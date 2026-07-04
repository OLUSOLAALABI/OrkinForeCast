import React from "react"
import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"

type AssignedBranchRow = {
  branch_id: string
  branches: { name: string }[] | { name: string } | null
}

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect("/auth/login")
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("*, regions(name), branches(name)")
    .eq("id", user.id)
    .single()

  if (!profile) {
    redirect("/auth/login")
  }

  const { data: assignedBranchRows } = profile.role === "branch_user"
    ? await supabase
      .from("user_branch_access")
      .select("branch_id, branches(name)")
      .eq("user_id", user.id)
    : { data: [] }

  const assignedBranchNames = ((assignedBranchRows ?? []) as AssignedBranchRow[])
    .map((row) => Array.isArray(row.branches) ? row.branches[0]?.name : row.branches?.name)
    .filter((name): name is string => Boolean(name))

  return (
    <div className="flex min-h-screen bg-background">
      <DashboardSidebar profile={profile} />
      <div className="flex-1 flex flex-col">
        <DashboardHeader profile={{ ...profile, assignedBranchNames }} />
        <main className="flex-1 p-4 sm:p-6 min-w-0">
          {children}
        </main>
      </div>
    </div>
  )
}
