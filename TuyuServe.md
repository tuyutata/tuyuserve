# 途遇服务端技术文档

## 平台编译现场

本产品编译任务使用本仓 `target/build/<平台>` 独立临时目录，平台键为 `cloudflare`、`linux-arm`。不同平台同时领取并执行；同平台已有活跃任务时立即拒绝再次领取。资源准备、工程副本、缓存和编译输出只写本平台现场；确认进程及后代退出、结果被调用方消费后，删除整个平台目录。`target/build` 仅是父目录，`target/test` 仍用于独立测试。独立执行和控制台调度调用同一本仓编译入口与清理接口。

途遇服务的Cloudflare与Linux ARM本机入口只确认源码编译，Worker部署及Linux运行时安装属于另外的真实流程。本机结果不携带部署字段、正式资产或设备安装终态。

## 工具与依赖的声明和供给职责（2026-10-08）

本产品完全独立管理全部流程所需的工具、依赖及其它资源需求。需求唯一依据为本仓源码、公开声明、锁文件及本产品拥有的准备配方，包括准确版本、平台、官方来源、摘要或固定提交、闭包、验真方式和失败条件；塔塔控制台按当前产品声明提供资源，不维护另一份产品需求或替产品决定版本、来源与流程步骤。

本产品必须能在没有塔塔控制台时完全独立执行全部已实现流程。独立执行时，本产品自行完成可信引导、资源获取、验真、保存、复用及任务工作视图准备，不依赖控制台源码、私有资料、安装位置或资源库。

通过塔塔控制台执行本产品流程时，本产品向控制台声明所需资源并使用其已准备好的供给。控制台先核对并复用已有的匹配工具与依赖；没有的由控制台按本产品声明下载、准备、验真并保存到控制台工具库或依赖库，再交付本产品复用。本产品负责核验交付与自身需求一致并使用资源，不因控制台缺件或供给失败改为自行下载，也不另建同一资源的永久副本；可写包管理器视图与流程过程数据仍归本产品当前任务工作目录。

两种执行方式使用本产品同一声明、锁和流程实现，仅资源供给职责随执行方式改变。该职责适用于本产品全部平台与已实现流程。独立模式下资源缺失由产品处理；控制台模式下资源缺失由控制台处理。显式离线缺件、交付失败、损坏、错误摘要、来源漂移或越界必须据实失败，不自动升级、覆盖可疑原件或切换执行方式。

以上为当前职责规范；本次只更新文档，不代表现有资源协议与运行代码已完成接入或通过真实流程验收。历史记录中的“可选供给”或“产品负责缺件获取”仅描述当时实现，不作为当前职责依据。

## 当前工作目录归属（第8步，2026-10-06）

本产品测试、编译的当前工作目录及收尾只按本文“本机固定执行目录”执行。独立入口与控制台调用共用本仓流程；永久工具与依赖原件保留在所属执行方式的源码外原件库，本轮可写资源视图、工程、下载半包和测试夹具只进入本产品当前现场。

第8、9步完成目录与路径实现、根文档迁移及测试源码维护，未运行测试、门禁、编译或安装。本文唯一原件位于<本仓根>/TuyuServe.md；产品接口及流程直接以本仓实际代码和声明为准，业务字典库与其检查已撤销，不另建登记副本。历史验收事实不表示本轮改造已经通过验收，统一测试在第10步进行。根技术文档由本仓门禁按原文、JSON解码值及既有补丁快照扫描机密，仅报告路径；文档迁出不减少资料安全检查。

## 聊天功能的唯一产品归属

**聊天客户端的逻辑功能只能在 TataChatSDK 中实现；聊天服务端的逻辑功能只能在 CitizenServe.tatachat 中实现。公民、途遇及其他产品只依赖使用。**

TuyuServe 涉及聊天时只作为依赖使用方；本条不代表尚未接入聊天的产品已经具备聊天能力。

