use std::sync::RwLock;
use time::OffsetDateTime;
use uuid::Uuid;

use crate::{AuthenticatedSession, Error, VerifiedAdministrator};

#[derive(Default)]
pub(crate) struct SessionStore {
    current: RwLock<Option<AuthenticatedSession>>,
}

impl SessionStore {
    pub(crate) fn login(
        &self,
        identity: VerifiedAdministrator,
        installation_id: Uuid,
        product_id: &str,
    ) -> Result<AuthenticatedSession, Error> {
        let session = AuthenticatedSession {
            id: Uuid::now_v7(),
            installation_id,
            product_id: product_id.to_owned(),
            administrator_id: identity.administrator_id,
            administrator_name: identity.name,
            public_key: identity.public_key,
            public_key_fingerprint: identity.public_key_fingerprint,
            expires_at_millis: identity.expires_at_millis,
        };
        let mut current = self.current.write().map_err(|_| Error::unavailable())?;
        *current = Some(session.clone());
        Ok(session)
    }

    pub(crate) fn logout(&self) -> Result<(), Error> {
        let mut current = self.current.write().map_err(|_| Error::unavailable())?;
        *current = None;
        Ok(())
    }

    pub(crate) fn require(&self) -> Result<AuthenticatedSession, Error> {
        let session = self
            .current
            .read()
            .map_err(|_| Error::unavailable())?
            .clone()
            .ok_or_else(Error::not_authenticated)?;
        if session.expires_at_millis <= now_millis() {
            return Err(Error::not_authenticated());
        }
        Ok(session)
    }
}

pub(crate) fn now_millis() -> i64 {
    i64::try_from(OffsetDateTime::now_utc().unix_timestamp_nanos() / 1_000_000).unwrap_or(i64::MAX)
}
