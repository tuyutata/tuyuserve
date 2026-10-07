# 途遇服务端技术文档

## 当前工作目录归属（第8步，2026-10-06）

本产品全部测试、编译临时数据和产物归 `/Users/rhett/tuyuserve/target`。多平台先使用声明中的完整平台身份，再在平台内按build、ci、release、publish、test、tmp隔离。独立入口与控制台调用消费同一产品流程；控制台仅创建任务、调用与跟踪，不准备产品专用版本、依赖或步骤。下载半包、工具编译候选、工程视图、Runner步骤临时状态和测试夹具均属于当前产品工作区；永久工具与依赖原件继续归原件库。整个根target不进入Git、源码快照、程序摘要或打包输入。准确流程短锁、活跃任务保护、成功产物保护和原清理规则继续适用。

第8、9步完成目录与路径实现、根文档迁移及测试源码维护，未运行测试、门禁、编译或安装。本文唯一原件位于/Users/rhett/tuyuserve/TuyuServe.md；产品接口及流程直接以本仓实际代码和声明为准，业务字典库与其检查已撤销，不另建登记副本。历史验收事实不表示本轮改造已经通过验收，统一测试在第10步进行。根技术文档由本仓门禁按原文、JSON解码值及既有补丁快照扫描机密，仅报告路径；文档迁出不减少资料安全检查。


## 聊天功能的唯一产品归属

**聊天客户端的逻辑功能只能在 TataChatSDK 中实现；聊天服务端的逻辑功能只能在 TataChatServer 中实现。公民、途遇及其他产品只依赖使用。**

TuyuServe 涉及聊天时只作为依赖使用方；本条不代表尚未接入聊天的产品已经具备聊天能力。

- 消息、会话、群组、加密、协议、传输、同步、重试、聊天存储、附件、通话及聊天界面行为，按客户端与服务端职责分别归 TataChatSDK 和 TataChatServer；新增功能、缺陷修复和平台差异也必须在所属塔塔聊天产品内完成。
- 消费产品只提供产品入口、身份与业务权益结果、服务地址及授权、主题和公开接口要求的平台配置；只通过公开接口接入，禁止复制、重写、包装成另一套聊天内核或维护产品专属聊天实现。CitizenServe、TuyuServe 的产品身份与权益授权不包含聊天数据面的实现职责。
- 本机开发直接依赖仓库路径；公民、途遇等产品的正式版本依赖塔塔聊天正式 Release；第三方市场分发使用公开市场版本。依赖使用不以公开市场发布为前置条件，也不改变实现归属。

受控缓存固定为 `tuyuserve/target/<platform>/<build|ci|release|publish>/`。本机 Build 的 Node 视图、`node_modules`、Wrangler/TypeScript状态、Linux脚本测试、bundle、临时文件和日志均写 `build/`；macOS 上的 Linux ARM Build 只做源码与 bundle 编译验证，正式 PostgreSQL/Node 运行时安装包只由真实 Linux ARM64 Release 生成。

## 2026-09-02 本机 Cloudflare 编译入口

TataConsole 已登记 `tuyuserve.cloudflare.build`。Node 依赖下载进入受控公共缓存，
Wrangler dry-run 候选和全部中间数据按 `tuyuserve/target/cloudflare/build` 隔离；TuyuServe 产品源码目录
不产生依赖、临时目录或编译输出。本机 Build 仅编译，不保留target产物目录、不部署 Cloudflare。

本文是途遇服务端（TuyuServe）唯一技术事实文档。

## 途遇共用Logo资产

`tuyuserve/logo/`是TUYU产品Logo资产真源；正式矢量与位图源保存在该目录，
`generate_assets.py`生成平台所需副本，`manifest.json`登记源及衍生资源路径、尺寸和SHA-256，
`test_assets.py`回读验证副本与清单一致。产品内的PNG/ICO属于平台打包副本，不能独立修改。
Android普通图标与自适应资源统一引用`@drawable/app_icon`；自适应背景取正式位图左上角颜色，
前景在108dp图层中居中占66dp，不改画或裁剪正式Logo。`--android-only`只处理相应Android XML及清单，
不重写其他平台图片；商家Flutter资源路径以`tuyubooking/app`为准。生成与校验不代表服务部署。

塔塔控制台“途遇云端”第二行独立显示 TuyuServe。TuyuServe 与 TuyuChatServer 都固定登记
`cloudflare`平台显示编译、CI、Release、发布，`linux-arm`平台只显示编译、CI、Release；服务端不生成启动位或LinuxARM发布位。尚未接入的编译、CI、Release动作显示禁用
“未接入”，不得隐藏、删除或借用 Cloudflare 动作。聊天服务按钮位于第一行 Web 发布右侧。

## 产品总览

### 途遇服务端技术文档

#### 1. 产品定义

- 中文名称：途遇服务端
- 英文名称：`TuyuServe`
- 仓库目录：`tuyuserve/`
- OS 平台：`platform=LinuxARM`
- 当前部署供应商：`deployment_provider=cloudflare`
- 当前供应商资源：Cloudflare Workers、D1、KV、R2

TuyuServe 是全途遇统一的云端账户、公开发现、游记和软件下载服务。当前生产继续运行在
Cloudflare；同一份服务代码同时具备打包为单个 `LinuxARM` 安装包的能力，以便今后部署到
自建服务器或其他云服务。两种运行形态使用同一套 API 和唯一最终数据库结构，不维护两套业务实现。

TuyuServe 不保存途遇商家端或途遇厂家端的权威库存、订单、员工账户和内部业务数据库。

#### 2. 代码结构与职责

```text
tuyuserve/
├── account/                 # 全途遇唯一账户实现
│   ├── cloud/               # TuyuServe Cloudflare 账户存储、会话和签名适配
│   ├── src/                 # 商家端、厂家端共用的 Rust 本机管理员核心
│   └── tests/               # QR_V1、会话和账户策略测试
├── linux/                   # 当前旧物理路径；承载 LinuxARM 运行、安装、导出和导入
├── schema.sql               # Cloudflare 与 Linux 共用的唯一最终业务结构
├── src/
│   ├── catalog/             # 商家公开服务签名摘要
│   ├── social/              # 游记正文和媒体键
│   ├── merchant/            # 商家实例及管理员授权
│   ├── request_guard.ts      # 服务装配层的 HTTPS、会话和请求安全门禁
│   └── shared/              # 服务内部基础工具
└── test/                    # Cloudflare 服务合同测试
```

