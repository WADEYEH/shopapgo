import CartPage from "@/components/shop/CartPage";

// Never indexed: a shopper's own cart.
export const metadata = {
  title: { absolute: "Your cart · APGO" },
  robots: { index: false, follow: false },
};

export default function Page() {
  return <CartPage />;
}
