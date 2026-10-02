// Preview the actual Worker email builders using fake data. Never sends email.
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { buildConfirmationEmail, buildShipmentEmail } from "../worker/customer-email.js";

const directory = new URL("../review/tmp/order-emails/", import.meta.url);
await mkdir(directory, { recursive: true });
const order = {
  id: "APGO-US-PREVIEW00001",
  email: "sandbox-buyer@example.com",
  currency: "USD",
  subtotal_cents: 2490,
  shipping_cents: 0,
  tax_cents: 0,
  total_cents: 2490,
  lines_json: JSON.stringify([{ sku: "D215", name: "APGO Atomic Glaze Coating", qty: 1, lineCents: 2490 }]),
  shipping_json: JSON.stringify({ firstName: "Sandbox", lastName: "Test", street: "123 Test Street", city: "Los Angeles", state: "CA", zip: "90001" }),
};
for (const [kind, message] of [
  ["confirmation", buildConfirmationEmail(order)],
  ["shipment", buildShipmentEmail(order, { carrier: "Example carrier", trackingNumber: "PREVIEW-ONLY" })],
]) {
  const html = message.html.replace("<body", '<body data-preview="true"').replace(/(<body[^>]*>)/, '$1<p style="padding:12px;background:#fff3d6;color:#5a3e00"><strong>Preview only</strong> · Fake order, address and unapproved test pricing. No email or shipment is sent.</p>');
  await writeFile(new URL(`${kind}.html`, directory), html);
  await writeFile(new URL(`${kind}.txt`, directory), `PREVIEW ONLY — no email or shipment sent.\nSubject: ${message.subject}\n\n${message.text}`);
}
console.log(`Email previews: ${fileURLToPath(directory)}`);
