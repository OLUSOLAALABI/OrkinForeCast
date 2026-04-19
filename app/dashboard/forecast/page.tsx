"use client"

import { useState, useEffect, useCallback, useMemo, useRef } from "react"
import { useSearchParams } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { LineChart, Download, Upload, TrendingUp, TrendingDown, Loader2, AlertCircle, Pencil, Search } from "lucide-react"
import {
  formatCurrency,
  formatPercent,
  getShortMonthName,
  normDesc,
  isRevenueLine,
  isExpenseLine,
  isSubtotalDescription,
  isLeafDescription,
  type ForecastResult
} from "@/lib/forecasting"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import * as XLSX from "xlsx"
import { ForecastChart, ForecastBarChart } from "@/components/dashboard/forecast-chart"
import { ForecastTable } from "@/components/dashboard/forecast-table"

type Branch = {
  id: string
  name: string
  code: string
  region_id: string
  regions?: { name: string } | null
}

type Profile = {
  role: string
  branch_id: string | null
  region_id: string | null
}

const ALL_BRANCHES_ID = "__all__" // HQ/region summary view (sum of forecasts from all branches)
const ALL_REGIONS_ID = "__all_regions__" // HQ view: all regions (HQ total); Select cannot use ""

const KPI_REVENUE = "TOTAL NET REVENUE"
const KPI_EXPENSE_LINES = new Set(["TOTAL EXPENSES", "TOTAL OVERHEAD ALLOCATIONS"])

// ────────────────────────────────────────────────────────────────
// Overhead allocation lines — statutory/fixed, use budget figures
// ────────────────────────────────────────────────────────────────
const BUDGET_ONLY_LINES = new Set([
  // Overhead allocations (statutory/fixed)
  "SALES ALLOCATIONS", "QA ALLOCATIONS", "AR ALLOCATIONS",
  "DATA PROCESSING ALLOCATIONS", "ACCOUNTING ALLOCATIONS",
  "ADVERTISING & MKTG - ALLOCATION", "REGION SUPPORT SERVICES",
  "CANADA OVERHEAD ALLOCATIONS", "BMT ALLOCATIONS",
  "FLEET ALLOCATIONS", "CORPORATE ADMIN ALLOCATIONS",
  "HO ADMIN ALLOCATIONS", "HUMAN RESOURCES ALLOCATIONS",
  "INFORMATION TECH. ALLOCATIONS",
  // Below-the-line statutory items
  "OVERHEAD ALLOCATION REVERSAL",
  "HOME OFFICE OVERHEAD",
  "ACQUISITION COST",
  "ULTIPRO COST",
].map(normDesc))

// Below-the-line descriptions that should NOT count as "Total Expenses" for Contribution B/4 Overhead
const BELOW_THE_LINE = new Set([
  ...BUDGET_ONLY_LINES,
  ..."OVERHEAD ALLOCATIONS,TOTAL OVERHEAD ALLOCATIONS,OPERATING PROFIT,OVERHEAD ALLOCATION REVERSAL,BONUS OPERATING PROFIT,HOME OFFICE OVERHEAD,ACQUISITION COST,ULTIPRO COST,EXTERNAL PROFIT,FOREIGN EXCHANGE GAIN/LOSS,ROYALTY FEES,INTEREST EXPENSE ORKIN,CANADIAN TAXES,NON-OP INT EXP/(REV),NET PROFIT,CONTRIBUTION B/4 OVERHEAD".split(",").map(s => normDesc(s)),
])

// ────────────────────────────────────────────────────────────────
// Hierarchical P&L subtotal rules — order matters (children first)
// ────────────────────────────────────────────────────────────────
type SubtotalRule = { desc: string; add: string[]; sub?: string[] }

