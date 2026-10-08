import { Barlow, Barlow_Condensed } from "next/font/google";

// The site's two faces, shared by the root layout (app/(us)/layout.js) and the 404 page (app/global-not-found.js).
export const barlow = Barlow({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-barlow",
  display: "swap",
});

export const barlowCondensed = Barlow_Condensed({
  subsets: ["latin"],
  weight: ["600", "700", "800"],
  variable: "--font-barlow-condensed",
  display: "swap",
});
