# 途遇账户签名协议

英文名称：Tuyu Account Signature Protocol  
协议标识：`TUYU`  
当前版本：`1`

## 1. 定位

途遇账户签名协议定义途遇系列产品共同使用的账户二维码、签名挑战和签名响应格式。协议只统一公钥身份、签名算法和传输信封，不统一各产品的授权数据库、角色、权限或会话。

本目录是协议规范和跨语言测试向量的权威真源。业务代码不得自行发明第二套字段、编码或摘要算法。

## 2. 密码学与编码

- 签名算法：`sr25519`。
- sr25519 signing context：ASCII `substrate`。
- 摘要算法：`Blake2-256`。
- 公钥：32 字节，JSON 中编码为小写 `0x` 十六进制。
- 签名：64 字节，JSON 中编码为小写 `0x` 十六进制。
- nonce：32 字节，JSON 中编码为小写 `0x` 十六进制。
- 时间：Unix 毫秒整数。
- JSON 只承担二维码或 HTTPS 传输，不是签名原文。

私钥始终留在签名设备中。验证端只保存或接收公钥、挑战和签名，不保存、读取或传输用户私钥。

## 3. 二维码信封

公共字段：

| 字段 | 类型 | 含义 |
| --- | --- | --- |
| `p` | string | 固定为 `TUYU` |
| `v` | integer | 协议版本，当前固定为 `1` |
| `k` | integer | 二维码类型 |
| `i` | string | 挑战 ID；挑战和响应必须一致 |
| `e` | integer | 挑战到期时间，Unix 毫秒 |
| `b` | object | 类型对应的正文 |

二维码类型：

| `k` | 名称 | 用途 |
| --- | --- | --- |
| `0` | account | 静态账户公钥二维码 |
| `1` | challenge | 验证端展示的单次签名挑战 |
| `2` | response | 签名设备生成的签名响应 |

### 3.1 账户二维码

```json
{"p":"TUYU","v":1,"k":0,"b":{"u":"0x..."}}
```

`b.u` 是 sr25519 公钥。途遇手机端、公民钱包以及其他获准签名端应展示同一种账户二维码。

### 3.2 挑战二维码

```json
{
  "p":"TUYU",
  "v":1,
  "k":1,
  "i":"tyc_...",
  "e":1800000000000,
  "b":{
    "o":2,
    "a":"tuyubooking",
    "t":"installation-id",
    "j":"",
    "d":"",
    "r":0,
    "n":"0x..."
  }
}
```

挑战正文字段：

| 字段 | 类型 | 含义 |
| --- | --- | --- |
| `o` | integer | 操作代码 |
| `a` | string | audience，接收签名的产品或服务 |
| `t` | string | target，具体服务端、安装实例或授权域 |
| `j` | string | subject；无预绑定主体时为空字符串 |
| `d` | string | device；不绑定设备时为空字符串 |
| `r` | integer | key revision；不使用修订号时为 `0` |
| `n` | string | 每次挑战独立生成的 32 字节随机 nonce |

### 3.3 响应二维码

```json
{
  "p":"TUYU",
  "v":1,
  "k":2,
  "i":"tyc_...",
  "e":1800000000000,
  "b":{"u":"0x...","s":"0x..."}
}
```

`b.u` 是签名公钥，`b.s` 是 sr25519 签名。验证端必须用 `i` 找回自己保存的挑战，不得相信响应端补充的挑战内容。

## 4. 操作代码

| `o` | 固定名称 | 用途 |
| --- | --- | --- |
| `1` | `TUYU_ACCOUNT_LOGIN` | 登录途遇服务端账户 |
| `2` | `LOCAL_ADMINISTRATOR_LOGIN` | 登录本机途遇商家端管理员 |
| `3` | `LOCAL_EMPLOYEE_LOGIN` | 登录本机商家员工账户 |
| `4` | `BIND_TUYU_SIGNER` | 为途遇号绑定签名公钥 |
| `5` | `ADMINISTRATOR_CONFIRMATION` | 管理员确认高权限本机操作 |

不同操作、audience 或 target 的签名不得互相复用。

## 5. 规范签名原文

签名摘要按以下字节顺序计算：

```text
preimage =
  ASCII("TUYU")
  || version_u8
  || operation_u8
  || SCALE_STRING(audience)
  || SCALE_STRING(target)
  || SCALE_STRING(subject)
  || SCALE_STRING(device)
  || key_revision_u64_le
  || SCALE_STRING(challenge_id)
  || account_public_key_32_bytes
  || expires_at_ms_u64_le
  || nonce_32_bytes

digest = BLAKE2_256(preimage)
signature = SR25519_SIGN(context="substrate", message=digest)
```

`SCALE_STRING` 是 UTF-8 字节长度的 SCALE compact 编码加 UTF-8 原文。版本和操作代码都是无符号单字节；修订号和到期时间都是 8 字节小端无符号整数。

## 6. 验证规则

验证端必须同时完成以下检查：

1. `p`、`v`、`k` 必须是当前支持的固定值。
2. 十六进制必须使用小写 `0x` 格式并满足固定字节长度。
3. 挑战 ID 必须存在、未过期、未消费并属于当前验证端。
4. 响应中的挑战 ID 和到期时间必须与服务端保存值完全一致。
5. operation、audience、target、subject、device 和 key revision 必须来自服务端保存的挑战。
6. 公钥必须通过当前产品自己的授权映射；协议成功不等于业务授权成功。
7. 签名验证成功后必须原子消费挑战，重复响应必须拒绝。

TuyuServe 负责把公钥映射到途遇号及其管理员；TuyuBooking 负责把公钥映射到本机管理员或员工。二者不共享授权表和会话。

## 7. 测试向量与变更规则

跨语言实现必须通过 `tuyu-v1-vectors.json`。任何改变签名字节的修改都属于协议版本变更，必须新增版本和向量，禁止静默修改 `v=1`。

当前阶段只冻结协议真源，现有生产登录实现将在后续步骤显式切换，不得把旧实现与本规范混合解析。