`account/` 是独立账户模块，不承载商家目录、聊天、游记、媒体、通知或隧道业务。仓库不创建
跨产品共享包装层，也不在 `TuyuServe` 根目录平铺账户实现。唯一数据库基线直接位于根目录；请求
守卫直接位于现有服务装配层，两个单文件包装目录均已删除。

#### 3. 全途遇唯一账户实现

账户模块同时包含两个明确隔离的数据边界：

- 云端途遇账户：由 TuyuServe 保存途遇号、`AccountId`、`sr25519` 公钥绑定、设备、挑战和云端会话。
- 本机系统管理员：途遇商家端和途遇厂家端通过 Rust 路径依赖直接复用 `tuyuserve/account`；
  管理员、公钥、审计和会话只属于当前产品、当前安装实例和当前本机数据库。

云端账户挑战和会话只绑定途遇号、签名者、目标产品和设备，不保存商家实例或商家角色。商家实例
关系与授权由 `src/merchant/` 独立保存，并在每次商家业务请求时实时读取；权限变化无需改写账户
会话即可立即生效。`account/` 不导入商家、目录、聊天或游记模块。

云端权限不能覆盖本机权限，本机权限也不能写入或覆盖云端账户。当前商家端和厂家端首次安装
不要求先向 TuyuServe 注册；今后接入云端注册时，仍以这一个账户模块扩展注册关系，不复制第二套
管理员、扫码、会话或签名实现。上游 Kamra、URY、Voyant、Hi.Events、ERPNext 和 Frappe 的
员工账户、岗位与权限保持原样。

本机管理员公共合同：

- 首次初始化只接受 `QR_V1/k=5` 的 32 字节 `sr25519` 公钥。
- 登录挑战和响应只使用 `QR_V1/k=1`、`QR_V1/k=2`。
- 每个产品和安装实例拥有独立会话作用域，公钥不可修改。
- 所有启用管理员权限相同，最多 99 名，始终至少保留 1 名启用管理员。

#### 4. 双运行时与数据库

| 职责 | 当前 Cloudflare | `LinuxARM` 自建部署 |
|---|---|---|
| 服务进程 | Workers | 安装包内固定 Node.js ARM64 与独立 systemd 服务 |
| 关系数据 | D1 | 安装包内 PostgreSQL 17.11 ARM64 |
| 短期 KV | Workers KV | PostgreSQL `tuyu_kv` |
| 对象数据 | R2 | `/var/lib/tuyuserve/objects/` 与 PostgreSQL `tuyu_objects` 元数据 |
| 业务结构 | `schema.sql` | 安装包内 `share/schema.sql`，来源相同 |
| 传输 | HTTPS | HTTPS，启动时必须提供证书和私钥 |

Linux 安装包把服务代码、固定 ARM64 Node、锁定的 PostgreSQL 17.11、唯一 schema、存储适配、
导入器、安装器、卸载器和两个 systemd unit 放在同一个 `tuyuserve-linux-arm64.tar.gz` 中。
PostgreSQL 源码地址与 SHA-256 固定在 `linux/postgresql.runtime.lock.json`，只允许在真实 Linux
ARM64 构建机上校验源码后编译；客户安装和启动阶段不联网下载数据库或依赖。
安装包同时保存 PostgreSQL 版权文件、bundle 的完整生产依赖清单及可用许可证正文。

`tuyuserve-postgresql.service` 以独立的 `tuyuserve-db` 系统用户运行，只监听
`/run/tuyuserve-postgresql` Unix Socket，不监听 TCP；`tuyuserve.service` 以 `tuyuserve` 用户运行，
使用独立 `tuyuserve_app` PostgreSQL 角色和 SCRAM 密码。数据库位于
`/var/lib/tuyuserve/postgresql/`，对象正文位于 `/var/lib/tuyuserve/objects/`。本机 KV 会话和对象
元数据进入 PostgreSQL，但对象正文不塞入关系表。

当前安装器只建立一个本机 PostgreSQL 实例。PostgreSQL 本身具备流复制能力，但主从双备、故障
切换、复制槽、备节点证书和恢复演练尚未配置，不能把数据库选型等同于已经完成高可用。

LinuxARM 运行时只允许真实 `aarch64/arm64`。构建脚本在非 LinuxARM 主机上直接失败，CI 和
Release 固定使用 `ubuntu-24.04-arm`，并回读安装包内 Node ELF 为 `ARM aarch64`。

#### 5. Cloudflare 数据导出与自建导入

Cloudflare 数据通过一个归档完整导出：

- D1：在确认写入已停止后，使用当前仓库锁定的 Wrangler 分页读取固定 14 张业务表，按固定字段
  和主键顺序写入 NDJSON；不把 SQLite 专用 SQL 交给 PostgreSQL 执行。
- KV：调用 Cloudflare 官方 REST API 分页读取全部键，以规范 Base64 无损保存字节，同时保存
  到期时间和 KV 元数据。