const SUBTOTAL_RULES: SubtotalRule[] = [
  // Revenue
  { desc: "SUBTOTAL MONTHLY", add: ["PEST CONTROL REVENUE", "COMMERCIAL REVENUE", "COMMERCIAL BED BUG REVENUE (recur)", "FLY CONTROL", "ORKIN/AIRE", "FEMININE HYGIENE", "DRAIN MAINTENANCE", "SOAK TANK"] },
  { desc: "SUBTOTAL/ALTERNATE/SEASONAL", add: ["RESIDENTIAL CONTRACT", "VALU PLUS COMM REVENUE", "SEASONAL REV  & OTHER"] },
  { desc: "GROSS CONTRACT REVENUE", add: ["SUBTOTAL MONTHLY", "SUBTOTAL/ALTERNATE/SEASONAL"] },
  { desc: "TOTAL ALLOWANCES", add: ["ALLOWANCES", "PC COMM MGMT FAILURE", "RESIDENTIAL MGMT FAILURE", "YEAR IN ADVANCE", "PC SALES DISC"] },
  { desc: "NET CONTRACT REVENUE", add: ["GROSS CONTRACT REVENUE", "TOTAL ALLOWANCES"] },
  { desc: "TOTAL MISC REVENUE", add: ["MISCELLANEOUS REVENUE", "RESIDENTIAL BED BUG REVENUE", "RESIDENTIAL SPECIAL SERVICES", "COMMERCIAL SPECIAL SERVICES", "PRODUCT SALES", "FUMIGATION PC"] },
  { desc: "TOTAL NET PC REVENUE", add: ["NET CONTRACT REVENUE", "TOTAL MISC REVENUE"] },
  { desc: "TOTAL NET TC REVENUE", add: ["TERMITE (TC) REVENUE", "TERMITE TREATING", "PRETREAT", "INSPECTION FEES", "TC MGMT FAILURE"] },
  { desc: "TOTAL NET REVENUE", add: ["TOTAL NET PC REVENUE", "TOTAL NET TC REVENUE"] },
  // Payroll
  { desc: "SUBTOTALS MANAGERS", add: ["DIVISION MANAGER", "REGION MANAGER SALARY", "BRANCH MANAGER SALARY", "QUALITY ASSURANCE", "MANAGER TRAINEE"] },
  { desc: "SUBTOTAL MGR INCENTIVES", add: ["MANAGERS INCENTIVES PAID", "MGR INCENTIVE ACCRUED"] },
  { desc: "SUBTOTAL OFFICE", add: ["OFFICE SALARIES", "VAC / HOLIDAY / SICK", "OFFICE SAL FLD OT", "TEMP OFFICE PERS"] },
  { desc: "SUBTOTAL ADMIN PAYROLL", add: ["SUBTOTALS MANAGERS", "SUBTOTAL MGR INCENTIVES", "SUBTOTAL OFFICE"] },
  { desc: "SUBTOTAL SALES PAYROLL", add: ["SALESPERSON SALARIES", "ASM & NATIONAL SALES SALARIES", "SALES COMMISSIONS / BONUS", "SALES VAC / HOL / SICK", "TECHNICIAN SALES COMMISSION"] },
  { desc: "SUBTOTAL SERV PAYROLL", add: ["TECHNICIAN SERVICE SALARIES", "TECHNICIAN SERV PRODUCTION", "PC VAC / HOL / SICK", "PC SERV WAGES - OT"] },
  { desc: "TOTAL SERVICE WAGES", add: ["SUBTOTAL SERV PAYROLL", "SERV MGR SALARY", "SERV MGR BONUS"] },
  { desc: "TOTAL PAYROLL", add: ["SUBTOTAL ADMIN PAYROLL", "SUBTOTAL SALES PAYROLL", "TOTAL SERVICE WAGES"] },
  // Personnel related
  { desc: "TOTAL PERSONNEL EXPENSES", add: ["PAYROLL TAXES", "INS-GROUP BENEFITS", "INS-GROUP DEDUCTIONS", "UNIFORMS", "MOVING", "TRAINING", "PROF RECRUITING", "MEDICAL", "OTHER PERSONNEL RELATED"] },
  { desc: "TOTAL EMPL COST", add: ["TOTAL PAYROLL", "TOTAL PERSONNEL EXPENSES"] },
  // Materials
  { desc: "SUB TOTAL M&S", add: ["PC CHEMICALS", "FREIGHT IN", "PC TOOLS & EQUIPMENT", "ORKIN/AIRE (M&S)", "M&S FLY LIGHTS"] },
  { desc: "TOTAL MATERIAL & SUPPLIES", add: ["SUB TOTAL M&S", "COGS PRODUCTS & EQUIPMENT"] },
  // Vehicle
  { desc: "TOTAL VEHICLE OPERATING", add: ["GASOLINE", "TIRES", "OIL CHANGE", "OTHER OPERATING EXPENSES"] },
  { desc: "TOTAL STAND EXPENSES", add: ["LEASE", "DEPRECIATION", "VEH GAIN / LOSS", "LICENSES / TAXES"] },
  { desc: "TOTAL VEHICLE EXPENSE", add: ["TOTAL VEHICLE OPERATING", "TOTAL STAND EXPENSES"] },
  { desc: "TOTAL FLEET", add: ["TOTAL VEHICLE EXPENSE", "AUTO ALLOWANCE", "PER USE DEDUCTIONS"] },
  // Insurance
  { desc: "SUBTOTAL INSURANCE & CLAIMS", add: ["VEHICLE ACCIDENT", "CLAIMS - GENERAL  LIABILITY", "INS - GENERAL LIABILITY", "INS - AUTO LIABILITY", "INS - WORKERS COMPENSATION"] },
  { desc: "TOTAL INSURANCE & CLAIMS", add: ["SUBTOTAL INSURANCE & CLAIMS", "CATASTROPHIC ACCRUAL"] },
  // Bad debts
  { desc: "SUBTOTAL BAD DEBTS", add: ["BAD DEBT EXPENSE", "RECOVERIES"] },
  { desc: "TOTAL BAD DEBTS", add: ["SUBTOTAL BAD DEBTS", "BAD DEBT ACCRUAL", "OUT OF POLICY"] },
  // Other expenses
  { desc: "TOTAL FIXED EXPENSE", add: ["ADVERTISING DIRECT", "RENT - BRANCH", "DEPRECIATION (fixed)", "TAXES PROP/OTHER"] },
  { desc: "SUBTOTAL TELEPHONE", add: ["LOCAL CENTRALIZED", "LONG DISTANCE CENTRALIZED", "CELLULAR TELEPHONE", "OTHER COMMUNICATION"] },
  { desc: "SUBTOTAL TELE. & UTILITIES", add: ["SUBTOTAL TELEPHONE", "UTILITIES"] },
  { desc: "TOTAL CONTROLLABLE", add: ["OFFICE SUPPLIES", "PRINTING & FORMS", "COMPUTER SUPPLIES", "TRAVEL", "CONFERENCE", "SUBTOTAL TELE. & UTILITIES", "PROFESSIONAL SERVICES", "MAINTENANCE & REPAIRS", "EQUIPMENT RENTAL", "POSTAGE", "BANK SERVICE CHARGES", "CREDIT CARD SERVICE FEE", "MISCELLANEOUS"] },
  { desc: "TOTAL OTHER EXPENSE", add: ["TOTAL FIXED EXPENSE", "TOTAL CONTROLLABLE"] },
  // Total expenses
  { desc: "TOTAL EXPENSES", add: ["TOTAL EMPL COST", "TOTAL MATERIAL & SUPPLIES", "TOTAL FLEET", "TOTAL INSURANCE & CLAIMS", "TOTAL BAD DEBTS", "TOTAL OTHER EXPENSE"] },
  // Contribution
  { desc: "CONTRIBUTION B/4 OVERHEAD", add: ["TOTAL NET REVENUE"], sub: ["TOTAL EXPENSES"] },
  // Overhead
  { desc: "TOTAL OVERHEAD ALLOCATIONS", add: ["SALES ALLOCATIONS", "QA ALLOCATIONS", "AR ALLOCATIONS", "DATA PROCESSING ALLOCATIONS", "ACCOUNTING ALLOCATIONS", "ADVERTISING & MKTG - ALLOCATION", "REGION SUPPORT SERVICES", "CANADA OVERHEAD ALLOCATIONS", "BMT ALLOCATIONS", "FLEET ALLOCATIONS", "CORPORATE ADMIN ALLOCATIONS", "HO ADMIN ALLOCATIONS", "HUMAN RESOURCES ALLOCATIONS", "INFORMATION TECH. ALLOCATIONS"] },
  // Bottom line
  { desc: "OPERATING PROFIT", add: ["CONTRIBUTION B/4 OVERHEAD"], sub: ["TOTAL OVERHEAD ALLOCATIONS"] },
  { desc: "BONUS OPERATING PROFIT", add: ["OPERATING PROFIT"], sub: ["OVERHEAD ALLOCATION REVERSAL"] },
  { desc: "EXTERNAL PROFIT", add: ["BONUS OPERATING PROFIT"], sub: ["HOME OFFICE OVERHEAD", "ACQUISITION COST", "ULTIPRO COST"] },
  { desc: "NET PROFIT", add: ["EXTERNAL PROFIT"], sub: ["FOREIGN EXCHANGE GAIN/LOSS", "ROYALTY FEES", "INTEREST EXPENSE ORKIN", "CANADIAN TAXES", "NON-OP INT EXP/(REV)"] },
]

/**
 * Recompute all subtotal/total rows from their children for both forecast and budget values.
 * Also overrides overhead allocation forecast values with budget (statutory/fixed).
 */
function recomputeAllSubtotals(forecasts: ForecastResult[]): ForecastResult[] {
  if (forecasts.length === 0) return forecasts
  const result = forecasts.map(f => {
    // Step 1: Override statutory/fixed items forecast with budget
    if (BUDGET_ONLY_LINES.has(normDesc(f.description))) {
      return { ...f, forecastValue: f.budgetValue, variance: 0, variancePercent: 0 }
    }
    return { ...f }
  })

  // Step 2: Recompute subtotals per month
  const months = [...new Set(result.map(f => f.month))]

  for (const month of months) {
    // Build lookup: normDesc → index in result array
    const descMap = new Map<string, number>()
    result.forEach((f, i) => {
      if (f.month === month) descMap.set(normDesc(f.description), i)
    })

    for (const rule of SUBTOTAL_RULES) {
      const key = normDesc(rule.desc)
      const idx = descMap.get(key)
      if (idx === undefined) continue // subtotal row doesn't exist

      let fSum = 0
      let bSum = 0
      for (const child of rule.add) {
        const ci = descMap.get(normDesc(child))
        if (ci !== undefined) { fSum += result[ci].forecastValue; bSum += result[ci].budgetValue }
      }
      if (rule.sub) {
        for (const child of rule.sub) {
          const ci = descMap.get(normDesc(child))
          if (ci !== undefined) { fSum -= result[ci].forecastValue; bSum -= result[ci].budgetValue }
        }
      }

      const fv = Math.round(fSum * 100) / 100
      const bv = Math.round(bSum * 100) / 100
      const v = Math.round((fv - bv) * 100) / 100
      result[idx] = { ...result[idx], forecastValue: fv, budgetValue: bv, variance: v, variancePercent: bv !== 0 ? Math.round(((fv - bv) / bv) * 100 * 100) / 100 : 0 }
    }
  }

  return result
}

