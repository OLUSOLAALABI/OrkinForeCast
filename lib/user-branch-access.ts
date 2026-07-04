export function normalizeBranchIds(input: unknown): string[] {
  const values = Array.isArray(input)
    ? input
    : typeof input === "string"
      ? [input]
      : []

  return [...new Set(values
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.trim())
    .filter(Boolean))]
}

export async function applyUserAccessScope(
  supabase: any,
  userId: string,
  role: string,
  regionId: string | null,
  branchIds: string[] = []
) {
  const normalizedBranchIds = normalizeBranchIds(branchIds)

  const { error } = await supabase.rpc("admin_update_user_access", {
    p_user_id: userId,
    p_role: role,
    p_region_id: role === "region_admin" ? regionId ?? null : null,
    p_branch_ids: role === "branch_user" ? normalizedBranchIds : [],
  })

  if (error) {
    throw error
  }
}