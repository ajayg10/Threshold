import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Threshold",
  description: "The front door's interpreter for people who cannot hear, or cannot speak the visitor's language.",
};

export const viewport: Viewport = {
  themeColor: "#0b1f33",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
