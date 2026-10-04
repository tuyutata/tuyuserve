use serde::{Deserialize, Serialize};

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ErrorKind {
    NotAuthenticated,
    InvalidIdentity,
    Policy,
    Storage,
    Unavailable,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize, thiserror::Error)]
#[error("{key}: {en_us}")]
pub struct Error {
    pub kind: ErrorKind,
    pub key: String,
    pub zh_cn: String,
    pub en_us: String,
}

impl Error {
    pub fn new(
        kind: ErrorKind,
        key: impl Into<String>,
        zh_cn: impl Into<String>,
        en_us: impl Into<String>,
    ) -> Self {
        Self {
            kind,
            key: key.into(),
            zh_cn: zh_cn.into(),
            en_us: en_us.into(),
        }
    }

    pub fn not_authenticated() -> Self {
        Self::new(
            ErrorKind::NotAuthenticated,
            "session.not_authenticated",
            "请先使用管理员二维码签名登录",
            "Sign in with an administrator QR signature first",
        )
    }

    pub(crate) fn invalid_qr() -> Self {
        Self::new(
            ErrorKind::InvalidIdentity,
            "account.qr_invalid",
            "途遇账户二维码无效",
            "The Tuyu account QR code is invalid",
        )
    }

    pub(crate) fn login(reason: &str) -> Self {
        Self::new(
            ErrorKind::InvalidIdentity,
            format!("account.login.{reason}"),
            "扫码登录验证失败",
            "The QR login could not be verified",
        )
    }

    pub(crate) fn storage() -> Self {
        Self::new(
            ErrorKind::Storage,
            "account.storage_unavailable",
            "本地账户数据服务暂时不可用",
            "The local account data service is unavailable",
        )
    }

    pub(crate) fn unavailable() -> Self {
        Self::new(
            ErrorKind::Unavailable,
            "account.unavailable",
            "本地账户服务暂时不可用",
            "The local account service is unavailable",
        )
    }
}

impl From<tokio_postgres::Error> for Error {
    fn from(_: tokio_postgres::Error) -> Self {
        Self::storage()
    }
}