- 消息、会话、群组、加密、协议、传输、同步、重试、聊天存储、附件、通话及聊天界面行为，按客户端与服务端职责分别归 TataChatSDK 和 CitizenServe.tatachat；新增功能、缺陷修复和平台差异也必须在所属产品内完成。
- 消费产品只提供产品入口、身份与业务权益结果、服务地址及授权、主题和公开接口要求的平台配置；只通过公开接口接入，禁止复制、重写、包装成另一套聊天内核或维护产品专属聊天实现。CitizenServe、TuyuServe 的产品身份与权益授权不包含聊天数据面的实现职责。
- 本机开发直接依赖仓库路径；公民、途遇等产品的正式版本依赖塔塔聊天正式 Release；第三方市场分发使用公开市场版本。依赖使用不以公开市场发布为前置条件，也不改变实现归属。

受控缓存固定为 `tuyuserve/target/<platform>/<build|ci|release|publish>/`。本机 Build 的 Node 视图、`node_modules`、Wrangler/TypeScript状态、Linux脚本测试、bundle、临时文件和日志均写 `build/`；macOS 上的 Linux ARM Build 只做源码与 bundle 编译验证，正式 PostgreSQL/Node 运行时安装包只由真实 Linux ARM64 Release 生成。

## 2026-09-02 本机 Cloudflare 编译入口

外部调用方 已登记 `tuyuserve.cloudflare.build`。Node 依赖下载进入受控公共缓存，
Wrangler dry-run 候选和全部中间数据按 `tuyuserve/target/cloudflare/build` 隔离；TuyuServe 产品源码目录
不产生依赖、临时目录或编译输出。本机 Build 仅编译，产物归本产品target工作区、不部署 Cloudflare。

本文是途遇服务端（TuyuServe）唯一技术事实文档。

## 途遇共用Logo资产

`tuyuserve/logo/`是TUYU产品Logo资产真源；正式矢量与位图源保存在该目录，
`generate_assets.py`生成平台所需副本，`manifest.json`登记源及衍生资源路径、尺寸和SHA-256，
`test_assets.py`回读验证副本与清单一致。产品内的PNG/ICO属于平台打包副本，不能独立修改。
Android普通图标与自适应资源统一引用`@drawable/app_icon`；自适应背景取正式位图左上角颜色，
前景在108dp图层中居中占66dp，不改画或裁剪正式Logo。`--android-only`只处理相应Android XML及清单，
不重写其他平台图片；商家Flutter资源路径以`tuyubooking/app`为准。生成与校验不代表服务部署。

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
cd <本仓根>
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

聊天会话、消息同步、存储和推送由 CitizenServe.tatachat 唯一实现；TuyuServe 的明文聊天路由、实现、类型、schema表和Linux存储登记已删除，当前没有聊天服务能力。本次不接入聊天模块，也不修改其他线上资源。游记当前保存正文和对象键；媒体上传授权、缩略图和通知尚未实现。

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
外部调用方 验真正式 Release 后执行。LinuxARM Release 使用
`tuyuserve-linux-arm-v<software_version>`，主资产固定为
`tuyuserve-linux-arm64.tar.gz`；它只固化可安装包，不代表已经部署到任何自建服务器。

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

## Release 全量构建（第 7.4 步）

正式 Release 固定从干净源码执行全量构建，显式关闭 Rust 增量编译及工具链内置缓存，不读取CI作业缓存且不复用本机编译中间物。版本、签名、校验、产物和发布流程保持原有产品合同。

## 双仓统一流程最终收口（第 7.5 步）

本产品执行统一流程规则：本机编译中间物只进入本轮塔塔缓存库的build目录并按终态规则清理；GitHub CI 的作业过程数据只进入该次Runner任务空间；正式Release从干净编译状态执行。源码不进入塔塔缓存库、塔塔依赖库或塔塔产物库。

## CitizenSDK统一边界复查（2026-09-15）

TuyuServe不持有用户私钥、不创建钱包，也不运行轻节点；途遇号、公钥绑定、挑战、会话、商家索引和授权判断
仍属于服务端业务。但是当前Cloudflare实现直接调用`@polkadot/util-crypto`验签，Rust `account`模块直接调用
`schnorrkel`构造TUYU摘要并验签，TuyuBooking和TuyuFactory本机主机再复用该路径。这构成独立于CitizenSDK的
第二套签名/验签实现，不符合全途遇统一边界。

