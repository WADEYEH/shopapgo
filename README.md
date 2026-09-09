# shopapgo

shopapgo.com 的網站原始碼。Next.js (App Router) 專案，部署在 Vercel。

## 架構

| 層 | 設定 |
|---|---|
| 程式碼 | GitHub `WADEYEH/shopapgo`，production 分支 `main` |
| 部署 | Vercel 專案 `shopapgo`（team: wade's projects），已連結上方 repo |
| 域名 | `shopapgo.com` → 308 轉到 `www.shopapgo.com`；www 指向 Production |
| DNS | Cloudflare 託管；`@` A 記錄 → Vercel、`www` CNAME → `cname.vercel-dns.com`，Proxy 關閉（DNS only） |
| SSL | Vercel 自動簽發 |

Vercel 帳號的 GitHub 連結是 `WADEYEH`；本機 git 以 `anpuuuuu`（collaborator）推送。

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
  (tw)/                 # 台灣站 root layout（lang=zh-Hant）
    layout.js
    page.js             # / 首頁（目前為建置中佔位頁）
  (us)/                 # 美國站 root layout（lang=en、Barlow 字體、us.css）
    layout.js
    us.css
    us/
      page.js           # /us Amazon 導購首頁
      guides/
        page.js         # /us/guides 指南總覽
        after-washing-your-car/page.js
        wet-or-dry-application/page.js
        how-to-apply-colored-glaze/page.js
        how-to-apply-glaze-coating/page.js
components/us/
  SiteChrome.js         # 六頁共用 header、手機抽屜與選單狀態
  SiteFooter.js         # 六頁共用完整站點導航與客服資訊
  landing/              # 首頁各區塊（client components，含 DRY/WET 選擇器狀態）
  guides/               # 指南共用 article、麵包屑、響應式目錄元件
lib/us/
  routes.js             # 所有站內連結與素材路徑的唯一來源（US_BASE = "/us"）
  navigation.js         # 主選單、頁尾共用的分組與短標題；首頁段落目錄
  company.js            # apgo.tw 公開公司資料、電話、地址、營業時間與預設客服信箱
  tokens.js             # 設計 tokens：色票、字體、產品基本資料
  config.js             # 讀取 NEXT_PUBLIC_APGO_US_* 環境變數（Amazon 網址、開關）
  faq.js                # 首頁 FAQ 文案（FAQ 區與 JSON-LD 共用）
  analytics.js          # dataLayer 事件
public/us/assets/       # logo、packshot、施作步驤圖、影片 poster
.env.example            # 美國站所需環境變數清單
```

## 美國站（/us）

`/us` 是 APGO 美國 Amazon 導購站，依 `APGO 美國亞馬遜登陸頁` 設計交付包高保真重建。文案經 FTC 審核，**不得改寫**。

### 環境變數

所有 Amazon CTA 預設停用（無 href、`aria-disabled`），要在 Vercel 專案設定中設好以下變數才會啟用：

| 變數 | 說明 |
|---|---|
| `NEXT_PUBLIC_APGO_US_LINKS_READY` | 總開關，`true` 才啟用任何 CTA |
| `NEXT_PUBLIC_APGO_US_D204_AMAZON_URL` / `..._D215_AMAZON_URL` | 商品頁網址，必須是 `https://*.amazon.com/` |
| `NEXT_PUBLIC_APGO_US_D204_LINK_READY` / `..._D215_LINK_READY` | 單品開關 |
| `NEXT_PUBLIC_APGO_US_VIDEO_READY` | 施作影片核准後設 `true`（影片檔放 `public/us/assets/video/{sku}-application.mp4` 與 `{sku}-captions-en.vtt`） |
| `NEXT_PUBLIC_APGO_US_SUPPORT_EMAIL` | 六頁共用客服信箱；未設定或空白時預設 services@apgo.com.tw |
| `NEXT_PUBLIC_APGO_US_D204_WASH_RESISTANCE` / `..._D215_...` | 耐洗次數文字，空白顯示「—」 |
| `NEXT_PUBLIC_APGO_US_RANK_SOURCE` | No.1 排名來源註記 |
| `NEXT_PUBLIC_APGO_US_SHOW_ORIGIN` | `false` 則 hero eyebrow 不顯示「Made in Taiwan」 |

完整清單見 `.env.example`。

### 導航與本地驗證

- 美國站 layout 統一提供 Header / Footer；文章正文保留 Server Components。
- 桌面 Header 高 72px；900px 以下高 64px，顯示 Guides 入口與右側 Menu 抽屜。
- 本頁目錄獨立於全站選單；文章在 1100px 以上使用右側固定目錄，其餘寬度放在文章頂部，手機預設收起。
- DRY / WET 選擇器位於產品比較區；`#d204` / `#d215` 保留深連結及瀏覽器歷史切換。
- 首頁手機購買列在 Hero、最後產品區或 Footer 可見，以及 Menu 開啟時隱藏；指南頁不顯示購買列。
- 尚為 `#` 的法律／聯絡連結不顯示。Footer 使用 `company.js` 的公開公司資料及預設信箱，並區分 APGO 產品支援與 Amazon 訂單支援。導覽入口文字可調整，產品與文章正文仍維持原核准文案。
- `npm test` 檢查 Amazon CTA 開關、網址驗證與點擊事件；`npm run build` 檢查正式建置。
- 瀏覽器驗證：六頁 × 360 / 390 / 768 / 1024 / 1440px；確認菜單鍵盤操作、跨頁／段落跳轉、產品切換與 Footer 避讓。

### 之後要把美國站搬到根路徑

- **目前狀態**：`next.config.mjs` 已設定 `/` 308 轉到 `/us`。台灣站要用 root 時把那段 `redirects` 刪掉即可。
- **真的搬到 /**：把 `lib/us/routes.js` 的 `US_BASE` 改成 `""`，把 `app/(us)/us/*` 移到 `app/(us)/*`，並為舊的 `/us/*` 加 redirect。

### 上線前待補（設計交付包列出的空缺）

- 兩個 Amazon 商品網址。
- Privacy / Terms / Contact 連結（`lib/us/routes.js` 目前是 `#`）。
- 施作影片 MP4 與英文字幕 VTT。
- 耐洗次數數值。
- 文案對齊：首頁 WET 段寫「No extra step」，指南寫毛巾擦乾後仍需 buff。
