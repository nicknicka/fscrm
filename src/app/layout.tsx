import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "fscrm · 飞书 CRM",
  description: "对接飞书的客户关系管理系统",
};

/** 移动端按设备宽度渲染，禁止默认缩放以适配触控目标。 */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="zh-CN"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      // 主题脚本在 hydration 之前就写入 data-theme（防深色白闪），
      // React 无法感知这次改动，必须显式豁免这一层的属性比对。
      suppressHydrationWarning
    >
      <head>
        {/*
         * 首屏前读出已存主题：避免深色用户先看到一帧白闪。
         * 用 next/script 的 beforeInteractive 而不是裸 <script>：React 19 在
         * 客户端渲染时会丢弃组件里的 <script> 标签并报 console error；
         * beforeInteractive 由 Next 注入到 <head> 并保证在 hydration 前执行。
         */}
        <Script id="theme-boot" strategy="beforeInteractive">
          {`try{var t=localStorage.getItem("fscrm:theme");if(t!=="dark"&&t!=="light"){t=matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"}document.documentElement.dataset.theme=t}catch(e){}`}
        </Script>
      </head>
      <body className="min-h-full bg-paper font-sans text-ink">{children}</body>
    </html>
  );
}