- R2：调用 [Cloudflare 官方 R2 Object API](https://developers.cloudflare.com/api/resources/r2/subresources/buckets/subresources/objects/)
  分页读取全部对象，保存原始字节、对象键、尺寸、ETag、HTTP 元数据、自定义元数据和 SHA-256。
- 清单：记录导出时间、每张 D1 表的字段、行数与摘要、KV 数据和每个 R2 对象摘要。

在仓库中导出：

```bash
cd /Users/rhett/tuyuserve
CLOUDFLARE_API_TOKEN=... \
CLOUDFLARE_ACCOUNT_ID=... \
TUYUSERVE_KV_NAMESPACE_ID=... \
TUYUSERVE_R2_BUCKET=tuyubooking \
TUYUSERVE_WRITES_FROZEN=confirmed \
npm run export:cloudflare -- /安全目录/tuyuserve-cloudflare.tar.gz
```

`TUYUSERVE_WRITES_FROZEN=confirmed` 只是操作者对“已经停止写入”的显式确认，不会替代实际停写。
源 D1 必须已经符合仓库当前唯一 `schema.sql`；字段、表或顺序不一致时导出直接失败。
导出目标已存在时拒绝覆盖，完整归档只通过同目录临时文件原子换入。

在 LinuxARM 服务器导入：

```bash
systemctl stop tuyuserve
set -a
. /etc/tuyuserve/env
set +a
export TUYUSERVE_POSTGRES_HOST=/run/tuyuserve-postgresql
export TUYUSERVE_POSTGRES_PORT=5432
export TUYUSERVE_POSTGRES_DATABASE=tuyuserve
export TUYUSERVE_POSTGRES_USER=tuyuserve_app
/opt/tuyuserve/node/bin/node /opt/tuyuserve/lib/import.mjs \
  /安全目录/tuyuserve-cloudflare.tar.gz /var/lib/tuyuserve
systemctl start tuyuserve
```

导入器只接受固定归档根和固定清单字段，拒绝绝对路径、路径穿越、符号链接、特殊文件、非规范
Base64、摘要不符、对象键与文件名不符、非安全整数、缺表、多表或字段漂移。导入目标只允许
空业务表、空 KV/对象元数据表和空对象目录，禁止覆盖正在使用的自建数据。导入前使用安装包内
`pg_dump` 保存 PostgreSQL 恢复文件；对象先在同盘暂存并验真，再与 PostgreSQL 事务协调切换。
导入收据固定写入 `/var/lib/tuyuserve/cloudflare-import.json`，记录数据库恢复文件与原对象目录。
已有导入收据时拒绝重复覆盖。
该流程是一次完整数据导出与导入，不执行 Cloudflare 和自建服务器双写。

#### 6. 当前 API 与业务边界

| API | 当前职责 |
|---|---|
| `POST /v1/auth/challenge` | 创建绑定途遇号、设备和 audience 的登录挑战 |
| `POST /v1/auth/session` | 验证 `sr25519` 签名并创建云端会话 |
| `POST /v1/auth/logout` | 注销当前云端会话 |
| `GET /v1/catalog` | 返回仍有效的签名商家服务摘要 |
| `GET/PUT /v1/catalog/:listing_id` | 读取或由商家安装实例发布签名摘要 |
| `GET/POST /v1/trips` | 公开读取或由已登录用户幂等发布游记 |
| `GET /v1/health` | 服务身份与健康检查 |

聊天会话、消息同步、存储和推送由 TataChatServer 唯一实现；TuyuServe 的旧聊天路由不属于最终产品职责，不得继续作为接入方案。本轮仅纠正文档，旧代码及运行状态尚未复查。游记当前保存正文和对象键；媒体上传授权、缩略图和通知尚未实现。

#### 7. 商家、厂家和客户端边界

TuyuBooking 只向 TuyuServe 发布酒店、餐厅、旅行团或票务的签名公开摘要、准确 HTTPS 地址和
短期有效期。途遇旅行必须先验证摘要签名，再直接向该商家 HTTPS 地址获取实时报价并提交预订；
TuyuServe 不代理预订，也不保存商家订单。

TuyuFactory 今后只发布厂家和商品公开摘要。途遇商家端中的途遇商城发现摘要后，必须直接向
厂家实例确认批发价、库存、起订量和交期；TuyuServe 不代理采购，也不保存采购单或销售单。

#### 8. 安全要求

- 所有第一方网络连接只允许 HTTPS/WSS，Linux 服务没有证书和私钥时拒绝启动。
- 登录挑战短时、一次性并绑定 audience、途遇号、设备和密钥修订号。
- Session Token 明文只返回客户端；D1 和 KV 索引只使用 Token 的 SHA-256。
- 公开摘要必须验证安装实例、`sr25519` 签名、时间、HTTPS 地址和允许字段。
- 写请求必须具备请求标识与幂等边界。
- 私钥、完整 Token、联系方式原文和平台凭据不得进入日志、仓库或响应。
- Cloudflare API Token 只用于操作者主动执行导出，不进入 Linux 安装包和数据归档。

#### 9. 安装、升级、回滚与 Release

解包后以 root 执行 `install.sh`。程序安装到 `/opt/tuyuserve`，配置位于 `/etc/tuyuserve`，数据
位于 `/var/lib/tuyuserve`。升级时程序目录原子替换，数据和配置不变；上一版程序保存在
`/opt/tuyuserve.rollback`，执行 `/opt/tuyuserve/install.sh rollback` 可恢复上一版程序。

首次安装创建 `tuyuserve`、`tuyuserve-db` 两个系统用户、随机 256 位 PostgreSQL 应用密码、
本机数据库和角色。卸载会停止并删除两个 systemd unit 和程序目录，但保留 PostgreSQL、对象、
备份和配置。当前安装包只锁定 PostgreSQL 17.11，不在安装时隐式执行数据库大版本升级。

Cloudflare Release 继续使用 `tuyuserve-cloudflare-v<software_version>`，生产发布仍只由本机
TataConsole 验真正式 Release 后执行。LinuxARM Release 使用
`tuyuserve-linux-arm-v<software_version>`，主资产固定为
`tuyuserve-linux-arm64.tar.gz`；它只固化可安装包，不代表已经部署到任何自建服务器。

两个 Release 都只接受准确 `main` 源码与对应最新成功 CI，禁止覆盖既有 Tag 或 Release，并
同时发布 `release-manifest.json` 和 `SHA256SUMS`。

#### 10. 当前验收与未完成项

- TuyuServe Cloudflare 服务测试 28 项通过，TypeScript 类型检查通过。
- `tuyuserve/account` Rust 测试 4 项通过。
- 唯一 `schema.sql` 已分别由本地 D1 和真实 PostgreSQL 17.11 执行；Linux PostgreSQL、KV、对象
  元数据、并发序号、Cloudflare 导出停写门禁和归档导入测试 5 项通过。
- PostgreSQL 17.11 源码 SHA-256 已按锁定值复核；安装、卸载脚本通过 ShellCheck，两个 Linux
  ARM64 工作流与顶层路由通过 actionlint。
- 本机 macOS 构建会按合同失败；真正的 PostgreSQL ARM64 源码编译、ELF 回读、安装包内数据库
  启动、Linux 测试和 HTTPS 健康检查由 `ubuntu-24.04-arm` CI 执行。

尚未完成的能力包括 WSS 实时在线状态、媒体上传授权、通知、厂家商品索引与自建服务器生产部署。
这些未完成项不得冒充当前可用能力，也不改变当前 Cloudflare 生产运行方式。

#### 2026-08-27 途遇 Logo 资产职责

TuyuServe 产品根目录下的 `logo/` 是全部途遇产品唯一的 Logo 权威资产目录。目录保存正式矢量源、500x500 RGBA 位图源、权威尺寸、生成器、清单和校验器；TuyuServe 不因此承担图形界面职责，只负责在仓库结构中持有统一品牌资产。

厂家品牌副本由 `generate_assets.py` 和 `manifest.json` 统一定位到 `tuyufactory/app/` 下的页面、macOS 与 Windows 资源。工程路径调整只更新这些路径，不重生成图像、不改变哈希或其他产品记录；本项不涉及账户或服务端业务实现。

当前矢量源 SHA-256 为 `24e0489b8b10e47d3b7bba009c74b1cb94d915087150db928e9722980442531b`，位图源 SHA-256 为 `27391305fe4e564dfceb54284383525901b3f70b39ff57e12e552f9eb4aa7b89`。

#### 途遇账户签名协议 TUYU v1（2026-08-28）

- `account/protocol/SPECIFICATION.md` 是途遇账户签名协议的权威规范，`account/protocol/tuyu-v1-vectors.json` 是 Rust、TypeScript、Dart 等实现必须共同通过的固定向量。
- 统一签名原文使用 `TUYU` 域、版本、操作代码和规范 SCALE claims，经 Blake2-256 后使用 sr25519 `substrate` context 签名。
- TuyuServe 的职责是根据签名公钥解析途遇号及其管理员授权；协议层不承载角色，也不把服务端授权数据下放到其他产品。
- 当前 Cloudflare 登录代码尚未在本阶段切换到 TUYU v1。后续切换时必须删除重复摘要构造，改为共享实现，并以固定向量作为发布门禁。

#### 2026-08-28 本机产品首位管理员签名初始化

- `account` 共享模块不再允许本机产品通过公钥二维码直接创建首位管理员。首次初始化和日常登录统一使用 `TUYU v1` 挑战与 sr25519 签名响应，但通过本机待处理挑战用途严格隔离。
- 首位管理员公钥只从通过验签的响应中取得，随后由产品本机 PostgreSQL 在安装实例锁保护下原子登记；并发初始化最多成功一次，不涉及 TuyuServe 云端途遇号或商家授权表。
- 后续管理员仍由已登录的本机管理员添加标准账户公钥二维码。共享模块只保存管理员公钥、可选姓名、状态和审计记录，不生成、读取或保存私钥。

#### 2026-08-29 跨产品数据与部署边界归并

- TuyuServe 是途遇号、公钥绑定、安全联系方式、游记、媒体、普通产品通知以及商家和厂家公开签名
  摘要的云端权威；搜索结果只是缓存索引，不是实时交易、库存或订单权威。
- TuyuBooking 与 TuyuFactory 均运行在所属机构自己的电脑或服务器。TuyuServe 不运行二者的业务
  进程或 PostgreSQL，不代理实时预订或采购，也不保存商家订单、厂家销售订单或实时库存。
- TuyuLove 和途遇商城必须先读取公开摘要，再直连摘要中的具体 HTTPS 权威实例确认实时数据；
  实例离线时只能使用带时间标记的缓存，不能由 TuyuServe 代替实例确认交易。
- 当前生产继续使用 Cloudflare Workers、D1、KV、R2；LinuxARM 安装包是同一代码和最终结构的
  自建部署形态，不改变商家端、厂家端各自独立部署和持有业务数据的边界。
- `tuyuserve/account/` 继续是全途遇唯一账户与本机管理员公共实现，但云端途遇账户、商家端本机
  管理员、厂家端本机管理员和各上游员工账户保持独立作用域，任何一方都不能覆盖另一方权限。

## GitHub CI 增量缓存（第 7.3 步）

途遇服务端 Cloudflare 部署流与 LinuxARM CI 已接入统一 CI 缓存。Worker 缓存 npm/XDG 状态，LinuxARM 服务缓存 Rust/Node 中间状态，部署和 Release 不使用 CI 增量缓存。

## Release 全量构建（第 7.4 步）

正式 Release 固定从干净源码执行全量构建，显式关闭 Rust 增量编译及工具链内置缓存，不读取CI作业缓存且不复用本机编译中间物。版本、签名、校验、产物和发布流程保持原有产品合同。
最新成功 CI 解析器作为可复用 Workflow 调用 Job 只传入 `ci_title`，不得声明 `env`；`CARGO_INCREMENTAL: "0"` 只属于实际 Release 构建 Job。

## 双仓统一流程最终收口（第 7.5 步）

本产品执行统一流程规则：本机编译中间物只进入本轮塔塔缓存库的build目录并按终态规则清理；GitHub CI 的作业过程数据只进入该次Runner任务空间；正式Release从干净编译状态执行。源码不进入塔塔缓存库、塔塔依赖库或塔塔产物库。

## TuyuChatServer 产品边界

TuyuChatServer 是 tuyutata/tuyuchatserver中的独立途遇主应用聊天服务实例，通用实现只来自 公开完整产品仓tuyutata/tatachatserver。正式地址固定为 `https://chat.tuyulove.com` 与 `wss://chat.tuyulove.com/realtime`，授权签发方是 TuyuServe，授权受众固定为 `tuyuchatserver`。

`tuyuchatserver/` 只保存宿主声明和 Cloudflare 资源配置，不复制通用消息、附件、实时连接、OpenMLS 密文或系统推送实现。TuyuServe 只负责途遇产品身份与权益授权，不得实现或保留独立聊天数据面。旧聊天实现是否已经清除、运行流量是否已经接入 TuyuChatServer 尚未复查，不能把本次文档纠正表述为生产切换完成。

### 途遇云端服务端行（2026-09-02）

塔塔控制台“途遇云端”下行显示为“服务端”，其中 TuyuServe 与 TuyuChatServer 的按钮按两个独立
产品登记顺序排列。该视觉分组不改变 TuyuServe 的既有 Cloudflare/LinuxARM 流程，也不把聊天
服务动作、版本或记录并入 TuyuServe。

## 平台与部署字段合同冻结（TUYU 第 3.1 步，2026-09-02）

- TuyuServe 的控制台平台只使用规范值 `cloudflare`、`linux-arm`。当前 `tuyuserve/linux/` 是产品源码内部实现路径，不得成为第三个控制台平台别名。
- Workers、D1、KV 与 R2 是 Cloudflare 平台内的供应商资源；当前生产运行在 Cloudflare 不会把 `linux-arm` 从产品平台合同中删除。
- 既有受控 `platform=cloudflare` 签名、路由与持久化 wire 本步骤没有局部改名；其迁移必须覆盖全部生产者、消费者、签名端和历史状态，禁止双写兼容。
- `arm64`、`aarch64`、Rust target triple、Runner 和归档架构继续作为类型明确的机器值。本步骤没有修改源码、目录、CI、Release、发布或部署。
### Build与Start物理归属（2026-09-12）

本产品Build、CI和Release唯一实现位于产品scripts目录；TataConsole只按固定身份调用。Start由TataConsole启动产物库中的macOS成功产物，产品不实现Start。

- tuyuserve：
  - `tuyuserve.cloudflare.build` → `tataconsole/console/tuyuserve/cloudflare/build.sh`
  - `tuyuserve.linux-arm.build` → `tataconsole/console/tuyuserve/linux-arm/build.sh`

## CI与Release入口归属

本产品CI与Release由所属仓当前`scripts/flows.json`的remote_routes及各平台Workflow声明定位，完整执行入口为本仓`scripts/flow.mjs`。控制台读取当前声明、创建原有真实任务、获取准确仓权限并跟踪原Run；旧控制台CI/Release Shell与Swift执行文件已删除，不作为入口。

## CitizenSDK统一边界复查（2026-09-15）

TuyuServe不持有用户私钥、不创建钱包，也不运行轻节点；途遇号、公钥绑定、挑战、会话、商家索引和授权判断
仍属于服务端业务。但是当前Cloudflare实现直接调用`@polkadot/util-crypto`验签，Rust `account`模块直接调用
`schnorrkel`构造TUYU摘要并验签，TuyuBooking和TuyuFactory本机主机再复用该路径。这构成独立于CitizenSDK的
第二套签名/验签实现，不符合全途遇统一边界。

最终结构中，TuyuServe继续拥有TUYU业务载荷、挑战状态、重放保护和授权数据，但密码学签名/验签必须调用
CitizenSDK正式提供的服务端可消费公开接口或发布件；Cloudflare TypeScript、Linux/Rust和移动端必须使用同一
实现与金标，不得继续并列维护`@polkadot/util-crypto`、`schnorrkel`和Dart/Rust私有实现。本轮仅报告该设计缺口，
未改动账户协议或生产认证路径。

## 独立 GitHub CI 与 Release 工作流

本产品每个实际产品、平台、流程身份使用下列独立文件，主 Job 为 `flow`；CI 验证源码，Release 生成正式产物，发布由塔塔控制台的独立 Publish 流程负责。

- `.github/workflows/tuyuserve-cloudflare-ci.yml`
- `.github/workflows/tuyuserve-cloudflare-release.yml`
- `.github/workflows/tuyuserve-linux-arm-ci.yml`
- `.github/workflows/tuyuserve-linux-arm-release.yml`

### Logo 目录整合后的资源路径

四款应用页面 Logo 位于各自 Flutter 工程根的`tuyu_logo.png`；商家、厂家 macOS 图标位于`macos/Runner/AppIcon.appiconset/`，Windows 图标位于`windows/runner/app_icon.ico`。清单、生成目标与校验使用同一现有位置，iOS 资源路径保持不变。路径调整保持原图片、尺寸及摘要；校验只读资源，不运行生成器。

本产品正式Release主flow Job实际创建GitHub版本，contents权限准确为当前仓write；辅助Job与其它权限保持原登记。源提交、成功CI、版本及资产验真不放宽，不派发发布。
## 完整产品组织与执行合同

所有者：`tuyuserve`，正式源码根 `/Users/rhett/tuyuserve`；本说明属于该完整产品。组件不会拆成独立仓库或目录产品。所有执行身份统一为 `产品.平台.流程`，单平台仅在控制台显示和物理目录中省略平台层。

真实平台目标：`cloudflare`、`linux-arm`。

推送门禁唯一源码位于 `/Users/rhett/tuyuserve/.github/tatagate/`，GitHub入口 `/Users/rhett/tuyuserve/.github/workflows/tatagate.yml`。控制台先从本仓已保存提交执行这份门禁，通过后推送准确SHA；GitHub main push再执行同一提交的门禁，控制台核对所属仓、Workflow、main、SHA、Run和attempt，只有success并再次回查main一致才完成推送。失败、取消、超时或身份漂移均不得显示成功，不自动重试或派发CI/Release。

技术文档由所属完整产品仓根唯一持有；私有规则和任务库由控制台私仓持有，公开产品不读取它们。公开门禁不依赖私仓资料、安装包源码、其它本机产品或个人账号；必要链真源先锁定公开main的实际SHA后只读该SHA。本机开发跨产品验收仍比较三仓已保存快照与各端真实镜像。


### 门禁与开发审查职责

准确中文注释按开发阶段逐项复核，不以保留源码每文件包含汉字作为仓库门禁的开发凭证。初始完整内容、生成文件和上游原件保持原文；真实第一方临时注释、机密、源码输出、Workflow、依赖和适用测试仍由本仓同提交门禁验真。公民门禁只把scripts中的Node命令行结果报告识别为CLI输出；本仓实际执行测试的准确协议拒绝断言不属于新运行协议，字符串、注释、模板和未登记测试中的同文不豁免。保存及推送仍逐仓独立授权，并以本机门禁和同SHA的GitHub门禁双成功为唯一终态。

### 仓库合同与平台验收归属

仓库门禁检查同提交源码及四个现存CI/Release Job；需要pg和真实PostgreSQL的Linux导入、存储验收继续由既有Linux ARM CI/Release执行并传入正式工具输入，禁止要求推送门禁借用开发数据库或跳过这些平台测试。

## 产品介绍与开源许可

根目录 `README.md` 仅提供本产品简明介绍，不承载技术方案、任务记录或验收结论。独立自有代码采用根 `LICENSE` 的MIT；上游代码、衍生修改、依赖及组合分发遵循各自原许可、版权、例外与附加要求。


### 本机Build代码所有权

本产品的scripts/flows.json声明自身平台、准确工具版本、原始锁以及既有CI/Release入口；scripts/build.mjs独立实现requirements、prepare、build三个阶段，拥有工程准备、编译命令、候选验真和失败条件。产品只消费调用方交付的公开资源回执，按本仓原始锁取得依赖，所有生成状态进入规范源码外工作目录。平台或资源身份不符、版本错误、缺锁、链接越界、归档摘要错误、旧工程复用或编译器失败均立即失败。


### 产品独立资源与编译入口

本产品的scripts/flows.json声明自身平台、准确工具版本、原始锁以及既有CI/Release入口；scripts/build.mjs独立实现requirements、prepare、build三个阶段，拥有工程准备、编译命令、候选验真和失败条件。产品只消费调用方交付的公开资源回执，按本仓原始锁取得依赖，所有生成状态进入规范源码外工作目录。平台或资源身份不符、版本错误、缺锁、链接越界、归档摘要错误、旧工程复用或编译器失败均立即失败。

本产品平台闭集为`cloudflare`、`linux-arm`。调用格式为`node scripts/build.mjs <requirements|prepare|build> <platform> --work <绝对工作目录>`；requirements只读并输出唯一JSON，prepare/build从标准输入读取schema=1的资源回执。调用方交付准确工具执行器、锁定依赖目录、Git来源和归档后先prepare，再读取展开来源新增的需求，完整交付后执行build。准备、展开和编译属于同一调用工作根，各平台互不共享可写状态。独立调用方按本仓声明准备资源即可运行，无需读取其他产品工作树或私有资料。

Git依赖只接受本仓声明与锁一致的HTTPS地址及40位固定提交；原生归档只接受本产品锁定坐标及完整SHA-256。工程副本排除旧生成物，内部文件链接重映射到同轮副本，外部链接与已有工程拒绝。原始依赖缓存必须显式交付，不能落入用户默认缓存；离线编译禁止隐式取得缺失资源。已有CI/Release Workflow仍各自调用本仓scripts，不受本机可视化入口是否存在影响。入口回归由本仓`scripts/build.test.mjs`负责，适配与资源服务的验证不替代产品编译和真实候选验收。


## 2026-10-06 产品自主资源阶段（第2步）

本仓`scripts/resources.mjs`拥有工具准确来源/版本/配方、递归锁解析、缺失获取、验真、复用和本轮依赖准备；`scripts/build.mjs resources <platform> --work <绝对外部工作根>`调用同一实现，独立入口为`resources.mjs <platform> --work <工作根> [--offline]`。前者从stdin读取公开身份回执；后者允许空请求。最小宿主必须使用本仓声明的官方Node25.2.1绝对入口，本机配方限定macOS ARM；资源阶段回读官方发行归档与运行Node字节，不能从PATH取同名程序。工作根预先存在、位于源码外且不经过链接。

可选`PRODUCT_TOOL_ROOT`只供读取工具原件，`PRODUCT_DEPENDENCY_ROOT`只供读取依赖原件；产品不读取供给者的版本决策或私有任务变量。独立缺省原件库为源码外`~/.local/share/product-resources`，本轮可写状态仅在work。GNU Bash/grep/sed纳入自身需求；发行件旧Shell仅用于声明中的首次GNU构建，不进入正式PATH。下载/源码工具编译不持全局锁，最终不可变对象提交使用短锁，取消传递到工具进程组。错误摘要、损坏、未锁来源、路径越界和显式离线缺失失败并保留可疑原件。

Pub/npm/Cargo按原始锁准备；Git按固定HTTPS提交检出，Git Cargo目录源展开workspace继承并锁定相对包版本；CocoaPods按准确锁摘要恢复验真快照，缺失spec校验规范摘要，未锁源码来源拒绝取得。Android固定包与修订归产品；额外平台仅消费官方固定发行来源与发行树摘要，不借宿主历史SDK目录。Maven供给只读验真后复制到独占Gradle缓存，由产品准备现有配置，消费仍离线；全库坐标导入与旧目录清理留到第5步。

`PRODUCT_WORK_DIR`、`PRODUCT_BASH_BIN`、`PRODUCT_RSYNC_BIN`及`PRODUCT_SOURCE_DIR`是公开工作/工具/工程入口；Flutter修订不读取调用方私有变量，也不回退系统rsync。旧Flutter补丁对象与当前配方不符时拒绝复用，真实替换须按准确资源操作另行授权。本步不改变编译、签名、安装及回读顺序，不修改产品UI，也未执行真实工具下载/安装。受控资源测试不能代替官方首次取得、正式编译或最终真实运行验收；第4至7步仍待逐步确认实施。

资源原件按完整内容验真后整体提交：Git bundle与固定来源/摘要回执处于同一个不可变对象，不暴露中间状态；可选依赖供给读取`objects/<SHA256>.blob`。锁解析器、源码工具依赖与官方有序补丁也从同一产品原件存储复用。Pod spec每次按锁中的规范checksum回验，Git tag只核对发行声明并消费本产品预锁提交；HTTP发行件消费固定SHA256，首次源码准备命令来自该已验真spec并由GNU Bash执行。spec、准备后源码与文件清单整体提交，再复制到本轮缓存；供给索引不决定产品版本。正式PATH排除旧POSIX Shell，`sh`对应已验真的GNU Bash。

独立缺省资源目录内`tools`保存工具发行件及工具编译输入，`rely`保存产品依赖的归档、Git和Pod原件；工作区只承载本轮可写视图。根据用户最新要求，分步骤先完成实现与用例，整项解耦任务完成后统一测试；本步实施记录不等于真实工具首次取得、完整Build或安装验收通过。


### 第3步：产品完整Build入口（2026-10-06）

本产品的正式完整入口为已锁定Node的绝对路径调用`/Users/rhett/tuyuserve/scripts/build.mjs execute <platform> --work <已存在绝对工作根>`，可选`--offline`。输入stdin可为空；调用方可传schema/product_id/platform/work及真实run_id/program_digest，禁止私有变量或执行命令。入口内部完成需求→资源→准备→再次需求/资源闭包→编译→适用签名/安装/回读；独立与控制台调用同一实现。最小引导Node只启动本产品的资源引导器，产品按自己的官方Node声明验真、准备并重入，控制台运行Node不决定产品Node版本。

标准输出只有唯一有界JSON：schema、product_id、platform、work、completion、files及可选真实run_id。completion沿用固定平台的device-install/macos-artifact/compile-only；files按本产品flows.json登记路径和SHA256。编译日志使用stderr进入现有任务日志，不新增资源任务或任务状态。完整结果只在各阶段成功、源码/锁不漂移、工具进程确认退出后落入本轮build-result.json；同根并发或复用旧结果拒绝，取消/失联/错误身份/损坏候选不得成功。

控制台每次Build直接读取本产品当前flows.json入口，调用一次execute；控制台只跟踪真实任务、核验公开结果和保存产物，不解释产品工具、依赖、编译参数或设备规则。当前控制台静态菜单、其它产品流程/安装器与程序摘要的历史耦合仍归第4步解除，本步不能当作整项解耦已完成。

本步同步完整入口、失败/取消/并发、结果/路径/摘要及适用移动端用例，但未运行测试、语法检查、编译、签名、安装或工具下载/替换；全部实现步骤完成后统一验收。源码交付与用例存在不代表真实Build已经通过。


### 第4步实施中：远端路由当前声明

CI/Release的规范身份、标题、版本前缀和正式版本记录标志已迁入所属仓现有scripts/flows.json的remote_routes。调用方按固定已接入动作重读当前声明；原生授权与流程查询不再使用编译期产品路由常量。产品声明只提供数据，不授予凭据、扩大平台矩阵或新增按钮。损坏、重复、越仓、字段越界及超限拒绝。

本次同步路线读取、热更新和失败边界用例，未运行测试、语法检查、编译、签名、安装或下载。第4步仍在开发中：Publish执行器、聊天安装器、Start、固定菜单声明与完整程序摘要的其余实际耦合尚未解除，不能报告该步或整项任务完成。

### 产品远端完整入口

本仓`scripts/flows.json`的`flow_entry`定位公开`scripts/flow.mjs`。`run ci <platform>`和`run release <platform>`分别执行同一产品流程，当前读取本仓Workflow与路由；Release的`version_source`声明准确版本文件类型和相对路径。成功CI选择、同源候选复用、版本递增、正式Release验真与旧Run/Artifact清理均由本产品入口完成。独立执行只需等价的本仓短期GitHub权限；没有宿主控制管道时入口自行跟踪Run，不依赖其它产品程序。

可选`PRODUCT_CONTROL_FD=3`只接受当前Run绑定确认、候选持久化确认和二值远端终态；令牌仅进入HTTPS请求头，未知身份、越仓、无成功CI、候选错源、控制帧错误、超时或取消均失败。宿主重启后的`recover`使用同一公开入口核验原Run、原候选并清理，不重新派发。公开控制协议不携带私有调用方变量，现有授权及用户操作顺序保持。源码、声明或Workflow在本次流程期间变化将拒绝继续。

相关正常、失败、身份、版本来源、独立远端跟踪、候选重试和真实控制管道边界用例位于本仓`scripts/flow.test.mjs`；当前只完善源码，尚未运行用例或远端操作。


### 产品软件记录与正式版本恢复

本仓公开`scripts/flow.mjs records`使用准确同仓短期GitHub权限，重读本仓当前路由，复用远端流程同一Run保留器并确认实际删除，再读取各平台最新正式版本。来源合同归本仓release.record_source：按实际产品选择Tag、单包正文或正式元数据资产验真，标题、版本、源码与适用不可变标志不能由调用方推测。准确元数据资产仅经官方HTTPS地址读取，跨主机不转发仓库令牌。正式资产和Tag不会在记录刷新中删除。公开结果仍是records/removed_run_ids，原记录页行为保持。

`recover`不重新派发；重新核验原候选、成功CI、原Run终态、正式资产来源与Tag，输出formal_release/removed_run_ids。控制调用方仅绑定原任务身份、原候选和产品公开回执，更新现有持久发布目标；产品验真算法不再随调用方程序编译。相关正常、失败、错资产/正文/来源、重定向隔离、独立记录刷新和恢复用例源码归本仓flow.test.mjs。

资源工具取消、超时、输出超限和异常收尾均等待主进程与整个后代组退出；无法确认退出时保留工作根和候选，禁止删除输入或改为可写。真实取消退出顺序用例仅写入resources.test.mjs，尚未执行。


### 发布实现范围

本轮新增产品发布实现已撤销，发布功能由后续逐个产品重建。现有操作入口与界面保留，当前不提供已删除实现的执行保证；Build、CI、Release和Start继续按各自现有入口运行。


### 产品独立资源与唯一依赖供给

本产品的scripts/resources.mjs拥有资源解析、来源与摘要验证、缺件取得、可写视图和失败条件。PRODUCT_DEPENDENCY_ROOT是可选只读供给；没有供给时使用源码外的本产品原件存储，产品需求仍只由当前源码、声明和锁决定。依赖索引读取仅接受schema_version=2及packages、git_sources、pods，不恢复旧目录或整锁快照。

Maven的具体JAR、AAR、POM、module及分类器文件统一由packages的group:artifact、version、准确上游URL、SHA256和SRI定位objects中的原件。产品在本轮work/dependencies/maven按上游分区复制独占文件；不复制Gradle二进制元数据、锁和下载状态。产品生成本轮GRADLE_USER_HOME/init.d初始化脚本，只在自身已声明的同源仓库之前加入本轮原件视图，缺件仍按产品原仓库解析，明确离线则失败。Gradle解析、工程状态和后续编译都属于同一产品任务。

Pod由pods中的name、version、checksum匹配当前Podfile.lock；spec保存官方CDN地址和原件摘要，source保存官方podspec来源，files保存发布树相对路径、文件内容摘要与权限或安全内部链接。只物化本产品所需的单个发布坐标；其它Pod、整锁、平台或宿主变化不要求复制全树。产品仍按CocoaPods官方规范回验SPEC CHECKSUMS，再验证本产品预锁定Git提交或HTTP发行摘要与源码回执。可写缓存和工具VERSION仅在本轮work产生，不能写回共享原件。

错来源、摘要、重复同源内容、生成状态、硬链接、内部链接越界或循环、取消及任务副本漂移均据实失败。独立与控制台调用使用同一实现；控制台只提供可选原件并跟踪原有任务，UI、功能、按钮、平台与操作顺序保持。用例源码已同步，执行留待整项实现结束后的统一测试。


### 独立入口回归验真边界

资源回归使用自带固定提交、源码字节和spec的合成Pod，不借用产品真实Pod清单提供测试输入；无真实Pod需求的平台也验证来源、摘要、链接、循环、取消和物化失败。测试现场仍位于本产品target的准确平台，不写源码或其它产品目录。资源声明与生产依赖坐标不因测试夹具改变。

资源取消对同一真实进程组每轮只发送一次信号；组不存在或Windows时才发送给主进程。仍等待主进程和后代实际退出，8秒未退出才强杀，12秒仍未确认则保留现场并失败；取消不能成为成功。


本产品scripts/build.mjs的模块初始化与CLI执行分离：私有异步runCLI承载原命令主体，仅在直接执行文件时启动，拒绝时输出错误并以退出码1失败。模块求值先完成，scripts/resources.mjs可反向导入同一checkWork、requirements和平台校验，不复制实现或增加启动入口；普通import不启动CLI。现有公开参数、JSON请求、--offline、锁定Node验真和必要重入、资源/准备/编译/适用签名安装回读步骤以及取消与结果合同保持。离线缺件和非法输入必须真实失败，禁止以未完成顶层await退出替代完整结果。对应真实CLI回归只在自有target测试现场替换资源供给边界，验证反向导入、参数与错误传播，不据此声称实际产品编译通过。


本产品scripts/resources.mjs的普通inventory清单保持独占文件要求；工具原件toolInventory复用同一扫描实现，只允许全部真实名称均位于同一规范payload内的硬链接组。扫描按dev/ino分组，实际名称数量必须与nlink闭合；工具普通文件以O_NOFOLLOW打开，打开及读取后复验身份、计数、权限和字节相关元数据，扫描结束再回读全部目录、文件及链接身份与规范目标。原件外额外名称、目录或链接越界、特殊项、读取期间替换/权限/内容变化均失败。清单仍逐路径保留原有path/sha256/executable或directory/target格式，继续由既有回执、准确官方归档/版本、配方和编译输入证明验真；regular与其它资源默认独占校验不放宽。不新增公开命令、参数、声明字段或原件登记，不改版本、锁、配方和工具原件，不以拆分内部链接、重新安装或下载解决验真。回归复制本仓完整实现到所属target测试现场，仅替换文件IO边界以确定性制造读取变化，并在夹具内暴露已有私有验真函数；纯合成对象覆盖正常、拒绝与回执漂移，不据此宣称真实工具或产品编译通过。


本产品资源验真将下载运输元数据与源码工具编译身份分开：仅在源码工具证明和本产品声明的比较副本中，验证并移除archive.mirrors与upstream_patches各项mirrors。镜像须为非空、无重复、无控制字符/空白、无账号/口令/片段的准确规范HTTPS地址数组；错误格式直接失败。官方来源URL、版本、归档字节摘要、kind/root/executable、补丁来源/摘要/顺序、前置与依赖闭包、其它位置同名字段及未知字段继续严格比较。Xcode/POSIX输入、recipe.source和source.archive/source.gem摘要、原回执清单及入口独占规则不变；比较不改写原证明、声明或回执，不改变原件/登记/配方/版本/锁和实际下载策略，不读取控制台登记作为产品版本或策略来源。既有回归使用完整本仓资源实现及纯合成物理证明，逐次重算清单，验证运输差异可复用与真正输入漂移必须失败；测试不启动工具或冒充真实编译交付。


本仓平台命名门禁仍扫描完整Git跟踪路径和正文，仅在内存副本识别scripts/resources.mjs中唯一规范的toolDefinitions与flutterPatch声明。规范JSON回读及唯一工具身份阻断重复键、转义、歧义和重复声明；使用Flutter时核验准确官方来源、版本对应归档和本仓补丁来源与全文摘要，未使用Flutter时只接受已核实固定来源与全文SHA-256的共同原补丁。仅处理官方native_assets_host.dart中与准确文件头、行号、lipoDylibs签名及紧邻调用同时闭合的一行原上下文注释，其它新增、删除、上下文、源码和路径的旧平台名称继续拒绝；实际资源源码、补丁、版本、锁和原件不变。目录边界回归以unlinkSync删除自身合成目录符号链接，继续完整验证根target普通目录可用、嵌套target/目录链接/普通文件拒绝；生产目录边界规则不变。回归使用本仓真实门禁与完整Git跟踪合成文件，只在本产品准确target测试现场运行，不将扫描夹具作为真实产品编译或发布证据。

本仓门禁的测试子进程白名单仅保留已有PRODUCT_GIT_BIN准确执行器路径，供完整Git索引夹具使用；缺少该准确入口时回归失败，不查询PATH、不回退系统Git、不传凭据或其它产品材料。不新增工具版本、声明字段、公开参数或生产资源获取步骤。
