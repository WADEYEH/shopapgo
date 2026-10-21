# shopapgo

APGO 美國站 `www.shopapgo.com` 的原始碼：品牌首頁、指南和所有購物頁面（商品、購物車、結帳、政策、聯絡）都在同一個 Next.js（App Router）靜態匯出（`out/`）裡，由 `commerce/` 的 Cloudflare Worker `apgo-us-store` 提供。同一個 Worker 也負責 `/api/*`、後台、轉址和排程。

## 現況（2026-10-16 起上線）

| 項目 | 內容 |
|---|---|
| 正式網站 | `www.shopapgo.com` 和裸網域，整個網域由 Worker `apgo-us-store` 服務（`out/` 當靜態檔，`run_worker_first`） |
| 舊網址 | `store.shopapgo.com`、`shopapgo.com` 的網頁 301 到 www 的同一頁（`MOVED_HOSTS`）；`/api/*`、`/.well-known/*` 不轉址 |
| 後台 | `admin.shopapgo.com`，Cloudflare Access 登入（Google 或 email 驗證碼）。成員在後台 Members 頁管理，同步到 Zero Trust 名單；`ADMIN_LOGIN_*`、`ADMIN_TOKEN` 還在，但在正式環境打不開 `/admin` |
| 測試站 | `staging.shopapgo.com`（網站密碼）＋ `admin-staging.shopapgo.com`（Access）；訂單送到假的 Amazon（`MCF_FAKE`），庫存讀真的 Amazon（唯讀） |
| 舊主機 | 之前服務 www 的 Cloudflare Pages 專案保留到 10/30 之後（C30）。Vercel 舊專案仍會替 PR 建預覽（PR 上的「Vercel」檢查），但不接任何流量；`vercel.json` 暫時保留 |
| 程式碼 | GitHub `WADEYEH/shopapgo`，主分支 `main` |

## 目錄

```
app/
  (us)/                 美國站 root layout（lang=en、Barlow、us.css、GTM、Meta Pixel）
    page.js             / 首頁
    us/guides/          /us/guides 指南總覽與 27 篇指南
    (shop)/             商店頁：/products、兩個商品頁、/cart、/checkout（含訂單頁 /checkout?order=…）、
                        /privacy、/terms、/returns、/shipping、/contact
  (tw)/                 預留給台灣站（目前沒有頁面，勿與根路徑衝突）
  robots.js、sitemap.js /robots.txt、/sitemap.xml（必須在 app 根目錄）
components/us/          Header、Footer、首頁區塊、指南元件、GTM 載入
components/shop/        商品頁、購物車、結帳、政策頁、聯絡表單
lib/us/                 站內網址（routes.js）、導覽、公司資料、設定（config.js）、分析事件（analytics.js）
lib/shop/               商店共用程式：商品資料、購物車、結帳與地址規則、付款輔助（Worker 也引用同一份）
lib/site.js             SITE_URL：正式網域的唯一來源
public/                 us/assets/（圖片、影片）、admin/（後台頁面）、js/meta-pixel.js、apple-pay/、_redirects
commerce/               商店 Worker：API、後台 API、轉址、排程、D1 遷移檔、測試與工具（見 commerce/README.md）
amazon-spapi-mcp/       Amazon 轉接程式（amazon-mcp.apgo.tw）：MCF 送單、讀回、取消、追蹤、庫存
amazon-connect/         Amazon 工具（MCP）的 GitHub 登入入口
amazon-review-cron/     Amazon 請評論排程的備援
docs/                   企劃、營運手冊、設計規格、政策全文（見下方「文件」）
tests/                  網站的 node:test 測試（npm test）
.env.example            網站的 NEXT_PUBLIC_* 設定
```

## 本機開發與測試

需要 Node 22.5 以上。

```bash
npm ci                                  # 第一次
npm run dev                             # 品牌頁與指南 http://localhost:3000
npm test                                # 網站測試（tests/*.test.cjs）
npm run build                           # 正式建置，產生 out/
```

