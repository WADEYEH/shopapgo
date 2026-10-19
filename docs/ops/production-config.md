# 正式环境设定清单

| 项目 | 内容 |
|---|---|
| 日期 | 2026-10-19（10/16 切换上线后的版本） |
| 范围 | Cloudflare 上和网站有关的所有资源、GitHub 的部署设定，以及接到的外部服务 |
| 规则 | 只记名称和用途，**不记任何密钥的值**。正式设定有任何变动，都要更新这份文件（企划第 10 章）。一般设定（vars）以 `commerce/wrangler.toml` 的 `[env.production.vars]` 为准 |
| 旧版 | 10/06 切换前的盘点（landing 线上店、24 条商店路由、当时缺的设定）在 git 纪录里 |

---

## 1. 网址与路由

| 网址 | 用途 | Cloudflare 资源 |
|---|---|---|
| www.shopapgo.com | 整个网站：品牌页、指南、商品、购物车、结账、订单页、政策、联络、`/api/*`（10/16 起） | Worker `apgo-us-store`，整个网域的路由 `www.shopapgo.com/*` |
| shopapgo.com（裸网域） | 网页 301 到 www 的同一页；`/api/*`、`/.well-known/*` 不转址 | 同一个 Worker，路由 `shopapgo.com/*`（`MOVED_HOSTS`） |
| store.shopapgo.com | 旧店网址：网页 301 到 www 的同一页；`/api/*`、`/.well-known/*` 照常回应（付款服务的通知 10/16 起都在 www） | 同一个 Worker，自订网域 |
| admin.shopapgo.com | 后台，只能用 Cloudflare Access 登录（10/18 起，C17）；其他网址的 `/admin` 一律 404 | 同一个 Worker，自订网域（`ADMIN_HOST`） |
| 旧的品牌站 Pages 专案 | www 的 DNS 纪录还指着它，但 Worker 路由在前面，访客看不到。保留到 10/30 之后再删（C30；10/06 盘点时名称是 `shopapgo`，删除前在 Cloudflare 核对） | Cloudflare Pages |

- **先进 Worker 的路径**：全部（`run_worker_first = true`）。静态页面也先经过 Worker，才能做转址、404 和后台网域的检查。
- **执行位置**：放在数据库旁边（placement `aws:us-east-1`，10/18），后台从台湾打开不用每次查询都跨太平洋。
- **回退**：营运手册第 24 节（Worker 回到切换前的版本 `f62194a4` ＋ `npm run rollback:routes` 把路由换回切换前的 24 条商店路径）；只回退新版本用第 5 节（wrangler rollback）。路由不属于 Worker 版本，回退版本不会改路由。

---

## 2. 部署

| 项目 | 规则 |
|---|---|
| 正式环境 | 只从 GitHub 部署：Actions → Deploy，手动触发，要 GitHub 变数 `PRODUCTION_DEPLOY_ENABLED` = true，并由 Production 环境的核准人核准（目前只有 anpuuuuu，D65；WADEYEH 也能核准是 C16）。只允许 `main`。不从本机部署 |
| 测试站 | 合并到 `main`、CI 通过后自动部署（只部署最新版本，#70） |
| 数据库迁移 | 由 Deploy 工作在部署前套用，先记下还原点（营运手册第 7 节） |
| GitHub 的金钥 | `CLOUDFLARE_API_TOKEN`、`CLOUDFLARE_ACCOUNT_ID`（M5，10/15）；Amazon 转接程序另用 `AMAZON_GATEWAY_DEPLOY_TOKEN`（D75，营运手册第 25 节） |
| 数据库备份 | GitHub Actions「Database backup」每天汇出正式数据库，用你的公钥加密，保留 90 天，失败开 issue（D77，#90 等合并）。另外 D1 Time Travel 可以还原到 30 天内任一分钟（营运手册第 6 节） |

---

## 3. 正式 Worker：`apgo-us-store`

### 3.1 一般设定（`[env.production.vars]`）

