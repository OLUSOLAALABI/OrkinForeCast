"use server"

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"

export async function updateUserProfile(
  userId: string,
  data: { role: string; region_id: string | null; branch_id: string | null }
) {
  const supabase = await createClient()
  const { error } = await supabase
    .from("profiles")
    .update({
      role: data.role,
      region_id: data.region_id || null,
      branch_id: data.branch_id || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", userId)

  if (error) {
    return { error: error.message }
  }
  revalidatePath("/dashboard/users")
  return { error: null }
}