最终结构中，TuyuServe继续拥有TUYU业务载荷、挑战状态、重放保护和授权数据，但密码学签名/验签必须调用
CitizenSDK正式提供的服务端可消费公开接口或发布件；Cloudflare TypeScript、Linux/Rust和移动端必须使用同一
实现与金标，不得继续并列维护`@polkadot/util-crypto`、`schnorrkel`和Dart/Rust私有实现。本轮仅报告该设计缺口，
未改动账户协议或生产认证路径。

本产品每个实际产品、平台、流程身份使用下列独立文件，主 Job 为 `flow`；CI 验证源码，Release 生成正式产物，自动化只固化正式资产；当前Publish只做只读资产验真，生产发布待后续接通。

### Logo 目录整合后的资源路径

四款应用页面 Logo 位于各自 Flutter 工程根的`tuyu_logo.png`；商家、厂家 macOS 图标位于`macos/Runner/AppIcon.appiconset/`，Windows 图标位于`windows/runner/app_icon.ico`。清单、生成目标与校验使用同一现有位置，iOS 资源路径保持不变。路径调整保持原图片、尺寸及摘要；校验只读资源，不运行生成器。

## 完整产品组织与执行合同

所有者：`tuyuserve`，正式源码根 `<本仓根>`；本说明属于该完整产品。组件不会拆成独立仓库或目录产品。所有执行身份统一为 `产品.平台.流程`，单平台物理目录省略平台层，执行身份仍保留真实平台。

真实平台目标：`cloudflare`、`linux-arm`。

仓库推送仅上传本仓已经保存的main提交。控制台推送的唯一实现为console/tuisong.mjs，每仓一次生物识别，授权成功后建立独立任务，任务栏记录Git进度、准确SHA、取消及成功/失败终态。只执行Git与GitHub main只读回查，不执行源码、依赖、注释、文档、测试、签名或资源门禁；不派发产品Workflow、不运行hooks、不续签或重复认证、不自动重试、合并或强推。

本仓已移除GitHub main推送门禁触发器；main上传后不自动运行产品自动化。自动化由用户单独发起，产品仍拥有自己的Workflow、声明、资源、测试和产物实现；产品不导入控制台源码，不依赖控制台工具库、私有规则或其它仓库工作树。控制台只是可选Git客户端。各仓可独立使用公开Git接口完成仓库操作，公开SDK依赖不构成流程耦合。

技术文档由所属完整产品仓根唯一持有；私有规则和任务库由控制台私仓持有，公开产品不读取它们。公开门禁不依赖私仓资料、安装包源码、其它本机产品或个人账号；必要链真源只读本仓明确固定的公开40位SHA，不在门禁中跟随main。本机开发跨产品验收仍比较三仓已保存快照与各端真实镜像。

### 门禁与开发审查职责

准确中文注释按开发阶段逐项复核，不以保留源码每文件包含汉字作为仓库门禁的开发凭证。初始完整内容、生成文件和上游原件保持原文；真实第一方临时注释、机密、源码输出、Workflow、依赖和适用测试仍由本仓同提交门禁验真。公民门禁只把scripts中的Node命令行结果报告识别为CLI输出；本仓实际执行测试的准确协议拒绝断言不属于新运行协议，字符串、注释、模板和未登记测试中的同文不豁免。保存及推送仍逐仓独立授权，并以本机门禁和同SHA的GitHub门禁双成功为唯一终态。

## 产品介绍与开源许可

根目录 `README.md` 仅提供本产品简明介绍，不承载技术方案、任务记录或验收结论。独立自有代码采用根 `LICENSE` 的MIT；上游代码、衍生修改、依赖及组合分发遵循各自原许可、版权、例外与附加要求。

### 产品独立资源与编译入口

本产品平台闭集为`cloudflare`、`linux-arm`。调用格式为`node scripts/build.mjs <requirements|prepare|build> <platform> --work <绝对工作目录>`；requirements只读并输出唯一JSON，prepare/build从标准输入读取schema=1的资源回执。调用方交付准确工具执行器、锁定依赖目录、Git来源和归档后先prepare，再读取展开来源新增的需求，完整交付后执行build。准备、展开和编译属于同一调用工作根，各平台互不共享可写状态。独立调用方按本仓声明准备资源即可运行，无需读取其他产品工作树或私有资料。

