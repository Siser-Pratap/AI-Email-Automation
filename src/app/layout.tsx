import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Link from "next/link";
import { Providers } from "@/components/Providers";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "AI Email Automation",
  description: "Dashboard for automated HR outreach",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-gray-50 text-gray-900`}
      >
        <Providers>
          <div className="min-h-screen flex">
            <aside className="w-64 bg-white border-r border-gray-200 p-4 hidden md:block">
              <h1 className="text-xl font-bold mb-8 text-blue-600">AutoMail AI</h1>
              <nav className="space-y-2">
                <Link href="/" className="block p-2 rounded hover:bg-gray-100">Dashboard</Link>
                <Link href="/templates" className="block p-2 rounded hover:bg-gray-100">Templates</Link>
                <Link href="/logs" className="block p-2 rounded hover:bg-gray-100">Logs</Link>
              </nav>
            </aside>
            <main className="flex-1 p-8 overflow-y-auto">
              {children}
            </main>
          </div>
        </Providers>
      </body>
    </html>
  );
}
