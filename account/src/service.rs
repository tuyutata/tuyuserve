use std::collections::HashMap;
use std::sync::Mutex;

use getrandom::fill;
use sha2::{Digest, Sha256};
use time::OffsetDateTime;
use tokio_postgres::Client;
use uuid::Uuid;

use crate::model::{
    Administrator, AdministratorAssertion, AdministratorState, AdministratorView,
    AuthenticatedSession, MAXIMUM_ADMINISTRATORS, MINIMUM_ACTIVE_ADMINISTRATORS,
    VerifiedAdministrator,
};
use crate::protocol::{self, LoginChallenge, LoginResponse};
use crate::repository;
use crate::session::{SessionStore, now_millis};
use crate::{Error, ErrorKind};

const CHALLENGE_TTL_MILLIS: i64 = 120_000;
const SESSION_TTL_MILLIS: i64 = 8 * 60 * 60 * 1_000;
const ASSERTION_TTL_SECONDS: i64 = 60;

#[derive(Clone)]
struct PendingLogin {
    challenge: LoginChallenge,
    purpose: ChallengePurpose,
}

#[derive(Clone, Copy, Eq, PartialEq)]
enum ChallengePurpose {
    Initialization,
    Login,
}

pub struct AccountService {
    product_id: String,
    installation_id: Uuid,
    sessions: SessionStore,
    pending: Mutex<HashMap<String, PendingLogin>>,
}

impl AccountService {
    pub fn new(product_id: impl Into<String>, installation_id: Uuid) -> Result<Self, Error> {
        let product_id = product_id.into();
        if product_id.is_empty()
            || !product_id
                .bytes()
                .all(|byte| byte.is_ascii_lowercase() || byte.is_ascii_digit())
        {
            return Err(policy(
                "account.product_id_invalid",
                "产品标识无效",
                "The product identifier is invalid",
            ));
        }
        Ok(Self {
            product_id,
            installation_id,
            sessions: SessionStore::default(),
            pending: Mutex::new(HashMap::new()),
        })
    }

    pub async fn state(&self, client: &Client) -> Result<AdministratorState, Error> {
        let counts = repository::counts(client, self.installation_id).await?;
        let marked = repository::initialized(client, self.installation_id).await?;
        Ok(AdministratorState {
            initialized: marked || counts.total > 0,
            total: counts.total,
            active: counts.active,
        })
    }

    pub async fn initialize(
        &self,
        client: &mut Client,
        response: LoginResponse,
        name: Option<&str>,
    ) -> Result<AuthenticatedSession, Error> {
        let public_key = self.consume_challenge(response, ChallengePurpose::Initialization)?;
        let name = normalize_name(name)?;
        let transaction = client.transaction().await?;
        repository::lock_installation(&transaction, self.installation_id).await?;
        let counts = repository::counts(&transaction, self.installation_id).await?;
        if repository::initialized(&transaction, self.installation_id).await? || counts.total != 0 {
            return Err(policy(
                "account.already_initialized",
                "当前途遇产品已经完成管理员初始化",
                "This Tuyu product has already initialized its administrator",
            ));
        }
        let administrator = repository::insert(
            &transaction,
            self.installation_id,
            &public_key,
            name.as_deref(),
        )
        .await?;
        let now = OffsetDateTime::now_utc();
        repository::mark_initialized(&transaction, self.installation_id, now).await?;
        repository::audit(
            &transaction,
            self.installation_id,
            Some(administrator.id),
            Some(&fingerprint(&administrator.public_key)),
            Some(administrator.id),
            &fingerprint(&administrator.public_key),
            None,
            "administrator_initialized",
            now,
        )
        .await?;
        transaction.commit().await?;
        self.login_administrator(&administrator)
    }

    pub async fn list(&self, client: &Client) -> Result<Vec<AdministratorView>, Error> {
        self.require_active(client).await?;
        Ok(repository::list(client, self.installation_id)
            .await?
            .iter()
            .map(AdministratorView::from)
            .collect())
    }