## 2026-10-06 产品自主资源阶段（第2步）

现存`PRODUCT_TOOL_ROOT`与`PRODUCT_DEPENDENCY_ROOT`是工具和依赖的只读路径输入，本身不能完成控制台缺件准备与交付。当前供给职责按本文“工具与依赖的声明和供给职责”执行：经控制台运行由控制台准备、保存与供给，独立运行由产品自行处理；源码外`~/.local/share/product-resources`仅描述现存独立资源存储，本轮可写状态仅在work。GNU Bash/grep/sed纳入自身需求；发行件旧Shell仅用于声明中的首次GNU构建，不进入正式PATH。下载/源码工具编译不持全局锁，最终不可变对象提交使用短锁，取消传递到工具进程组。错误摘要、损坏、未锁来源、路径越界和显式离线缺失失败并保留可疑原件。

Pub/npm/Cargo按原始锁准备；Git按固定HTTPS提交检出，Git Cargo目录源展开workspace继承并锁定相对包版本；CocoaPods按准确锁摘要恢复验真快照，缺失spec校验规范摘要，未锁源码来源拒绝取得。Android固定包与修订归产品；额外平台仅消费官方固定发行来源与发行树摘要，不借宿主历史SDK目录。Maven供给只读验真后复制到独占Gradle缓存，由产品准备现有配置，消费仍离线；全库坐标导入与旧目录清理留到第5步。

`PRODUCT_WORK_DIR`、`PRODUCT_BASH_BIN`、`PRODUCT_RSYNC_BIN`及`PRODUCT_SOURCE_DIR`是公开工作/工具/工程入口；Flutter修订不读取调用方私有变量，也不回退系统rsync。旧Flutter补丁对象与当前配方不符时拒绝复用，真实替换须按准确资源操作另行授权。本步不改变编译、签名、安装及回读顺序，不修改产品UI，也未执行真实工具下载/安装。受控资源测试不能代替官方首次取得、正式编译或最终真实运行验收；第4至7步仍待逐步确认实施。

资源原件按完整内容验真后整体提交：Git bundle与固定来源/摘要回执处于同一个不可变对象，不暴露中间状态；可选依赖供给读取`objects/<SHA256>.blob`。锁解析器、源码工具依赖与官方有序补丁也从同一产品原件存储复用。Pod spec每次按锁中的规范checksum回验，Git tag只核对发行声明并消费本产品预锁提交；HTTP发行件消费固定SHA256，首次源码准备命令来自该已验真spec并由GNU Bash执行。spec、准备后源码与文件清单整体提交，再复制到本轮缓存；供给索引不决定产品版本。正式PATH排除旧POSIX Shell，`sh`对应已验真的GNU Bash。

独立缺省资源目录内`tools`保存工具发行件及工具编译输入，`rely`保存产品依赖的归档、Git和Pod原件；工作区只承载本轮可写视图。根据用户最新要求，分步骤先完成实现与用例，整项解耦任务完成后统一测试；本步实施记录不等于真实工具首次取得、完整Build或安装验收通过。

### 第3步：产品完整Build入口（2026-10-06）

本产品的正式完整入口为已锁定Node的绝对路径调用`<本仓根>/scripts/build.mjs execute <platform> --work <已存在绝对工作根>`，可选`--offline`。输入stdin可为空；调用方可传schema/product_id/platform/work及真实run_id/program_digest，禁止私有变量或执行命令。入口内部完成需求→资源→准备→再次需求/资源闭包→编译→产物验真；独立与控制台调用同一实现。最小引导Node只启动本产品的资源引导器，产品按自己的官方Node声明准备并重入，控制台运行Node不决定产品Node版本。

