# amazon-review-cron：自动请评论的备援排程

| 项目 | 内容 |
|---|---|
| 是什么 | Cloudflare Worker `amazon-review-solicitation-cron`，没有网址 |
| 做什么 | 每天 16:30 UTC（台湾 00:30）呼叫 Amazon 转接程序（`amazon-spapi-mcp/`）的 `ReviewSolicitationJob.runDaily`，请 Amazon 顾客留评论。转接程序自己 16:00 UTC 已经跑一次，这里是备援：已经请过的订单会跳过，所以跑两次不会多寄 |
| 这份原始码怎么来的 | 原本的原始码不在 GitHub（10/6 从一台电脑直接上传）。2026-10-19 从 Cloudflare 下载线上的版本放进来（C32），只有 12 行，没有改过；`wrangler.toml` 照 Cloudflare 上的设定写，dry-run 打包出来跟线上一模一样 |
| 金钥 | 没有 |
| 纪录 | 每次执行的结果写在 Cloudflare 的 Worker 纪录（Observability）；转接程序的资料库 `amazon-review-solicitations` 的 `review_solicitation_runs` 也有一笔（`trigger = cron_backup`） |

## 怎么改、怎么部署

```bash
cd amazon-review-cron
npx --yes wrangler@4.144.0 deploy --dry-run --outdir dist
```

部署只从 GitHub：Actions → **Deploy Amazon gateway** → Run workflow（分支 `main`），Worker 选 `amazon-review-cron`，确认栏输入 `deploy amazon gateway`，Production 核准人核准（营运手册第 25 节）。

## 回退

```bash
cd amazon-review-cron
npx --yes wrangler@4.144.0 rollback <版本号>
```
