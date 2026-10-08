import { money } from "@/lib/shop/store-config";
import { Estimate, Notice, PriceRows, ProductName, RoutineWord, productImage } from "@/components/shop/ui";

// The checkout's building blocks: form fields, the address-check panel, the order summary and the order page.

export const STEPS = [
  ["contact", "Contact"],
  ["shipping", "Shipping"],
  ["payment", "Payment"],
];

export const oneLine = (s) => `${[s.street, s.street2].filter(Boolean).join(", ")}, ${s.city}, ${s.state} ${s.zip}`;

// aria-describedby: the field's own hint (if any) plus its error once there is one.
export const describedBy = (name, error, hintId) => [hintId, error ? `${name}-error` : ""].filter(Boolean).join(" ") || undefined;

// A labelled field with its error line. `after` goes below the error (the email spelling hint).
export function Field({ name, label, error, required = true, after, children }) {
  return (
    <div className={`field${error ? " field--error" : ""}`} data-field={name}>
      <label className="field__label" htmlFor={name}>
        {label}
        {required && <span className="req" aria-hidden="true"> *</span>}
      </label>
      {children}
      <span className="field__error" data-error="" id={`${name}-error`} hidden={!error}>{error}</span>
      {after}
    </div>
  );
}

// A card field: Airwallex mounts its iframe into the empty .card-input box.
export function CardField({ name, label, containerId, error }) {
  return (
    <div className={`field${error ? " field--error" : ""}`} data-field={name}>
      <span className="field__label" id={`${containerId}-label`}>
        {label}
        <span className="req" aria-hidden="true"> *</span>
      </span>
      <div className="card-input" id={containerId} role="group" aria-labelledby={`${containerId}-label`} />
      <span className="field__error" data-error="" id={`${name}-error`} hidden={!error}>{error}</span>
    </div>
  );
}

// A custom radio or checkbox row (.check); extra props go to the input.
export function CheckOption({ label, description, ...input }) {
  return (
    <label className="check">
      <span className="check__control">
        <input {...input} />
        <span className="check__box" aria-hidden="true" />
      </span>
      <span className="check__label">{label}</span>
      {description && <span className="check__description">{description}</span>}
    </label>
  );
}

// What the address check found (M3 §4). The shopper's answer stays in the inputs (addressChoice / noUnit) and is read
// when they continue.
export function AddressCheck({ check }) {
  if (check?.status === "suggest") {
    return (
      <div className="notice notice--info" role="group" aria-labelledby="address-check-title">
        <span className="notice__title" id="address-check-title">Check your address</span>
        <span className="notice__body">We found a more complete version of this address. Choose one, then continue.</span>
        <div className="address-check__options">
          <CheckOption type="radio" name="addressChoice" value="suggested" defaultChecked label="Use the suggested address" description={oneLine(check.suggestion)} />
          <CheckOption type="radio" name="addressChoice" value="original" label="Keep the address I entered" description={oneLine(check.entered)} />
        </div>
      </div>
    );
  }
  if (check?.status === "missing_unit") {
    return (
      <div className="notice notice--warning" role="alert">
        <span className="notice__title">Apartment or unit number?</span>
        <span className="notice__body">{check.message}</span>
        <CheckOption type="checkbox" name="noUnit" label="My address doesn't have a unit number" />
      </div>
    );
  }
  if (check?.status === "undeliverable") return <Notice tone="warning" title="We couldn't confirm this address">{check.message}</Notice>;
  return null;
}

// source: the current quote, or the order on the order page.
export function OrderSummary({ source, estimate, note }) {
  const tax = source?.taxCents === null || source?.taxCents === undefined ? "Calculated at next step" : money(source.taxCents);
  return (
    <aside className="summary" aria-labelledby="summary-title" data-summary="" hidden={!source}>
      <h2 className="label label--xs" id="summary-title">Order summary</h2>
      <ul className="summary-lines" data-summary-lines="">
        {source?.lines.map((line) => (
          <li key={line.id} className="summary-line">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={productImage(line.id)} alt="" width="56" height="56" />
            <div className="line-item__body">
              <span className="line-item__title">
                <RoutineWord routine={line.routine} />
                <ProductName line={line} newTab />
              </span>
              <span className="label">{`Qty ${line.qty}`}</span>
            </div>
            <span className="summary-line__price">{money(line.lineCents)}</span>
          </li>
        ))}
      </ul>
      <div data-summary-rows="">
        {source && (
          <PriceRows
            rows={[
              { label: "Subtotal", value: money(source.subtotalCents) },
              { label: "Shipping", value: <Estimate estimate={estimate}>{source.shippingCents ? money(source.shippingCents) : "Free"}</Estimate>, free: !source.shippingCents },
              { label: "Tax", value: <Estimate estimate={estimate}>{tax}</Estimate> },
            ]}
            total={money(source.totalCents)}
          />
        )}
      </div>
      <p className="label summary__note" data-summary-note="">{note}</p>
    </aside>
  );
}

// The order page (/checkout?order=…). state.kind: pending | error | paid | review | failed | processing.
export function OrderStatus({ state }) {
  const home = (
    <a className="btn" href="/">
      Back to APGO <span aria-hidden="true">→</span>
    </a>
  );
  const { kind, order } = state;
  if (kind === "pending") return <Notice tone="info" title="Confirming payment">One moment while we confirm your order.</Notice>;
  if (kind === "error") return <Notice tone="warning" title={state.title}>{state.body}</Notice>;
  if (kind === "paid") {
    return (
      <>
        <Notice tone="success" title="Order confirmed">{`Order ${order.id} · Payment received.`}</Notice>
        <h2 className="heading-guide-h2">Thanks for your order.</h2>
        <p className="body body--sm">{`Keep your order number for support. Order details are linked to ${order.email}.`}</p>
        <div className="actions">{home}</div>
      </>
    );
  }
  if (kind === "review") {
    return (
      <>
        <Notice tone="info" title="Order received">{`Order ${order.id} · We're verifying the payment. No action is needed.`}</Notice>
        <div className="actions">{home}</div>
      </>
    );
  }
  if (kind === "failed") {
    return (
      <>
        <Notice tone="warning" title="Payment didn't go through">
          {order.paymentFailure?.message || "Your payment wasn't completed. Return to checkout to try another payment method."}
        </Notice>
        <div className="actions">
          <a className="btn" href="/checkout">
            Return to checkout <span aria-hidden="true">→</span>
          </a>
        </div>
      </>
    );
  }
  return <Notice tone="info" title="Payment processing">{`Order ${order.id} · We're confirming your payment. Refresh this page in a minute.`}</Notice>;
}
