use serde_json::Value;
use tuyu_account::{
    LoginChallenge, LoginResponse, TUYU_PROTOCOL, TUYU_VERSION, login_signing_digest,
    parse_account_qr,
};

fn fixture() -> Value {
    serde_json::from_str(include_str!("../protocol/tuyu-v1-vectors.json"))
        .expect("TUYU v1 fixture must be valid JSON")
}

fn hex(bytes: &[u8]) -> String {
    format!(
        "0x{}",
        bytes
            .iter()
            .map(|value| format!("{value:02x}"))
            .collect::<String>()
    )
}

#[test]
fn account_qr_only_accepts_canonical_tuyu_v1() {
    let vector = &fixture()["vectors"][0];
    let raw = serde_json::to_string(&vector["account_qr"]).unwrap();
    assert_eq!(
        parse_account_qr(&raw).unwrap().account_id,
        vector["account_id"].as_str().unwrap()
    );

    let mut wrong_protocol = vector["account_qr"].clone();
    wrong_protocol["p"] = Value::String("OTHER".to_owned());
    assert!(parse_account_qr(&wrong_protocol.to_string()).is_err());
    let mut unknown_field = vector["account_qr"].clone();
    unknown_field["private_key"] = Value::String("forbidden".to_owned());
    assert!(parse_account_qr(&unknown_field.to_string()).is_err());
}

#[test]
fn login_qr_and_digest_match_the_frozen_tuyu_v1_vector() {
    let vector = &fixture()["vectors"][0];
    let challenge: LoginChallenge = serde_json::from_value(vector["challenge_qr"].clone()).unwrap();
    let response: LoginResponse = serde_json::from_value(vector["response_qr"].clone()).unwrap();
    let account = parse_account_qr(&vector["account_qr"].to_string()).unwrap();

    assert_eq!(challenge.p, TUYU_PROTOCOL);
    assert_eq!(challenge.v, TUYU_VERSION);
    assert_eq!(challenge.k, 1);
    assert_eq!(challenge.b.o, 2);
    assert_eq!(response.p, TUYU_PROTOCOL);
    assert_eq!(response.v, TUYU_VERSION);
    assert_eq!(response.k, 2);
    assert_eq!(response.i, challenge.i);
    assert_eq!(response.e, challenge.e);
    assert_eq!(
        hex(&login_signing_digest(&challenge, &account.bytes).unwrap()),
        vector["signing_digest_hex"].as_str().unwrap()
    );

    let mut unknown_field = vector["response_qr"].clone();
    unknown_field["private_key"] = Value::String("forbidden".to_owned());
    assert!(serde_json::from_value::<LoginResponse>(unknown_field).is_err());
}

#[test]
fn every_authorization_scope_field_is_bound_to_the_tuyu_v1_digest() {
    let vector = &fixture()["vectors"][0];
    let challenge: LoginChallenge = serde_json::from_value(vector["challenge_qr"].clone()).unwrap();
    let account = parse_account_qr(&vector["account_qr"].to_string()).unwrap();
    let expected = login_signing_digest(&challenge, &account.bytes).unwrap();

    let mut changed = challenge.clone();
    changed.b.a = "another-product".to_owned();
    assert_ne!(
        login_signing_digest(&changed, &account.bytes).unwrap(),
        expected
    );

    let mut changed = challenge.clone();
    changed.b.t = "another-installation".to_owned();
    assert_ne!(
        login_signing_digest(&changed, &account.bytes).unwrap(),
        expected
    );

    let mut changed = challenge.clone();
    changed.b.n = format!("0x{}", "33".repeat(32));
    assert_ne!(
        login_signing_digest(&changed, &account.bytes).unwrap(),
        expected
    );

    let mut changed = challenge.clone();
    changed.i = format!("tyc_{}", "44".repeat(16));
    assert_ne!(
        login_signing_digest(&changed, &account.bytes).unwrap(),
        expected
    );

    let mut changed = challenge.clone();
    changed.e += 1;
    assert_ne!(
        login_signing_digest(&changed, &account.bytes).unwrap(),
        expected
    );

    let mut wrong_version = challenge.clone();
    wrong_version.v += 1;
    assert!(login_signing_digest(&wrong_version, &account.bytes).is_err());

    let mut wrong_operation = challenge;
    wrong_operation.b.o = 1;
    assert!(login_signing_digest(&wrong_operation, &account.bytes).is_err());
}
