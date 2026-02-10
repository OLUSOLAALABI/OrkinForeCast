import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Building2, TrendingUp, TrendingDown, FileSpreadsheet, ArrowLeft, MapPin } from "lucide-react"
import Link from "next/link"
import { formatCurrency } from "@/lib/forecasting"

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

  // Region admin: only their region. HQ: all branches, or one region when drilling down from Regions.
  let branchesQuery = supabase
    .from("branches")
    .select("*, regions(name)")
    .order("name")

  if (profile?.role === "region_admin" && profile.region_id) {
    branchesQuery = branchesQuery.eq("region_id", profile.region_id)
  } else if (profile?.role === "hq_admin" && regionId) {
    branchesQuery = branchesQuery.eq("region_id", regionId)
  }

  const { data: branches } = await branchesQuery

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

  // Fetch forecast summaries for each branch
  const branchIds = branches?.map(b => b.id) || []
  const { data: forecasts } = await supabase
    .from("forecasts")
    .select("branch_id, forecast_value, budget_value")
    .in("branch_id", branchIds)
    .eq("year", 2026)
    .eq("month", 1)

  // Fetch recent uploads for each branch
  const { data: uploads } = await supabase
    .from("uploads")
    .select("branch_id, created_at")
    .in("branch_id", branchIds)
    .order("created_at", { ascending: false })

  // Create lookup maps
  const forecastMap = new Map<string, { forecast: number; budget: number }>()
  forecasts?.forEach(f => {
    const existing = forecastMap.get(f.branch_id) || { forecast: 0, budget: 0 }
    forecastMap.set(f.branch_id, {
      forecast: existing.forecast + f.forecast_value,
      budget: existing.budget + f.budget_value,
    })
  })

  const uploadMap = new Map<string, Date>()
  uploads?.forEach(u => {
    if (!uploadMap.has(u.branch_id)) {
      uploadMap.set(u.branch_id, new Date(u.created_at))
    }
  })

  const isRegionAdmin = profile?.role === "region_admin"
  const isHqDrillDown = profile?.role === "hq_admin" && regionId

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
              : profile?.role === "hq_admin"
                ? "View and manage all branches across regions."
                : "View and manage branches in your region."}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {branches?.map(branch => {
          const forecastData = forecastMap.get(branch.id)
          const lastUpload = uploadMap.get(branch.id)
          const variance = forecastData 
            ? forecastData.forecast - forecastData.budget 
            : 0
          const variancePercent = forecastData?.budget 
            ? (variance / forecastData.budget) * 100 
            : 0

          return (
            <Link key={branch.id} href={`/dashboard/forecast?branch=${branch.id}`}>
              <Card className="hover:border-primary/50 transition-colors cursor-pointer h-full">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="rounded-full bg-primary/10 p-2">
                        <Building2 className="h-4 w-4 text-primary" />
                      </div>
                      <div>
                        <CardTitle className="text-base">{branch.name}</CardTitle>
                        <CardDescription className="text-xs">
                          {branch.regions?.name}
                        </CardDescription>
                      </div>
                    </div>
                    <Badge variant="secondary" className="text-xs">
                      {branch.code}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {forecastData ? (
                    <div className="space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-muted-foreground">Forecast</span>
                        <span className="font-semibold">{formatCurrency(forecastData.forecast)}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-muted-foreground">Budget</span>
                        <span className="text-sm">{formatCurrency(forecastData.budget)}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-muted-foreground">Variance</span>
                        <div className="flex items-center gap-1">
                          {variance >= 0 ? (
                            <TrendingUp className="h-3 w-3 text-accent" />
                          ) : (
                            <TrendingDown className="h-3 w-3 text-destructive" />
                          )}
                          <Badge variant={variance >= 0 ? "default" : "destructive"} className="text-xs">
                            {variancePercent >= 0 ? "+" : ""}{variancePercent.toFixed(1)}%
                          </Badge>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-2">
                      <p className="text-sm text-muted-foreground">No forecast data</p>
                    </div>
                  )}
                  
                  {lastUpload && (
                    <div className="flex items-center gap-2 pt-2 border-t border-border">
                      <FileSpreadsheet className="h-3 w-3 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground">
                        Last upload: {lastUpload.toLocaleDateString()}
                      </span>
                    </div>
                  )}
                </CardContent>
              </Card>
            </Link>
          )
        })}
      </div>

      {(!branches || branches.length === 0) && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Building2 className="h-12 w-12 text-muted-foreground mb-4" />
            <h2 className="text-xl font-semibold">No Branches Found</h2>
            <p className="text-muted-foreground mt-2">
              No branches are assigned to your region.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
