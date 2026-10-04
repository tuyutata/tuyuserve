//! 全途遇唯一账户实现。
//!
//! 本模块同时服务途遇商家端、途遇厂家端和途遇服务端。产品只提供产品标识、安装标识
//! 与本地数据库连接；管理员策略、会话、扫码验签、断言和账户数据访问全部在这里实现。

mod error;
mod model;
mod protocol;
mod repository;
mod service;
mod session;

pub use error::{Error, ErrorKind};
pub use model::{
    Administrator, AdministratorAssertion, AdministratorState, AdministratorView,
    AuthenticatedSession, MAXIMUM_ADMINISTRATORS, MINIMUM_ACTIVE_ADMINISTRATORS,
    VerifiedAdministrator,
};
pub use protocol::{
    AccountQr, LoginChallenge, LoginRequestBody, LoginResponse, LoginResponseBody, TUYU_PROTOCOL,
    TUYU_VERSION, login_signing_digest, parse_account_qr,
};
pub use service::AccountService;
