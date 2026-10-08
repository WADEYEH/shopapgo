import CheckoutPage from "@/components/shop/checkout/CheckoutPage";

// Never indexed: the checkout and the order page (/checkout?order=…).
export const metadata = {
  title: { absolute: "Checkout · APGO" },
  robots: { index: false, follow: false },
};

export default function Page() {
  return <CheckoutPage />;
}
