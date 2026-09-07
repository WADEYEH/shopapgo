export const metadata = {
  title: "Shop APGO",
  description: "APGO 汽車護理 官方商城",
};

export default function RootLayout({ children }) {
  return (
    <html lang="zh-Hant">
      <body style={{ margin: 0, fontFamily: "system-ui, sans-serif" }}>{children}</body>
    </html>
  );
}