标准输出只有唯一有界JSON：schema、product_id、platform、work、completion、files及可选真实run_id。completion固定为compile-only，仅编译及验真产物，禁止安装或部署；files按本产品flows.json登记路径和SHA256。编译日志使用stderr进入现有任务日志，不新增资源任务或任务状态。完整结果只在各阶段成功、源码/锁不漂移、工具进程确认退出后落入本轮build-result.json；同根并发或复用旧结果拒绝，取消/失联/错误身份/损坏候选不得成功。

控制台每次Build直接读取本产品当前flows.json入口，调用一次execute；控制台只跟踪真实任务、核验公开结果和保存产物，不解释产品工具、依赖、编译参数或设备规则。当前控制台静态菜单、其它产品流程/安装器与程序摘要的历史耦合仍归第4步解除，本步不能当作整项解耦已完成。

本步同步完整入口、失败/取消/并发及结果/路径/摘要用例，但未运行测试、语法检查、编译、签名、安装或工具下载/替换；全部实现步骤完成后统一验收。源码交付与用例存在不代表真实Build已经通过。

### 第4步实施中：远端路由当前声明

本次同步路线读取、热更新和失败边界用例，未运行测试、语法检查、编译、签名、安装或下载。第4步仍在开发中：Publish执行器、聊天安装器、Start、固定菜单声明与完整程序摘要的其余实际耦合尚未解除，不能报告该步或整项任务完成。

### 产品软件记录与正式版本恢复

资源工具取消、超时、输出超限和异常收尾均等待主进程与整个后代组退出；无法确认退出时保留工作根和候选，禁止删除输入或改为可写。真实取消退出顺序用例仅写入resources.test.mjs，尚未执行。

### 产品独立资源与唯一依赖供给

Maven的具体JAR、AAR、POM、module及分类器文件统一由packages的group:artifact、version、准确上游URL、SHA256和SRI定位objects中的原件。产品在本轮work/dependencies/maven按上游分区复制独占文件；不复制Gradle二进制元数据、锁和下载状态。产品生成本轮GRADLE_USER_HOME/init.d初始化脚本，只在自身已声明的同源仓库之前加入本轮原件视图，缺件仍按产品原仓库解析，明确离线则失败。Gradle解析、工程状态和后续编译都属于同一产品任务。

Pod由pods中的name、version、checksum匹配当前Podfile.lock；spec保存官方CDN地址和原件摘要，source保存官方podspec来源，files保存发布树相对路径、文件内容摘要与权限或安全内部链接。只物化本产品所需的单个发布坐标；其它Pod、整锁、平台或宿主变化不要求复制全树。产品仍按CocoaPods官方规范回验SPEC CHECKSUMS，再验证本产品预锁定Git提交或HTTP发行摘要与源码回执。可写缓存和工具VERSION仅在本轮work产生，不能写回共享原件。

错来源、摘要、重复同源内容、生成状态、硬链接、内部链接越界或循环、取消及任务副本漂移均据实失败。独立与控制台调用使用同一实现；控制台只提供可选原件并跟踪原有任务，UI、功能、按钮、平台与操作顺序保持。用例源码已同步，执行留待整项实现结束后的统一测试。

### 独立入口回归验真边界

资源回归使用自带固定提交、源码字节和spec的合成Pod，不借用产品真实Pod清单提供测试输入；无真实Pod需求的平台也验证来源、摘要、链接、循环、取消和物化失败。测试现场仍位于本产品target的准确平台，不写源码或其它产品目录。资源声明与生产依赖坐标不因测试夹具改变。

资源取消对同一真实进程组每轮只发送一次信号；组不存在或Windows时才发送给主进程。仍等待主进程和后代实际退出，8秒未退出才强杀，12秒仍未确认则保留现场并失败；取消不能成为成功。

本仓门禁的测试子进程白名单仅保留已有PRODUCT_GIT_BIN准确执行器路径，供完整Git索引夹具使用；缺少该准确入口时回归失败，不查询PATH、不回退系统Git、不传凭据或其它产品材料。不新增工具版本、声明字段、公开参数或生产资源获取步骤。

## 只读塔塔门禁与功能验收边界（2026-10-10）

