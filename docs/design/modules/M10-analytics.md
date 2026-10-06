# M10 追踪与分析：设计规格

| 项目 | 内容 |
|---|---|
| 文件版本 | v0.1 草稿，待你审核 |
| 日期 | 2026-10-06 |
| 上层文件 | `docs/commerce-plan.md`、`docs/design/scenarios.md` |
| 对应情境 | K1–K4、L3 |

---

## 0. 摘要

记录顾客从看商品到付款的过程，送给 Google Analytics（经 GTM）和 Meta，用来看成效和投广告。原则是**一个网站只有一套**：GTM／GA4 一套、Meta Pixel 一份程式。

---

## 1. 设定

| 项目 | 规则 |
|---|---|
| GTM／GA4 | 只留一套。线上现在是 `GTM-56WK5G8T`，9 月建的 `GTM-TD5NTFH9` 没有载入；留哪一套待你决定（企划 O2） |
| Meta Pixel | 只留一份程式，品牌页和商店页共用；只在正式网域启动 |
| Meta Conversions API | 沿用 landing 的实作：付款和开始结账由后端另外送一份，用同一个事件编号让 Meta 自动去重 |
| 移除 | 品牌站的 `AmazonClick`、`amazon_referral_click`（已经不导去 Amazon） |
| 保留 | 指南的内容事件（捲动深度、FAQ 展开等） |
| 测试用设定 | `META_TEST_EVENT_CODE` 只在测试时设定，正式环境移除 |
| staging、本机 | 不送任何事件 |
| 内部流量 | GA4 的开发人员流量过滤器维持启用（K4） |
| 隐私 | 是否需要 cookie 同意、加州「不出售或分享」选项，依法务结论（企划 O7、L3） |

---

## 2. 电商事件

| 时机 | GA4（经 GTM） | Meta Pixel（浏览器） | Meta CAPI（后端） |
|---|---|---|---|
| 看产品页 | `view_item` | ViewContent | — |
| 加入购物车 | `add_to_cart` | AddToCart | — |
| 进入结账 | `begin_checkout` | InitiateCheckout | InitiateCheckout |
| 付款成功 | `purchase` | Purchase | Purchase |
| 退款 | `refund`（由后端送） | — | — |

每个事件都带商品、数量、金额、币别；付款和退款事件带订单编号，让 GA4 能把退款扣回对应的订单（K3）。

---

## 3. 验收测试

| # | 测试 | 情境 |
|---|---|---|
| M10-01 | 四个电商事件在 GTM 预览和 Meta 测试工具都出现，参数正确 | K1 |
| M10-02 | Purchase 在 Meta 只算一次（浏览器和后端去重成功） | K1 |
| M10-03 | 退款后，GA4 收到退款事件，营收扣除 | K3 |
| M10-04 | staging 和本机不送任何事件 | — |
| M10-05 | 广告点击资料随订单保存，付款后送给 Meta | K2 |
| M10-06 | 内部流量被 GA4 过滤 | K4 |
| M10-07 | 全站只载入一套 GTM、一份 Pixel | — |
| M10-08 | 隐私选项依法务结论运作 | L3 |

---

## 4. 跟现有代码的差距

| 项目 | 现在 | 要做的 |
|---|---|---|
| Meta Pixel、CAPI、广告归因 | ✓ landing 的商店页；品牌站另有一份 Pixel | 合成一份 |
| GA4 电商事件 | ✗ | 新增 |
| 退款回报 GA4 | ✗ | 新增 |
| GTM | 两套（O2） | 留一套 |
| 品牌站导去 Amazon 的事件 | 还在 | 移除 |
