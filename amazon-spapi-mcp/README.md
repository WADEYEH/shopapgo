# amazon-spapi-mcp：Amazon 转接程序

| 项目 | 内容 |
|---|---|
| 是什么 | Cloudflare Worker `amazon-spapi-mcp`，网址 `https://amazon-mcp.apgo.tw`。所有跟 Amazon SP-API 的连线都经过它，Amazon 的授权只放在这里 |
| 谁在用 | ① 美国网站送单、读回、取消、追踪（`/internal/outbound/*`，金钥 `OUTBOUND_INTERNAL_TOKEN`）② Amazon 工具（MCP，`/mcp`，金钥 `MCP_API_KEY`；`amazon-connect.apgo.tw` 那个登录前门也是转到这里）③ 自动请 Amazon 顾客留评论的排程（资料库 `amazon-review-solicitations`） |
| 这份原始码怎么来的 | 原本的原始码找不到（10/6 直接从一台电脑上传部署，没有放在 GitHub）。2026-10-16 从 Cloudflare 下载当时线上的版本（`ce267b34`，10/13 换金钥后的版本，程序码是 10/6 那版）放进来。`src/worker.js` 就是当时线上的程序，没有改过；`wrangler.toml` 照 Cloudflare 上的设定写，用 `wrangler deploy --dry-run` 比对过，打包出来的程序跟线上一个字都不差 |
| 金钥 | 都存在 Cloudflare，**不在这里**：`AMAZON_SP_API_CLIENT_ID`、`AMAZON_SP_API_CLIENT_SECRET`、`AMAZON_SP_API_REFRESH_TOKEN`、`MCP_API_KEY`、`OUTBOUND_INTERNAL_TOKEN`、`SHORTLINKS_INTERNAL_TOKEN`。重新部署不会动到它们 |

## 网站用的入口（`/internal/outbound`，金钥 `OUTBOUND_INTERNAL_TOKEN`）

| 入口 | 做什么 |
|---|---|
| `POST /preview` | 出货试算（地址能不能送、预计送达） |
| `POST /orders`、`GET /orders`、`GET /orders/{id}`、`POST /orders/{id}/cancel` | 建立、列出、读取、取消出货单 |
| `GET /tracking/{包裹编号}` | 包裹追踪 |
| `GET /inventory?skus=D204,D215` | 每个 SKU 的可售、入库中、保留数量（只读，10/18 的 1.8.3 加的，规格见下面「库存入口」） |

## 库存入口（`GET /internal/outbound/inventory`）

网站每 15 分钟读一次，可售低于 5 件就显示缺货、不让结账（D25、D76；网站这边是 `commerce/worker/inventory.js`，营运手册第 26 节）。

```
GET /internal/outbound/inventory?skus=D204,D215
Authorization: Bearer <OUTBOUND_INTERNAL_TOKEN>
```

- 只读，不改任何 Amazon 资料。`skus` 必填，1–50 个，逗号分开。
- 回应（200）：`{ "marketplaceId": "ATVPDKIKX0DER", "items": [{ "sellerSku": "D204", "fulfillable": 37, "inbound": 120, "reserved": 2, "updatedAt": "…" }] }`
- **Amazon 没有纪录的 SKU 不会出现在 `items` 里**（不是回 0）；网站把没出现的 SKU 当成 0 件。
- 错误沿用其他入口的格式（`{ error, spapiStatus, details }`，Amazon 的 4xx／5xx 照转）。

| 栏位 | SP-API（FBA Inventory v1 `/fba/inventory/v1/summaries`，`details=true`） |
|---|---|
| `fulfillable` | `inventoryDetails.fulfillableQuantity` |
| `inbound` | `inboundWorkingQuantity + inboundShippedQuantity + inboundReceivingQuantity` |
| `reserved` | `inventoryDetails.reservedQuantity.totalReservedQuantity` |
| `updatedAt` | `lastUpdatedTime` |

## 怎么改

`src/worker.js` 是打包好的程序（约 9 万行，没有压缩，看得懂）。要改就直接改这个档，照 `/internal/outbound` 那一段的写法，改完：

```bash
cd amazon-spapi-mcp
npx --yes wrangler@4.144.0 deploy --dry-run --outdir dist
```

dry-run 不用登录，也不会上传，用来确认设定和程序都能打包。CI 每个 PR 都会跑一次。

## 怎么部署

只能从 GitHub 部署（营运手册第 25 节）：Actions → **Deploy Amazon gateway** → Run workflow（只能选 `main`），确认栏输入 `deploy amazon gateway`，然后由 Production 环境的核准人按核准。部署前会把线上的版本号写进执行摘要，方便回退；部署后会检查 `/health` 回报的版本号是不是这次的。

## 回退

```bash
cd amazon-spapi-mcp
npx --yes wrangler@4.144.0 rollback <版本号>
```

版本号在部署执行摘要里（「Live before this deploy」）。2026-10-16 改版前的版本是 `ce267b34-956c-4821-8cce-c14a3cc42fda`。
