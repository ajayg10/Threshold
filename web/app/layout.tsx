import type { Metadata, Viewport } from "next";
import { Atkinson_Hyperlegible, Bricolage_Grotesque, Noto_Sans_Devanagari } from "next/font/google";
import AuthGate from "@/components/AuthGate";
import ServiceWorker from "@/components/ServiceWorker";
import Shell from "@/components/Shell";
import "./globals.css";

const atkinson = Atkinson_Hyperlegible({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-atkinson",
  display: "swap",
});

const bricolage = Bricolage_Grotesque({
  subsets: ["latin"],
  weight: ["600", "700", "800"],
  variable: "--font-bricolage",
  display: "swap",
});

const devanagari = Noto_Sans_Devanagari({
  subsets: ["devanagari"],
  weight: ["400", "600", "700"],
  variable: "--font-devanagari",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Threshold · The Front Door's Interpreter",
  description: "The front door's interpreter for people who cannot hear, or cannot speak the visitor's language.",
  applicationName: "Threshold",
  keywords: ["smart doorbell", "accessibility", "deaf assistive technology", "interpreter", "door display"],
  manifest: "/manifest.webmanifest",
  icons: {
    icon: "/icons/icon-192.png",
    apple: "/icons/apple-touch-icon.png",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Threshold",
  },
  openGraph: {
    title: "Threshold · The Front Door's Interpreter",
    description: "Accessible front door interpreter with real-time transcription, translation, and high-contrast smart replies.",
    url: "https://threshold.app",
    siteName: "Threshold",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Threshold · The Front Door's Interpreter",
    description: "Accessible front door interpreter with real-time transcription, translation, and high-contrast smart replies.",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#162B3D" },
    { media: "(prefers-color-scheme: dark)", color: "#0E1B27" },
  ],
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`h-full ${atkinson.variable} ${bricolage.variable} ${devanagari.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  var stored = localStorage.getItem('threshold.theme');
                  var theme = stored;
                  if (!theme) {
                    var hour = new Date().getHours();
                    theme = (hour < 7 || hour >= 19) ? 'night' : 'day';
                  }
                  document.documentElement.setAttribute('data-theme', theme);
                } catch(e) {}
              })();
            `,
          }}
        />
      </head>
      <body className="flex min-h-full flex-col font-sans" suppressHydrationWarning>
        <ServiceWorker />
        <AuthGate>
          <Shell>{children}</Shell>
        </AuthGate>
      </body>
    </html>
  );
}
