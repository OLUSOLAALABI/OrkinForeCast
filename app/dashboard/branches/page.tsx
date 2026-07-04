import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { redirect } from "next/navigation"
import { ArrowLeft, MapPin } from "lucide-react"
import Link from "next/link"
import { BranchesList } from "./branches-list"

const KPI_REVENUE = "TOTAL NET REVENUE"
const KPI_EXPENSE_LINES = new Set(["TOTAL EXPENSES"])

type Props = { searchParams: Promise<{ region?: string }> }

export default async function BranchesPage({ searchParams }: Props) {
  const { region: regionId } = await searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect("/auth/login")

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, region_id")
    .eq("id", user.id)
    .single()

  if (profile?.role === "branch_user") {
    redirect("/dashboard")
  }

  // Use admin client for region admin to bypass RLS (ensures branches load when grouped under regions)
  let branches: { id: string; name: string; code: string; region_id: string; regions?: { name: string } | null }[] = []
  if (profile?.role === "region_admin" && profile.region_id) {
    try {
      const admin = createAdminClient()
      const { data } = await admin
        .from("branches")
        .select("*, regions(name)")
        .eq("region_id", profile.region_id)
        .order("code", { ascending: true })
      branches = data ?? []
    } catch {
      branches = []
    }
  } else {
    let branchesQuery = supabase
      .from("branches")
      .select("*, regions(name)")
      .order("code", { ascending: true })
    if (profile?.role === "hq_admin" && regionId) {
      branchesQuery = branchesQuery.eq("region_id", regionId)
    }
    const { data } = await branchesQuery
    branches = data ?? []
  }

  // Region name for header: HQ drill-down from Regions, or region_admin's single region
  let regionName: string | null = null
  if (profile?.role === "hq_admin" && regionId) {
    const { data: region } = await supabase
      .from("regions")
      .select("name")
      .eq("id", regionId)
      .single()
    regionName = region?.name ?? null
  } else if (profile?.role === "region_admin" && profile.region_id) {
    const { data: region } = await supabase
      .from("regions")
      .select("name")
      .eq("id", profile.region_id)
      .single()
    regionName = region?.name ?? null
  }

  // Fetch forecast summaries for each branch — only the KPI rows we display
  const branchIds = branches?.map(b => b.id) || []
  const kpiDescriptions = [KPI_REVENUE, ...KPI_EXPENSE_LINES]
  const currentMonth = new Date().getMonth() + 1 // 1-12
  let forecasts: Array<{ branch_id: string; description: string; forecast_value: number; budget_value: number }> = []
  if (branchIds.length > 0) {
    const { data, error } = await supabase
      .from("forecasts")
      .select("branch_id, description, forecast_value, budget_value")
      .in("branch_id", branchIds)
      .in("description", kpiDescriptions)
      .eq("year", 2026)
      .eq("month", currentMonth)
    if (error) throw error
    forecasts = data || []
  }

  // Fetch recent uploads for each branch
  const { data: uploads } = await supabase
    .from("uploads")
    .select("branch_id, created_at")
    .in("branch_id", branchIds)
    .order("created_at", { ascending: false })

  // Create lookup maps
  const forecastMap = new Map<string, {
    revenueForecast: number
    revenueBudget: number
    expenseForecast: number
    expenseBudget: number
  }>()
  forecasts.forEach(f => {
    const existing = forecastMap.get(f.branch_id) || {
      revenueForecast: 0,
      revenueBudget: 0,
      expenseForecast: 0,
      expenseBudget: 0,
    }
    const desc = String(f.description || "").toUpperCase().trim()
    if (desc === KPI_REVENUE) {
      existing.revenueForecast += Number(f.forecast_value || 0)
      existing.revenueBudget += Number(f.budget_value || 0)
    } else if (KPI_EXPENSE_LINES.has(desc)) {
      existing.expenseForecast += Number(f.forecast_value || 0)
      existing.expenseBudget += Number(f.budget_value || 0)
    }
    forecastMap.set(f.branch_id, existing)
  })

  const uploadMap = new Map<string, Date>()
  uploads?.forEach(u => {
    if (!uploadMap.has(u.branch_id)) {
      uploadMap.set(u.branch_id, new Date(u.created_at))
    }
  })

  const isRegionAdmin = profile?.role === "region_admin"
  const isHqDrillDown = profile?.role === "hq_admin" && regionId
  const isHqAdmin = profile?.role === "hq_admin"

  // Regions list for HQ filter dropdown
  const { data: regionsList } = isHqAdmin
    ? await supabase.from("regions").select("id, name").order("name")
    : { data: [] }

  const forecastByBranch: Record<string, { revenueForecast: number; revenueBudget: number; expenseForecast: number; expenseBudget: number }> = {}
  forecastMap.forEach((v, k) => { forecastByBranch[k] = v })

  const lastUploadByBranch: Record<string, string> = {}
  uploadMap.forEach((v, k) => { lastUploadByBranch[k] = v.toISOString() })

  return (
    <div className="space-y-6">
      <div>
        {isHqDrillDown && (
          <Link
            href="/dashboard/regions"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-2"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Regions
          </Link>
        )}
        <h1 className="text-3xl font-bold text-foreground">
          {regionName ? (
            <span className="flex items-center gap-2">
              <MapPin className="h-8 w-8 text-accent" />
              {isRegionAdmin ? "Your region: " : ""}{regionName}
              {isHqDrillDown ? " – Branches" : ""}
            </span>
          ) : (
            "Branches"
          )}
        </h1>
        <p className="text-muted-foreground mt-1">
          {isRegionAdmin
            ? "Branches and forecasts in your region only."
            : regionName && isHqDrillDown
              ? "Individual branch forecasts in this region."
              : isHqAdmin
                ? "View and manage all branches across regions."
                : "View and manage branches in your region."}
        </p>
      </div>

      <BranchesList
        branches={branches}
        regions={regionsList ?? []}
        regionId={regionId ?? null}
        forecastByBranch={forecastByBranch}
        lastUploadByBranch={lastUploadByBranch}
        isHqAdmin={isHqAdmin}
      />
    </div>
  )
}
