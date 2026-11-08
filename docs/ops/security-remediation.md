# 2026-11-08 安全修复与验收

审查基线：`5791e54224e8d7b1cb360fb9fdde0e3d05e71709`。范围为五项已确认发现及验证中发现的依赖漏洞；审查没有证明线上已被利用。

## 执行检查点（2026-11-08，后续暂缓）

用户要求先 commit / push，平台配置与剩余合并、部署留待之后继续。恢复工作时先核对平台实际状态，不自动发起新的部署。

- 支付修复 [PR #94](https://github.com/WADEYEH/shopapgo/pull/94) 与 Access／请求体限制 [PR #95](https://github.com/WADEYEH/shopapgo/pull/95) 已合并；main 为 `fd90fc539e03f512045078ceaf6f1983cb3af8a7`。
- 已按用户授权，通过现有 GitHub Actions 流程部署上述两组修复。[正式部署](https://github.com/WADEYEH/shopapgo/actions/runs/42486632365) 成功，Worker 版本 `ab7cc39f-4e22-49de-8a5c-4e6b4bb50832`；[测试部署](https://github.com/WADEYEH/shopapgo/actions/runs/42487087360) 成功，版本 `b755af8f-3389-4ffd-8fdc-d65b036872cb`。两者均无待执行数据库迁移；正式部署 summary 已记录部署前 D1 还原点。
- 部署后正式站 `/api/health` 与 `/api/store/config` 返回 200；262145 字节的无签名 Airwallex webhook 返回 413。没有真实付款、退款或 Amazon 出货；这不代替有效 Access 用户登录、沙盒交易及备份恢复验收。
- Production 与新建 staging 已限制 main，审核人设为 WADEYEH／anpuuuuu，禁止自行批准及管理员绕过。新建 backup-production、backup-staging 已限制 main；备份不设人工审批，保留每日自动执行。
- main 分支保护尚未保存成功：已准备至少一人批准、CODEOWNERS、禁止管理员绕过，以及 test／commerce／amazon-gateway／三个 security 必需检查；提交时 GitHub 要求 WADEYEH 重新验证身份。不能将表单已填写视为规则已生效。
- [PR #96](https://github.com/WADEYEH/shopapgo/pull/96) 保持 draft，尚未合并或部署。它包含凭证迁移工作流、Action SHA 固定、独立安全扫描及依赖修补；[CI](https://github.com/WADEYEH/shopapgo/actions/runs/42485612183) 和 [security](https://github.com/WADEYEH/shopapgo/actions/runs/42485612174) 已通过。

恢复前需在 GitHub Environments 直接配置以下 secret，值不进入 Git、日志或聊天：

| 环境 | Secret |
|---|---|
| staging | STAGING_CLOUDFLARE_API_TOKEN |
| Production | PRODUCTION_CLOUDFLARE_API_TOKEN |
| backup-staging | D1_BACKUP_API_TOKEN |
| backup-production | D1_BACKUP_API_TOKEN |

部署凭证仅授予所需 Workers／D1 权限；备份凭证仅授予 D1 导出所需权限，不复用通用部署 token。四个 secret 最近核对均尚未配置。旧部署／备份工作流和仓库级凭证暂留，避免切换后中断；后续按平台迁移顺序完成配置、合并 #96、验证新部署和加密备份／隔离恢复，再确认其他依赖并撤销旧通用凭证。

## 问题、根因与修复

| 项目 | 根因 | 修复及必须保持的行为 |
|---|---|---|
| High：支付竞态 | 用 SELECT 的旧总额核对付款，UPDATE 时结账已被另一请求改动 | 两种支付共用结算；SQL 在更新时核对当前总额、币别和地址条件。订单、成功付款记录、确认信任务在同一 D1 batch 提交。付款不足进 review、不出货；重复付款保持现有处理 |
| High：部署凭证隔离 | 分支测试部署取得通用仓库凭证；同一凭证用于正式数据库备份 | 测试／正式部署均 main-only、Environment 审批；凭证只给 Cloudflare 操作步骤。备份使用独立 main-only 环境与专用 D1 token。平台配置与旧凭证撤销完成前不能关闭此项 |
| Medium：旧后台 token | Access 检查前无条件接受 ADMIN_TOKEN | 正式配置拒绝 token／共用密码，Access 误关返回 503；测试站必须显式开启 ADMIN_SCRIPT_TOKEN_ENABLED，保留成员级脚本。外层 Service Auth 仍必须存在 |
| Medium：请求体资源消耗 | webhook 鉴权前完整读取无限制请求体 | 流式检查实际字节，超限取消读取返回 413。JSON 64 KiB、支付 webhook 256 KiB、Resend 64 KiB、图片 2 MiB；保持原始签名字节。webhook 按 IP 与服务商限速 120 次／分钟，429 允许重送 |
| Low：Action 标签可移动 | 工作流依赖版本标签 | 固定完整 commit SHA，checkout 不保存凭证，不改变 Action 主版本 |
| 依赖扫描新增发现 | 网站及 Worker 工具链锁定了有公告的依赖 | Next.js 15.5.29，Next 的 PostCSS 8.5.32／sharp 0.35.5，source-map-js 1.2.2；Wrangler 4.158.0。保持框架主版本，overrides 需通过建置和浏览器回归 |

## 验证规则

- 支付使用真实 SQLite migrations、假服务；固定在读取订单后插入另一次结账更新：$37.98 的付款不能让 $307.89／10 件的订单进入 paid。
- 覆盖更新先完成、付款先完成、重复通知、金额／币别不符、付款编号保护及事务回滚。付款记录写入失败，订单及确认信任务都必须回滚。
- 正式 token 无 JWT 被拒、Access 误关 503、有效成员正常登录；测试脚本需要显式开关。
- 请求体覆盖缺少／伪造 Content-Length、分块、多字节 UTF-8、精确边界、签名原始字节、超限不访问数据库，以及按服务商限速。
- 网站测试、商店 test:static、build:site、Worker dry-run、Playwright 必须通过。扫描失败不算通过，不自动忽略告警。
- security 在本仓库独立运行 Gitleaks、Semgrep 和两个 lockfile 的 OSV，不接收 secrets。版本与校验值对齐参考策略 `39f03aec49a407e8b3cb0543b49e0b6e24c7c145`；参考仓库为私有，公开 repo 无法调用其 reusable workflow，因此未直接引用或公开该仓库。

## 平台迁移（仓库管理员执行，值不进入 Git 或日志）

2026-11-08 只读核对：CLI 账号 anpuuuuu 有 push、无 admin 权限；仓库级存在 CLOUDFLARE_API_TOKEN；Production 只有 anpuuuuu 审核，prevent_self_review=false；没有 staging／backup 环境或已启用 ruleset。主分支保护 API 返回 404，需管理员确认及配置。

按顺序迁移。新凭证与权限未就绪时，暂不合并工作流更名，避免中断备份或部署。

1. 保留现有 Production，禁止自己批准、禁止管理员绕过，只允许 main；审核人设置为 WADEYEH 与 anpuuuuu，任一人可审核另一人发起的部署。创建同样保护的 staging。两个部署环境均人工审批。
2. staging 放 STAGING_CLOUDFLARE_API_TOKEN，Production 放 PRODUCTION_CLOUDFLARE_API_TOKEN；账户标识继续使用 CLOUDFLARE_ACCOUNT_ID。若平台不能限定单一测试 Worker，两个环境保持同等级审批，不宣称资源级隔离。
3. 创建 backup-production、backup-staging，只允许 main，无人工审核以保留每日备份。各放独立 D1_BACKUP_API_TOKEN，只授予导出所需最小 D1 权限，不给 Workers／DNS 写入权限。不能满足时保持迁移待办，不能复用通用部署 token。
4. main 分支保护：禁止直接 push、force push、删除；至少一位其他维护者批准，要求 CODEOWNERS 审核，以及 CI（test、commerce、amazon-gateway）和三个 security 检查成功。必需检查名称取首次实际 workflow run 的名称。
5. 合并后先批准测试部署；以沙盒支付和假 Amazon 演练并发及正常交易；核实错误 token 被应用拒绝、正常 Access 用户可进入、安全扫描正常执行。
6. 新备份凭证各手动跑一次加密备份，artifact 只含密文；在隔离空数据库还原测试站备份，不覆盖现有数据库。新部署凭证验证可用后，确认其他使用者不依赖旧凭证，再撤销旧通用 token、删除仓库级 CLOUDFLARE_API_TOKEN。
7. 正式部署人工发起，由另一名审核人批准。记录旧 Worker 版本及 D1 还原点；部署后检查健康、鉴权、支付 review、webhook 413／429 及下一次备份。

最初修复阶段不执行真实付款、退款、Amazon 出货或正式部署；后续获授权的部署结果见上方执行检查点。旧后台 secret 可暂留，正式应用不会接受；删除／轮替另记营运记录。

## 回退与关闭

- 无数据库 schema 迁移。优先发布修正，保留旧 Worker 版本供人工回退。
- 必须回退到含支付竞态版本时，先暂停新结账及自动送单，再回退，不能重新开放少付多出路径。
- 请求体上限必须有限；真实服务商 payload 超过默认值时，只调整对应上限并补边界测试。
- 代码通过不等于平台验收完成。环境保护、凭证隔离、main 保护、扫描运行、测试站演练及正式验收逐项留证，再执行 sec-audit full。
- 另行验证订单号修改授权、MCP 人机确认边界及 Amazon 预打包依赖可追溯性；本次不据推测修改流程。


## 本地验证记录

- 网站 Node 测试 38 项通过；商店 Node 测试 491 项通过，均无跳过。
- 网站完整静态建置与 Worker production dry-run 通过；Actionlint 1.7.12（校验下载包 SHA-256）通过。
- Playwright 常规回归 273 项通过；默认跳过的 7 项以 APGO_SITE_URL 指向隔离本地 Worker 后全部通过，共 280 项。
- 两个 lockfile 的 npm audit 均为 0 项；Gitleaks／Semgrep／OSV 的 GitHub 执行结果另记，不以 npm audit 代替。
- 上述本地验证不涉及真实扣款、退款、Amazon 出货或正式部署。后续平台配置及部署进度见上方执行检查点。

- 真实本地 Worker／D1 签名 webhook 演练：$37.98／1 件为 paid；付款 $37.98、订单 $307.89／10 件为 review。临时配置只含假密钥，数据库及数据均在系统暂存目录。

- CI 首次全历史 Gitleaks 的 8 笔发现逐项核对，均为公开 ACCESS_AUD／ACCESS_LIST_ID，非鉴权密钥；只豁免精确历史指纹，并记录在 .gitleaksignore，不屏蔽新发现。测试部署改为静态 checkout main，并在审批后核对 CI 的不可变 SHA，main 已前进时拒绝部署。
