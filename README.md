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
  layout.js   # 全站 layout 與 metadata
  page.js     # 首頁
next.config.mjs
package.json
```
