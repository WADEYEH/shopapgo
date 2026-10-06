# 正式环境设定清单

| 项目 | 内容 |
|---|---|
| 日期 | 2026-10-06（阶段 0 盘点，只读） |
| 范围 | Cloudflare 上和网站有关的所有资源，以及接到的外部服务 |
| 规则 | 只记名称和用途，**不记任何密钥的值**。正式设定有任何变动，都要更新这份文件（企划第 10 章） |

---

## 1. 网站与网域

| 网址 | 用途 | Cloudflare 资源 | 部署方式 | 代码来源 |
|---|---|---|---|---|
| www.shopapgo.com（另有 shopapgo.pages.dev） | 品牌站（首页 `/`、指南 `/us/guides`） | Pages 专案 `shopapgo` | **手动上传**：这个 Pages 专案没有接 GitHub，是在某个人的电脑上建置后直接上传 | shopapgo `main` |
| www.shopapgo.com 上的商店路径：`/products/*`、`/cart`、`/checkout`、`/api/*`、政策页及其 css/js/图片 | 商品页、购物车、结账（品牌站的购买按钮连到这里） | Worker `apgo-us-store`（跟 store.shopapgo.com 同一个） | 网域路由直接在 Cloudflare 设定，**不在任何 repo 里** | landing（同上） |
| store.shopapgo.com、admin.shopapgo.com | landing 线上店与后台 | Worker `apgo-us-store` | 从本机用 wrangler 部署 | landing `codex/v2-content-blueprint`（同步点 1：`cbdf77e`） |
| staging.shopapgo.com、admin-staging.shopapgo.com | 测试店 | Worker `apgo-us-store-staging` | 从本机部署；两个 repo 都会部署到这里 | 目前是 landing（10/5 21:00 最后一次部署） |

**10/6 下午更正**：上午盘点时漏了上面第二列。实测 www 的 `/products/d204`、`/cart`、`/api/store/config`、`/privacy` 都由线上店的 Worker 回应（没有 Pages 的回应标头），首页和指南仍是 Pages。品牌站 `main` 的 #25（购买按钮改连 `/products/*`）、#26（首页改成 `/`，`/us` 转到 `/`）已经上线。也就是说，D9「所有顾客页面都在 www」已经由 landing 那边部分上线。确切的路由清单要到 Cloudflare 后台「Workers 路由」查看。

**品牌站的注意事项**：品牌站的 GTM、Meta Pixel 等设定是「建置时」写进网页的。因为是在个人电脑上建置，线上用哪一套设定，取决于部署者电脑上的环境变数。目前线上载入的是 `GTM-56WK5G8T` 和 Pixel `2606879866471418`。之后改由 CI 建置部署（M12）。

---

## 2. 数据库（D1）

| 名称 | ID | 建立时间（UTC） | 用途 | 目前的资料表 |
|---|---|---|---|---|
| `apgo-us-store` | `b409b132-2f2d-4da8-970c-2cf5560ac830` | 2026-10-04 20:25 | 正式 | orders、webhook_events、order_notifications、order_fulfillments、order_emails、order_audit、order_mcf、order_attribution、order_meta_events、order_payments |
| `apgo-us-store-staging` | `246c3158-a70e-420e-a165-cda01b4ca434` | 2026-09-30 17:51 | 测试 | 两个 repo 的资料表都有 |

正式数据库的订单（10/6）：39 张，全部待付款，0 张付款成功。

---

## 3. 正式 Worker：`apgo-us-store`

| 类别 | 名称 |
|---|---|
| 一般设定 | `ADMIN_HOST`（admin.shopapgo.com）、`AIRWALLEX_ENV`（prod）、`META_DATASET_ID` |
| 密钥 | `ADMIN_LOGIN_EMAIL`、`ADMIN_LOGIN_PASSWORD`、`ADMIN_TOKEN`、`AIRWALLEX_API_KEY`、`AIRWALLEX_CLIENT_ID`、`AIRWALLEX_WEBHOOK_SECRET`、`APPLE_PAY_ENABLED`、`GOOGLE_PAY_ENABLED`、`META_CAPI_ACCESS_TOKEN`、`META_TEST_EVENT_CODE`、`PAYPAL_CLIENT_ID`、`PAYPAL_CLIENT_SECRET`、`PAYPAL_ENV`、`PRICING_APPROVED` |
| 排程 | 每 15 分钟 |
| 先进程式的路径 | `/api/*`、`/admin`、`/admin/*`、Apple Pay 验证文件 |

**跟 repo 对不上的地方**：`APPLE_PAY_ENABLED`、`GOOGLE_PAY_ENABLED`、`PRICING_APPROVED` 这几个开关是用「密钥」设定的，不在任何 repo 的设定档里；PayPal、后台 email＋密码登录的密钥也是直接在 Cloudflare 上设的。

**合并后的新版需要、但正式环境还没有的设定**：