    pub async fn add(
        &self,
        client: &mut Client,
        account_qr: &str,
        name: Option<&str>,
    ) -> Result<AdministratorView, Error> {
        let actor = self.require_active(client).await?;
        let account = protocol::parse_account_qr(account_qr)?;
        let name = normalize_name(name)?;
        let transaction = client.transaction().await?;
        repository::lock_installation(&transaction, self.installation_id).await?;
        if repository::counts(&transaction, self.installation_id)
            .await?
            .total
            >= MAXIMUM_ADMINISTRATORS
        {
            return Err(policy(
                "account.administrator_limit_reached",
                "管理员数量已达到 99 个上限",
                "The administrator limit of 99 has been reached",
            ));
        }
        let inserted = repository::insert(
            &transaction,
            self.installation_id,
            &account.bytes,
            name.as_deref(),
        )
        .await?;
        self.audit(&transaction, &actor, &inserted, "administrator_added")
            .await?;
        transaction.commit().await?;
        Ok(AdministratorView::from(&inserted))
    }

    pub async fn rename(
        &self,
        client: &Client,
        administrator_id: Uuid,
        name: Option<&str>,
    ) -> Result<AdministratorView, Error> {
        let actor = self.require_active(client).await?;
        let name = normalize_name(name)?;
        let target = repository::by_id(client, self.installation_id, administrator_id)
            .await?
            .ok_or_else(not_found)?;
        let updated = repository::rename(
            client,
            self.installation_id,
            administrator_id,
            name.as_deref(),
        )
        .await?
        .ok_or_else(not_found)?;
        self.audit(client, &actor, &target, "administrator_name_updated")
            .await?;
        Ok(AdministratorView::from(&updated))
    }

    pub async fn set_status(
        &self,
        client: &mut Client,
        administrator_id: Uuid,
        status: &str,
    ) -> Result<AdministratorView, Error> {
        if status != "active" && status != "disabled" {
            return Err(policy(
                "account.administrator_status_invalid",
                "管理员状态只能是 active 或 disabled",
                "Administrator status must be active or disabled",
            ));
        }
        let actor = self.require_active(client).await?;
        let transaction = client.transaction().await?;
        repository::lock_installation(&transaction, self.installation_id).await?;
        let target = repository::by_id(&transaction, self.installation_id, administrator_id)
            .await?
            .ok_or_else(not_found)?;
        let counts = repository::counts(&transaction, self.installation_id).await?;
        if status == "disabled"
            && target.status == "active"
            && counts.active <= MINIMUM_ACTIVE_ADMINISTRATORS
        {
            return Err(last_active());
        }
        if status == "disabled" {
            repository::revoke_bridges(&transaction, self.installation_id, administrator_id)
                .await?;
        }
        let updated =
            repository::set_status(&transaction, self.installation_id, administrator_id, status)
                .await?
                .ok_or_else(not_found)?;
        self.audit(
            &transaction,
            &actor,
            &target,
            "administrator_status_updated",
        )
        .await?;
        transaction.commit().await?;
        if actor.administrator_id == administrator_id && status == "disabled" {
            self.sessions.logout()?;
        }
        Ok(AdministratorView::from(&updated))
    }

    pub async fn delete(&self, client: &mut Client, administrator_id: Uuid) -> Result<(), Error> {
        let actor = self.require_active(client).await?;
        let transaction = client.transaction().await?;
        repository::lock_installation(&transaction, self.installation_id).await?;
        let target = repository::by_id(&transaction, self.installation_id, administrator_id)
            .await?
            .ok_or_else(not_found)?;
        let counts = repository::counts(&transaction, self.installation_id).await?;
        if target.status == "active" && counts.active <= MINIMUM_ACTIVE_ADMINISTRATORS {
            return Err(last_active());
        }
        self.audit(&transaction, &actor, &target, "administrator_deleted")
            .await?;
        if repository::delete(&transaction, self.installation_id, administrator_id).await? == 0 {
            return Err(not_found());
        }
        transaction.commit().await?;
        if actor.administrator_id == administrator_id {
            self.sessions.logout()?;
        }
        Ok(())
    }