| 名称 | 值或用途 |
|---|---|
| `AIRWALLEX_ENV` | `prod`（正式 Airwallex） |
| `CONFIG_PROFILE` | `production`（设定检查用哪一份清单） |
| `GA4_MEASUREMENT_ID` | `G-YM10YMKE30`（GA4 退款事件） |
| `ADMIN_HOST` | `admin.shopapgo.com` |
| `SITE_HOST` | `www.shopapgo.com` |
| `MOVED_HOSTS` | `store.shopapgo.com,shopapgo.com`（301 到 www） |
| `ADMIN_OWNER_EMAIL` | 第一位拥有者（wadeyeh@apgo.com.tw） |
| `ADMIN_ACCESS` | `true`（后台只能用 Cloudflare Access 登录，10/18） |
| `ACCESS_TEAM_DOMAIN`、`ACCESS_AUD` | Cloudflare Access 团队和正式后台应用的编号（公开值，见设定档） |
| `CLOUDFLARE_ACCOUNT_ID`、`ACCESS_LIST_ID` | 公司 Cloudflare 帐号、正式后台的成员名单（Zero Trust list `apgo-backoffice-members-production`） |
| `META_DATASET_ID` | `2606879866471418`（Meta Pixel／CAPI） |
| `CONTACT_EMAIL_TO` | 联络表单的收件信箱（wadeyeh@apgo.com.tw） |
| `TURNSTILE_SITE_KEY` | 联络表单的 Turnstile 公开金钥 |
| `CARD_PAYMENTS_ENABLED` | `false`：不显示 Card、Apple Pay、Google Pay（D70）。Airwallex 开通信用卡后改成 true（C14） |
| `CUSTOMER_EMAIL_FROM` | `APGO <orders@shopapgo.com>` |
| `CUSTOMER_EMAIL_REPLY_TO` | services@apgo.com.tw |
| `CUSTOMER_EMAIL_RETRY_CRON` | `true`（排程重寄失败的信） |
| `ORDER_NOTIFY_EMAIL_TO`、`ORDER_NOTIFY_EMAIL_FROM` | 新订单通知寄给 wadeyeh@apgo.com.tw，寄件人 `APGO <orders@shopapgo.com>`（M17） |
| `REFUND_ALERT_EMAIL_TO` | 退款失败的通知（wadeyeh@apgo.com.tw） |
| `MCF_AUTO_SUBMIT`、`MCF_SYNC_CRON` | `true`：付款满 1 小时自动送 Amazon、排程读回出货状态（10/16 Hold 测试单通过后打开，G15） |

故意不设的：`SITE_ENV`（没有测试站的密码门）、`ADMIN_ACCEPT_SITE_BASIC`、`MCF_SHIPPING_MAP_JSON`（选填，不设就用标准配送）、`MCF_NOTIFY_AMAZON_EMAIL`（不设 = Amazon 不寄信给顾客）。

### 3.2 密钥（24 个，只记名称）

| 用途 | 名称 |
|---|---|
| Airwallex | `AIRWALLEX_CLIENT_ID`、`AIRWALLEX_API_KEY`、`AIRWALLEX_WEBHOOK_SECRET` |
| PayPal | `PAYPAL_CLIENT_ID`、`PAYPAL_CLIENT_SECRET`、`PAYPAL_ENV`、`PAYPAL_WEBHOOK_ID` |
| 寄信 | `RESEND_API_KEY`、`RESEND_WEBHOOK_SECRET` |
| Amazon 出货 | `AMAZON_OUTBOUND_BASE_URL`、`OUTBOUND_INTERNAL_TOKEN`、`MCF_SKU_MAP_JSON` |
| 追踪 | `META_CAPI_ACCESS_TOKEN`、`GA4_API_SECRET` |
| 地址验证 | `GOOGLE_ADDRESS_VALIDATION_KEY` |
| 联络表单 | `TURNSTILE_SECRET_KEY` |
| 后台 | `ACCESS_LIST_API_TOKEN`（同步成员名单）；`ADMIN_LOGIN_EMAIL`、`ADMIN_LOGIN_PASSWORD`、`ADMIN_TOKEN`（依你 10/18 的决定留着，但 `ADMIN_ACCESS` 打开时不能进后台；正式环境没有给脚本用的服务金钥） |
| 监控 | `HEALTHCHECK_PING_URL` |
| 用密钥设的开关 | `PRICING_APPROVED`（价格核准，没有它结账会拒收）、`PAYPAL_ENV`（上面已列）、`APPLE_PAY_ENABLED`、`GOOGLE_PAY_ENABLED` |

已删除：`META_TEST_EVENT_CODE`（10/16，O10）。

### 3.3 设定检查（营运手册第 21 节，D59）

网站每天和每次新版本上线后，拿自己的设定跟 `worker/config-check.js` 的清单比对（清单要跟 `wrangler.toml` 一致，有测试守着），不一致寄团队信。C23（#90，等合并）补上：

- 必须有的密钥加上 `GA4_API_SECRET`、`HEALTHCHECK_PING_URL`；
- 开关 `PRICING_APPROVED` 必须是 true、`PAYPAL_ENV` 必须是 live（只报名称，不报值）；
- 测试用的设定不能出现在正式环境：`META_TEST_EVENT_CODE`、`MCF_FAKE`、`CUSTOMER_EMAIL_TEST_RECIPIENTS`、`CUSTOMER_EMAIL_POLICY_NOTE`、`STAGING_BASIC_AUTH_*`、`SITE_ENV`、`ADMIN_ACCEPT_SITE_BASIC`。

