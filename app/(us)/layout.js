import { Barlow, Barlow_Condensed } from "next/font/google";
import "./us.css";

const barlow = Barlow({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-barlow",
  display: "swap",
});

const barlowCondensed = Barlow_Condensed({
  subsets: ["latin"],
  weight: ["600", "700", "800"],
  variable: "--font-barlow-condensed",
  display: "swap",
});

export const metadata = {
  metadataBase: new URL("https://www.shopapgo.com"),
  title: { default: "APGO Auto Care · US", template: "%s · APGO" },
  description: "APGO Atomic Colored Glaze and Atomic Glaze Coating. Professional finish care, made simple. Available on Amazon.com.",
  openGraph: { siteName: "APGO", type: "website", locale: "en_US" },
};

export default function USLayout({ children }) {
  return (
    <html lang="en" className={`${barlow.variable} ${barlowCondensed.variable}`}>
      <body>{children}</body>
    </html>
  );
}
