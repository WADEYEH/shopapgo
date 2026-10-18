# Amazon 转接程序要加的「查库存」入口

给负责 `amazon-spapi-mcp`（Cloudflare Worker，网址 amazon-mcp.apgo.tw）的人。写于 2026-10-09（PR 3-6）。

> **已完成（2026-10-18）**：转接程序的原始码已放进 repo 的 `amazon-spapi-mcp/`（D75），入口在 1.8.3 上线（#80）。跟下面的规格有一点不同：Amazon 没有纪录的 SKU 不会出现在回覆里（不是回 0）；网站把没出现的 SKU 当成 0 件。网站这边见 `commerce/worker/inventory.js` 和营运手册第 26 节。

## 为什么要加

网站要在 Amazon 可售库存低于 5 件时显示缺货、不让结账（D25，M6-09），后台也要有库存页（M9-17）。网站本身不保管 Amazon 的授权，一律透过这个转接程序。

10/9 查过它目前上线的程式：
- 已经有 `getInventorySummaries(env, { sellerSku })`（FBA Inventory API v1 `/fba/inventory/v1/summaries`，`details=true`），给 MCP 工具用。
- 给网站用的 `/internal/outbound/*` 入口里**没有**库存。只差把它开放出来。
- Hold 测试单不用改：建单入口已经接受 `fulfillment_action: "Hold"`。

## 要加的入口

```
GET /internal/outbound/inventory?skus=<sellerSku>,<sellerSku>
Authorization: Bearer <OUTBOUND_INTERNAL_TOKEN>      （跟其他 /internal/outbound 入口一样）
```

- 只读，不改任何 Amazon 资料。
- `skus` 必填，最多 50 个，用逗号分开。
- 回应（200）：

```json
{
  "marketplaceId": "ATVPDKIKX0DER",
  "items": [
    { "sellerSku": "D204", "fulfillable": 37, "inbound": 120, "reserved": 2, "updatedAt": "2026-10-09T03:00:00Z" }
  ]
}
```

| 栏位 | 从 SP-API 的哪里来 |
|---|---|
| `fulfillable` | `inventoryDetails.fulfillableQuantity` |
| `inbound` | `inboundWorkingQuantity + inboundShippedQuantity + inboundReceivingQuantity` |
| `reserved` | `inventoryDetails.reservedQuantity.totalReservedQuantity` |
| `updatedAt` | `lastUpdatedTime` |

- 没有这个 SKU：该笔回 `fulfillable: 0, inbound: 0`，不要整个失败。
- 错误沿用现有格式（`{ error, spapiStatus, details }`，Amazon 4xx/5xx 照转）。

## 程式大概长这样

放在 `handleInternalOutbound` 里，`tracking` 那段之前：

```js
if (seg.length === 1 && seg[0] === "inventory") {
  if (method !== "GET") return json2({ error: "Method not allowed" }, 405, { allow: "GET" });
  const skus = (url2.searchParams.get("skus") || "").split(",").map((s) => s.trim()).filter(Boolean);
  if (!skus.length || skus.length > 50) return json2({ error: "skus must list 1 to 50 seller SKUs" }, 400);
  const rows = await getInventorySummaries(env, { sellerSku: skus.join(",") });
  const bySku = new Map(rows.map((row) => [row.sellerSku, row]));
  return json2({
    marketplaceId: MARKETPLACE_US,
    items: skus.map((sku) => {
      const d = bySku.get(sku)?.inventoryDetails ?? {};
      return {
        sellerSku: sku,
        fulfillable: d.fulfillableQuantity ?? 0,
        inbound: (d.inboundWorkingQuantity ?? 0) + (d.inboundShippedQuantity ?? 0) + (d.inboundReceivingQuantity ?? 0),
        reserved: d.reservedQuantity?.totalReservedQuantity ?? 0,
        updatedAt: bySku.get(sku)?.lastUpdatedTime ?? null,
      };
    }),
  });
}
```

## 上线

- 这个转接程序是正式环境的服务，Claude 里的 Amazon 工具和评论邀请排程也在用。更新它要店主同意，并照它原本的部署方式部署。
- 加好后告诉我们，网站这边另开一个小 PR：每 15 分钟读一次存成快照、商品页低于 5 件显示缺货、后台库存页、低于门槛通知团队。
