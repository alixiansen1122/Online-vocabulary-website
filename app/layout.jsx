import "./globals.css";
import "../src/reader-theme.css";
import "../src/mobile.css";
import { headers } from "next/headers";

export const viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#EA580C" };

export async function generateMetadata() {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") || requestHeaders.get("host");
  const protocol = requestHeaders.get("x-forwarded-proto") || "https";
  const origin = host ? `${protocol}://${host}` : "http://localhost:3000";
  const title = "IELTS 背单词";
  const description = "在线 IELTS 词汇学习工具，支持搜索、发音、收藏、笔记与学习进度。";

  return {
    metadataBase: new URL(origin),
    title,
    description,
    manifest: "/manifest.webmanifest",
    appleWebApp: { capable: true, title: "雅思词汇", statusBarStyle: "default" },
    icons: {
      icon: "/favicon.svg",
      shortcut: "/favicon.svg",
      apple: "/app-icon-192.png",
    },
    openGraph: {
      title,
      description,
      type: "website",
      images: [{ url: `${origin}/og.png`, width: 1536, height: 1024, alt: title }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [`${origin}/og.png`],
    },
  };
}

export default function RootLayout({ children }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