| 用途 | 名称 |
|---|---|
| 寄信 | `RESEND_API_KEY`、`RESEND_WEBHOOK_SECRET`、`CUSTOMER_EMAIL_*`、`ORDER_NOTIFY_*`、`REFUND_ALERT_*` |
| Amazon 出货 | `AMAZON_OUTBOUND_BASE_URL`、`OUTBOUND_INTERNAL_TOKEN`、`MCF_SKU_MAP_JSON`、`MCF_SHIPPING_MAP_JSON`、`MCF_AUTO_SUBMIT` |
| PayPal 通知验证 | `PAYPAL_WEBHOOK_ID` |
| 地址验证 | Google Address Validation 的 API 金钥（新增，名称待定） |
| 后台登录 | Cloudflare Access 设定（新增） |
| 联络表单防机器人 | Turnstile 金钥（新增） |

**之后要移除的**（企划 O10）：`META_TEST_EVENT_CODE`（先确认用途）；切换到 Cloudflare Access 后的 `ADMIN_LOGIN_EMAIL`、`ADMIN_LOGIN_PASSWORD`；`ADMIN_TOKEN` 只留给脚本或移除。

---

## 4. 测试 Worker：`apgo-us-store-staging`

| 类别 | 名称 |
|---|---|
| 一般设定 | `ADMIN_ACCEPT_SITE_BASIC`、`ADMIN_HOST`、`AIRWALLEX_ENV`、`EXPRESS_CHECKOUT`、`ROOT_PAGE`、`SITE_ENV` |
| 密钥 | `ADMIN_LOGIN_EMAIL`、`ADMIN_LOGIN_PASSWORD`、`ADMIN_TOKEN`、`AIRWALLEX_API_KEY`、`AIRWALLEX_CLIENT_ID`、`AIRWALLEX_WEBHOOK_SECRET`、`AMAZON_OUTBOUND_BASE_URL`、`APPLE_PAY_ENABLED`、`GOOGLE_PAY_ENABLED`、`MCF_SKU_MAP_JSON`、`OUTBOUND_INTERNAL_TOKEN`、`PAYPAL_CLIENT_ID`、`PAYPAL_CLIENT_SECRET`、`PAYPAL_ENV`、`RESEND_API_KEY`、`RESEND_WEBHOOK_SECRET`、`STAGING_BASIC_AUTH_PASSWORD`、`STAGING_BASIC_AUTH_USER` |

10/5 landing 部署后，shopapgo 原本在 staging 用的一般设定（寄件人、测试收件信箱、退款通知收件人等）被换掉了；这些设定仍写在 shopapgo `codex/us-commerce` 的部署设定里，密钥都还在。

---

## 5. 外部服务

| 服务 | 现况 | 待办 |
|---|---|---|
| Airwallex（正式） | 正式金钥有效；付款通知有收到（78 则，付款单与付款尝试事件），签章验证通过；还没有任何一笔付款成功 | 在 Airwallex 后台确认通知网址、退款事件有没有订阅、5 笔刷卡失败的原因；之后加订阅争议事件 |
| PayPal（正式） | 正式收款已开启（landing） | 建立付款通知（webhook），设定 `PAYPAL_WEBHOOK_ID` |
| Resend | 正式没有设定；staging 有 | 新版上线前设定；寄件网域待 O8 |
| Amazon（经 `amazon-spapi-mcp`） | 正式没有连线；staging 有连线设定 | 新版上线前设定；先确认危险品分类（F11） |
| Meta | Dataset／Pixel `2606879866471418`；正式有 CAPI 金钥，也有测试事件代码 | 确认后移除测试事件代码 |
| Google Analytics／GTM | 品牌站载入 `GTM-56WK5G8T` → `G-DRY1NJHGXW`；另一套 `GTM-TD5NTFH9` → `G-YM10YMKE30` 没有载入 | 留哪一套待 O2 |
| Google Search Console | 网域资源 `shopapgo.com`，用 DNS 验证 | 维持 |
| Apple Pay 网域登记 | store.shopapgo.com 是否已在 Airwallex 登记待确认 | 切换前登记最终网域 |

---

## 6. 盘点发现的风险

| 风险 | 处理 |
|---|---|
| 品牌站在个人电脑建置后手动上传，线上设定取决于部署者的电脑 | 改由 CI 建置部署（M12） |
| 线上店从本机部署，设定散在 Cloudflare 上 | 每次同步时比对本文件（D22）；切换后只从 CI 部署 |
| www 上的商店路由只存在 Cloudflare，不在任何 repo 的设定里 | 先把确切的路由清单抄进本文件；从任何 repo 部署正式环境之前，都要先把这些路由写进该 repo 的设定，避免部署时被移除 |
| 两个 repo 部署到同一个 staging | 合并后的新版改用独立测试站 next.shopapgo.com（10/6 同意，D35） |
| 正式环境没有寄信、通知、Amazon 出货连线 | 过渡期人工处理（企划第 7 章）；新版上线前补齐 |
| PayPal 付款通知没有设定 | 现在就补 |
