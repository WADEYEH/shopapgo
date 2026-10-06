// In-memory PayPal Orders v2 + webhook-verify stand-in. Tests replace global fetch
// with this; nothing reaches api-m.paypal.com.

const jsonResponse = (status, body) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const TOKEN = { access_token: "paypal_tok_1", expires_in: 32_400 };

export function createFakePaypal({
  orderId = "5O190127TN364715T",
  status = "CREATED",
  shipping = {
    name: { full_name: "Ada Lee" },
    address: {
      address_line_1: "100 Example Ave",
      address_line_2: "Apt 4",
      admin_area_2: "Austin",
      admin_area_1: "TX",
      postal_code: "78701",
      country_code: "US",
    },
  },
  payer = { name: { given_name: "Ada", surname: "Lee" }, email_address: "ada@example.com" },
  amountValue,
  verifyStatus = "SUCCESS",
  onCreate,
} = {}) {
  const orders = new Map();
  const calls = [];

  function snapshot(id) {
    const row = orders.get(id);
    if (!row) return null;
    const capture = row.status === "COMPLETED"
      ? [{ id: `CAP-${id.slice(0, 8)}`, status: "COMPLETED", amount: { currency_code: "USD", value: row.amountValue } }]
      : [];
    return {
      id,
      status: row.status,
      intent: "CAPTURE",
      payer: row.payer,
      purchase_units: [{
        reference_id: "default",
        invoice_id: row.storeOrderId,
        custom_id: row.storeOrderId,
        amount: { currency_code: "USD", value: row.amountValue },
        shipping: row.shipping,
        payments: capture.length ? { captures: capture } : undefined,
      }],
      links: [{ rel: "approve", href: `https://www.sandbox.paypal.com/checkoutnow?token=${id}` }],
    };
  }

  function handler(url, init = {}) {
    const href = String(url);
    calls.push({ url: href, init });

    if (href.endsWith("/v1/oauth2/token")) {
      const auth = init.headers?.Authorization || "";
      if (!auth.startsWith("Basic ")) return jsonResponse(401, { error: "invalid_client" });
      return jsonResponse(200, TOKEN);
    }

    if (href.endsWith("/v2/checkout/orders") && (init.method || "GET") === "POST") {
      const payload = JSON.parse(init.body);
      onCreate?.(payload, init);
      const value = amountValue ?? payload.purchase_units[0].amount.value;
      const id = orderId;
      orders.set(id, {
        status,
        storeOrderId: payload.purchase_units[0].custom_id,
        amountValue: value,
        shipping: payload.purchase_units[0].shipping ?? shipping,
        payer,
      });
      return jsonResponse(201, snapshot(id));
    }

    const getMatch = href.match(/\/v2\/checkout\/orders\/([^/?]+)$/);
    if (getMatch && (init.method || "GET") === "GET") {
      const body = snapshot(decodeURIComponent(getMatch[1]));
      return body ? jsonResponse(200, body) : jsonResponse(404, { name: "RESOURCE_NOT_FOUND" });
    }

    const capMatch = href.match(/\/v2\/checkout\/orders\/([^/?]+)\/capture$/);
    if (capMatch && init.method === "POST") {
      const id = decodeURIComponent(capMatch[1]);
      const row = orders.get(id);
      if (!row) return jsonResponse(404, { name: "RESOURCE_NOT_FOUND" });
      row.status = "COMPLETED";
      return jsonResponse(201, snapshot(id));
    }

    if (href.endsWith("/v1/notifications/verify-webhook-signature")) {
      const payload = JSON.parse(init.body);
      return jsonResponse(200, { verification_status: payload.webhook_id ? verifyStatus : "FAILURE" });
    }

    return jsonResponse(404, { name: "NOT_FOUND" });
  }

  return {
    handler,
    calls,
    orders,
    snapshot,
    approve(id = orderId, patch = {}) {
      const row = orders.get(id);
      if (!row) throw new Error(`unknown paypal order ${id}`);
      row.status = "APPROVED";
      Object.assign(row, patch);
    },
    complete(id = orderId) {
      const row = orders.get(id);
      if (!row) throw new Error(`unknown paypal order ${id}`);
      row.status = "COMPLETED";
    },
  };
}
