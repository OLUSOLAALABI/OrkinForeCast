import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { MapPin, Building2, TrendingUp, TrendingDown, Users } from "lucide-react"
import Link from "next/link"
import { formatCurrency } from "@/lib/forecasting"

const KPI_REVENUE = "TOTAL NET REVENUE"
const KPI_EXPENSE_LINES = new Set(["TOTAL EXPENSES"])

export default async function RegionsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect("/auth/login")

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single()

  if (profile?.role !== "hq_admin") {
    redirect("/dashboard")
  }

  // Fetch all regions
  const { data: regions } = await supabase
    .from("regions")
    .select("*")
    .order("name")

  // Fetch branch counts per region
  const { data: branches } = await supabase
    .from("branches")
    .select("id, region_id")

  const branchCountMap = new Map<string, number>()
  branches?.forEach(b => {
    branchCountMap.set(b.region_id, (branchCountMap.get(b.region_id) || 0) + 1)
  })

  // Fetch user counts per region
  const { data: users } = await supabase
    .from("profiles")
    .select("region_id")
    .not("region_id", "is", null)

  const userCountMap = new Map<string, number>()
  users?.forEach(u => {
    if (u.region_id) {
      userCountMap.set(u.region_id, (userCountMap.get(u.region_id) || 0) + 1)
    }
  })

  // Fetch forecast summaries per region — only the KPI rows we display
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

  // Create branch to region lookup
  const branchToRegion = new Map<string, string>()
  branches?.forEach(b => branchToRegion.set(b.id, b.region_id))

  // Aggregate forecasts by region
  const forecastMap = new Map<string, {
    revenueForecast: number
    revenueBudget: number
    expenseForecast: number
    expenseBudget: number
  }>()
  forecasts.forEach(f => {
    const regionId = branchToRegion.get(f.branch_id)
    if (regionId) {
      const existing = forecastMap.get(regionId) || {
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
      forecastMap.set(regionId, existing)
    }
  })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-foreground">Regions</h1>
        <p className="text-muted-foreground mt-1">
          Overview of all regions and their performance
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {regions?.map(region => {
          const branchCount = branchCountMap.get(region.id) || 0
          const userCount = userCountMap.get(region.id) || 0
          const forecastData = forecastMap.get(region.id)
          const revenueVariance = forecastData
            ? forecastData.revenueForecast - forecastData.revenueBudget
            : 0
          const revenueVariancePercent = forecastData?.revenueBudget
            ? (revenueVariance / forecastData.revenueBudget) * 100
            : 0
          const expenseVariance = forecastData
            ? forecastData.expenseForecast - forecastData.expenseBudget
            : 0
          const expenseVariancePercent = forecastData?.expenseBudget
            ? (expenseVariance / forecastData.expenseBudget) * 100
            : 0

          return (
            <Link key={region.id} href={`/dashboard/branches?region=${region.id}`}>
              <Card className="hover:border-primary/50 transition-colors cursor-pointer h-full">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="rounded-full bg-accent/10 p-2">
                        <MapPin className="h-4 w-4 text-accent" />
                      </div>
                      <CardTitle className="text-base">{region.name}</CardTitle>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex gap-4">
                    <div className="flex items-center gap-2">
                      <Building2 className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm">{branchCount} branches</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Users className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm">{userCount} users</span>
                    </div>
                  </div>

                  {forecastData ? (
                    <div className="space-y-2 pt-2 border-t border-border">
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-muted-foreground">Revenue F vs B</span>
                        <span className="font-semibold">
                          {formatCurrency(forecastData.revenueForecast)} / {formatCurrency(forecastData.revenueBudget)}
                        </span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-muted-foreground">Revenue variance</span>
                        <div className="flex items-center gap-1">
                          {revenueVariance >= 0 ? (
                            <TrendingUp className="h-3 w-3 text-accent" />
                          ) : (
                            <TrendingDown className="h-3 w-3 text-destructive" />
                          )}
                          <Badge variant={revenueVariance >= 0 ? "default" : "destructive"} className="text-xs">
                            {revenueVariancePercent >= 0 ? "+" : ""}{revenueVariancePercent.toFixed(1)}%
                          </Badge>
                        </div>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-muted-foreground">Expense F vs B</span>
                        <span className="font-semibold">
                          {formatCurrency(forecastData.expenseForecast)} / {formatCurrency(forecastData.expenseBudget)}
                        </span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-muted-foreground">Expense variance</span>
                        <div className="flex items-center gap-1">
                          {expenseVariance >= 0 ? (
                            <TrendingUp className="h-3 w-3 text-accent" />
                          ) : (
                            <TrendingDown className="h-3 w-3 text-destructive" />
                          )}
                          <Badge variant={expenseVariance >= 0 ? "default" : "destructive"} className="text-xs">
                            {expenseVariancePercent >= 0 ? "+" : ""}{expenseVariancePercent.toFixed(1)}%
                          </Badge>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-2 border-t border-border">
                      <p className="text-sm text-muted-foreground">No forecast data available</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </Link>
          )
        })}
      </div>

      {(!regions || regions.length === 0) && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <MapPin className="h-12 w-12 text-muted-foreground mb-4" />
            <h2 className="text-xl font-semibold">No Regions Found</h2>
            <p className="text-muted-foreground mt-2">
              No regions have been created yet.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
