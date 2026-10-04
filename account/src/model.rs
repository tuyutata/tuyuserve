use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::{Error, ErrorKind};

pub const MAXIMUM_ADMINISTRATORS: i64 = 99;
pub const MINIMUM_ACTIVE_ADMINISTRATORS: i64 = 1;

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Administrator {
    pub id: Uuid,
    pub public_key: [u8; 32],
    pub name: Option<String>,
    pub status: String,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
pub struct AdministratorState {
    pub initialized: bool,
    pub total: i64,
    pub active: i64,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
pub struct AdministratorView {
    pub id: Uuid,
    pub public_key: String,
    pub name: Option<String>,
    pub status: String,
}

impl From<&Administrator> for AdministratorView {
    fn from(value: &Administrator) -> Self {
        Self {
            id: value.id,
            public_key: crate::protocol::hex32(&value.public_key),
            name: value.name.clone(),
            status: value.status.clone(),
        }
    }
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
pub struct VerifiedAdministrator {
    pub administrator_id: Uuid,
    pub name: Option<String>,
    pub public_key: String,
    pub public_key_fingerprint: String,
    pub expires_at_millis: i64,
}

impl VerifiedAdministrator {
    pub fn new(
        administrator_id: Uuid,
        name: Option<String>,
        public_key: impl Into<String>,
        public_key_fingerprint: impl Into<String>,
        expires_at_millis: i64,
    ) -> Result<Self, Error> {
        let public_key = public_key.into();
        let public_key_fingerprint = public_key_fingerprint.into();
        let name_is_valid = name
            .as_ref()
            .map(|value| !value.trim().is_empty() && value.chars().count() <= 30)
            .unwrap_or(true);
        if !name_is_valid
            || !crate::protocol::is_hex(&public_key, 32)
            || public_key_fingerprint.len() != 64
            || !public_key_fingerprint
                .bytes()
                .all(|value| value.is_ascii_digit() || (b'a'..=b'f').contains(&value))
            || expires_at_millis <= crate::session::now_millis()
        {
            return Err(Error::new(
                ErrorKind::InvalidIdentity,
                "account.identity_invalid",
                "本机管理员身份无效",
                "The local administrator identity is invalid",
            ));
        }
        Ok(Self {
            administrator_id,
            name,
            public_key,
            public_key_fingerprint,
            expires_at_millis,
        })
    }
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
pub struct AuthenticatedSession {
    pub id: Uuid,
    pub installation_id: Uuid,
    pub product_id: String,
    pub administrator_id: Uuid,
    pub administrator_name: Option<String>,
    pub public_key: String,
    pub public_key_fingerprint: String,
    pub expires_at_millis: i64,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
pub struct AdministratorAssertion {
    pub token: String,
    pub expires_at_millis: i64,
}