`npm run dev` 只適合看品牌頁和指南。商店頁（Shop、購物車、結帳、政策頁）要跟 Worker 一起看：

```bash
npm run commerce:install                # commerce/ 的套件
npm --prefix commerce run build:site    # 用測試站設定建置 out/
npm run commerce:dev                    # Worker http://127.0.0.1:8799
npm run commerce:test                   # Worker 與商店的 node:test
npm run commerce:test:e2e               # Playwright，跑在 build:site 的結果上
npm run commerce:verify                 # Worker 打包檢查（dry-run）
```

本機 D1、`.dev.vars` 和沙盒付款見 `commerce/README.md`。

## 部署

- **CI**（`.github/workflows/ci.yml`）：每個 PR 和每次 push 到 `main` 都跑：網站測試與建置、商店測試、Worker 打包、Playwright、三個 Amazon Worker 的 dry-run。
- **測試站**：`main` 的 CI 通過後自動部署（`.github/workflows/deploy.yml`；只部署 `main` 最新的那個 commit）。
- **正式環境**：只能手動。GitHub → Actions → Deploy → target 選 `production`、confirm 輸入 `deploy production`，再由 Production 環境的審核人核准（D65）。push 到 `main` 不會更新正式網站，也不從本機部署。
- **Amazon 轉接程式和另外兩個 Amazon Worker**：`.github/workflows/deploy-amazon-gateway.yml`（手動、要核准）。
- **資料庫每日加密備份**：`.github/workflows/backup-database.yml`（D77，`docs/ops/runbook.md` 第 6 節）。

步驟、回退和還原：`docs/ops/runbook.md`。

## 網址與轉址

- 首頁在 `/`。`/us`、`/us/` 301 到 `https://www.shopapgo.com/`（Worker 的 `commerce/worker/redirects.js`，`public/_redirects` 同一條規則）；指南和素材維持在 `/us/guides/*`、`/us/assets/*`。
- `/go/*` 是包裝卡 QR 短網址，302 到指南。
- 商品頁用具名網址：`/products/atomic-colored-glaze`（D204）、`/products/atomic-glaze-coating`（D215）；舊的 `/products/d204`、`/products/d215` 301 過去。
- 站內連結的唯一來源是 `lib/us/routes.js`。`NEXT_PUBLIC_APGO_US_SINGLE_SITE=true`（正式與測試站的建置都會設）才在 Header / Footer 顯示 Shop、購物車和政策連結，並使用具名商品網址；沒設的建置（本機 `next dev`、Vercel 預覽）不顯示這些連結，商品按鈕連到 `/products/d204`、`/products/d215`。

## 商店頁

商品總覽、兩個商品頁、購物車、結帳、政策頁和聯絡頁（`app/(us)/(shop)`，D41）跟品牌頁共用 Header / Footer（結帳頁只留標誌和購物車），商品資料與首頁共用 `lib/shop/`。價格一律來自 Worker 的 `/api/store/config`，頁面本身不含價格；擁有者在後台改價格、文字和照片（D52）。

政策頁直接顯示 `docs/legal/` 的全文（2026-10-16 生效，賣家 WEI SYUAN TECHNOLOGY CO., LTD.）；改那幾個檔案，下次部署後網站就跟著變。

付款、出貨、後台和寄信的細節：`commerce/README.md`、`commerce/docs/commerce.md`。

## 環境變數（網站）

