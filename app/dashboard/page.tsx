import { createClient } from "@/lib/supabase/server"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { LineChart, Building2, TrendingUp } from "lucide-react"
import Link from "next/link"

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: profile } = await supabase
    .from("profiles")
    .select("*, regions(name), branches(name)")
    .eq("id", user?.id)
    .single()

  // Fetch stats based on role (branch_user: only their branch)
  const isBranchUser = profile?.role === "branch_user"
  const userBranchId = profile?.branch_id ?? null

  const { count: forecastsCount } = isBranchUser && userBranchId
    ? await supabase
        .from("forecasts")
        .select("*", { count: "exact", head: true })
        .eq("branch_id", userBranchId)
    : await supabase
        .from("forecasts")
        .select("*", { count: "exact", head: true })

  let branchesCount: number | null = 1
  if (profile?.role === "branch_user") {
    branchesCount = 1
  } else if (profile?.role === "region_admin" && profile.region_id) {
    const { count } = await supabase
      .from("branches")
      .select("*", { count: "exact", head: true })
      .eq("region_id", profile.region_id)
    branchesCount = count
  } else if (profile?.role === "hq_admin") {
    const { count } = await supabase
      .from("branches")
      .select("*", { count: "exact", head: true })
    branchesCount = count
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-foreground">Dashboard</h1>
        <p className="text-muted-foreground mt-1">
          Welcome back, {profile?.full_name || "User"}.
          {profile?.role === "branch_user" && profile?.branches?.name ? (
            <> You&apos;re viewing data for your branch only: <strong>{profile.branches.name}</strong>.</>
          ) : profile?.role === "region_admin" && profile?.regions?.name ? (
            <> You&apos;re viewing data for your region only: <strong>{profile.regions.name}</strong>.</>
          ) : (
            " Here's an overview of your forecasting data."
          )}
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Forecasts Generated
            </CardTitle>
            <LineChart className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{forecastsCount || 0}</div>
            <p className="text-xs text-muted-foreground">
              {isBranchUser ? "Forecasts for your branch" : "Monthly forecasts"}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Branches
            </CardTitle>
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{branchesCount || 0}</div>
            <p className="text-xs text-muted-foreground">
              {profile?.role === "branch_user"
                ? "Your branch"
                : profile?.role === "region_admin"
                  ? "In your region"
                  : "Under management"}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Forecast Year
            </CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">2026</div>
            <p className="text-xs text-muted-foreground">
              Current forecast period
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
            <CardDescription>Common tasks you can perform</CardDescription>
          </CardHeader>
          <CardContent>
            <Link
              href="/dashboard/forecast"
              className="flex items-center gap-4 p-4 rounded-lg border border-border hover:bg-accent/50 transition-colors"
            >
              <div className="rounded-full bg-accent/20 p-2">
                <LineChart className="h-5 w-5 text-accent" />
              </div>
              <div>
                <p className="font-medium">View &amp; Generate Forecasts</p>
                <p className="text-sm text-muted-foreground">
                  Your branch data is pre-loaded. Generate and review monthly forecasts for 2026.
                </p>
              </div>
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