`ADMIN_LOGIN_*`、`APPLE_PAY_ENABLED`、`GOOGLE_PAY_ENABLED` 不检查。

### 3.4 绑定与排程

| 类别 | 内容 |
|---|---|
| 数据库 | D1 `DB` → `apgo-us-store`（`b409b132-2f2d-4da8-970c-2cf5560ac830`，美东） |
| 商品图片 | R2 `PRODUCT_IMAGES` → `apgo-us-store-images`（D61） |
| 限速 | `CHECKOUT_LIMITER`（每个来源每分钟 10 次）、`ADDRESS_LIMITER`（20 次）、`QUOTE_LIMITER`（60 次） |
| 网站档案 | `ASSETS`（Next.js 建置的 `out/`，找不到的页面给 404 页） |
| 版本编号 | `CF_VERSION_METADATA`（设定检查用） |
| 执行位置 | placement `aws:us-east-1` |
| 排程 | 每 5 分钟（`*/5 * * * *`，`worker/cron.js`）：未完成结账失效、每日付款对帐、出货检查、送 Amazon 和读回出货状态、包裹追踪、重寄失败的信、重送 Meta 事件、GA4 退款事件、库存（每 15 分钟读一次 Amazon）、设定检查（每天）、每日摘要；#90 合并后加上资料保存期限（每天）和付款手续费。每次都回报 healthchecks.io。测试站每 2 分钟 |
| 错误告警 | Workers Observability 和 Issues 都开着（营运手册第 8 节） |

---

## 4. 正式数据库（D1 `apgo-us-store`）

资料表 = 迁移档 `commerce/migrations/0001`–`0015`（只增不改，D45）。0015 随 #90 合并部署后才会套用。

| 迁移档 | 新增的资料表 |
|---|---|
| 0001 baseline | orders、order_payment_failures、order_refunds、webhook_events、order_notifications、order_fulfillments、order_emails、order_audit、order_mcf、order_email_delivery、order_email_jobs、order_message_jobs、customer_email_events、customer_email_suppressions、order_attribution、order_meta_events、order_payments、contact_messages |
| 0002 operations | cron_runs、staging_fake_mcf_orders（只有测试站会用） |
| 0003 admin_members | admin_members、admin_audit |
| 0004 order_core | order_cancellations、mcf_submission_queue、team_alerts |
| 0005 checkouts | checkout_payments |
| 0006 payment_events | order_disputes、ops_state |
| 0007 fulfillment | order_notice_jobs、order_refund_requests、mcf_hold_tests |
| 0008 notifications | （没有新资料表） |
| 0009 admin_v1 | order_notes、product_settings |
| 0010 privacy | order_privacy |
| 0011 customers_refunds | admin_refunds、customer_notes、privacy_requests、order_mcf_fees |
| 0012 packages_ga4 | order_packages、order_analytics、order_ga_events |
| 0013 product_content | product_content、product_versions、product_images |
| 0014 product_stock | product_stock |
| 0015 payment_fees | payment_fees（#90） |

切换前旧店留下的 39 张待付款纪录，10/16 切换时已失效。

---

## 5. 外部服务