| 變數 | 說明 |
|---|---|
| `NEXT_PUBLIC_APGO_US_SINGLE_SITE` | `true` = 這份建置由商店 Worker 一起服務（見上方「網址與轉址」）；`commerce/scripts/build-site.mjs` 會設 |
| `NEXT_PUBLIC_APGO_US_ANALYTICS_READY` | 分析總開關；只在正式建置設 `true` |
| `NEXT_PUBLIC_APGO_US_GTM_ID` | GTM 容器 ID（`GTM-XXXXXXX`）；GA4 評估 ID 設在 GTM 容器裡，不進程式碼 |
| `NEXT_PUBLIC_APGO_US_HONOR_GPC` | Global Privacy Control（D46）；空白 = 遵守，`false` = 不遵守 |
| `NEXT_PUBLIC_APGO_US_SUPPORT_EMAIL` | 客服信箱；空白時用 services@apgo.com.tw |
| `NEXT_PUBLIC_APGO_US_VIDEO_READY` | 施作影片核准後設 `true`（影片放 `public/us/assets/video/{sku}-application.mp4` 與 `{sku}-captions-en.vtt`） |
| `NEXT_PUBLIC_APGO_US_D204_WASH_RESISTANCE` / `..._D215_...` | 耐洗次數文字，空白顯示「—」 |
| `NEXT_PUBLIC_APGO_US_RANK_SOURCE` | No.1 排名來源註記 |
| `NEXT_PUBLIC_APGO_US_SHOW_ORIGIN` | `false` 則 hero 不顯示「Made in Taiwan」 |

`NEXT_PUBLIC_*` 在建置時寫進頁面，改了要重新部署。正式建置的追蹤設定由 Deploy workflow 給值（GitHub Variables，未設時用預設的 `GTM-TD5NTFH9`）；測試站和本機一律不載入。完整清單見 `.env.example`。

## 分析與搜尋

- GA4 透過 GTM 載入。`lib/us/analytics.js` 把事件推到 `dataLayer`：GA4 建議的電商事件（`view_item`、`select_item`、`view_cart`、`add_to_cart`、`remove_from_cart`、`begin_checkout`、`add_shipping_info`、`add_payment_info`、`purchase`，都帶 `ecommerce` 物件），以及 `us_referral_landing_view`、`scroll_depth`、`fit_selector_answer`、`faq_expand`、`video_start` 等。**事件名稱是跟 GTM 容器之間的契約，改名會靜默弄壞後台的代碼，而且不會有任何建置錯誤。**
- 同一個事件也以 `apgo:analytics` DOM 事件送出，`public/js/meta-pixel.js`（全站唯一的 Meta Pixel，只在 shopapgo.com 的網域上啟動）把它轉成 Meta 事件；購買事件跟 Worker 的 Conversions API 用同一個事件編號去重（`commerce/docs/meta-tracking.md`）。瀏覽器送出 Global Privacy Control 時不載入 Pixel（D46）。
- GTM 只在 `NEXT_PUBLIC_APGO_US_ANALYTICS_READY=true` 且容器 ID 格式正確時載入。不要改用 `NODE_ENV` 判斷：預覽建置的 `NODE_ENV` 同樣是 `production`。
- 除了購物車和結帳，所有頁面都開放收錄；`/sitemap.xml` 共 37 頁（D71）。新增頁面要加進 `app/sitemap.js` 的 `pages`，忘了的話 `npm test` 會失敗。`lastModified` 是文案最後修改的日期，改樣式不用動。Search Console 用 Cloudflare DNS TXT 驗證網域資源，那筆 TXT 紀錄不能刪。

## 文件

| 文件 | 內容 |
|---|---|
| `docs/commerce-plan.md` | 企劃、決策紀錄（D 編號）、待辦總表（第 8.1 節） |
| `docs/ops/runbook.md` | 營運手冊（簡體中文）：部署、回退、還原、告警、後台操作 |
| `docs/ops/production-config.md` | 正式環境設定清單（只記名稱，不記密鑰） |
| `docs/design/` | 設計規格：`modules/`、`scenarios.md`、`traceability.md` |
| `docs/legal/` | 政策全文（網站的政策頁直接顯示） |
| `commerce/README.md`、`commerce/docs/` | 商店 Worker：技術參考 `commerce.md`、`paypal.md`、`meta-tracking.md`、`product-pages.md` |
| `amazon-spapi-mcp/README.md` | Amazon 轉接程式 |
