import type { Metadata } from "next";
import { Inter, Oswald } from "next/font/google";
import "./globals.css";
import { Header } from "@/components/Header";
import { MobileActionBar } from "@/components/MobileActionBar";
import { CartProvider } from "@/lib/cart/CartContext";
import { CartSlideout } from "@/components/CartSlideout";
import { Suspense } from "react";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

const oswald = Oswald({
  subsets: ["latin"],
  variable: "--font-oswald",
});

export const metadata: Metadata = {
  title: "Warehouse Tire",
  description: "Tires & install scheduling",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${inter.variable} ${oswald.variable} antialiased`}>
        <CartProvider>
          <Suspense fallback={<div className="h-16" />}>
            <Header />
          </Suspense>
          {children}
          <MobileActionBar />
          <CartSlideout />
        </CartProvider>
      </body>
    </html>
  );
}
