use blake2::{
    Blake2bVar,
    digest::{Update, VariableOutput},
};
use schnorrkel::{PublicKey, Signature, signing_context};
use serde::{Deserialize, Serialize};

use crate::Error;

pub const TUYU_PROTOCOL: &str = "TUYU";
pub const TUYU_VERSION: u8 = 1;
pub(crate) const ACCOUNT_KIND: u8 = 0;
pub(crate) const SIGN_REQUEST_KIND: u8 = 1;
pub(crate) const SIGN_RESPONSE_KIND: u8 = 2;
pub(crate) const LOCAL_ADMINISTRATOR_LOGIN: u8 = 2;

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct AccountEnvelope {
    p: String,
    v: u8,
    k: u8,
    b: AccountBody,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct AccountBody {
    u: String,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AccountQr {
    pub bytes: [u8; 32],
    pub account_id: String,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct LoginChallenge {
    pub p: String,
    pub v: u8,
    pub k: u8,
    pub i: String,
    pub e: i64,
    pub b: LoginRequestBody,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct LoginRequestBody {
    pub o: u8,
    pub a: String,
    pub t: String,
    pub j: String,
    pub d: String,
    pub r: u64,
    pub n: String,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct LoginResponse {
    pub p: String,
    pub v: u8,
    pub k: u8,
    pub i: String,
    pub e: i64,
    pub b: LoginResponseBody,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct LoginResponseBody {
    pub u: String,
    pub s: String,
}

pub fn parse_account_qr(raw: &str) -> Result<AccountQr, Error> {
    let document: AccountEnvelope = serde_json::from_str(raw).map_err(|_| Error::invalid_qr())?;
    if document.p != TUYU_PROTOCOL
        || document.v != TUYU_VERSION
        || document.k != ACCOUNT_KIND
        || !is_hex(&document.b.u, 32)
    {
        return Err(Error::invalid_qr());
    }
    let bytes = decode_hex::<32>(&document.b.u).ok_or_else(Error::invalid_qr)?;
    PublicKey::from_bytes(&bytes).map_err(|_| Error::invalid_qr())?;
    Ok(AccountQr {
        bytes,
        account_id: document.b.u,
    })
}

pub(crate) fn request(
    request_id: String,
    expires_at_millis: i64,
    audience: &str,
    target: &str,
    nonce: [u8; 32],
) -> LoginChallenge {
    LoginChallenge {
        p: TUYU_PROTOCOL.to_owned(),
        v: TUYU_VERSION,
        k: SIGN_REQUEST_KIND,
        i: request_id,
        e: expires_at_millis,
        b: LoginRequestBody {
            o: LOCAL_ADMINISTRATOR_LOGIN,
            a: audience.to_owned(),
            t: target.to_owned(),
            j: String::new(),
            d: String::new(),
            r: 0,
            n: hex32(&nonce),
        },
    }
}

/// Builds the exact TUYU v1 digest signed by a mobile wallet.
///
/// JSON is only the QR transport. The signature always covers this canonical
/// Blake2-256 digest, including the operation, audience, installation target,
/// challenge identity, signing public key, expiry, and nonce.
pub fn login_signing_digest(
    challenge: &LoginChallenge,
    public_key: &[u8; 32],
) -> Result<[u8; 32], Error> {
    validate_challenge(challenge)?;
    let nonce = decode_hex::<32>(&challenge.b.n).ok_or_else(|| Error::login("nonce"))?;
    let expires_at = u64::try_from(challenge.e).map_err(|_| Error::login("expired"))?;

    let mut claims = Vec::new();
    push_scale_string(&mut claims, &challenge.b.a)?;
    push_scale_string(&mut claims, &challenge.b.t)?;
    push_scale_string(&mut claims, &challenge.b.j)?;
    push_scale_string(&mut claims, &challenge.b.d)?;
    claims.extend(challenge.b.r.to_le_bytes());
    push_scale_string(&mut claims, &challenge.i)?;
    claims.extend(public_key);
    claims.extend(expires_at.to_le_bytes());
    claims.extend(nonce);

    let mut preimage = TUYU_PROTOCOL.as_bytes().to_vec();
    preimage.push(TUYU_VERSION);
    preimage.push(challenge.b.o);
    preimage.extend(claims);

    let mut digest = [0_u8; 32];
    let mut hasher = Blake2bVar::new(digest.len()).map_err(|_| Error::login("digest"))?;
    hasher.update(&preimage);
    hasher
        .finalize_variable(&mut digest)
        .map_err(|_| Error::login("digest"))?;
    Ok(digest)
}

pub(crate) fn verify(
    response: &LoginResponse,
    challenge: &LoginChallenge,
) -> Result<[u8; 32], Error> {
    if response.p != TUYU_PROTOCOL
        || response.v != TUYU_VERSION
        || response.k != SIGN_RESPONSE_KIND
        || response.i != challenge.i
        || response.e != challenge.e
    {
        return Err(Error::login("protocol"));
    }
    let public_key = decode_hex::<32>(&response.b.u).ok_or_else(|| Error::login("public_key"))?;
    let signature = decode_hex::<64>(&response.b.s).ok_or_else(|| Error::login("signature"))?;
    let digest = login_signing_digest(challenge, &public_key)?;
    let verifier = PublicKey::from_bytes(&public_key).map_err(|_| Error::login("public_key"))?;
    let signature = Signature::from_bytes(&signature).map_err(|_| Error::login("signature"))?;
    verifier
        .verify(signing_context(b"substrate").bytes(&digest), &signature)
        .map_err(|_| Error::login("signature"))?;
    Ok(public_key)
}

fn validate_challenge(challenge: &LoginChallenge) -> Result<(), Error> {
    if challenge.p != TUYU_PROTOCOL
        || challenge.v != TUYU_VERSION
        || challenge.k != SIGN_REQUEST_KIND
        || challenge.b.o != LOCAL_ADMINISTRATOR_LOGIN
        || challenge.b.a.is_empty()
        || challenge.b.t.is_empty()
        || challenge.e < 0
        || !is_challenge_id(&challenge.i)
        || !is_hex(&challenge.b.n, 32)
    {
        return Err(Error::login("challenge"));
    }
    Ok(())
}

fn push_scale_string(output: &mut Vec<u8>, value: &str) -> Result<(), Error> {
    push_scale_compact(output, value.len())?;
    output.extend(value.as_bytes());
    Ok(())
}

fn push_scale_compact(output: &mut Vec<u8>, value: usize) -> Result<(), Error> {
    let value = u32::try_from(value).map_err(|_| Error::login("claims"))?;
    if value < 1 << 6 {
        output.push((value as u8) << 2);
    } else if value < 1 << 14 {
        output.extend((((value << 2) | 0b01) as u16).to_le_bytes());
    } else if value < 1 << 30 {
        output.extend(((value << 2) | 0b10).to_le_bytes());
    } else {
        output.push(0b11);
        output.extend(value.to_le_bytes());
    }
    Ok(())
}

fn is_challenge_id(value: &str) -> bool {
    value.len() == 36
        && value.starts_with("tyc_")
        && value[4..]
            .bytes()
            .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
}

pub(crate) fn is_hex(value: &str, bytes: usize) -> bool {
    value.len() == bytes * 2 + 2
        && value.starts_with("0x")
        && value[2..]
            .bytes()
            .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
}

pub(crate) fn hex32(bytes: &[u8; 32]) -> String {
    format!("0x{}", hex(bytes))
}

pub(crate) fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|byte| format!("{byte:02x}")).collect()
}

fn decode_hex<const N: usize>(value: &str) -> Option<[u8; N]> {
    if !is_hex(value, N) {
        return None;
    }
    let raw = value.strip_prefix("0x")?;
    let mut output = [0_u8; N];
    for (index, byte) in output.iter_mut().enumerate() {
        *byte = u8::from_str_radix(&raw[index * 2..index * 2 + 2], 16).ok()?;
    }
    Some(output)
}
