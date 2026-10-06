// Bridges the Playwright admin mock to the real Worker modules (pure functions only), so the
// e2e tests check the actual email templates and shipment validation, not copies of them.
import { buildShipmentEmail as build } from "../../worker/customer-email.js";
import { validateShipment, FulfillmentError } from "../../worker/fulfillment.js";

// The mock's sample orders use the API (camelCase) shape; the templates read D1 rows.
function toRow(order) {
  return {
    id: order.id, email: order.email, currency: order.currency,
    subtotal_cents: order.subtotalCents, shipping_cents: order.shippingCents, tax_cents: order.taxCents, total_cents: order.totalCents,
    lines_json: JSON.stringify(order.lines), shipping_json: JSON.stringify(order.shipping),
  };
}

export const buildShipmentEmail = (order, shipment) => build(toRow(order), shipment);

export function validateShipmentForMock(body) {
  try {
    return { shipment: validateShipment(body) };
  } catch (error) {
    if (error instanceof FulfillmentError) return { error: { code: error.code, message: error.message } };
    throw error;
  }
}
