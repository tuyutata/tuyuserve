use schnorrkel::{ExpansionMode, MiniSecretKey, PublicKey, Signature, signing_context};
use serde_json::Value;

fn decode_hex(value: &str) -> Vec<u8> {
    let value = value
        .strip_prefix("0x")
        .expect("protocol hexadecimal values must start with 0x");
    assert_eq!(
        value.len() % 2,
        0,
        "hexadecimal value must contain whole bytes"
    );

    value
        .as_bytes()
        .chunks_exact(2)
        .map(|chunk| {
            let pair = std::str::from_utf8(chunk).expect("hexadecimal value must be UTF-8");
            u8::from_str_radix(pair, 16).expect("hexadecimal value must be valid")
        })
        .collect()
}

fn encode_hex(value: &[u8]) -> String {
    let mut encoded = String::with_capacity(2 + value.len() * 2);
    encoded.push_str("0x");
    for byte in value {
        use std::fmt::Write;
        write!(&mut encoded, "{byte:02x}").expect("writing to a String cannot fail");
    }
    encoded
}

fn scale_compact_length(length: usize) -> Vec<u8> {
    assert!(
        length < 64,
        "the v1 fixture only uses one-byte SCALE lengths"
    );
    vec![(length as u8) << 2]
}

fn push_scale_string(output: &mut Vec<u8>, value: &str) {
    output.extend(scale_compact_length(value.len()));
    output.extend(value.as_bytes());
}

fn required_string<'a>(value: &'a Value, pointer: &str) -> &'a str {
    value
        .pointer(pointer)
        .and_then(Value::as_str)
        .unwrap_or_else(|| panic!("missing fixture string at {pointer}"))
}

#[test]
fn tuyu_v1_fixture_freezes_the_account_signature_contract() {
    let document: Value = serde_json::from_str(include_str!("../protocol/tuyu-v1-vectors.json"))
        .expect("TUYU v1 vectors must be valid JSON");
    assert_eq!(document["protocol"], "TUYU");
    assert_eq!(document["version"], 1);
    assert_eq!(document["name_zh"], "途遇账户签名协议");

    let vector = &document["vectors"][0];
    let account = &vector["account_qr"];
    let challenge = &vector["challenge_qr"];
    let response = &vector["response_qr"];

    assert_eq!(account["p"], "TUYU");
    assert_eq!(account["v"], 1);
    assert_eq!(account["k"], 0);
    assert_eq!(challenge["p"], "TUYU");
    assert_eq!(challenge["v"], 1);
    assert_eq!(challenge["k"], 1);
    assert_eq!(response["p"], "TUYU");
    assert_eq!(response["v"], 1);
    assert_eq!(response["k"], 2);
    assert_eq!(challenge["i"], response["i"]);
    assert_eq!(challenge["e"], response["e"]);

    let seed: [u8; 32] = decode_hex(required_string(vector, "/seed_hex"))
        .try_into()
        .expect("fixture seed must be 32 bytes");
    let mini_secret = MiniSecretKey::from_bytes(&seed).expect("fixture seed must be valid");
    let keypair = mini_secret.expand_to_keypair(ExpansionMode::Ed25519);
    let account_id = required_string(vector, "/account_id");
    assert_eq!(encode_hex(&keypair.public.to_bytes()), account_id);
    assert_eq!(account["b"]["u"], account_id);
    assert_eq!(response["b"]["u"], account_id);

    let mut claims = Vec::new();
    push_scale_string(&mut claims, required_string(challenge, "/b/a"));
    push_scale_string(&mut claims, required_string(challenge, "/b/t"));
    push_scale_string(&mut claims, required_string(challenge, "/b/j"));
    push_scale_string(&mut claims, required_string(challenge, "/b/d"));
    claims.extend(
        challenge["b"]["r"]
            .as_u64()
            .expect("key revision must be an unsigned integer")
            .to_le_bytes(),
    );
    push_scale_string(&mut claims, required_string(challenge, "/i"));
    claims.extend(keypair.public.to_bytes());
    claims.extend(
        challenge["e"]
            .as_u64()
            .expect("expiry must be an unsigned integer")
            .to_le_bytes(),
    );
    claims.extend(decode_hex(required_string(challenge, "/b/n")));
    assert_eq!(
        encode_hex(&claims),
        required_string(vector, "/canonical_claims_scale_hex")
    );

    let mut preimage = b"TUYU".to_vec();
    preimage.push(1);
    preimage.push(
        challenge["b"]["o"]
            .as_u64()
            .expect("operation must be an unsigned integer") as u8,
    );
    preimage.extend(claims);
    assert_eq!(
        encode_hex(&preimage),
        required_string(vector, "/signing_preimage_hex")
    );

    let digest = decode_hex(required_string(vector, "/signing_digest_hex"));
    assert_eq!(digest.len(), 32, "Blake2-256 digest must be 32 bytes");
    let signature_bytes: [u8; 64] = decode_hex(required_string(vector, "/signature_hex"))
        .try_into()
        .expect("fixture signature must be 64 bytes");
    assert_eq!(response["b"]["s"], encode_hex(&signature_bytes));

    let public = PublicKey::from_bytes(&keypair.public.to_bytes())
        .expect("fixture public key must be valid sr25519");
    let signature =
        Signature::from_bytes(&signature_bytes).expect("fixture signature must be valid sr25519");
    public
        .verify(signing_context(b"substrate").bytes(&digest), &signature)
        .expect("fixture signature must verify with the substrate context");
}
