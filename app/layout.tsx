import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

// ★ 引入統一組件
import Navbar from "@/components/Navbar"; 
import Footer from "@/components/Footer";
import RecentBookingsToast from "@/components/RecentBookingsToast"; 

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "佳寓 PrimeLiving | 香港直營高品質學生公寓",
  description: "專為赴港留學生與高才精英打造的星級理想家，提供拎包入住、官方直營、專業管家服務。",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="zh-HK"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      {/* ★ 強制加上 bg-orange-50/bg-white 避免深色模式底色外洩產生黑邊 */}
      <body className="min-h-full flex flex-col relative bg-orange-50 text-slate-900">
        <Navbar />
        
        {/* 為毛玻璃導航列預留的呼吸空間，現在底色會是溫和的橘白色 */}
        <div className="flex-grow pt-20 md:pt-24 flex flex-col">
          {children}
        </div>
        
        <Footer />
        <RecentBookingsToast />
      </body>
    </html>
  );
}
