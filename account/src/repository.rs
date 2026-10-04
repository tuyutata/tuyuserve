use time::OffsetDateTime;
use tokio_postgres::{GenericClient, Row};
use uuid::Uuid;

use crate::{Administrator, Error};

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) struct Counts {
    pub total: i64,
    pub active: i64,
}

pub(crate) async fn insert(
    client: &impl GenericClient,
    installation_id: Uuid,
    public_key: &[u8; 32],
    name: Option<&str>,
) -> Result<Administrator, Error> {
    let id = Uuid::now_v7();
    let row = client
        .query_one(
            "INSERT INTO tuyu_core.local_system_administrator
             (id, installation_id, public_key, name)
             VALUES ($1, $2, $3, $4)
             RETURNING id, public_key, name, status",
            &[&id, &installation_id, &public_key.as_slice(), &name],
        )
        .await?;
    Ok(from_row(&row))
}

pub(crate) async fn counts(
    client: &impl GenericClient,
    installation_id: Uuid,
) -> Result<Counts, Error> {
    let row = client
        .query_one(
            "SELECT COUNT(*)::bigint,
                    COUNT(*) FILTER (WHERE status='active')::bigint
             FROM tuyu_core.local_system_administrator WHERE installation_id=$1",
            &[&installation_id],
        )
        .await?;
    Ok(Counts {
        total: row.get(0),
        active: row.get(1),
    })
}

pub(crate) async fn list(
    client: &impl GenericClient,
    installation_id: Uuid,
) -> Result<Vec<Administrator>, Error> {
    let rows = client
        .query(
            "SELECT id, public_key, name, status
             FROM tuyu_core.local_system_administrator
             WHERE installation_id=$1 ORDER BY created_at, id",
            &[&installation_id],
        )
        .await?;
    Ok(rows.iter().map(from_row).collect())
}

pub(crate) async fn by_id(
    client: &impl GenericClient,
    installation_id: Uuid,
    administrator_id: Uuid,
) -> Result<Option<Administrator>, Error> {
    let row = client
        .query_opt(
            "SELECT id, public_key, name, status
             FROM tuyu_core.local_system_administrator
             WHERE installation_id=$1 AND id=$2",
            &[&installation_id, &administrator_id],
        )
        .await?;
    Ok(row.as_ref().map(from_row))
}

pub(crate) async fn active_by_public_key(
    client: &impl GenericClient,
    installation_id: Uuid,
    public_key: &[u8; 32],
) -> Result<Option<Administrator>, Error> {
    let row = client
        .query_opt(
            "SELECT id, public_key, name, status
             FROM tuyu_core.local_system_administrator
             WHERE installation_id=$1 AND public_key=$2 AND status='active'",
            &[&installation_id, &public_key.as_slice()],
        )
        .await?;
    Ok(row.as_ref().map(from_row))
}

pub(crate) async fn rename(
    client: &impl GenericClient,
    installation_id: Uuid,
    administrator_id: Uuid,
    name: Option<&str>,
) -> Result<Option<Administrator>, Error> {
    let row = client
        .query_opt(
            "UPDATE tuyu_core.local_system_administrator
             SET name=$3, updated_at=CURRENT_TIMESTAMP, version=version+1
             WHERE installation_id=$1 AND id=$2
             RETURNING id, public_key, name, status",
            &[&installation_id, &administrator_id, &name],
        )
        .await?;
    Ok(row.as_ref().map(from_row))
}

pub(crate) async fn set_status(
    client: &impl GenericClient,
    installation_id: Uuid,
    administrator_id: Uuid,
    status: &str,
) -> Result<Option<Administrator>, Error> {
    let row = client
        .query_opt(
            "UPDATE tuyu_core.local_system_administrator
             SET status=$3, updated_at=CURRENT_TIMESTAMP, version=version+1
             WHERE installation_id=$1 AND id=$2
             RETURNING id, public_key, name, status",
            &[&installation_id, &administrator_id, &status],
        )
        .await?;
    Ok(row.as_ref().map(from_row))
}

pub(crate) async fn delete(
    client: &impl GenericClient,
    installation_id: Uuid,
    administrator_id: Uuid,
) -> Result<u64, Error> {
    Ok(client
        .execute(
            "DELETE FROM tuyu_core.local_system_administrator
             WHERE installation_id=$1 AND id=$2",
            &[&installation_id, &administrator_id],
        )
        .await?)
}

pub(crate) async fn lock_installation(
    client: &impl GenericClient,
    installation_id: Uuid,
) -> Result<(), Error> {
    client
        .query_one(
            "SELECT id FROM tuyu_core.installation WHERE id=$1 FOR UPDATE",
            &[&installation_id],
        )
        .await?;
    Ok(())
}

