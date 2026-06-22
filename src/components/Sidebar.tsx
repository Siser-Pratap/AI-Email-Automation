"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, FileText, Activity, Send, LogOut, MessageCircle } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function Sidebar() {
  const pathname = usePathname();

  const { data } = useQuery({
    queryKey: ["review-count"],
    queryFn: async () => {
      const res = await fetch("/api/emails/review-count");
      return res.json() as Promise<{ count: number }>;
    },
    refetchInterval: 30_000,
  });

  const reviewCount = data?.count ?? 0;

  const { data: whatsAppReviewData } = useQuery({
    queryKey: ["whatsapp-review-count"],
    queryFn: async () => {
      const res = await fetch("/api/whatsapp/leads/review-count");
      return res.json() as Promise<{ count: number }>;
    },
    refetchInterval: 30_000,
  });

  const whatsAppReviewCount = whatsAppReviewData?.count ?? 0;

  const navItems = [
    { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard, badge: reviewCount },
    { name: "WhatsApp", href: "/whatsapp", icon: MessageCircle, badge: whatsAppReviewCount },
    { name: "Templates", href: "/templates", icon: FileText },
    { name: "Logs", href: "/logs", icon: Activity },
    { name: "Resumes", href: "/resumes", icon: FileText },
  ];

  return (
    <aside className="w-64 bg-white border-r border-gray-200 flex flex-col h-screen sticky top-0 hidden md:flex">
      <div className="flex items-center gap-2 px-6 py-6 mb-2 text-indigo-600">
        <Send className="w-6 h-6" />
        <h1 className="text-xl font-bold tracking-tight text-gray-900">AutoMail<span className="text-indigo-600">.ai</span></h1>
      </div>
      <nav className="flex-1 px-4 space-y-1.5">
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                "flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200",
                isActive
                  ? "bg-indigo-50 text-indigo-700"
                  : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
              )}
            >
              <span className="flex items-center gap-3">
                <item.icon className={cn("w-5 h-5", isActive ? "text-indigo-600" : "text-gray-400")} />
                {item.name}
              </span>
              {item.badge ? (
                <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-amber-500 text-white text-xs font-bold">
                  {item.badge > 99 ? "99+" : item.badge}
                </span>
              ) : null}
            </Link>
          );
        })}
      </nav>
      <div className="p-4 border-t border-gray-200">
        <div className="flex items-center gap-3 px-3 py-2 mb-2">
          <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold text-sm">
            HR
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-medium text-gray-900">Admin</span>
            <span className="text-xs text-gray-500">System Account</span>
          </div>
        </div>
        <button
          onClick={() => {
            document.cookie = "admin_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
            window.location.href = "/";
          }}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-red-600 hover:bg-red-50 transition-colors"
        >
          <LogOut className="w-4 h-4" />
          Log Out
        </button>
      </div>
    </aside>
  );
}
