"use client"

import Link from "next/link"
import Image from "next/image"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import {
  LineChart,
  Building2,
  MapPin,
  Users,
  UserPlus,
  Settings,
  Home,
  History,
  ClipboardList,
} from "lucide-react"

type Profile = {
  id: string
  email: string
  full_name: string | null
  role: string
  region_id: string | null
  branch_id: string | null
  regions?: { name: string } | null
  branches?: { name: string } | null
}

const navItems = {
  branch_user: [
    { href: "/dashboard", label: "Dashboard", icon: Home },
    { href: "/dashboard/forecast", label: "Forecasts", icon: LineChart },
    // { href: "/dashboard/actuals", label: "Monthly Actuals", icon: ClipboardList },
    { href: "/dashboard/activity", label: "Activity", icon: History },
  ],
  region_admin: [
    { href: "/dashboard", label: "Dashboard", icon: Home },
    { href: "/dashboard/forecast", label: "Forecasts", icon: LineChart },
    // { href: "/dashboard/actuals", label: "Monthly Actuals", icon: ClipboardList },
    { href: "/dashboard/branches", label: "Branches", icon: Building2 },
    { href: "/dashboard/activity", label: "Activity", icon: History },
  ],
  hq_admin: [
    { href: "/dashboard", label: "Dashboard", icon: Home },
    { href: "/dashboard/create-account", label: "Create account", icon: UserPlus },
    { href: "/dashboard/forecast", label: "Forecasts", icon: LineChart },
    // { href: "/dashboard/actuals", label: "Monthly Actuals", icon: ClipboardList },
    { href: "/dashboard/branches", label: "Branches", icon: Building2 },
    { href: "/dashboard/regions", label: "Regions", icon: MapPin },
    { href: "/dashboard/activity", label: "Activity", icon: History },
    { href: "/dashboard/users", label: "Users", icon: Users },
  ],
}

export function DashboardSidebar({ profile }: { profile: Profile }) {
  const pathname = usePathname()
  const items = navItems[profile.role as keyof typeof navItems] || navItems.branch_user

  return (
    <aside className="w-14 md:w-64 shrink-0 bg-sidebar text-sidebar-foreground flex flex-col border-r border-sidebar-border transition-[width]">
      <div className="p-3 md:p-6 border-b border-sidebar-border flex justify-center md:justify-start">
        <Link href="/dashboard" className="flex items-center">
          <Image src="/orkinlogo.png" alt="Orkin" width={120} height={36} className="h-7 w-auto hidden md:block" />
          <Image src="/orkinlogo.png" alt="Orkin" width={32} height={32} className="h-8 w-8 md:hidden rounded object-contain" />
        </Link>
      </div>
      <nav className="flex-1 p-2 md:p-4">
        <ul className="space-y-1">
          {items.map((item) => {
            const Icon = item.icon
            const isActive = pathname === item.href
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  title={item.label}
                  className={cn(
                    "flex items-center justify-center md:justify-start gap-3 px-2 md:px-3 py-2 rounded-md text-sm font-medium transition-colors",
                    isActive
                      ? "bg-sidebar-accent text-sidebar-accent-foreground"
                      : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                  )}
                >
                  <Icon className="h-5 w-5 shrink-0" />
                  <span className="hidden md:inline truncate">{item.label}</span>
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>
      <div className="p-2 md:p-4 border-t border-sidebar-border">
        <Link
          href="/dashboard/settings"
          title="Settings"
          className={cn(
            "flex items-center justify-center md:justify-start gap-3 px-2 md:px-3 py-2 rounded-md text-sm font-medium transition-colors",
            pathname === "/dashboard/settings"
              ? "bg-sidebar-accent text-sidebar-accent-foreground"
              : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          )}
        >
          <Settings className="h-5 w-5 shrink-0" />
          <span className="hidden md:inline truncate">Settings</span>
        </Link>
      </div>
    </aside>
  )
}