export default function ForecastPage() {
  const searchParams = useSearchParams()
  const branchFromUrl = searchParams.get("branch")
  const [branches, setBranches] = useState<Branch[]>([])
  // Default to summary (all branches) so HQ/Region Admin see rollup immediately, not "Select a Branch"
  const [selectedBranch, setSelectedBranch] = useState<string>(branchFromUrl || ALL_BRANCHES_ID)
  // HQ only: when viewing summary, filter by region ("" = all regions, else region_id)
  const [selectedRegionId, setSelectedRegionId] = useState<string>(ALL_REGIONS_ID)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [forecasts, setForecasts] = useState<ForecastResult[]>([])
  const [rawForecastRows, setRawForecastRows] = useState<{ branch_id: string; description: string; month: number; forecast_value: number; budget_value: number }[]>([])
  const [loading, setLoading] = useState(true)
  const [needsBranchAssignment, setNeedsBranchAssignment] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedDescription, setSelectedDescription] = useState<string>("all")
  const [searchQuery, setSearchQuery] = useState<string>("")
  const [showMethodology, setShowMethodology] = useState<boolean>(false)
  const [currentYear, setCurrentYear] = useState(2026)
  const [currentMonth, setCurrentMonth] = useState(() => {
    const m = new Date().getMonth() + 1
    return m >= 1 && m <= 12 ? m : 1
  })
  const supabase = createClient()
  const lastFetchedKeyRef = useRef<string | null>(null)
  const [lastMonthActuals, setLastMonthActuals] = useState<Map<string, number>>(new Map())
  const [uploading, setUploading] = useState(false)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const regionsList = useMemo(() => {
    const m = new Map<string, { id: string; name: string }>()
    branches.forEach((b: Branch) => {
      if (b.region_id && b.regions?.name && !m.has(b.region_id)) {
        m.set(b.region_id, { id: b.region_id, name: b.regions.name })
      }
    })
    return [...m.values()].sort((a, b) => a.name.localeCompare(b.name))
  }, [branches])

  // Per-branch breakdown for region/HQ summary view (revenue + expenses + net profit for current month)
  const branchBreakdown = useMemo(() => {
    if (selectedBranch !== ALL_BRANCHES_ID || rawForecastRows.length === 0) return []

    const monthRows = rawForecastRows.filter((r) => r.month === currentMonth)
    const byBranch = new Map<
      string,
      { revenueForecast: number; revenueBudget: number; expenseForecast: number; expenseBudget: number; netProfitForecast: number; netProfitBudget: number }
    >()

    const DISPLAY_CAP = 1000000000 // 1 Billion

    monthRows.forEach((r) => {
      const d = normDesc(r.description)
      const isLeaf = isLeafDescription(d)
      if (!isLeaf) return

      const cur = byBranch.get(r.branch_id) || {
        revenueForecast: 0,
        revenueBudget: 0,
        expenseForecast: 0,
        expenseBudget: 0,
        netProfitForecast: 0,
        netProfitBudget: 0
      }

      const val = Math.min(DISPLAY_CAP, Number(r.forecast_value ?? 0))
      const bud = Number(r.budget_value ?? 0)

      if (isRevenueLine(d)) {
        cur.revenueForecast += val
        cur.revenueBudget += bud
      } else {
        cur.expenseForecast += val
        cur.expenseBudget += bud
      }

      cur.netProfitForecast = cur.revenueForecast - cur.expenseForecast
      cur.netProfitBudget = cur.revenueBudget - cur.expenseBudget

      byBranch.set(r.branch_id, cur)
    })

    return branches
      .filter((b) => byBranch.has(b.id))
      .map((b) => {
        const data = byBranch.get(b.id)!
        return {
          branch: b,
          ...data,
        }
      })
      .sort((a, b) => a.branch.name.localeCompare(b.branch.name))
  }, [selectedBranch, rawForecastRows, currentMonth, branches])

  const years = [2024, 2025, 2026, 2027, 2028]
  const months = Array.from({ length: 12 }, (_, i) => ({ value: i + 1, label: getShortMonthName(i + 1) }))

  const fetchForecastRowsPaginated = useCallback(
    async (buildQuery: () => any) => {
      const pageSize = 1000
      let from = 0
      const allRows: any[] = []

      while (true) {
        const { data, error } = await buildQuery().range(from, from + pageSize - 1)
        if (error) throw error
        const rows = data ?? []
        allRows.push(...rows)
        if (rows.length < pageSize) break
        from += pageSize
      }

      return allRows
    },
    []
  )

  // When profile loads, branch users get their branch auto-selected; others get branch list
  useEffect(() => {
    const fetchData = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      setUserId(user.id)

      const { data: profileData } = await supabase
        .from("profiles")
        .select("role, branch_id, region_id")
        .eq("id", user.id)
        .single()

      if (profileData) {
        setProfile(profileData)

        if (profileData.role === "branch_user") {
          // Branch users always see their assigned branch — no selector
          if (profileData.branch_id) {
            setSelectedBranch(profileData.branch_id)
          } else {
            setNeedsBranchAssignment(true)
          }
          setLoading(false)
          return
        }

        // HQ and Region Admin keep summary view; branch_user already handled above
        // Skip if a specific branch was requested via URL to avoid a race condition
        // where the ALL_BRANCHES fetch overwrites the single-branch fetch result.
        if (!branchFromUrl && (profileData.role === "hq_admin" || profileData.role === "region_admin")) {
          setSelectedBranch(ALL_BRANCHES_ID)
        }

        // Use API for branches to avoid RLS issues (region admin may not get branches via client)
        const res = await fetch("/api/branches")
        const { branches: branchData } = res.ok ? await res.json().catch(() => ({})) : { branches: null }
        if (branchData && Array.isArray(branchData)) {
          setBranches(branchData)
          if (branchFromUrl && branchData.some((b: Branch) => b.id === branchFromUrl)) {
            setSelectedBranch(branchFromUrl)
          }
        } else if (profileData.role === "hq_admin") {
          // Fallback for HQ: direct query (RLS allows all)
          const { data } = await supabase
            .from("branches")
            .select("*, regions(name)")
            .order("name")
          if (data) {
            setBranches(data)
            if (branchFromUrl && data.some((b: Branch) => b.id === branchFromUrl)) {
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
      if (selectedBranch === ALL_BRANCHES_ID) {
        const branchIds = selectedRegionId && selectedRegionId !== ALL_REGIONS_ID
          ? branches.filter((b: Branch) => b.region_id === selectedRegionId).map((b: Branch) => b.id)
          : branches.map((b: Branch) => b.id)
        if (branchIds.length === 0) {
          setForecasts([])
          setRawForecastRows([])
          setLoading(false)
          return
        }
        const aggregate = (forecastRows: any[], actualRows: any[]): ForecastResult[] => {
          const byKey = new Map<string, { forecast: number; budget: number; actual: number; lastMonth: number; lastYear: number }>()

          forecastRows.forEach(f => {
            const key = `${f.description}\t${f.month}`
            const cur = byKey.get(key)
            const forecast = Number(f.forecast_value)
            const budget = Number(f.budget_value)
            const lastMonth = Number(f.last_month_value)
            const lastYear = Number(f.last_year_value)
            if (!cur) {
              byKey.set(key, { forecast, budget, actual: 0, lastMonth, lastYear })
            } else {
              byKey.set(key, {
                forecast: cur.forecast + forecast,
                budget: cur.budget + budget,
                actual: 0,
                lastMonth: cur.lastMonth + lastMonth,
                lastYear: cur.lastYear + lastYear,
              })
            }
          })

          actualRows.forEach(a => {
            const key = `${a.description}\t${a.month}`
            const cur = byKey.get(key)
            const val = Number(a.value)
            if (cur) {
              cur.actual += val
            } else {
              byKey.set(key, { forecast: 0, budget: 0, actual: val, lastMonth: 0, lastYear: 0 })
            }
          })

          const result: ForecastResult[] = Array.from(byKey.entries()).map(([key, v]) => {
            const [description, monthStr] = key.split("\t")
            const month = Number(monthStr)
            const variance = v.forecast - v.budget
            const variancePercent = v.budget !== 0 ? (variance / v.budget) * 100 : 0
            return {
              description,
              month,
              forecastValue: v.forecast,
              budgetValue: v.budget,
              actualValue: v.actual,
              lastMonthValue: v.lastMonth,
              lastYearValue: v.lastYear,
              variance,
              variancePercent,
            }
          })
          result.sort((a, b) => (a.description.localeCompare(b.description) || a.month - b.month))
          return result
        }
        // Fetch all 12 months once; month dropdown only filters the display (no refetch)
        const CHUNK = 15
        const chunks: string[][] = []
        for (let i = 0; i < branchIds.length; i += CHUNK) {
          chunks.push(branchIds.slice(i, i + CHUNK))
        }
        // Fetch forecasts and actuals in parallel chunks
        const forecastChunks = await Promise.all(
          chunks.map((ids) =>
            fetchForecastRowsPaginated(() =>
              supabase.from("forecasts").select("*").in("branch_id", ids).eq("year", currentYear)
            )
          )
        )
        const actualChunks = await Promise.all(
          chunks.map((ids) =>
            supabase.from("actuals").select("*").in("branch_id", ids).eq("year", currentYear)
          )
        )

        const allForecastRows = forecastChunks.flat()
        const allActualRows = actualChunks.map(r => r.data || []).flat()

        if (allForecastRows.length > 0 || allActualRows.length > 0) {
          setForecasts(aggregate(allForecastRows, allActualRows))
          setRawForecastRows(allForecastRows)
        } else {
          setForecasts([])
          setRawForecastRows([])
        }
      } else {
        // Single branch view
        const [forecastRes, actualRes] = await Promise.all([
          fetchForecastRowsPaginated(() =>
            supabase.from("forecasts").select("*").eq("branch_id", selectedBranch).eq("year", currentYear)
          ),
          supabase.from("actuals").select("*").eq("branch_id", selectedBranch).eq("year", currentYear)
        ])

        const existingForecasts = forecastRes ?? []
        const existingActuals = actualRes.data ?? []

        const actualMap = new Map<string, number>()
        existingActuals.forEach(a => {
          actualMap.set(`${a.description}\t${a.month}`, Number(a.value))
        })

        if (existingForecasts.length > 0 || existingActuals.length > 0) {
          const formattedForecasts: ForecastResult[] = existingForecasts.map(f => ({
            description: f.description,
            month: f.month,
            forecastValue: f.forecast_value,
            budgetValue: f.budget_value,
            actualValue: actualMap.get(`${f.description}\t${f.month}`) || 0,
            lastMonthValue: f.last_month_value,
            lastYearValue: f.last_year_value,
            variance: f.forecast_value - f.budget_value,
            variancePercent: f.budget_value !== 0 ? ((f.forecast_value - f.budget_value) / f.budget_value) * 100 : 0,
          }))
          setForecasts(formattedForecasts)
        } else {
          setForecasts([])
        }
        setRawForecastRows(existingForecasts)
      }
    } catch (err) {
      console.error("Error loading forecasts:", err)
      setError("Failed to load forecasts")
    } finally {
      setLoading(false)
    }
  }, [selectedBranch, selectedRegionId, supabase, currentYear, branches, fetchForecastRowsPaginated])

  const fetchVersionRef = useRef(0)

  useEffect(() => {
    if (!selectedBranch) return
    const branchCount = selectedBranch === ALL_BRANCHES_ID ? branches.length : 0
    const key = `${selectedBranch}-${selectedRegionId}-${currentYear}-${branchCount}`
    if (lastFetchedKeyRef.current === key) return
    lastFetchedKeyRef.current = key
    // Increment version so stale in-flight fetches are discarded
    const version = ++fetchVersionRef.current
    loadForecasts().then(() => {
      // If another fetch was triggered while this one was in flight, discard these results
      if (fetchVersionRef.current !== version) {
        // A newer fetch is in progress; re-trigger with current selectedBranch
        lastFetchedKeyRef.current = null
      }
    })
  }, [selectedBranch, selectedRegionId, currentYear, branches.length, loadForecasts])

  // ── Fetch last month actuals from the last_month_actuals table ──
  const fetchLastMonthActuals = useCallback(async () => {
    if (!selectedBranch || !profile) return

    try {
      let query = supabase
        .from("last_month_actuals")
        .select("description, month, value")
        .eq("year", currentYear)

      if (selectedBranch === ALL_BRANCHES_ID) {
        if (profile.role === "hq_admin") {
          if (selectedRegionId && selectedRegionId !== ALL_REGIONS_ID) {
            query = query.eq("region_id", selectedRegionId)
          } else {
            query = query.eq("is_company_wide", true)
          }
        } else if (profile.role === "region_admin" && profile.region_id) {
          query = query.eq("region_id", profile.region_id)
        }
      } else {
        query = query.eq("branch_id", selectedBranch)
      }

      const { data, error: fetchErr } = await query
      if (fetchErr) {
        // Table may not exist yet — silently ignore
        if (fetchErr.code !== "PGRST204" && fetchErr.code !== "PGRST205") {
          console.error("Error fetching last month actuals:", fetchErr)
        }
        return
      }

      const map = new Map<string, number>()
      for (const row of data ?? []) {
        map.set(`${row.description}\t${row.month}`, Number(row.value))
      }
      setLastMonthActuals(map)
    } catch (err) {
      console.error("Error fetching last month actuals:", err)
    }
  }, [selectedBranch, selectedRegionId, profile, currentYear, supabase])

  useEffect(() => {
    fetchLastMonthActuals()
  }, [fetchLastMonthActuals])

  // ── File selection handler ──
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ""
    setSelectedFile(file)
  }

  // ── Upload actuals handler (client-side Excel parsing) ──
  const handleUploadActuals = async () => {
    const file = selectedFile
    if (!file) return

    setUploading(true)
    try {
      // 1. Parse Excel in the browser
      const arrayBuffer = await file.arrayBuffer()
      const workbook = XLSX.read(new Uint8Array(arrayBuffer), { type: "array" })

      // Constants matching the Excel P&L layout
      const DESC_COL_T = 19, MONTH_START = 20, MONTH_END = 31, HDR_ROW = 8
      const SKIP_DESCS = new Set(["line of bus", "district", "gl", "period", "orkin canada", "spare row", "spare", "actual", "*", ""])
      const SKIP_PREFIXES = ["toc", "travel", "mktg dept"]
      const SKIP_SUFFIXES = [" oh", " cc", " qa", " sales"]
      const SKIP_EXACT = new Set(["024 atlas e", "028 atlas w", "functionals", "ntl accts (total)", "ttl qa"])
      const SKIP_TTL = new Set(["ttl pac_gvr", "ttl island", "ttl barrie", "ttl edm", "ttl sask & reg", "ttl gta res", "ttl nfld"])

      const toNum = (v: unknown): number | null => {
        if (v === undefined || v === null || v === "") return null
        if (typeof v === "number" && !Number.isNaN(v)) return v
        const n = parseFloat(String(v).replace(/,/g, ""))
        return Number.isNaN(n) ? null : n
      }

      const shouldSkip = (t: string) => {
        if (SKIP_EXACT.has(t) || SKIP_TTL.has(t)) return true
        if (SKIP_PREFIXES.some(p => t.startsWith(p))) return true
        if (SKIP_SUFFIXES.some(s => t.endsWith(s))) return true
        if (/^\d{3}\s/.test(t)) {
          const num = parseInt(t, 10)
          if ((num >= 400 && num < 500) || (num >= 600 && num < 700) || (num >= 800 && num < 1000)) return true
        }
        return false
      }

      // 2. Build master description map from ORKIN CANADA column T (single source of truth)
      const masterDescByRow = new Map<number, string>()
      const canadaSheet = workbook.Sheets["ORKIN CANADA"]
      if (!canadaSheet) {
        toast.error("Excel file is missing the ORKIN CANADA sheet")
        return
      }
      const canadaRows = XLSX.utils.sheet_to_json(canadaSheet, { header: 1, defval: "" }) as unknown[][]
      for (let i = HDR_ROW + 1; i < canadaRows.length; i++) {
        const desc = String(canadaRows[i]?.[DESC_COL_T] ?? "").trim()
        if (desc && !SKIP_DESCS.has(desc.toLowerCase()) && !/^\d+$/.test(desc)) {
          masterDescByRow.set(i, desc)
        }
      }

      // 3. Detect year and last month with data
      let detectedYear: number | null = null
      let lastMonth = 0

      for (let r = 0; r < Math.min(canadaRows.length, 10); r++) {
        for (let c = 0; c < (canadaRows[r]?.length || 0); c++) {
          const m = String(canadaRows[r][c] || "").match(/\b(202[0-9])\b/)
          if (m) { detectedYear = parseInt(m[1], 10); break }
        }
        if (detectedYear) break
      }

      for (let i = HDR_ROW + 1; i < canadaRows.length; i++) {
        if (!masterDescByRow.has(i)) continue
        for (let m = MONTH_END; m >= MONTH_START; m--) {
          const val = toNum(canadaRows[i][m])
          if (val !== null && val !== 0) {
            const mo = m - MONTH_START + 1
            if (mo > lastMonth) lastMonth = mo
            break
          }
        }
      }

      if (!detectedYear || lastMonth === 0) {
        toast.error("Could not detect year or month from the Excel file")
        return
      }

      const months = Array.from({ length: lastMonth }, (_, i) => i + 1)

      // 4. Extract data from each relevant sheet using master descriptions
      const sheets: Array<{ tabName: string; rows: Array<{ description: string; month: number; value: number }> }> = []

      for (const name of workbook.SheetNames) {
        const low = name.trim().toLowerCase()
        if (shouldSkip(low)) continue

        const rows = XLSX.utils.sheet_to_json(workbook.Sheets[name], { header: 1, defval: "" }) as unknown[][]
        const extracted: Array<{ description: string; month: number; value: number }> = []

        for (const [rowIdx, desc] of masterDescByRow) {
          const row = rows[rowIdx] || []
          for (const mo of months) {
            const colIdx = MONTH_START + mo - 1
            extracted.push({ description: desc, month: mo, value: toNum(row[colIdx]) ?? 0 })
          }
        }

        if (extracted.length > 0) {
          sheets.push({ tabName: name, rows: extracted })
        }
      }

      // 5. Send parsed data to API
      const res = await fetch("/api/upload-actuals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ year: detectedYear, months, sheets }),
      })

      const result = await res.json()

      if (!res.ok) {
        toast.error(result.error || "Upload failed")
        return
      }

      toast.success(
        `Actuals uploaded — ${result.branchesMatched} branches, ${result.regionsMatched} regions, ${result.monthRange} ${result.year}`
      )

      setSelectedFile(null)

      // Refresh the actuals data
      await fetchLastMonthActuals()
    } catch (err) {
      console.error("Upload error:", err)
      toast.error("Failed to process actuals file")
    } finally {
      setUploading(false)
    }
  }

  // ──────────────────────────────────────────────────────────────
  // P&L recalculation constants
  // Derived rows that are auto-computed from leaf items
  // ──────────────────────────────────────────────────────────────
  const DERIVED_ROW_CONTRIBUTION = "CONTRIBUTION B/4 OVERHEAD"
  const DERIVED_ROW_OPERATING_PROFIT = "OPERATING PROFIT"
  const DERIVED_ROW_BONUS_OPERATING_PROFIT = "BONUS OPERATING PROFIT"
  const DERIVED_ROW_EXTERNAL_PROFIT = "EXTERNAL PROFIT"
  const DERIVED_ROW_NET_PROFIT = "NET PROFIT"
  const TOTAL_NET_REVENUE = "TOTAL NET REVENUE"
  const TOTAL_EXPENSES = "TOTAL EXPENSES"
  const TOTAL_OVERHEAD_ALLOCATIONS = "TOTAL OVERHEAD ALLOCATIONS"
  const OVERHEAD_ALLOCATION_REVERSAL = "OVERHEAD ALLOCATION REVERSAL"
  const HOME_OFFICE_OVERHEAD = "HOME OFFICE OVERHEAD"
  const ACQUISITION_COST = "ACQUISITION COST"
  const ULTIPRO_FEES = "ULTIPRO COST"
  const FOREIGN_EXCHANGE = "FOREIGN EXCHANGE GAIN/LOSS"
  const ROYALTY_FEES = "ROYALTY FEES"
  const INTEREST_EXPENSE = "INTEREST EXPENSE ORKIN"
  const CANADIAN_TAXES = "CANADIAN TAXES"
  const NON_OP_INT = "NON-OP INT EXP/(REV)"

  // ── DEPRECATED: recalcDerivedRows ──────────────────────────────────────────
  // Previously used after edits to recalculate only 8 top-level P&L rows.
  // Replaced by recomputeAllSubtotals() which handles all 43 subtotal rules
  // (intermediate subtotals like SUBTOTAL MONTHLY, GROSS CONTRACT REVENUE, etc.)
  // Kept commented for reference.
  //
  // function recalcDerivedRows(allForecasts: ForecastResult[], targetMonth: number): Map<string, number> {
  //   const leafRows = allForecasts.filter(f => f.month === targetMonth && isLeafDescription(f.description))
  //   let totalRevenue = 0, totalExpenses = 0, totalOverhead = 0
  //   leafRows.forEach(r => {
  //     const d = normDesc(r.description)
  //     if (isRevenueLine(d)) totalRevenue += r.forecastValue
  //     else if (d.includes("ALLOCATIONS")) totalOverhead += r.forecastValue
  //     else totalExpenses += r.forecastValue
  //   })
  //   const get = (desc: string) => {
  //     const row = allForecasts.find(f => normDesc(f.description) === normDesc(desc) && f.month === targetMonth)
  //     return row ? row.forecastValue : 0
  //   }
  //   const contribution = totalRevenue - totalExpenses
  //   const operatingProfit = contribution - totalOverhead
  //   const bonusOperatingProfit = operatingProfit - get(OVERHEAD_ALLOCATION_REVERSAL)
  //   const externalProfit = bonusOperatingProfit - get(HOME_OFFICE_OVERHEAD) - get(ACQUISITION_COST) - get(ULTIPRO_FEES)
  //   const netProfit = externalProfit - get(FOREIGN_EXCHANGE) - get(ROYALTY_FEES) - get(INTEREST_EXPENSE) - get(CANADIAN_TAXES) - get(NON_OP_INT)
  //   const derivedMap = new Map<string, number>()
  //   derivedMap.set(normDesc(TOTAL_NET_REVENUE), Math.round(totalRevenue * 100) / 100)
  //   derivedMap.set(normDesc(TOTAL_EXPENSES), Math.round(totalExpenses * 100) / 100)
  //   derivedMap.set(normDesc(TOTAL_OVERHEAD_ALLOCATIONS), Math.round(totalOverhead * 100) / 100)
  //   derivedMap.set(normDesc(DERIVED_ROW_CONTRIBUTION), Math.round(contribution * 100) / 100)
  //   derivedMap.set(normDesc(DERIVED_ROW_OPERATING_PROFIT), Math.round(operatingProfit * 100) / 100)
  //   derivedMap.set(normDesc(DERIVED_ROW_BONUS_OPERATING_PROFIT), Math.round(bonusOperatingProfit * 100) / 100)
  //   derivedMap.set(normDesc(DERIVED_ROW_EXTERNAL_PROFIT), Math.round(externalProfit * 100) / 100)
  //   derivedMap.set(normDesc(DERIVED_ROW_NET_PROFIT), Math.round(netProfit * 100) / 100)
  //   return derivedMap
  // }

  const handleUpdateForecast = async (description: string, month: number, newValue: number) => {
    if (!selectedBranch || selectedBranch === ALL_BRANCHES_ID) return

    // Find the old value for audit logging
    const oldRow = forecasts.find(f => f.description === description && f.month === month)
    const oldValue = oldRow?.forecastValue ?? 0

    // Log the edit to the audit trail (non-blocking – table may not exist yet)
    if (userId && oldValue !== newValue) {
      supabase
        .from("forecast_audit_log")
        .insert({
          user_id: userId,
          branch_id: selectedBranch,
          description,
          year: currentYear,
          month,
          old_value: oldValue,
          new_value: newValue,
        })
        .then(({ error: auditErr }) => {
          if (auditErr && auditErr.code !== "PGRST205") {
            console.error("Error logging forecast edit:", auditErr)
          }
        })
    }

    // 1. Update the edited row in the database
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
      toast.error("Failed to save forecast update")
      return
    }

    toast.success(`${description} updated for ${getShortMonthName(month)}`)

    // 2. Build a working copy with the new value applied
    const updatedForecasts = forecasts.map(f => {
      if (f.description === description && f.month === month) {
        return { ...f, forecastValue: newValue }
      }
      return f
    })

    // 3. Recompute ALL subtotals (intermediate + top-level) using the full hierarchy rules
    const finalForecasts = recomputeAllSubtotals(updatedForecasts)

    // 4. Diff against old state to find which subtotal rows changed for DB persistence
    const dbUpdates: { description: string; value: number }[] = []
    const oldByKey = new Map<string, number>()
    forecasts.forEach(f => {
      if (f.month === month) oldByKey.set(normDesc(f.description), f.forecastValue)
    })
    finalForecasts.forEach(f => {
      if (f.month !== month) return
      const nd = normDesc(f.description)
      const oldVal = oldByKey.get(nd)
      // Persist any row whose forecast value changed (subtotals + the edited leaf)
      if (oldVal !== undefined && Math.abs(f.forecastValue - oldVal) > 0.001 && nd !== normDesc(description)) {
        dbUpdates.push({ description: f.description, value: f.forecastValue })
      }
    })

    setForecasts(finalForecasts)

    // 5. Persist subtotal updates to database (fire-and-forget)
    if (dbUpdates.length > 0) {
      const now = new Date().toISOString()
      Promise.all(
        dbUpdates.map(u =>
          supabase
            .from("forecasts")
            .update({ forecast_value: u.value, updated_at: now })
            .eq("branch_id", selectedBranch)
            .eq("description", u.description)
            .eq("year", currentYear)
            .eq("month", month)
        )
      ).catch(err => console.error("Error saving subtotal rows:", err))
    }
  }

  // ── Recompute subtotals & override overhead allocations for display ──
  const processedForecasts = useMemo(() => recomputeAllSubtotals(forecasts), [forecasts])

  const descriptions = [...new Set(processedForecasts.map(f => f.description))]
  const filteredByCategory =
    selectedDescription === "all"
      ? processedForecasts
      : processedForecasts.filter((f) => f.description === selectedDescription)
  const searchLower = searchQuery.trim().toLowerCase()
  const filteredForecasts =
    searchLower === ""
      ? filteredByCategory
      : filteredByCategory.filter((f) =>
        f.description.toLowerCase().includes(searchLower)
      )

  // Chart: when "All Categories" show KPI-only totals (same as summary cards); otherwise show selected category
  const chartForecasts =
    selectedDescription === "all"
      ? processedForecasts.filter((f) => {
        const d = normDesc(f.description)
        return d === KPI_REVENUE || KPI_EXPENSE_LINES.has(d)
      })
      : filteredForecasts

  // Summary stats: read directly from subtotal rows so cards match the table exactly
  const monthRows = processedForecasts.filter(f => f.month === currentMonth)
  const findMonthRow = (desc: string) => monthRows.find(f => normDesc(f.description) === normDesc(desc))

  const revenueRow = findMonthRow("TOTAL NET REVENUE")
  const expenseRow = findMonthRow("TOTAL EXPENSES")
  const contributionRow = findMonthRow("CONTRIBUTION B/4 OVERHEAD")

  const revenueForecast = revenueRow?.forecastValue ?? 0
  const revenueBudget = revenueRow?.budgetValue ?? 0
  const expenseForecast = expenseRow?.forecastValue ?? 0
  const expenseBudget = expenseRow?.budgetValue ?? 0
  const contributionForecast = contributionRow?.forecastValue ?? 0
  const contributionBudget = contributionRow?.budgetValue ?? 0

  const revenueVariance = revenueForecast - revenueBudget
  const revenueVariancePct = revenueBudget !== 0 ? (revenueVariance / revenueBudget) * 100 : 0
  const expenseVariance = expenseForecast - expenseBudget
  const expenseVariancePct = expenseBudget !== 0 ? (expenseVariance / expenseBudget) * 100 : 0
  const contributionVariance = contributionForecast - contributionBudget
  const contributionPct = contributionBudget !== 0 ? (contributionVariance / Math.abs(contributionBudget)) * 100 : 0

  // Full-year totals (all 12 months)
  const monthsPresent = new Set(processedForecasts.map((f) => f.month))
  const hasFullYearData = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].every((m) => monthsPresent.has(m))

  const findAnnualTotal = (desc: string) => {
    const rows = processedForecasts.filter(f => normDesc(f.description) === normDesc(desc))
    return {
      forecast: rows.reduce((sum, f) => sum + f.forecastValue, 0),
      budget: rows.reduce((sum, f) => sum + f.budgetValue, 0),
    }
  }

  const annualRevenue = findAnnualTotal("TOTAL NET REVENUE")
  const annualExpense = findAnnualTotal("TOTAL EXPENSES")
  const annualContribution = findAnnualTotal("CONTRIBUTION B/4 OVERHEAD")

  const annualRevenueForecast = annualRevenue.forecast
  const annualRevenueBudget = annualRevenue.budget
  const annualExpenseForecast = annualExpense.forecast
  const annualExpenseBudget = annualExpense.budget
  const annualContributionForecast = annualContribution.forecast
  const annualContributionBudget = annualContribution.budget
  const annualContributionVariance = annualContributionForecast - annualContributionBudget

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
    a.download = `forecast_${currentYear}_${selectedBranch === ALL_BRANCHES_ID ? "all" : selectedBranch}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const downloadMethodologyPdf = () => {
    if (typeof window === "undefined") return
    window.print()
  }

  const viewLevelLabel =
    selectedBranch === ALL_BRANCHES_ID
      ? profile?.role === "region_admin"
        ? "Region level"
        : selectedRegionId && selectedRegionId !== ALL_REGIONS_ID
          ? "Region: " + (regionsList.find((r) => r.id === selectedRegionId)?.name ?? "Region")
          : "HQ level"
      : (() => {
        const b = branches.find((x: Branch) => x.id === selectedBranch)
        return b ? `Branch: ${b.name}` : "Branch level"
      })()

  if (loading && !profile) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  if (needsBranchAssignment) {
    return (
      <div className="space-y-6 min-w-0">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Budget vs Forecast</h1>
          <p className="text-sm sm:text-base text-muted-foreground mt-1">
            View and generate forecasts for your branch.
          </p>
        </div>
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Your branch has not been assigned yet. You need a branch assignment to view and generate forecasts.
            Please contact your administrator to assign your branch, or if you signed up recently, ensure you selected
            your region and branch during registration.
          </AlertDescription>
        </Alert>
      </div>
    )
  }

  return (
    <div className="space-y-6 min-w-0">
      <div className="flex flex-col gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Budget vs Forecast</h1>
          <p className="text-sm sm:text-base text-muted-foreground mt-1">
            View budget and forecast at HQ, region, or branch for {currentYear} (as of {getShortMonthName(currentMonth)}). Variance = Forecast − Budget.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={String(currentYear)} onValueChange={(v) => setCurrentYear(Number(v))}>
            <SelectTrigger className="w-full sm:w-[100px]">
              <SelectValue placeholder="Year" />
            </SelectTrigger>
            <SelectContent>
              {years.map((y) => (
                <SelectItem key={y} value={String(y)}>{y}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={String(currentMonth)} onValueChange={(v) => setCurrentMonth(Number(v))}>
            <SelectTrigger className="w-full sm:w-[110px]">
              <SelectValue placeholder="As of month" />
            </SelectTrigger>
            <SelectContent>
              {months.map((m) => (
                <SelectItem key={m.value} value={String(m.value)}>{m.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {profile?.role === "hq_admin" && selectedBranch === ALL_BRANCHES_ID && regionsList.length > 0 && (
            <Select value={selectedRegionId} onValueChange={setSelectedRegionId}>
              <SelectTrigger className="w-full sm:w-[220px]">
                <SelectValue placeholder="Region" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_REGIONS_ID}>All regions (HQ total)</SelectItem>
                {regionsList.map((r) => (
                  <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {profile?.role !== "branch_user" && branches.length > 0 && (
            <Select value={selectedBranch || ALL_BRANCHES_ID} onValueChange={(v) => { setSelectedBranch(v); if (v !== ALL_BRANCHES_ID) setSelectedRegionId(ALL_REGIONS_ID) }}>
              <SelectTrigger className="w-full sm:w-[260px]">
                <SelectValue placeholder="Select branch" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_BRANCHES_ID}>
                  {profile?.role === "region_admin" ? "All branches in region (summary)" : "All branches (summary)"}
                </SelectItem>
                {(() => {
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
            variant="outline"
            onClick={exportToCSV}
            disabled={forecasts.length === 0}
          >
            <Download className="mr-2 h-4 w-4" />
            Export
          </Button>
          {profile?.role === "hq_admin" && (
            <>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xlsm"
                className="hidden"
                onChange={handleFileSelect}
              />
              <Button
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
              >
                <Upload className="mr-2 h-4 w-4" />
                {selectedFile ? selectedFile.name : "Select Actuals File"}
              </Button>
              {selectedFile && (
                <Button
                  onClick={handleUploadActuals}
                  disabled={uploading}
                >
                  {uploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
                  {uploading ? "Uploading…" : "Upload"}
                </Button>
              )}
            </>
          )}
        </div>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg font-semibold">How the 2026 forecasts are generated</CardTitle>
          <CardDescription>
            This app uses Seasonal naive + growth + driver-based adjustments: 2025 seasonal pattern with YoY growth from 2024→2025, plus working days and seasonal index (unbiased, no budget input).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowMethodology((v) => !v)}
            >
              {showMethodology ? "Hide full explanation" : "Read full explanation"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={downloadMethodologyPdf}
            >
              <Download className="mr-2 h-4 w-4" />
              Download as PDF
            </Button>
          </div>

          {showMethodology && (
            <div className="prose prose-sm max-w-none text-muted-foreground space-y-2 mt-3">
              <p>
                The 2026 forecasts are generated entirely from historical data stored in Supabase – no 2026 actuals are used and there is no manual tuning to force the numbers toward any target.
                The input data consists of:
              </p>
              <ul className="list-disc pl-5">
                <li>
                  <strong>Actuals:</strong> 2023–2025 branch-level monthly actuals imported from the workbook using the import scripts.
                </li>
                <li>
                  <strong>Budgets:</strong> 2026 branch-level monthly budgets imported from the per-branch 2026 budget files (used for comparison only, not for forecasting).
                </li>
              </ul>
              <p>
                For each branch and each line item (for example <strong>TOTAL NET REVENUE</strong> or a specific expense line), we use a 36-month history (2023–2025). The series is cleaned by mapping description names consistently across years and deduplicating any duplicated (year, month, description) rows per branch.
              </p>
              <p>
                The forecast uses <strong>Seasonal naive + growth</strong> with a driver-based layer: it keeps the seasonal pattern from 2025 (which month is high/low), applies the YoY growth rate from 2024→2025, then adjusts for working days and a global seasonal index. No budget is used as input – the model is unbiased.
              </p>
              <p>
                Formula per branch and line item:
              </p>
              <ol className="list-decimal pl-5">
                <li>Start with 2025 same month (or 2024 if 2025 missing).</li>
                <li>growth = (2025_annual ÷ 2024_annual) − 1 (or 0 if prior year has no data).</li>
                <li>base[m] = max(0, 2025[m] × (1 + growth)).</li>
                <li>Apply working days: base[m] × (wd_2026[m] ÷ wd_2025[m]).</li>
                <li>Apply seasonal index (global pattern from 2023–2025 history).</li>
              </ol>
              <p>
                The key point is that the model uses only 2023–2025 history – no budget input. When we
                generate 2026 forecasts, we do not look at 2026 actuals or adjust forecasts to match any known 2026 figures. This makes the 2026 numbers true model forecasts, suitable for honest
                forecast-versus-budget comparison at branch, region, and HQ level.
              </p>
              <p>
                The dashboard you are viewing simply reads these precomputed 2026 forecasts from Supabase, aggregates them by branch, region, or HQ, and displays the variance between <strong>forecast</strong> and
                <strong> budget</strong> for the selected month, category, and level.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {selectedBranch === ALL_BRANCHES_ID && (
        <Alert className="bg-muted/50">
          <AlertDescription>
            {profile?.role === "region_admin"
              ? "Region level: summation of forecast and budget for all branches in your region. Compare variance below; select a branch to see branch-level detail."
              : selectedRegionId && selectedRegionId !== ALL_REGIONS_ID
                ? "Region level: budget and forecast totals for this region. Compare variance below; select a branch to drill down or choose another region above."
                : "HQ level: budget and forecast totals for all branches. Use the Region dropdown to view a single region, or select a branch for branch detail."}
          </AlertDescription>
        </Alert>
      )}
      {selectedBranch && selectedBranch !== ALL_BRANCHES_ID && (
        <Alert className="bg-muted/50">
          <AlertDescription>
            {profile?.role === "branch_user"
              ? "Branch level: view-only. Budget and forecast for your branch; variance shows forecast vs budget."
              : "Branch level: budget and forecast for this branch. Variance = Forecast − Budget. You can edit forecast values in the table."}
          </AlertDescription>
        </Alert>
      )}

      {(selectedBranch === ALL_BRANCHES_ID || (selectedBranch && selectedBranch !== ALL_BRANCHES_ID)) && (loading || forecasts.length > 0) && (
        <>
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <Badge variant="secondary">{viewLevelLabel}</Badge>
            <span className="min-w-0">
              {loading ? "Loading…" : "— comparing budget to forecast for selected month"}
            </span>
          </div>
          {!loading && forecasts.length > 0 && hasFullYearData && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Card className="border-primary/20 bg-primary/5">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    {currentYear} full year · Revenue
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-xl font-bold">Forecast {formatCurrency(annualRevenueForecast)}</div>
                  <p className="text-xs text-muted-foreground">Budget {formatCurrency(annualRevenueBudget)}</p>
                  {/* <p className={cn("text-xs mt-1 font-medium", annualRevenueForecast >= annualRevenueBudget ? "text-accent" : "text-destructive")}>
                    Variance {annualRevenueForecast >= annualRevenueBudget ? "+" : ""}{formatCurrency(annualRevenueForecast - annualRevenueBudget)}
                  </p> */}
                </CardContent>
              </Card>
              <Card className="border-primary/20 bg-primary/5">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    {currentYear} full year · Expenses
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-xl font-bold">Forecast {formatCurrency(annualExpenseForecast)}</div>
                  <p className="text-xs text-muted-foreground">Budget {formatCurrency(annualExpenseBudget)}</p>
                  {/* <p className={cn("text-xs mt-1 font-medium", annualExpenseForecast <= annualExpenseBudget ? "text-accent" : "text-destructive")}>
                    Variance {annualExpenseForecast <= annualExpenseBudget ? "" : "+"}{formatCurrency(annualExpenseForecast - annualExpenseBudget)}
                  </p> */}
                </CardContent>
              </Card>
              <Card className="border-accent/20 bg-accent/5">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    {currentYear} full year · Contribution B/4 Overhead
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-xl font-bold">Forecast {formatCurrency(annualContributionForecast)}</div>
                  <p className="text-xs text-muted-foreground">Budget {formatCurrency(annualContributionBudget)}</p>
                  {/* <p className={cn("text-xs mt-1 font-medium", annualContributionForecast >= annualContributionBudget ? "text-accent" : "text-destructive")}>
                    Variance {annualContributionForecast >= annualContributionBudget ? "+" : ""}{formatCurrency(annualContributionVariance)}
                  </p> */}
                </CardContent>
              </Card>
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {loading ? (
              <>
                {[1, 2, 3].map((i) => (
                  <Card key={i}>
                    <CardHeader className="pb-2">
                      <Skeleton className="h-4 w-24" />
                    </CardHeader>
                    <CardContent>
                      <Skeleton className="h-8 w-28 mb-2" />
                      <Skeleton className="h-3 w-20" />
                    </CardContent>
                  </Card>
                ))}
              </>
            ) : (
              <>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">
                      Monthly Revenue · {getShortMonthName(currentMonth)}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{formatCurrency(revenueForecast)}</div>
                    <div className="flex items-center justify-between mt-1">
                      <p className="text-xs text-muted-foreground">Budget: {formatCurrency(revenueBudget)}</p>
                      <p className={cn("text-xs font-medium", revenueVariance >= 0 ? "text-accent" : "text-destructive")}>
                        {formatPercent(revenueVariancePct)}
                      </p>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">
                      Monthly Expenses · {getShortMonthName(currentMonth)}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{formatCurrency(expenseForecast)}</div>
                    <div className="flex items-center justify-between mt-1">
                      <p className="text-xs text-muted-foreground">Budget: {formatCurrency(expenseBudget)}</p>
                      <p className={cn("text-xs font-medium", expenseVariance <= 0 ? "text-accent" : "text-destructive")}>
                        {formatPercent(expenseVariancePct)}
                      </p>
                    </div>
                  </CardContent>
                </Card>

                <Card className="border-accent/20">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">
                      Contribution B/4 Overhead · {getShortMonthName(currentMonth)}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{formatCurrency(contributionForecast)}</div>
                    <div className="flex items-center justify-between mt-1">
                      <p className="text-xs text-muted-foreground">Budget: {formatCurrency(contributionBudget)}</p>
                      <p className={cn("text-xs font-medium", contributionVariance >= 0 ? "text-accent" : "text-destructive")}>
                        {formatPercent(contributionPct)}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              </>
            )}
          </div>

          {selectedBranch === ALL_BRANCHES_ID && branchBreakdown.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Branch contribution · {getShortMonthName(currentMonth)} {currentYear}</CardTitle>
                <CardDescription>
                  Each branch&apos;s contribution to revenue and expenses. Compare side by side.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[600px] text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-3 px-2 font-medium">Branch</th>
                        <th className="text-right py-3 px-2 font-medium">Revenue (F)</th>
                        <th className="text-right py-3 px-2 font-medium">Revenue (B)</th>
                        <th className="text-right py-3 px-2 font-medium">Expense (F)</th>
                        <th className="text-right py-3 px-2 font-medium">Expense (B)</th>
                        <th className="text-right py-3 px-2 font-medium">Net Profit (F)</th>
                        <th className="text-right py-3 px-2 font-medium">Net Profit (B)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {branchBreakdown.map((row) => (
                        <tr key={row.branch.id} className="border-b last:border-0 hover:bg-muted/30">
                          <td className="py-2 px-2 font-medium">
                            <button
                              type="button"
                              onClick={() => setSelectedBranch(row.branch.id)}
                              className="text-primary hover:underline text-left inline-flex flex-col items-start gap-0.5"
                            >
                              <span>{row.branch.name}</span>
                              <span className="text-[10px] text-muted-foreground font-normal uppercase">{row.branch.code}</span>
                            </button>
                          </td>
                          <td className="text-right py-2 px-2">{formatCurrency(row.revenueForecast)}</td>
                          <td className="text-right py-2 px-2 text-muted-foreground">{formatCurrency(row.revenueBudget)}</td>
                          <td className="text-right py-2 px-2">{formatCurrency(row.expenseForecast)}</td>
                          <td className="text-right py-2 px-2 text-muted-foreground">{formatCurrency(row.expenseBudget)}</td>
                          <td className="text-right py-2 px-2 font-bold">{formatCurrency(row.netProfitForecast)}</td>
                          <td className="text-right py-2 px-2">
                            <div className="flex flex-col items-end">
                              <span className="text-muted-foreground">{formatCurrency(row.netProfitBudget)}</span>
                              <span className={cn("text-[10px] font-medium", (row.netProfitForecast - row.netProfitBudget) >= 0 ? "text-accent" : "text-destructive")}>
                                {(row.netProfitForecast - row.netProfitBudget) >= 0 ? "+" : ""}{formatCurrency(row.netProfitForecast - row.netProfitBudget)}
                              </span>
                            </div>
                          </td>
                        </tr>
                      ))}
                      <tr className="bg-muted/30 font-bold">
                        <td className="py-3 px-2">HQ Total ({branchBreakdown.length} branches)</td>
                        <td className="text-right py-3 px-2">
                          {formatCurrency(branchBreakdown.reduce((sum, b) => sum + b.revenueForecast, 0))}
                        </td>
                        <td className="text-right py-3 px-2">
                          {formatCurrency(branchBreakdown.reduce((sum, b) => sum + b.revenueBudget, 0))}
                        </td>
                        <td className="text-right py-3 px-2">
                          {formatCurrency(branchBreakdown.reduce((sum, b) => sum + b.expenseForecast, 0))}
                        </td>
                        <td className="text-right py-3 px-2">
                          {formatCurrency(branchBreakdown.reduce((sum, b) => sum + b.expenseBudget, 0))}
                        </td>
                        <td className="text-right py-3 px-2">
                          {formatCurrency(branchBreakdown.reduce((sum, b) => sum + b.netProfitForecast, 0))}
                        </td>
                        <td className="text-right py-3 px-2">
                          {formatCurrency(branchBreakdown.reduce((sum, b) => sum + b.netProfitBudget, 0))}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <div className="flex flex-col gap-4">
                <div>
                  <CardTitle>Budget vs Forecast by Category</CardTitle>
                  <CardDescription>Monthly breakdown: budget and forecast by line item. Variance = Forecast − Budget. Use search and filter to narrow results.</CardDescription>
                </div>
                <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                  <div className="relative flex-1 w-full sm:max-w-xs">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      placeholder="Search categories..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-9"
                    />
                  </div>
                  <Select value={selectedDescription} onValueChange={setSelectedDescription}>
                    <SelectTrigger className="w-full sm:w-[200px]">
                      <SelectValue placeholder="Filter by category" />
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
                  {(searchQuery.trim() || selectedDescription !== "all") && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setSearchQuery("")
                        setSelectedDescription("all")
                      }}
                    >
                      Clear
                    </Button>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {selectedBranch === ALL_BRANCHES_ID && profile?.role !== "branch_user" && (
                <div className="mb-4 flex items-center gap-2 text-sm text-amber-600 dark:text-amber-500 bg-amber-50 dark:bg-amber-950/40 rounded-md p-3 border border-amber-200 dark:border-amber-800">
                  <Pencil className="h-4 w-4 shrink-0" />
                  <span>To edit forecast values, select a specific branch from the dropdown above or click a branch name in the Branch contribution table.</span>
                </div>
              )}
              {selectedBranch !== ALL_BRANCHES_ID && (
                <div className="mb-4 flex items-center gap-2 text-sm text-muted-foreground bg-muted/50 rounded-md p-3">
                  <Pencil className="h-4 w-4" />
                  <span>Click on any cell in the table view to adjust forecast values by description and month.</span>
                </div>
              )}
              <Tabs defaultValue="chart">
                <TabsList>
                  <TabsTrigger value="chart">Chart</TabsTrigger>
                  <TabsTrigger value="line">Line Graph</TabsTrigger>
                  <TabsTrigger value="table">Table</TabsTrigger>
                </TabsList>
                <TabsContent value="chart" className="mt-4">
                  <ForecastBarChart
                    forecasts={chartForecasts}
                    currentMonth={currentMonth}
                  />
                </TabsContent>
                <TabsContent value="line" className="mt-4">
                  <ForecastChart
                    forecasts={chartForecasts}
                    currentMonth={currentMonth}
                  />
                </TabsContent>
                <TabsContent value="table" className="mt-4">
                  <ForecastTable
                    forecasts={filteredForecasts}
                    currentMonth={currentMonth}
                    onUpdateForecast={handleUpdateForecast}
                    editable={profile?.role !== "branch_user" && selectedBranch !== ALL_BRANCHES_ID}
                    lastMonthActuals={lastMonthActuals}
                  />
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </>
      )}

      {(selectedBranch === ALL_BRANCHES_ID || selectedBranch) && loading && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Loader2 className="h-10 w-10 animate-spin text-primary mb-4" />
            <p className="text-muted-foreground">
              {selectedBranch === ALL_BRANCHES_ID ? "Loading summary…" : "Loading your branch data…"}
            </p>
          </CardContent>
        </Card>
      )}

      {selectedBranch === ALL_BRANCHES_ID && forecasts.length === 0 && !loading && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <LineChart className="h-12 w-12 text-muted-foreground mb-4" />
            <h2 className="text-xl font-semibold">
              {profile?.role === "region_admin" && branches.length === 0
                ? "No branches in your region"
                : "No Summary Data Yet"}
            </h2>
            <p className="text-muted-foreground mt-2 text-center max-w-md">
              {profile?.role === "region_admin" && branches.length === 0 ? (
                <>Your region has no branches assigned. Contact your administrator to assign branches to your region.</>
              ) : profile?.role === "region_admin" ? (
                <>No forecast data has been generated for the branches in your region yet. Forecasts are derived from imported Excel data. Contact your administrator to import data, or select a branch below to check if it has forecasts.</>
              ) : (
                <>Forecasts are derived from each branch&apos;s three-year data. Select a branch to view its forecasts; the summary here will show totals once branch forecasts are available.</>
              )}
            </p>
          </CardContent>
        </Card>
      )}

      {selectedBranch && selectedBranch !== ALL_BRANCHES_ID && forecasts.length === 0 && !loading && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <LineChart className="h-12 w-12 text-muted-foreground mb-4" />
            <h2 className="text-xl font-semibold">No Forecasts Yet</h2>
            <p className="text-muted-foreground mt-2 text-center max-w-md">
              Forecasts are derived from this branch&apos;s pre-loaded three-year data. They will appear here when available.
            </p>
          </CardContent>
        </Card>
      )}

      {!selectedBranch && profile?.role === "branch_user" && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <LineChart className="h-12 w-12 text-muted-foreground mb-4" />
            <h2 className="text-xl font-semibold">Branch not assigned</h2>
            <p className="text-muted-foreground mt-2 text-center max-w-md">
              Your account is not assigned to a branch. Contact your administrator to get access.
            </p>
          </CardContent>
        </Card>
      )}

      {!selectedBranch && profile?.role !== "branch_user" && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <LineChart className="h-12 w-12 text-muted-foreground mb-4" />
            <h2 className="text-xl font-semibold">Select a Branch</h2>
            <p className="text-muted-foreground mt-2">
              Choose a branch to view forecasts.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
