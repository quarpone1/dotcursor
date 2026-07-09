import type { Metadata } from "next";
import { Work_Sans } from "next/font/google";
import "./globals.css";
import SmoothScroll from "@/components/SmoothScroll";
import Preloader from "@/components/Preloader";
import Nav from "@/components/Nav";
import CustomCursor from "@/components/CustomCursor";
import CursorTrail from "@/components/CursorTrail";
import ScrollProgress from "@/components/ScrollProgress";
import BackToTop from "@/components/BackToTop";

// Work Sans for Latin/body. Headings & Cyrillic resolve to SF Pro Display
// via the system font stack defined in globals.css.
const workSans = Work_Sans({
  variable: "--font-work",
  subsets: ["latin"],
  display: "swap",
});

const SITE_URL = "https://dotcursor.ru";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: ".КУРСОР — A New Class of Craft",
  description:
    "Студия цифрового дизайна и разработки. Мы создаём интерфейсы, которые двигают индустрию вперёд.",
  icons: {
    icon: [{ url: "/favicon.svg", type: "image/svg+xml" }],
    apple: "/apple-touch-icon.png",
  },
  openGraph: {
    title: ".КУРСОР — A New Class of Craft",
    description:
      "Студия цифрового дизайна и разработки. Бренды, айдентика, сайты.",
    images: ["/og.png"],
    type: "website",
    locale: "ru_RU",
  },
  twitter: {
    card: "summary_large_image",
    images: ["/og.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ru"
      className={`${workSans.variable} antialiased`}
    >
      <body className="bg-ink text-bone">
        <Preloader />
        <CursorTrail />
        <CustomCursor />
        <ScrollProgress />
        <BackToTop />
        <div className="grain" />
        <Nav />
        <SmoothScroll>{children}</SmoothScroll>
      </body>
    </html>
  );
}
