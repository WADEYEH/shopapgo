import { PRODUCTS, SEO, productPath } from "@/lib/shop/catalog";

// Small pieces shared by the cart and checkout pages (styles in app/(us)/(shop)/shop.css).

// tone: "info" | "success" | "warning". Warnings are announced right away. `after` follows the text (a link).
export function Notice({ tone, title, after, children }) {
  return (
    <div className={`notice notice--${tone}`} role={tone === "warning" ? "alert" : "status"}>
      {title && <span className="notice__title">{title}</span>}
      <span className="notice__body">{children}</span>
      {after}
    </div>
  );
}

// rows: [{ label, value, free? }]
export function PriceRows({ rows, total, totalLabel = "Total" }) {
  return (
    <dl className="price-rows">
      {rows.map((row) => (
        <div key={row.label} className={`price-row${row.free ? " price-row--free" : ""}`}>
          <dt>{row.label}</dt>
          <dd>{row.value}</dd>
        </div>
      ))}
      {total && (
        <div className="price-row price-row--total">
          <dt>{totalLabel}</dt>
          <dd>{total}</dd>
        </div>
      )}
    </dl>
  );
}

// A shipping or tax term followed by "[TO CONFIRM]" while pricing is not approved (same mark as the policy pages).
export function Estimate({ estimate, children }) {
  if (!estimate) return children;
  return (
    <span>
      {children} <mark data-to-confirm="" data-estimate-mark="">[TO CONFIRM]</mark>
    </span>
  );
}

export const RoutineWord = ({ routine }) => <span className={`routine routine--${routine}`}>{routine === "dry" ? "DRY" : "WET"}</span>;

export const productImage = (id) => SEO[id]?.image ?? "";

// The product name links to its page. newTab keeps a shopper who is in the middle of checking out on the form.
export function ProductName({ line, newTab = false }) {
  const text = line.name.replace(/^APGO /, "");
  if (!PRODUCTS[line.id]) return <span className="product-name">{text}</span>;
  return (
    <a className="product-name product-link" href={productPath(line.id)} {...(newTab ? { target: "_blank", rel: "noopener" } : {})}>
      {text}
    </a>
  );
}