    pub async fn create_administrator_challenge(
        &self,
        client: &Client,
    ) -> Result<LoginChallenge, Error> {
        let counts = repository::counts(client, self.installation_id).await?;
        let initialized = repository::initialized(client, self.installation_id).await?;
        let purpose = if !initialized && counts.total == 0 {
            ChallengePurpose::Initialization
        } else if counts.active >= MINIMUM_ACTIVE_ADMINISTRATORS {
            ChallengePurpose::Login
        } else {
            return Err(not_found());
        };
        let request_id = random_id()?;
        let expires_at = now_millis() + CHALLENGE_TTL_MILLIS;
        let challenge = protocol::request(
            request_id.clone(),
            expires_at,
            &self.product_id,
            &self.installation_id.to_string(),
            random_nonce()?,
        );
        let mut pending = self.pending.lock().map_err(|_| Error::unavailable())?;
        pending.retain(|_, item| item.challenge.e > now_millis());
        pending.insert(
            request_id,
            PendingLogin {
                challenge: challenge.clone(),
                purpose,
            },
        );
        Ok(challenge)
    }

    pub async fn complete_login(
        &self,
        client: &Client,
        response: LoginResponse,
    ) -> Result<AuthenticatedSession, Error> {
        let public_key = self.consume_challenge(response, ChallengePurpose::Login)?;
        let administrator =
            repository::active_by_public_key(client, self.installation_id, &public_key)
                .await?
                .ok_or_else(|| Error::login("administrator"))?;
        let session = self.login_administrator(&administrator)?;
        if repository::audit(
            client,
            self.installation_id,
            Some(administrator.id),
            Some(&session.public_key_fingerprint),
            Some(administrator.id),
            &session.public_key_fingerprint,
            Some(session.id),
            "administrator_login",
            OffsetDateTime::now_utc(),
        )
        .await
        .is_err()
        {
            self.sessions.logout()?;
            return Err(Error::login("audit"));
        }
        Ok(session)
    }

    fn consume_challenge(
        &self,
        response: LoginResponse,
        expected_purpose: ChallengePurpose,
    ) -> Result<[u8; 32], Error> {
        let pending = self
            .pending
            .lock()
            .map_err(|_| Error::unavailable())?
            .remove(&response.i)
            .ok_or_else(|| Error::login("challenge"))?;
        if pending.purpose != expected_purpose {
            return Err(Error::login("purpose"));
        }
        if response.e != pending.challenge.e || now_millis() >= pending.challenge.e {
            return Err(Error::login("expired"));
        }
        protocol::verify(&response, &pending.challenge)
    }

    pub fn login_verified(
        &self,
        identity: VerifiedAdministrator,
    ) -> Result<AuthenticatedSession, Error> {
        self.sessions
            .login(identity, self.installation_id, &self.product_id)
    }

    pub fn require_session(&self) -> Result<AuthenticatedSession, Error> {
        self.sessions.require()
    }

    pub fn logout(&self) -> Result<(), Error> {
        self.sessions.logout()
    }

