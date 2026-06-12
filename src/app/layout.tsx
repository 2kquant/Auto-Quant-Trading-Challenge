import type { Metadata } from "next";
import "./globals.css";
import { LoadingProvider } from "../contexts/loadingContext";

export const metadata: Metadata = {
  title: "Quant App",
  description: "AI Quant Trading App",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body>
        <LoadingProvider>{children}</LoadingProvider>
      </body>
    </html>
  );
}
