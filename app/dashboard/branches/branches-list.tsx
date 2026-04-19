"use client"

import { useState, useMemo } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Building2, TrendingUp, TrendingDown, FileSpreadsheet, Search, MapPin } from "lucide-react"
import Link from "next/link"
import { formatCurrency } from "@/lib/forecasting"

type Branch = {
  id: string
  name: string
  code: string
  region_id: string
  regions?: { name: string } | null
}

type Region = { id: string; name: string }

type Props = {
  branches: Branch[]
  regions: Region[]
  regionId: string | null
  forecastByBranch: Record<string, {
    revenueForecast: number
    revenueBudget: number
    expenseForecast: number
    expenseBudget: number
  }>
  lastUploadByBranch: Record<string, string>
  isHqAdmin: boolean
}

export function BranchesList({
  branches,
  regions,
  regionId,
  forecastByBranch,
  lastUploadByBranch,
  isHqAdmin,
}: Props) {
  const router = useRouter()
  const [search, setSearch] = useState("")

  const filteredBranches = useMemo(() => {
    if (!branches) return []
    const q = search.trim().toLowerCase()
    const results = !q
      ? branches
      : branches.filter(
          (b) =>
            b.name.toLowerCase().includes(q) ||
            b.code.toLowerCase().includes(q) ||
            (b.regions?.name ?? "").toLowerCase().includes(q)
        )
    return [...results].sort((a, b) => parseInt(a.code, 10) - parseInt(b.code, 10))
  }, [branches, search])

  const handleRegionChange = (value: string) => {
    if (value === "all") {
      router.push("/dashboard/branches")
    } else {
      router.push(`/dashboard/branches?region=${value}`)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search by branch name, code, or region..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        {isHqAdmin && (
          <Select
            value={regionId ?? "all"}
            onValueChange={handleRegionChange}
          >
            <SelectTrigger className="w-full sm:w-[220px]">
              <MapPin className="h-4 w-4 text-muted-foreground mr-2" />
              <SelectValue placeholder="All regions" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All regions</SelectItem>
              {regions.map((r) => (
                <SelectItem key={r.id} value={r.id}>
                  {r.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {filteredBranches.map((branch) => {
          const forecastData = forecastByBranch[branch.id]
          const lastUploadStr = lastUploadByBranch[branch.id]
          const lastUpload = lastUploadStr ? new Date(lastUploadStr) : null
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

      {filteredBranches.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Building2 className="h-12 w-12 text-muted-foreground mb-4" />
            <h2 className="text-xl font-semibold">
              {search.trim() ? "No branches match your search" : "No Branches Found"}
            </h2>
            <p className="text-muted-foreground mt-2 text-center max-w-sm">
              {search.trim()
                ? "Try a different search term (branch name, code, or region)."
                : "No branches are assigned to your region."}
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
