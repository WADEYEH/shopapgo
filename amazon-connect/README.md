# amazon-connect：Amazon 工具的登录入口

| 项目 | 内容 |
|---|---|
| 是什么 | Cloudflare Worker `apgo-amazon-mcp-gateway`，网址 `https://amazon-connect.apgo.tw`（版本 0.2.2） |
| 做什么 | 让 Claude（和 ChatGPT）使用 Amazon 工具（MCP）：先用 GitHub 登录，只有指定的那一个 GitHub 帐号（`GITHUB_OWNER_ID`）能通过；通过后把工具请求转给 Amazon 转接程序（`amazon-spapi-mcp/`，`https://amazon-mcp.apgo.tw/mcp`），带上转接程序的金钥 |
| 这份原始码怎么来的 | 原本的原始码不在 GitHub（10/4 从一台电脑直接上传）。2026-10-19 从 Cloudflare 下载当时线上的版本放进来（C32）。`src/index.js` 就是线上的程序，没有改过；`wrangler.toml` 照 Cloudflare 上的设定写，dry-run 打包出来跟线上一模一样 |
| 金钥 | 都存在 Cloudflare，**不在这里**：`AMAZON_MCP_API_KEY`（转接程序的 `MCP_API_KEY`）、`GITHUB_CLIENT_ID`、`GITHUB_CLIENT_SECRET`（GitHub 的 OAuth 应用）。重新部署不会动到它们 |
| 资料 | KV `OAUTH_KV`：登录的客户端、授权和令牌 |

## 怎么改、怎么部署

`src/index.js` 是打包好的程序（约 5,200 行，没有压缩）。改完先跑：

```bash
cd amazon-connect
npx --yes wrangler@4.144.0 deploy --dry-run --outdir dist
```

部署只从 GitHub：Actions → **Deploy Amazon gateway** → Run workflow（分支 `main`），Worker 选 `amazon-connect`，确认栏输入 `deploy amazon gateway`，Production 核准人核准（营运手册第 25 节）。部署后在 Claude 用一次 Amazon 工具（例如查库存），确认登录和工具都正常。

## 回退

```bash
cd amazon-connect
npx --yes wrangler@4.144.0 rollback <版本号>
```

版本号在部署执行摘要（「Live before this deploy」）。
