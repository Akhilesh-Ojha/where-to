import type { Metadata } from "next";
import { Instrument_Serif, Space_Grotesk } from "next/font/google";
import "./globals.css";

const bodyFont = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-body",
});

const displayFont = Instrument_Serif({
  subsets: ["latin"],
  variable: "--font-display",
  weight: "400",
});

const siteUrl = process.env.NEXT_PUBLIC_BASE_URL?.trim();
const metadataBase = siteUrl ? new URL(siteUrl) : undefined;

export const metadata: Metadata = {
  metadataBase,
  title: {
    default: "Meetfair",
    template: "%s | Meetfair",
  },
  description: "Find fair, fast meetup spots for your group.",
  applicationName: "Meetfair",
  keywords: ["meetup planner", "group plan", "fair meeting point", "place voting", "meetfair"],
  openGraph: {
    title: "Meetfair",
    description: "Find fair, fast meetup spots for your group.",
    siteName: "Meetfair",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "Meetfair",
    description: "Find fair, fast meetup spots for your group.",
  },
  icons: {
    icon: "/favicon.png",
    shortcut: "/favicon.png",
    apple: "/favicon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${bodyFont.variable} ${displayFont.variable}`} suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
