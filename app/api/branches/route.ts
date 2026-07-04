import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"

type BranchRow = {
  id: string
  name: string
  code: string
  region_id: string
  regions: { name: string }[] | { name: string } | null
}

function normalizeBranch(row: BranchRow) {
  return {
    id: row.id,
    name: row.name,
    code: row.code,
    region_id: row.region_id,
    regions: Array.isArray(row.regions) ? (row.regions[0] ?? null) : row.regions ?? null,
  }
}

/**
 * Fetch branches for the current user. Uses service role for region admins
 * to ensure they get branches in their region even if RLS has edge cases.
 */
export async function GET() {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("role, region_id, branch_id")
      .eq("id", user.id)
      .single()

    if (!profile) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 })
    }

    let admin: ReturnType<typeof createAdminClient>
    try {
      admin = createAdminClient()
    } catch {
      return NextResponse.json(
        { error: "Server configuration error" },
        { status: 503 }
      )
    }

    let query = admin
      .from("branches")
      .select("id, name, code, region_id, regions(name)")
      .order("name")

    if (profile.role === "region_admin") {
      if (!profile.region_id) {
        return NextResponse.json({
          branches: [],
          message: "Your region is not assigned. Contact your administrator to set your region in User Management.",
        })
      }
      query = query.eq("region_id", profile.region_id)
    } else if (profile.role === "branch_user") {
      const { data: accessRows, error: accessError } = await admin
        .from("user_branch_access")
        .select("branch_id")
        .eq("user_id", user.id)

      if (accessError) {
        console.error("Branch access fetch error:", accessError)
        return NextResponse.json(
          { error: accessError.message || "Failed to fetch assigned branches" },
          { status: 500 }
        )
      }

      const assignedBranchIds = [
        ...new Set([
          ...(accessRows ?? []).map((row) => row.branch_id),
          ...(profile.branch_id ? [profile.branch_id] : []),
        ].filter(Boolean))
      ]

      if (assignedBranchIds.length === 0) {
        return NextResponse.json({ branches: [] })
      }

      query = query.in("id", assignedBranchIds)
    }
    // HQ admin: no filter, gets all branches

    const { data: branches, error } = await query

    if (error) {
      console.error("Branches fetch error:", error)
      return NextResponse.json(
        { error: error.message || "Failed to fetch branches" },
        { status: 500 }
      )
    }
    return NextResponse.json({ branches: (branches ?? []).map((row) => normalizeBranch(row as BranchRow)) })
  } catch (e) {
    console.error("Branches API error:", e)
    return NextResponse.json(
      { error: "Something went wrong" },
      { status: 500 }
    )
  }
}
