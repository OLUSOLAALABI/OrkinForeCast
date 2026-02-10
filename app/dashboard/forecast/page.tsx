"use client"

import { useState, useEffect, useCallback } from "react"
import { useSearchParams } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { LineChart, RefreshCw, Download, TrendingUp, TrendingDown, Loader2, AlertCircle, Pencil } from "lucide-react"
import { 
  generateBranchForecasts, 
  formatCurrency, 
  formatPercent, 
  getShortMonthName,
  type ForecastResult 
} from "@/lib/forecasting"
import { ForecastChart } from "@/components/dashboard/forecast-chart"
import { ForecastTable } from "@/components/dashboard/forecast-table"

type Branch = {
  id: string
  name: string
  region_id: string
  regions?: { name: string } | null
}

type Profile = {
  role: string
  branch_id: string | null
  region_id: string | null
}

type Actual = {
  description: string
  month: number
  year: number
  value: number
}

export default function ForecastPage() {
  const searchParams = useSearchParams()
  const branchFromUrl = searchParams.get("branch")
  const [branches, setBranches] = useState<Branch[]>([])
  const [selectedBranch, setSelectedBranch] = useState<string>(branchFromUrl || "")
  const [profile, setProfile] = useState<Profile | null>(null)
  const [forecasts, setForecasts] = useState<ForecastResult[]>([])
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedDescription, setSelectedDescription] = useState<string>("all")
  const [currentYear, setCurrentYear] = useState(2026)
  const [currentMonth, setCurrentMonth] = useState(() => {
    const m = new Date().getMonth() + 1
    return m >= 1 && m <= 12 ? m : 1
  })
  const supabase = createClient()

  const years = [2024, 2025, 2026, 2027, 2028]
  const months = Array.from({ length: 12 }, (_, i) => ({ value: i + 1, label: getShortMonthName(i + 1) }))

  useEffect(() => {
    const fetchData = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: profileData } = await supabase
        .from("profiles")
        .select("role, branch_id, region_id")
        .eq("id", user.id)
        .single()

      if (profileData) {
        setProfile(profileData)
        
        if (profileData.role === "branch_user" && profileData.branch_id) {
          setSelectedBranch(profileData.branch_id)
        } else {
          const { data: branchData } = await supabase
            .from("branches")
            .select("*, regions(name)")
            .order("name")
          if (branchData) {
            setBranches(branchData)
            // Pre-select branch from URL when HQ/region_admin clicks from Branches page
            if (branchFromUrl && branchData.some((b: Branch) => b.id === branchFromUrl)) {
              setSelectedBranch(branchFromUrl)
            }
          }
        }
      }
      setLoading(false)
    }
    fetchData()
  }, [supabase, branchFromUrl])

  const loadForecasts = useCallback(async () => {
    if (!selectedBranch) return

    setLoading(true)
    setError(null)

    try {
      // Check for existing forecasts
      const { data: existingForecasts } = await supabase
        .from("forecasts")
        .select("*")
        .eq("branch_id", selectedBranch)
        .eq("year", currentYear)

      if (existingForecasts && existingForecasts.length > 0) {
        const formattedForecasts: ForecastResult[] = existingForecasts.map(f => ({
          description: f.description,
          month: f.month,
          forecastValue: f.forecast_value,
          budgetValue: f.budget_value,
          lastMonthValue: f.last_month_value,
          lastYearValue: f.last_year_value,
          variance: f.forecast_value - f.budget_value,
          variancePercent: f.budget_value !== 0 ? ((f.forecast_value - f.budget_value) / f.budget_value) * 100 : 0,
        }))
        setForecasts(formattedForecasts)
      } else {
        setForecasts([])
      }
    } catch (err) {
      console.error("Error loading forecasts:", err)
      setError("Failed to load forecasts")
    } finally {
      setLoading(false)
    }
  }, [selectedBranch, supabase, currentYear])

  useEffect(() => {
    if (selectedBranch) {
      loadForecasts()
    }
  }, [selectedBranch, currentYear, loadForecasts])

  const generateForecasts = async () => {
    if (!selectedBranch) return

    setGenerating(true)
    setError(null)

    try {
      // Fetch actuals data
      const { data: actualsData, error: actualsError } = await supabase
        .from("actuals")
        .select("description, month, year, value")
        .eq("branch_id", selectedBranch)
        .in("year", [currentYear - 1, currentYear])

      if (actualsError) throw actualsError

      if (!actualsData || actualsData.length === 0) {
        setError("No actuals data found. Please upload data first.")
        setGenerating(false)
        return
      }

      // Get budget data (using last year's data as budget proxy if no budget uploaded)
      const budgetData = actualsData
        .filter(d => d.year === currentYear - 1)
        .map(d => ({ description: d.description, month: d.month, value: d.value * 1.05 })) // 5% increase as budget

      // Generate forecasts
      const newForecasts = generateBranchForecasts(
        actualsData as Actual[],
        budgetData,
        currentYear,
        currentMonth
      )

      // Save forecasts to database
      const forecastRecords = newForecasts.map(f => ({
        branch_id: selectedBranch,
        description: f.description,
        year: currentYear,
        month: f.month,
        forecast_value: f.forecastValue,
        budget_value: f.budgetValue,
        last_month_value: f.lastMonthValue,
        last_year_value: f.lastYearValue,
      }))

      // Upsert in batches
      const batchSize = 100
      for (let i = 0; i < forecastRecords.length; i += batchSize) {
        const batch = forecastRecords.slice(i, i + batchSize)
        const { error: insertError } = await supabase
          .from("forecasts")
          .upsert(batch, {
            onConflict: "branch_id,description,year,month",
            ignoreDuplicates: false,
          })

        if (insertError) throw insertError
      }

      setForecasts(newForecasts)
    } catch (err) {
      console.error("Error generating forecasts:", err)
      setError(err instanceof Error ? err.message : "Failed to generate forecasts")
    } finally {
      setGenerating(false)
    }
  }

  const handleUpdateForecast = async (description: string, month: number, newValue: number) => {
    if (!selectedBranch) return

    // Update in database
    const { error: updateError } = await supabase
      .from("forecasts")
      .update({ 
        forecast_value: newValue,
        updated_at: new Date().toISOString()
      })
      .eq("branch_id", selectedBranch)
      .eq("description", description)
      .eq("year", currentYear)
      .eq("month", month)

    if (updateError) {
      console.error("Error updating forecast:", updateError)
      setError("Failed to update forecast")
      return
    }

    // Update local state
    setForecasts(prev => prev.map(f => {
      if (f.description === description && f.month === month) {
        const newVariance = newValue - f.budgetValue
        const newVariancePercent = f.budgetValue !== 0 
          ? ((newValue - f.budgetValue) / f.budgetValue) * 100 
          : 0
        return {
          ...f,
          forecastValue: newValue,
          variance: newVariance,
          variancePercent: newVariancePercent
        }
      }
      return f
    }))
  }

  const descriptions = [...new Set(forecasts.map(f => f.description))]
  const filteredForecasts = selectedDescription === "all"
    ? forecasts
    : forecasts.filter(f => f.description === selectedDescription)

  // Calculate summary stats
  const totalForecast = filteredForecasts
    .filter(f => f.month === currentMonth)
    .reduce((sum, f) => sum + f.forecastValue, 0)
  const totalBudget = filteredForecasts
    .filter(f => f.month === currentMonth)
    .reduce((sum, f) => sum + f.budgetValue, 0)
  const totalVariance = totalForecast - totalBudget
  const variancePercent = totalBudget !== 0 ? (totalVariance / totalBudget) * 100 : 0

  const exportToCSV = () => {
    const headers = ["Description", "Month", "Forecast", "Budget", "Variance", "Variance %"]
    const rows = filteredForecasts.map(f => [
      f.description,
      getShortMonthName(f.month),
      f.forecastValue.toFixed(2),
      f.budgetValue.toFixed(2),
      f.variance.toFixed(2),
      f.variancePercent.toFixed(2) + "%"
    ])

    const csv = [headers, ...rows].map(row => row.join(",")).join("\n")
    const blob = new Blob([csv], { type: "text/csv" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `forecast_${currentYear}_${selectedBranch}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (loading && !profile) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Forecasts</h1>
          <p className="text-muted-foreground mt-1">
            Monthly forecasts for {currentYear} (as of {getShortMonthName(currentMonth)})
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={String(currentYear)} onValueChange={(v) => setCurrentYear(Number(v))}>
            <SelectTrigger className="w-[100px]">
              <SelectValue placeholder="Year" />
            </SelectTrigger>
            <SelectContent>
              {years.map((y) => (
                <SelectItem key={y} value={String(y)}>{y}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={String(currentMonth)} onValueChange={(v) => setCurrentMonth(Number(v))}>
            <SelectTrigger className="w-[110px]">
              <SelectValue placeholder="As of month" />
            </SelectTrigger>
            <SelectContent>
              {months.map((m) => (
                <SelectItem key={m.value} value={String(m.value)}>{m.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {profile?.role !== "branch_user" && branches.length > 0 && (
            <Select value={selectedBranch} onValueChange={setSelectedBranch}>
              <SelectTrigger className="w-[240px]">
                <SelectValue placeholder="Select branch" />
              </SelectTrigger>
              <SelectContent>
                {(() => {
                  // Group branches by region (HQ sees all regions; region_admin sees one)
                  const byRegion = new Map<string, Branch[]>()
                  branches.forEach((b) => {
                    const regionName = b.regions?.name ?? "Other"
                    if (!byRegion.has(regionName)) byRegion.set(regionName, [])
                    byRegion.get(regionName)!.push(b)
                  })
                  const sortedRegions = [...byRegion.keys()].sort()
                  return sortedRegions.map((regionName) => (
                    <SelectGroup key={regionName}>
                      <SelectLabel>{regionName}</SelectLabel>
                      {byRegion.get(regionName)!.map((branch) => (
                        <SelectItem key={branch.id} value={branch.id}>
                          {branch.name}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  ))
                })()}
              </SelectContent>
            </Select>
          )}
          <Button
            onClick={generateForecasts}
            disabled={!selectedBranch || generating}
          >
            {generating ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            Generate
          </Button>
          <Button
            variant="outline"
            onClick={exportToCSV}
            disabled={forecasts.length === 0}
          >
            <Download className="mr-2 h-4 w-4" />
            Export
          </Button>
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {selectedBranch && (
        <Alert className="bg-muted/50">
          <AlertDescription>
            Forecasts use <strong>last year actuals</strong>, <strong>current year to date</strong>, and <strong>budget</strong> (from Budget uploads when available, otherwise derived from last year). Generate after uploading actuals (and optionally budget) for accurate results. <strong>As of month</strong> uses server date (UTC) when not changed.
          </AlertDescription>
        </Alert>
      )}

      {selectedBranch && forecasts.length > 0 && (
        <>
          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Current Month Forecast
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatCurrency(totalForecast)}</div>
                <p className="text-xs text-muted-foreground">
                  {getShortMonthName(currentMonth)} {currentYear}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Budget
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatCurrency(totalBudget)}</div>
                <p className="text-xs text-muted-foreground">
                  Monthly target
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Variance
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2">
                  <span className={`text-2xl font-bold ${totalVariance >= 0 ? "text-accent" : "text-destructive"}`}>
                    {formatCurrency(Math.abs(totalVariance))}
                  </span>
                  {totalVariance >= 0 ? (
                    <TrendingUp className="h-5 w-5 text-accent" />
                  ) : (
                    <TrendingDown className="h-5 w-5 text-destructive" />
                  )}
                </div>
                <Badge variant={totalVariance >= 0 ? "default" : "destructive"} className="mt-1">
                  {formatPercent(variancePercent)}
                </Badge>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                  <CardTitle>Forecast Details</CardTitle>
                  <CardDescription>Monthly breakdown by category</CardDescription>
                </div>
                <Select value={selectedDescription} onValueChange={setSelectedDescription}>
                  <SelectTrigger className="w-[200px]">
                    <SelectValue placeholder="All categories" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Categories</SelectItem>
                    {descriptions.map((desc) => (
                      <SelectItem key={desc} value={desc}>
                        {desc}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent>
              <div className="mb-4 flex items-center gap-2 text-sm text-muted-foreground bg-muted/50 rounded-md p-3">
                <Pencil className="h-4 w-4" />
                <span>Click on any cell in the table view to adjust forecast values by description and month.</span>
              </div>
              <Tabs defaultValue="chart">
                <TabsList>
                  <TabsTrigger value="chart">Chart</TabsTrigger>
                  <TabsTrigger value="table">Table</TabsTrigger>
                </TabsList>
                <TabsContent value="chart" className="mt-4">
                  <ForecastChart 
                    forecasts={filteredForecasts} 
                    currentMonth={currentMonth}
                  />
                </TabsContent>
                <TabsContent value="table" className="mt-4">
                  <ForecastTable 
                    forecasts={filteredForecasts}
                    currentMonth={currentMonth}
                    onUpdateForecast={handleUpdateForecast}
                    editable={true}
                  />
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </>
      )}

      {selectedBranch && forecasts.length === 0 && !loading && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <LineChart className="h-12 w-12 text-muted-foreground mb-4" />
            <h2 className="text-xl font-semibold">No Forecasts Yet</h2>
            <p className="text-muted-foreground mt-2 text-center max-w-md">
              Upload your actuals data first, then click Generate to create forecasts for {currentYear}.
            </p>
            <Button className="mt-4" onClick={() => window.location.href = "/dashboard/upload"}>
              Upload Data
            </Button>
          </CardContent>
        </Card>
      )}

      {!selectedBranch && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <LineChart className="h-12 w-12 text-muted-foreground mb-4" />
            <h2 className="text-xl font-semibold">Select a Branch</h2>
            <p className="text-muted-foreground mt-2">
              Choose a branch to view and generate forecasts.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
