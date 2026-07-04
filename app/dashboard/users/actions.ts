"use server"

import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { applyUserAccessScope, normalizeBranchIds } from "@/lib/user-branch-access"
import { revalidatePath } from "next/cache"

export async function deleteUser(userId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Unauthorized" }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single()

  if (profile?.role !== "hq_admin") {
    return { error: "Forbidden" }
  }

  if (userId === user.id) {
    return { error: "You cannot delete your own account" }
  }

  try {
    const admin = createAdminClient()
    const { error } = await admin.auth.admin.deleteUser(userId)
    if (error) return { error: error.message }
  } catch (e) {
    console.error("Delete user error:", e)
    return { error: "Failed to delete user" }
  }

  revalidatePath("/dashboard/users")
  return { error: null }
}

export async function updateUserProfile(
  userId: string,
  data: { role: string; region_id: string | null; branch_ids?: string[] }
) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Unauthorized" }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single()

  if (profile?.role !== "hq_admin") {
    return { error: "Forbidden" }
  }

  const branchIds = data.role === "branch_user"
    ? normalizeBranchIds(data.branch_ids)
    : []

  if (data.role === "branch_user" && branchIds.length === 0) {
    return { error: "Select at least one branch for Branch User" }
  }

  try {
    await applyUserAccessScope(
      supabase,
      userId,
      data.role,
      data.region_id || null,
      branchIds
    )
  } catch (e: any) {
    console.error("Update user profile error:", e)
    return { error: e?.message || "Failed to update user profile" }
  }

  revalidatePath("/dashboard/users")
  revalidatePath("/dashboard/settings")
  return { error: null }
}
