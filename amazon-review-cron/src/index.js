// index.js
var index_default = {
  async scheduled(controller, env) {
    const summary = await env.SPAPI.runDaily(controller.cron);
    const line = JSON.stringify({ event: "review_solicitation_cron_dispatch", cron: controller.cron, ...summary });
    if (summary?.ok) console.log(line);
    else console.error(line);
  },
  async fetch() {
    return new Response("Not found", { status: 404 });
  }
};
export {
  index_default as default
};
//# sourceMappingURL=index.js.map
