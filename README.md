# shopapgo

shopapgo.com 的網站原始碼。Next.js (App Router) 專案，正在從 Vercel 遷移到 Cloudflare Pages 靜態匯出。

## 架構

| 層 | 設定 |
|---|---|
| 程式碼 | GitHub `WADEYEH/shopapgo`，production 分支 `main` |
| 部署 | **遷移中**：Vercel 專案 `shopapgo` 仍接收流量；Cloudflare Pages 靜態匯出準備中 |
| 域名 | `shopapgo.com` → 308 轉到 `www.shopapgo.com`；www 指向 Production |
| DNS | Cloudflare 託管；**目前**仍指向 Vercel（`@` A 記錄、`www` CNAME → `cname.vercel-dns.com`） |
| SSL | Vercel 自動簽發（切換 Cloudflare Pages 後由 Cloudflare 簽發） |

Vercel 帳號的 GitHub 連結是 `WADEYEH`；本機 git 以 `anpuuuuu`（collaborator）推送。

## Cloudflare Pages 遷移

網站正在從 Vercel 遷移到 Cloudflare Pages 作為靜態 HTML 匯出。**DNS 尚未切換**，production 流量仍走 Vercel。

### 靜態匯出設定

`next.config.mjs` 設定 `output: "export"`，建置後產生 `out/` 目錄，適用於 Cloudflare Pages：

| 設定 | 值 |
|---|---|
| Build command | `npm run build`（或 `npx next build`） |
| Output directory | `out` |
| Framework | Next.js (Static HTML Export) |

### 首頁與 /us 重導

美國站首頁已掛在網域根路徑 `/`。精確路徑 `/us` 與 `/us/` 301 到 `https://www.shopapgo.com/`；`/us/guides` 與 `/us/assets` 維持原 URL、不重導。

| 檔案 | 平台 | 說明 |
|------|------|------|
| `vercel.json` | Vercel（若仍部署） | `/us`、`/us/` → `/` 301 |
| `public/_redirects` | Cloudflare Pages | 同上（絕對 URL 目標） |

### 遷移階段

1. **Phase 1**（本 PR）：啟用靜態匯出、設定 `_redirects`、更新文件
2. **Phase 2**：在 Cloudflare Dashboard 建立 Pages 專案、設定環境變數、驗證預覽部署
3. **Phase 3**：切換 DNS（`www` CNAME → Pages 專案、`@` 轉址）、停用 Vercel 部署

### 驗證靜態匯出

```bash
npm run build           # 產生 out/ 目錄
ls out/                 # 確認 index.html、us.html、_redirects、sitemap.xml 等
npx serve out           # 本地預覽（需另裝 serve）
```

## 日常工作流

在 `main` 上直接開發，push 即上線：

```bash
npm install     # 第一次
npm run dev     # 本地預覽 http://localhost:3000
git add -A && git commit -m "..." && git push
```

push 到 `main` 後 Vercel 會自動建置並部署到 shopapgo.com。

只有在改動大、想先看效果時才開分支；push 分支後 Vercel 會給一個預覽網址，確認沒問題再合回 `main`。

## 目錄

```
app/
  (tw)/                 # 預留給台灣站（目前無 page；勿與 US 根路徑衝突）
    layout.js
  (us)/                 # 美國站 root layout（lang=en、Barlow 字體、us.css）
    layout.js
    us.css
    page.js             # / 美國落地頁（CTA 連同域商品頁）
    us/
      guides/
        page.js         # /us/guides 指南總覽
        after-washing-your-car/page.js
        wet-or-dry-application/page.js
        how-to-apply-colored-glaze/page.js
        how-to-apply-glaze-coating/page.js
components/us/
  GtmScripts.js         # GTM 容器載入器，兩道閘門都通過才輸出
  SiteChrome.js         # 六頁共用 header、手機抽屜與選單狀態
  SiteFooter.js         # 六頁共用完整站點導航與客服資訊
  landing/              # 首頁各區塊（client components，含 DRY/WET 選擇器狀態）
  guides/               # 指南共用 article、麵包屑、響應式目錄元件
app/
  robots.js             # /robots.txt（必須在 app 根目錄，放進 route group 會失效）
  sitemap.js            # /sitemap.xml：首頁為 /，指南仍為 /us/guides/*；不含會 301 的 /us
lib/
  site.js               # SITE_URL：正式網域的唯一來源，metadataBase、JSON-LD、sitemap 共用
lib/us/
  routes.js             # 站內連結唯一來源（home="/"；guides/assets 仍用 US_BASE="/us"）
  navigation.js         # 主選單、頁尾共用的分組與短標題；首頁段落目錄
  company.js            # apgo.tw 公開公司資料、電話、地址、營業時間與預設客服信箱
  tokens.js             # 設計 tokens：色票、字體、產品基本資料
  config.js             # 讀取 NEXT_PUBLIC_APGO_US_* 環境變數（影片、分析、耐洗次數）
  faq.js                # 首頁 FAQ 文案（FAQ 區與 JSON-LD 共用）
  analytics.js          # dataLayer 事件
public/us/assets/       # logo、packshot、施作步驤圖、影片 poster
.env.example            # 美國站所需環境變數清單
```

## 美國站（/ 首頁；指南 /us/guides）

`/` 是 APGO 美國落地頁（原 `/us`），依設計交付包高保真重建。精確 `/us` 會 301 到 `/`。主要購買 CTA 連到同域商店商品頁（`/products/d204`、`/products/d215`）；結帳由同一主機的 Worker 處理。產品與指南正文仍維持原核准文案。