    pub async fn assertion(&self, client: &Client) -> Result<AdministratorAssertion, Error> {
        let session = self.sessions.require()?;
        let now = now_millis();
        let expires_at_millis =
            (now + ASSERTION_TTL_SECONDS * 1_000).min(session.expires_at_millis);
        let expires_at =
            OffsetDateTime::from_unix_timestamp_nanos(i128::from(expires_at_millis) * 1_000_000)
                .map_err(|_| Error::unavailable())?;
        let session_expires_at = OffsetDateTime::from_unix_timestamp_nanos(
            i128::from(session.expires_at_millis) * 1_000_000,
        )
        .map_err(|_| Error::unavailable())?;
        let token = random_token()?;
        let hash = Sha256::digest(token.as_bytes()).to_vec();
        if !repository::insert_assertion(
            client,
            &hash,
            self.installation_id,
            session.id,
            session.administrator_id,
            &session.public_key_fingerprint,
            session_expires_at,
            expires_at,
        )
        .await?
        {
            self.sessions.logout()?;
            return Err(Error::unavailable());
        }
        Ok(AdministratorAssertion {
            token,
            expires_at_millis,
        })
    }

    async fn require_active(&self, client: &Client) -> Result<AuthenticatedSession, Error> {
        let session = self.sessions.require()?;
        let administrator =
            repository::by_id(client, self.installation_id, session.administrator_id).await?;
        if administrator.is_none_or(|value| value.status != "active") {
            self.sessions.logout()?;
            return Err(policy(
                "account.session_invalid",
                "管理员会话已失效",
                "The administrator session is no longer valid",
            ));
        }
        Ok(session)
    }

    fn login_administrator(
        &self,
        administrator: &Administrator,
    ) -> Result<AuthenticatedSession, Error> {
        let identity = VerifiedAdministrator::new(
            administrator.id,
            administrator.name.clone(),
            protocol::hex32(&administrator.public_key),
            fingerprint(&administrator.public_key),
            now_millis() + SESSION_TTL_MILLIS,
        )?;
        self.login_verified(identity)
    }

    async fn audit(
        &self,
        client: &impl tokio_postgres::GenericClient,
        actor: &AuthenticatedSession,
        target: &Administrator,
        action: &str,
    ) -> Result<(), Error> {
        repository::audit(
            client,
            self.installation_id,
            Some(actor.administrator_id),
            Some(&actor.public_key_fingerprint),
            Some(target.id),
            &fingerprint(&target.public_key),
            Some(actor.id),
            action,
            OffsetDateTime::now_utc(),
        )
        .await
    }
}

fn normalize_name(name: Option<&str>) -> Result<Option<String>, Error> {
    let Some(value) = name else { return Ok(None) };
    let value = value.trim();
    if value.is_empty() {
        return Ok(None);
    }
    if value.chars().count() > 30 {
        return Err(policy(
            "account.administrator_name_too_long",
            "管理员姓名不能超过 30 个字符",
            "Administrator name cannot exceed 30 characters",
        ));
    }
    Ok(Some(value.to_owned()))
}

fn random_id() -> Result<String, Error> {
    let mut bytes = [0_u8; 16];
    fill(&mut bytes).map_err(|_| Error::unavailable())?;
    Ok(format!("tyc_{}", protocol::hex(&bytes)))
}

fn random_nonce() -> Result<[u8; 32], Error> {
    let mut bytes = [0_u8; 32];
    fill(&mut bytes).map_err(|_| Error::unavailable())?;
    Ok(bytes)
}

fn random_token() -> Result<String, Error> {
    let mut bytes = [0_u8; 32];
    fill(&mut bytes).map_err(|_| Error::unavailable())?;
    Ok(protocol::hex(&bytes))
}

fn fingerprint(public_key: &[u8; 32]) -> String {
    protocol::hex(&Sha256::digest(public_key))
}

fn not_found() -> Error {
    policy(
        "account.administrator_not_found",
        "管理员不存在",
        "Administrator not found",
    )
}

fn last_active() -> Error {
    policy(
        "account.last_active_administrator_required",
        "必须至少保留一个启用的管理员",
        "At least one active administrator must remain",
    )
}

fn policy(key: &'static str, zh_cn: &'static str, en_us: &'static str) -> Error {
    Error::new(ErrorKind::Policy, key, zh_cn, en_us)
}