pub(crate) async fn initialized(
    client: &impl GenericClient,
    installation_id: Uuid,
) -> Result<bool, Error> {
    let row = client
        .query_one(
            "SELECT initialized_at IS NOT NULL FROM tuyu_core.installation WHERE id=$1",
            &[&installation_id],
        )
        .await?;
    Ok(row.get(0))
}

pub(crate) async fn mark_initialized(
    client: &impl GenericClient,
    installation_id: Uuid,
    initialized_at: OffsetDateTime,
) -> Result<(), Error> {
    client
        .execute(
            "UPDATE tuyu_core.installation SET initialized_at=$2,
             updated_at=CURRENT_TIMESTAMP, version=version+1 WHERE id=$1",
            &[&installation_id, &initialized_at],
        )
        .await?;
    Ok(())
}

#[allow(clippy::too_many_arguments)]
pub(crate) async fn audit(
    client: &impl GenericClient,
    installation_id: Uuid,
    actor_id: Option<Uuid>,
    actor_fingerprint: Option<&str>,
    target_id: Option<Uuid>,
    target_fingerprint: &str,
    session_id: Option<Uuid>,
    action: &str,
    occurred_at: OffsetDateTime,
) -> Result<(), Error> {
    client
        .execute(
            "INSERT INTO tuyu_core.administrator_audit_log
             (id, installation_id, administrator_id, actor_public_key_fingerprint,
              target_administrator_id, target_public_key_fingerprint, session_id,
              action, occurred_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)",
            &[
                &Uuid::now_v7(),
                &installation_id,
                &actor_id,
                &actor_fingerprint,
                &target_id,
                &target_fingerprint,
                &session_id,
                &action,
                &occurred_at,
            ],
        )
        .await?;
    Ok(())
}

pub(crate) async fn revoke_bridges(
    client: &impl GenericClient,
    installation_id: Uuid,
    administrator_id: Uuid,
) -> Result<(), Error> {
    client
        .execute(
            "UPDATE tuyu_core.administrator_assertion
             SET revoked_at=COALESCE(revoked_at, CURRENT_TIMESTAMP)
             WHERE installation_id=$1 AND administrator_id=$2",
            &[&installation_id, &administrator_id],
        )
        .await?;
    client
        .execute(
            "UPDATE tuyu_core.upstream_administrator_session
             SET revoked_at=COALESCE(revoked_at, CURRENT_TIMESTAMP)
             WHERE installation_id=$1 AND administrator_id=$2",
            &[&installation_id, &administrator_id],
        )
        .await?;
    Ok(())
}

#[allow(clippy::too_many_arguments)]
pub(crate) async fn insert_assertion(
    client: &impl GenericClient,
    assertion_hash: &[u8],
    installation_id: Uuid,
    session_id: Uuid,
    administrator_id: Uuid,
    fingerprint: &str,
    session_expires_at: OffsetDateTime,
    expires_at: OffsetDateTime,
) -> Result<bool, Error> {
    let inserted = client
        .execute(
            "WITH created AS (
                INSERT INTO tuyu_core.administrator_assertion (
                    assertion_hash, installation_id, local_session_id, administrator_id,
                    administrator_public_key_fingerprint, local_session_expires_at, expires_at)
                SELECT $1, $2, $3, $4, $5, $6, $7
                FROM tuyu_core.local_system_administrator
                WHERE installation_id=$2 AND id=$4 AND status='active'
                RETURNING assertion_hash, installation_id, administrator_id,
                          administrator_public_key_fingerprint
            )
            INSERT INTO tuyu_core.administrator_bridge_audit (
                assertion_hash, installation_id, administrator_id,
                administrator_public_key_fingerprint, action, outcome)
            SELECT assertion_hash, installation_id, administrator_id,
                   administrator_public_key_fingerprint, 'ASSERTION_CREATED', 'SUCCESS'
            FROM created",
            &[
                &assertion_hash,
                &installation_id,
                &session_id,
                &administrator_id,
                &fingerprint,
                &session_expires_at,
                &expires_at,
            ],
        )
        .await?;
    Ok(inserted == 1)
}

fn from_row(row: &Row) -> Administrator {
    let public_key: Vec<u8> = row.get("public_key");
    Administrator {
        id: row.get("id"),
        public_key: public_key
            .try_into()
            .expect("数据库约束保证管理员公钥固定为 32 字节"),
        name: row.get("name"),
        status: row.get("status"),
    }
}