| 服务 | 现况 | 待办 |
|---|---|---|
| Airwallex（正式） | 金钥有效；通知 `https://www.shopapgo.com/api/webhooks/airwallex`，版本 2026-08-21，全部 294 个事件（含退款、争议，10/16）；旧 store 的通知已删除。**还没开通信用卡收款**（M18），所以结账页只有 Airwallex Pay | 开通后 C14（打开 Card、Apple Pay、Google Pay）。C20 剩下：在 Airwallex 后台看通知传送纪录、Airwallex Pay 不付款的建单测试 |
| PayPal（正式） | live；结账页排第一、预设选它，没有 PayPal 帐户也能在 PayPal 视窗刷卡；通知 `https://www.shopapgo.com/api/webhooks/paypal`，8 个事件，`PAYPAL_WEBHOOK_ID` 已设（M6）；App 是 Wix 当年建的 `MyApp_Wix_com_Ltd` | 之后考虑换成专用 App（C8） |
| Resend | 正式金钥 `shopapgo-production`；通知 `https://www.shopapgo.com/api/webhooks/resend`（7 种寄送状态，10/16 打开）；10/16 起顾客信、团队信从 orders@shopapgo.com 寄出，SPF、DKIM、DMARC 通过（C5） | 换成只能寄信的金钥（C23，你建金钥）；DMARC 收紧（C7） |
| Google 地址验证 | 金钥 `shopapgo-worker-address-validation`，测试站和正式环境共用，每天上限 150 次（两边合计，M7） | 测试站另建金钥、分开额度（C23） |
| Amazon MCF（经 `amazon-spapi-mcp` 转接程序 1.8.3） | 连线、商品对应（D204、D215）已设；10/16 Hold 测试单通过（G15）后自动送单和出货同步都打开；库存每 15 分钟读一次（C4）。转接程序只从 GitHub 部署（D75，营运手册第 25 节） | 第一张真实订单整段检查（C15）；请 Mac 的使用者不要再从 Mac 部署（C31） |
| Meta | Dataset／Pixel `2606879866471418`；CAPI 金钥已设；测试事件代码 10/16 已删除 | 第一张真实订单确认 Purchase 浏览器＋服务器、去重（C15） |
| Google Analytics／GTM | `GTM-TD5NTFH9` → GA4 `G-YM10YMKE30`（资源「shopapgo.com (US)」，D40）；`GA4_API_SECRET` 10/16 设好，退款会从营收扣掉 | 内部流量筛选改成「有效」（C24）；第一张订单确认 purchase（C15） |
| Google Search Console | 网域资源 `shopapgo.com`；10/16 开放收录，网站地图 37 页（D71） | — |
| Cloudflare Access | 应用「shopapgo back office (production)」（admin.shopapgo.com），Google 或 email 验证码登录，名单先只有你；没有服务金钥（10/18，C17） | — |
| healthchecks.io | 检查「shopapgo production」「shopapgo staging」，每 5 分钟、宽限 10 分钟，停了寄信通知（M10） | — |
| Turnstile | widget「shopapgo contact form」（shopapgo.com 和子网域，Managed）；Site Key 在设定档，Secret 两个环境都设了（M11） | — |
| Apple Pay 网域登记 | www 还没登记（正式环境没有 Apple Pay） | 跟 C14 一起登记 `www.shopapgo.com` |

---

## 6. 测试站 Worker：`apgo-us-store-staging`

| 项目 | 内容 |
|---|---|
| 网址 | staging.shopapgo.com（要网站密码）、admin-staging.shopapgo.com（后台，Cloudflare Access 10/15 起，M4）、store-staging.shopapgo.com（模拟旧 store：网页 301 到 staging） |
| 数据库 | D1 `apgo-us-store-staging`（`246c3158-a70e-420e-a165-cda01b4ca434`） |
| 其他绑定 | R2 `apgo-us-store-images-staging`；三个限速（独立的额度）；`CF_VERSION_METADATA`；placement `aws:ap-northeast-3`（大阪，数据库旁边） |
| 排程 | 每 2 分钟 |
| 付款 | Airwallex 沙盒（`AIRWALLEX_ENV` = demo）、PayPal 沙盒；没有设 `CARD_PAYMENTS_ENABLED`，所以 Card、Apple Pay、Google Pay、Airwallex Pay、PayPal 全部显示 |
| 出货 | 假 Amazon（`MCF_FAKE`，只在测试站生效），不会真的出货；库存读真的 Amazon（只读） |
| 寄信 | 只寄到核准的测试信箱（`CUSTOMER_EMAIL_TEST_RECIPIENTS`），信里有测试说明 |
| 后台登录 | `ADMIN_ACCESS` = true（名单 `apgo-backoffice-members`，跟正式环境分开）；网站密码 `ADMIN_ACCEPT_SITE_BASIC` 和共用帐密不能进后台；`ADMIN_TOKEN` 是成员身分，给脚本用，脚本用服务金钥通过 Cloudflare |
| 联络表单 | Turnstile（同一个 widget），留言寄到测试信箱 |
| 设定检查要求的密钥 | `ADMIN_TOKEN`、`AIRWALLEX_CLIENT_ID`、`AIRWALLEX_API_KEY`、`PAYPAL_CLIENT_ID`、`PAYPAL_CLIENT_SECRET`、`RESEND_API_KEY`、`STAGING_BASIC_AUTH_USER`、`STAGING_BASIC_AUTH_PASSWORD`、`ACCESS_LIST_API_TOKEN`、`TURNSTILE_SECRET_KEY` |
| 另外设了的密钥（依纪录） | `AIRWALLEX_WEBHOOK_SECRET`、`PAYPAL_ENV`（sandbox）、`PAYPAL_WEBHOOK_ID`（M6）、`GOOGLE_ADDRESS_VALIDATION_KEY`（M7）、`AMAZON_OUTBOUND_BASE_URL`、`OUTBOUND_INTERNAL_TOKEN`、`MCF_SKU_MAP_JSON`（M8）、`HEALTHCHECK_PING_URL`（M10）、`ADMIN_LOGIN_EMAIL`、`ADMIN_LOGIN_PASSWORD` |

一般设定的完整清单看 `commerce/wrangler.toml` 的 `[env.staging.vars]`。