.github/tatagate/tatagate.mjs 只读核对本仓正式 main/HTTPS 来源、scripts/ 的 Build/Publish 双文件闭集、同仓 Workflow、流程调用方向与 Node 语法，并扫描自有受控文件的禁用字符、强特征机密及脚本中的明文网络地址。门禁不准备资源、不调用 Build 或 Publish、不执行产品测试。编译回归归 Build，自动化测试归各自 Workflow；旧门禁中的其它产品专属静态约束仍需逐项复核。当前代码只完成静态检查，没有执行正式门禁、完整产品测试、真实编译或发布。

## 本机固定执行目录

历史验收路径保留原记录；本节为当前本机目录规则。

### scripts 同文件回归

## 本机编译入口

本产品完整本机编译只由scripts/build.mjs实现。声明与资源配方归本仓；独立执行自行准备，控制台发起时只消费其明确供给，不因缺件或失败切换到独立下载。控制台调用、移动端安装与macOS App约束归console/build.mjs，控制台供给的原件获取、命令执行和对象提交归tools/toolchain.mjs，产品负责自身现场与资源配方临时路径清理；供给方只收尾自己创建的候选和提交锁。

公开编译组件只有本文件中的正文；确有既有消费者的原路径只转交参数或公开接口，不保存编译命令。本机编译不生成第二份脚本。公开SDK依赖按本仓原锁消费，不读取兄弟仓本机检出或调度兄弟仓任务。GitHub流程不属于本次修改范围。

## GitHub自动化

本仓自动化只在GitHub的main源码上执行；控制台只调用与展示。各目标独立拥有同名的YAML与Node实现，不调用其他仓或其他目标的Workflow。版本、构建、测试、签名、完整产物核验与正式tag/Release均由本仓负责。

- `.github/workflows/release-cloudflare.yml`及同名`.mjs`。

每个目标的最后任务使用always读取所有前置结果：全部成功清本仓本目标旧成功，否则清旧失败并失败退出。仅保留最新成功、最新失败各一条；保护本次Run和所有活动任务，另一类结果与其他目标不受影响。删除关联正式Release、tag、Actions产物和Run后回查；任何清理错误都按实际失败报告，不自动重试。

当前自动化目标仅Cloudflare；未实现的Linux ARM自动化入口、声明及对应断言移除。

所属回归位于各目标同名mjs，覆盖前置结果、版本边界、平台隔离、活动保护和完整分页；真实GitHub构建与发布验收依任务授权另行执行。

调度方按本仓supplyRequirements和prepareToolSupply取得工具候选；调度模式的获取、提交及执行使用供给方交付的能力；产品配方自行清理自己的临时生成物。缓存复用消费实际路径，运行Node版本/字节、Apple资源签名及工具全树复验不作为本机编译门禁；上游锁与正式应用签名、安装回读继续由各自真实流程执行。

本机编译现场由本产品领取和收尾。调度任务编号随本产品领取记录保存；本轮结果消费后，只允许匹配该编号的收尾请求。产品确认自身进程及资源供给后代全部退出后才清场；异常、编号不符或退出未确认时保留现场。控制台只持有调度锁、调用本产品入口并供给资源，不实现产品清理。

软件版本计算使用本目标GitHub运行序号作为单调下界，并与本仓已成功版本比较；失败或历史清理不使版本返回源码初值。版本只在GitHub本次运行内产生，同一Run重试保持运行序号，Tag另绑定准确attempt。

### 当前自动化最后处理

本仓每个自动化目标仅由自身release-<平台>.yml与同名mjs执行，最后处理依赖全部前置任务。清理只接受该目标准确Workflow路径、main和手动事件，不根据已删除文件或旧入口名称猜测归属。前置失败时，本次产物撤销与旧失败清理分别尝试并汇总错误；任何一项未确认均失败。固定依赖仍由本仓声明和原锁管理，不参加自产历史结果分类。

### 本仓 GitHub 自动化与塔塔门禁目录

本仓 .github/ 仅保留 workflows/ 与 tatagate/。Workflow 自行执行产品自动化，tatagate.json 与 tatagate.mjs 只登记并只读核对本仓静态合同；产品测试由 Build 或对应 Workflow 执行。
