import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Orders & Settlements",
  description: "Create orders, record payments, track what is still due.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
