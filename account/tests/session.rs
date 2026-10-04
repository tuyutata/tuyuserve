use time::OffsetDateTime;
use tuyu_account::{AccountService, ErrorKind, VerifiedAdministrator};
use uuid::Uuid;

fn identity(expires_at_millis: i64) -> VerifiedAdministrator {
    VerifiedAdministrator::new(
        Uuid::now_v7(),
        Some("测试管理员".to_owned()),
        format!("0x{}", "11".repeat(32)),
        "22".repeat(32),
        expires_at_millis,
    )
    .unwrap()
}

#[test]
fn local_session_keeps_product_and_installation_scope() {
    let installation_id = Uuid::now_v7();
    let service = AccountService::new("tuyubooking", installation_id).unwrap();
    let expires_at =
        i64::try_from(OffsetDateTime::now_utc().unix_timestamp_nanos() / 1_000_000 + 60_000)
            .unwrap();
    let session = service.login_verified(identity(expires_at)).unwrap();
    assert_eq!(session.product_id, "tuyubooking");
    assert_eq!(session.installation_id, installation_id);
    assert_eq!(service.require_session().unwrap(), session);
}

#[test]
fn logout_removes_only_the_local_session() {
    let service = AccountService::new("tuyufactory", Uuid::now_v7()).unwrap();
    let expires_at =
        i64::try_from(OffsetDateTime::now_utc().unix_timestamp_nanos() / 1_000_000 + 60_000)
            .unwrap();
    service.login_verified(identity(expires_at)).unwrap();
    service.logout().unwrap();
    assert_eq!(
        service.require_session().unwrap_err().kind,
        ErrorKind::NotAuthenticated
    );
}