### 環境變數

| 變數 | 說明 |
|---|---|
| `NEXT_PUBLIC_APGO_US_VIDEO_READY` | 施作影片核准後設 `true`（影片檔放 `public/us/assets/video/{sku}-application.mp4` 與 `{sku}-captions-en.vtt`） |
| `NEXT_PUBLIC_APGO_US_SUPPORT_EMAIL` | 六頁共用客服信箱；未設定或空白時預設 services@apgo.com.tw |
| `NEXT_PUBLIC_APGO_US_D204_WASH_RESISTANCE` / `..._D215_...` | 耐洗次數文字，空白顯示「—」 |
| `NEXT_PUBLIC_APGO_US_RANK_SOURCE` | No.1 排名來源註記 |
| `NEXT_PUBLIC_APGO_US_SHOW_ORIGIN` | `false` 則 hero eyebrow 不顯示「Made in Taiwan」 |
| `NEXT_PUBLIC_APGO_US_ANALYTICS_READY` | 分析總開關，只在 Production 設 `true`，預覽與本機留空才不會汙染 GA4 |
| `NEXT_PUBLIC_APGO_US_GTM_ID` | GTM 容器 ID，格式 `GTM-XXXXXXX`；GA4 評估 ID 設在 GTM 後台，不進程式碼 |
| `NEXT_PUBLIC_APGO_US_META_PIXEL_ID` | Meta Pixel（資料集）ID，純數字 8–20 碼；與 `ANALYTICS_READY=true` 同時成立才載入（官網 /us 僅送 PageView 與 `AmazonClick`）；正式站為公開值 `2606879866471418`，其他環境留空 |

完整清單見 `.env.example`。

### 導航與本地驗證

- 美國站 layout 統一提供 Header / Footer；文章正文保留 Server Components。
- 桌面 Header 高 72px；900px 以下高 64px，顯示 Guides 入口與右側 Menu 抽屜。
- 本頁目錄獨立於全站選單；文章在 1100px 以上使用右側固定目錄，其餘寬度放在文章頂部，手機預設收起。
- DRY / WET 選擇器位於產品比較區；`#d204` / `#d215` 保留深連結及瀏覽器歷史切換。
- 首頁手機購買列在 Hero、最後產品區或 Footer 可見，以及 Menu 開啟時隱藏；指南頁不顯示購買列。
- 尚為 `#` 的法律／聯絡連結不顯示。Footer 使用 `company.js` 的公開公司資料及預設信箱，並區分 APGO 產品支援與 Amazon 訂單支援。導覽入口文字可調整，產品與文章正文仍維持原核准文案。
- `npm test` 檢查同域商品 CTA 與點擊事件；`npm run build` 檢查正式建置。
- 瀏覽器驗證：六頁 × 360 / 390 / 768 / 1024 / 1440px；確認菜單鍵盤操作、跨頁／段落跳轉、產品切換與 Footer 避讓。

### 分析與搜尋

GA4 透過 GTM 載入，程式碼裡只有容器 ID。`lib/us/analytics.js` 推送六個事件到 `dataLayer`，
GTM 後台再把它們對應成 GA4 事件：`us_referral_landing_view`、`scroll_depth`、
`fit_selector_answer`、`amazon_referral_click`、`faq_expand`、`video_start`。
**這些事件名稱是跟 GTM 容器之間的契約，改名會靜默弄壞後台的代碼，而且不會有任何建置錯誤。**

容器只在 `NEXT_PUBLIC_APGO_US_ANALYTICS_READY=true` 且容器 ID 格式正確時載入，兩者都預設關閉。
不要改用 `NODE_ENV` 判斷：Vercel 建預覽部署時 `NODE_ENV` 同樣是 `production`。

`/robots.txt` 和 `/sitemap.xml` 由 `app/robots.js` 與 `app/sitemap.js` 產生。新增頁面時要一併加進
`app/sitemap.js` 的 `pages` 陣列，忘了的話 `npm test` 會紅字。`lastModified` 是文案最後修改的日期，
改樣式不用動。Search Console 用 Cloudflare DNS TXT 驗證的網域資源，那筆 TXT 記錄不能刪。

### 之後要把美國站搬到根路徑

- **目前狀態**：`public/_redirects` 設定 `/` 301 轉到 `/us`。台灣站要用 root 時把那行刪掉即可。
- **真的搬到 /**：把 `lib/us/routes.js` 的 `US_BASE` 改成 `""`，把 `app/(us)/us/*` 移到 `app/(us)/*`，並在 `public/_redirects` 為舊的 `/us/*` 加 redirect。

### 上線前待補（設計交付包列出的空缺）

- Privacy / Terms / Contact 連結（`lib/us/routes.js` 目前是 `#`）。
- 施作影片 MP4 與英文字幕 VTT。
- 耐洗次數數值。
- 文案對齊：首頁 WET 段寫「No extra step」，指南寫毛巾擦乾後仍需 buff。

## Direct store integration (October 1)

The imported V3 storefront, Airwallex Worker and order back office live in
`commerce/` as a separate application. Existing Pages export and guide routes
remain intact. Setup, provenance, preview switches and go-live limitations:
[commerce/README.md](commerce/README.md). No commerce deploy is triggered by
`npm run build`; production checkout remains closed until its release gates pass.
