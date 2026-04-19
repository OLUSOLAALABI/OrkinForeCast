"use client"

import { useState, Fragment } from "react"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Pencil, Check, X, Loader2, Calendar, CalendarDays, TrendingUp, TrendingDown, BarChart3, Filter, ArrowDownAZ, ListOrdered } from "lucide-react"
import {
  type ForecastResult,
  getShortMonthName,
  formatCurrency,
  formatPercent,
  isSubtotalDescription,
  isLeafDescription,
  normDesc,
  isRevenueLine,
  isExpenseLine
} from "@/lib/forecasting"
import { cn } from "@/lib/utils"

const KPI_REVENUE = "TOTAL NET REVENUE"
const KPI_EXPENSE_LINES = new Set(["TOTAL EXPENSES", "TOTAL OVERHEAD ALLOCATIONS"])

// Items hidden from display (below External Profit)
const HIDDEN_BELOW_EXTERNAL = new Set([
  "FOREIGN EXCHANGE GAIN/LOSS",
  "ROYALTY FEES",
  "INTEREST EXPENSE ORKIN",
  "CANADIAN TAXES",
  "NON-OP INT EXP/(REV)",
  "NET PROFIT",
])

// Statutory/fixed lines — non-editable (use budget figures)
const BUDGET_ONLY_DESCS = new Set([
  "SALES ALLOCATIONS", "QA ALLOCATIONS", "AR ALLOCATIONS",
  "DATA PROCESSING ALLOCATIONS", "ACCOUNTING ALLOCATIONS",
  "ADVERTISING & MKTG - ALLOCATION", "REGION SUPPORT SERVICES",
  "CANADA OVERHEAD ALLOCATIONS", "BMT ALLOCATIONS",
  "FLEET ALLOCATIONS", "CORPORATE ADMIN ALLOCATIONS",
  "HO ADMIN ALLOCATIONS", "HUMAN RESOURCES ALLOCATIONS",
  "INFORMATION TECH. ALLOCATIONS",
  "OVERHEAD ALLOCATION REVERSAL",
  "HOME OFFICE OVERHEAD",
  "ACQUISITION COST",
  "ULTIPRO COST",
])

// Template order matching production display order
const TEMPLATE_ORDER = [
  "COMMERCIAL REVENUE",
  "COMMERCIAL BED BUG REVENUE (recur)",
  "FLY CONTROL",
  "ORKIN/AIRE",
  "FEMININE HYGIENE",
  "DRAIN MAINTENANCE",
  "SOAK TANK",
  "SUBTOTAL MONTHLY",
  "RESIDENTIAL CONTRACT",
  "VALU PLUS COMM REVENUE",
  "SEASONAL REV  & OTHER",
  "SUBTOTAL/ALTERNATE/SEASONAL",
  "GROSS CONTRACT REVENUE",
  "ALLOWANCES",
  "PC COMM MGMT FAILURE",
  "RESIDENTIAL MGMT FAILURE",
  "YEAR IN ADVANCE",
  "PC SALES DISC",
  "TOTAL ALLOWANCES",
  "NET CONTRACT REVENUE",
  "RESIDENTIAL BED BUG REVENUE",
  "COMMERCIAL BED BUG REVENUE",
  "RESIDENTIAL SPECIAL SERVICES",
  "COMMERCIAL SPECIAL SERVICES",
  "PRODUCT SALES",
  "FUMIGATION PC",
  "TOTAL MISC REVENUE",
  "TOTAL NET PC REVENUE",
  "TERMITE TREATING",
  "PRETREAT",
  "INSPECTION FEES",
  "TC MGMT FAILURE",
  "TOTAL NET TC REVENUE",
  "TOTAL NET REVENUE",
  "DIVISION MANAGER",
  "REGION MANAGER SALARY",
  "BRANCH MANAGER SALARY",
  "QUALITY ASSURANCE",
  "MANAGER TRAINEE",
  "SUBTOTALS MANAGERS",
  "MANAGERS INCENTIVES PAID",
  "MGR INCENTIVE ACCRUED",
  "SUBTOTAL MGR INCENTIVES",
  "OFFICE SALARIES",
  "VAC / HOLIDAY / SICK",
  "OFFICE SAL FLD OT",
  "TEMP OFFICE PERS",
  "SUBTOTAL OFFICE",
  "SUBTOTAL ADMIN PAYROLL",
  "SALESPERSON SALARIES",
  "ASM & NATIONAL SALES SALARIES",
  "SALES COMMISSIONS / BONUS",
  "SALES VAC / HOL / SICK",
  "TECHNICIAN SALES COMMISSION",
  "SUBTOTAL SALES PAYROLL",
  "TECHNICIAN SERVICE SALARIES",
  "TECHNICIAN SERV PRODUCTION",
  "PC VAC / HOL / SICK",
  "PC SERV WAGES - OT",
  "SUBTOTAL SERV PAYROLL",
  "SERV MGR SALARY",
  "SERV MGR BONUS",
  "TOTAL SERVICE WAGES",
  "TOTAL PAYROLL",
  "PAYROLL TAXES",
  "INS-GROUP BENEFITS",
  "INS-GROUP DEDUCTIONS",
  "UNIFORMS",
  "MOVING",
  "TRAINING",
  "PROF RECRUITING",
  "MEDICAL",
  "OTHER PERSONNEL RELATED",
  "TOTAL PERSONNEL EXPENSES",
  "TOTAL EMPL COST",
  "PC CHEMICALS",
  "FREIGHT IN",
  "PC TOOLS & EQUIPMENT",
  "ORKIN/AIRE (M&S)",
  "M&S FLY LIGHTS",
  "SUB TOTAL M&S",
  "COGS PRODUCTS & EQUIPMENT",
  "TOTAL MATERIAL & SUPPLIES",
  "GASOLINE",
  "TIRES",
  "OIL CHANGE",
  "OTHER OPERATING EXPENSES",
  "TOTAL VEHICLE OPERATING",
  "LEASE",
  "DEPRECIATION",
  "VEH GAIN / LOSS",
  "LICENSES / TAXES",
  "TOTAL STAND EXPENSES",
  "TOTAL VEHICLE EXPENSE",
  "PER USE DEDUCTIONS",
  "TOTAL FLEET",
  "VEHICLE ACCIDENT",
  "CLAIMS - GENERAL  LIABILITY",
  "INS - GENERAL LIABILITY",
  "INS - AUTO LIABILITY",
  "INS - WORKERS COMPENSATION",
  "SUBTOTAL INSURANCE & CLAIMS",
  "CATASTROPHIC ACCRUAL",
  "TOTAL INSURANCE & CLAIMS",
  "BAD DEBT EXPENSE",
  "RECOVERIES",
  "SUBTOTAL BAD DEBTS",
  "BAD DEBT ACCRUAL",
  "OUT OF POLICY",
  "TOTAL BAD DEBTS",
  "ADVERTISING DIRECT",
  "RENT - BRANCH",
  "DEPRECIATION (fixed)",
  "TAXES PROP/OTHER",
  "TOTAL FIXED EXPENSE",
  "OFFICE SUPPLIES",
  "PRINTING & FORMS",
  "COMPUTER SUPPLIES",
  "TRAVEL",
  "CONFERENCE",
  "LOCAL CENTRALIZED",
  "LONG DISTANCE CENTRALIZED",
  "CELLULAR TELEPHONE",
  "OTHER COMMUNICATION",
  "SUBTOTAL TELEPHONE",
  "UTILITIES",
  "SUBTOTAL TELE. & UTILITIES",
  "PROFESSIONAL SERVICES",
  "MAINTENANCE & REPAIRS",
  "EQUIPMENT RENTAL",
  "POSTAGE",
  "BANK SERVICE CHARGES",
  "CREDIT CARD SERVICE FEE",
  "MISCELLANEOUS",
  "TOTAL CONTROLLABLE",
  "TOTAL OTHER EXPENSE",
  "TOTAL EXPENSES",
  "CONTRIBUTION B/4 OVERHEAD",
  "SALES ALLOCATIONS",
  "QA ALLOCATIONS",
  "AR ALLOCATIONS",
  "DATA PROCESSING ALLOCATIONS",
  "ACCOUNTING ALLOCATIONS",
  "ADVERTISING & MKTG - ALLOCATION",
  "REGION SUPPORT SERVICES",
  "CANADA OVERHEAD ALLOCATIONS",
  "BMT ALLOCATIONS",
  "FLEET ALLOCATIONS",
  "CORPORATE ADMIN ALLOCATIONS",
  "HO ADMIN ALLOCATIONS",
  "HUMAN RESOURCES ALLOCATIONS",
  "INFORMATION TECH. ALLOCATIONS",
  "TOTAL OVERHEAD ALLOCATIONS",
  "OPERATING PROFIT",
  "OVERHEAD ALLOCATION REVERSAL",
  "BONUS OPERATING PROFIT",
  "HOME OFFICE OVERHEAD",
  "ACQUISITION COST",
  "ULTIPRO COST",
  "EXTERNAL PROFIT",
]

// Normalize for template matching (handles " - " vs ". " etc.)
function normForMatch(s: string) {
  return normDesc(s).replace(/[\s\-\.]+/g, " ").replace(/\s+/g, " ").trim()
}

function isKpiLine(description: string) {
  const d = normDesc(description)
  return d === KPI_REVENUE || KPI_EXPENSE_LINES.has(d)
}

type ViewMode = "revenue" | "expenses" | "both"

type ForecastTableProps = {
  forecasts: ForecastResult[]
  currentMonth: number
  onUpdateForecast?: (description: string, month: number, newValue: number) => Promise<void>
  editable?: boolean
  lastMonthActuals?: Map<string, number>
}

type EditingCell = {
  description: string
  month: number
  currentValue: number
} | null

export function ForecastTable({
  forecasts,
  currentMonth,
  onUpdateForecast,
  editable = true,
  lastMonthActuals,
}: ForecastTableProps) {
  const [editingCell, setEditingCell] = useState<EditingCell>(null)
  const [editValue, setEditValue] = useState<string>("")
  const [saving, setSaving] = useState(false)
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [showAllMonths, setShowAllMonths] = useState(true)
  const [viewMode, setViewMode] = useState<ViewMode>("both")
  const [hiddenRows, setHiddenRows] = useState<Set<string>>(new Set())
  const [sortByTemplate, setSortByTemplate] = useState(true)

  // Metric toggles
  const [showForecast, setShowForecast] = useState(true)
  const [showBudget, setShowBudget] = useState(true)
  const [showLastYear, setShowLastYear] = useState(true)
  const [showLastMonth, setShowLastMonth] = useState(true)
  const visibleMetricCount = [showForecast, showBudget, showLastYear, showLastMonth].filter(Boolean).length

  // Floating row indicator
  const [hoveredRow, setHoveredRow] = useState<string | null>(null)
  const [hoveredMonth, setHoveredMonth] = useState<number | null>(null)
  const [hoveredMetric, setHoveredMetric] = useState<string | null>(null)

  // Filter forecasts by view mode
  const filteredForecasts = forecasts.filter((f) => {
    if (viewMode === "revenue") return isRevenueLine(f.description)
    if (viewMode === "expenses") return isExpenseLine(f.description)
    return true
  })

  // Group by description (from filtered forecasts), exclude hidden rows and below-External-Profit items
  const uniqueDescriptions = [...new Set(filteredForecasts.map(f => f.description))]
    .filter(d => !HIDDEN_BELOW_EXTERNAL.has(normDesc(d)))
  const allDescriptions = sortByTemplate
    ? [...uniqueDescriptions].sort((a, b) => {
      const na = normForMatch(a)
      const nb = normForMatch(b)
      const findTemplateIndex = (n: string) => {
        // Prefer exact match to avoid prefix collisions (e.g. "PAYROLL" vs "PAYROLL TAXES")
        const exact = TEMPLATE_ORDER.findIndex((t) => normForMatch(t) === n)
        if (exact !== -1) return exact
        return TEMPLATE_ORDER.findIndex((t) => {
          const nt = normForMatch(t)
          return n.startsWith(nt + " ") || nt.startsWith(n + " ")
        })
      }
      const ia = findTemplateIndex(na)
      const ib = findTemplateIndex(nb)
      if (ia >= 0 && ib >= 0) return ia - ib
      if (ia >= 0) return -1
      if (ib >= 0) return 1
      return a.localeCompare(b)
    })
    : [...uniqueDescriptions].sort((a, b) => a.localeCompare(b))
  const descriptions = allDescriptions.filter((d) => !hiddenRows.has(d))
  const toggleRow = (desc: string) => {
    setHiddenRows((prev) => {
      const next = new Set(prev)
      if (next.has(desc)) next.delete(desc)
      else next.add(desc)
      return next
    })
  }

  // Get months to display: all 12 or only current month
  const months = showAllMonths
    ? Array.from({ length: 12 }, (_, i) => i + 1)
    : [currentMonth]

  const handleCellClick = (description: string, month: number, currentValue: number) => {
    if (!editable || !onUpdateForecast) return
    setEditingCell({ description, month, currentValue })
    setEditValue(currentValue.toFixed(2))
    setEditDialogOpen(true)
  }

  const handleSave = async () => {
    if (!editingCell || !onUpdateForecast) return

    const newValue = parseFloat(editValue)
    if (isNaN(newValue)) return

    setSaving(true)
    try {
      await onUpdateForecast(editingCell.description, editingCell.month, newValue)
      setEditDialogOpen(false)
      setEditingCell(null)
    } finally {
      setSaving(false)
    }
  }

  const handleCancel = () => {
    setEditDialogOpen(false)
    setEditingCell(null)
    setEditValue("")
  }

  // Restrictive cap for display
  const DISPLAY_CAP = 1000000000 // 1 Billion

  // Total row: sum only leaf items to ensure real-time updates when children are edited
  const totalFilter = (f: ForecastResult) => {
    const d = normDesc(f.description)
    const isLeaf = isLeafDescription(d)
    if (!isLeaf) return false

    if (viewMode === "revenue") return isRevenueLine(d)
    if (viewMode === "expenses") return isExpenseLine(d)
    return true
  }

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
        <div className="flex flex-wrap items-center gap-4">
          {/* Sorting and Rows */}
          <div className="flex items-center gap-2">
            <Label className="text-sm text-muted-foreground">Rows:</Label>
            <div className="flex items-center gap-1.5">
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-1.5 h-8">
                    <Filter className="h-3.5 w-3.5" />
                    Filters
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-72 max-h-64 overflow-y-auto" align="start">
                  <div className="space-y-4">
                    <div>
                      <p className="text-sm font-medium mb-2">Primary Filter</p>
                      <div className="flex rounded-md border p-0.5 bg-muted/30">
                        <button onClick={() => setViewMode("both")} className={cn("px-2 py-1 text-xs rounded-sm flex-1", viewMode === "both" ? "bg-background shadow" : "")}>All</button>
                        <button onClick={() => setViewMode("revenue")} className={cn("px-2 py-1 text-xs rounded-sm flex-1", viewMode === "revenue" ? "bg-background shadow" : "")}>Rev</button>
                        <button onClick={() => setViewMode("expenses")} className={cn("px-2 py-1 text-xs rounded-sm flex-1", viewMode === "expenses" ? "bg-background shadow" : "")}>Exp</button>
                      </div>
                    </div>
                    <div>
                      <p className="text-sm font-medium mb-2">Show/Hide Items</p>
                      {allDescriptions.map((desc) => (
                        <label key={desc} className="flex items-center gap-2 cursor-pointer text-sm py-1">
                          <Checkbox checked={!hiddenRows.has(desc)} onCheckedChange={() => toggleRow(desc)} />
                          <span className="truncate">{desc}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                </PopoverContent>
              </Popover>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 px-2"
                onClick={() => setSortByTemplate(!sortByTemplate)}
                title={sortByTemplate ? "Sorting by Template order" : "Sorting Alphabetically"}
              >
                {sortByTemplate ? <ListOrdered className="h-4 w-4" /> : <ArrowDownAZ className="h-4 w-4" />}
              </Button>
            </div>
          </div>

          {/* Metrics Toggles */}
          <div className="flex items-center gap-2 border-l pl-4 border-border/50">
            <Label className="text-sm text-muted-foreground mr-1">Metrics:</Label>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-1.5 cursor-pointer">
                <Checkbox checked={showForecast} onCheckedChange={(v) => setShowForecast(!!v)} />
                <span className="text-sm font-medium">Forecast</span>
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <Checkbox checked={showBudget} onCheckedChange={(v) => setShowBudget(!!v)} />
                <span className="text-sm text-muted-foreground">Budget</span>
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <Checkbox checked={showLastYear} onCheckedChange={(v) => setShowLastYear(!!v)} />
                <span className="text-sm text-muted-foreground">Last Year</span>
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <Checkbox checked={showLastMonth} onCheckedChange={(v) => setShowLastMonth(!!v)} />
                <span className="text-sm text-muted-foreground">Actuals</span>
              </label>
            </div>
          </div>

          <div className="flex items-center gap-2 border-l pl-4 border-border/50">
            <Switch
              id="show-all-months"
              checked={showAllMonths}
              onCheckedChange={setShowAllMonths}
            />
            <Label htmlFor="show-all-months" className="text-sm font-normal cursor-pointer flex items-center gap-2">
              {showAllMonths ? "All months" : "Selected month"}
            </Label>
          </div>
        </div>
      </div>

      {hoveredRow && (
        <div className="fixed right-4 top-1/2 -translate-y-1/2 z-50 bg-primary text-primary-foreground px-4 py-2.5 text-sm font-semibold shadow-lg rounded-lg pointer-events-none">
          <div className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4 shrink-0" />
            <span className="truncate max-w-[240px]">{hoveredRow}</span>
          </div>
          {(hoveredMonth !== null || hoveredMetric) && (
            <div className="text-xs font-normal opacity-80 mt-1 pl-6 flex items-center gap-1.5">
              {hoveredMonth !== null && <span>{hoveredMonth === 0 ? 'Annual Total' : `${getShortMonthName(hoveredMonth)} 2026`}</span>}
              {hoveredMonth !== null && hoveredMetric && <span>&middot;</span>}
              {hoveredMetric && <span>{hoveredMetric}</span>}
            </div>
          )}
        </div>
      )}

      <div className="border rounded-lg relative">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/30">
              <TableHead rowSpan={2} className="min-w-[200px] font-medium align-middle border-r bg-muted/80">Description</TableHead>
              {months.map(month => (
                <TableHead
                  key={month}
                  colSpan={visibleMetricCount}
                  className={cn(
                    "text-center font-bold border-l",
                    month === currentMonth && "bg-primary/5"
                  )}
                >
                  {getShortMonthName(month)}
                </TableHead>
              ))}
              {(showForecast || showBudget) && <TableHead colSpan={[showForecast, showBudget].filter(Boolean).length} className="text-center bg-muted/50 font-bold border-l">Annual Total</TableHead>}
            </TableRow>
            <TableRow className="bg-muted/20 text-xs">
              {months.map(month => (
                <Fragment key={month}>
                  {showForecast && <TableHead className={cn("text-center min-w-[120px] font-medium border-l", month === currentMonth && "bg-primary/5")}>Forecast</TableHead>}
                  {showBudget && <TableHead className={cn("text-center min-w-[120px] font-medium text-muted-foreground", month === currentMonth && "bg-primary/5")}>Budget</TableHead>}
                  {showLastYear && <TableHead className={cn("text-center min-w-[120px] font-medium text-muted-foreground", month === currentMonth && "bg-primary/5")}>Last Year</TableHead>}
                  {showLastMonth && <TableHead className={cn("text-center min-w-[120px] font-medium text-muted-foreground", month === currentMonth && "bg-primary/5")}>Actuals</TableHead>}
                </Fragment>
              ))}
              {showForecast && <TableHead className="text-center min-w-[120px] font-medium bg-muted/50 border-l">Forecast</TableHead>}
              {showBudget && <TableHead className="text-center min-w-[120px] font-medium bg-muted/50 text-muted-foreground">Budget</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {descriptions.map((description, idx) => {
              const descForecasts = filteredForecasts.filter(f => f.description === description)
              const ytdForecast = descForecasts.reduce((sum, f) => sum + f.forecastValue, 0)
              const ytdBudget = descForecasts.reduce((sum, f) => sum + f.budgetValue, 0)
              const isEven = idx % 2 === 0

              return (
                <TableRow
                  key={description}
                  className={cn("hover:bg-accent/30", isEven ? "bg-background" : "bg-muted/20")}
                  onMouseEnter={() => setHoveredRow(description)}
                  onMouseLeave={() => { setHoveredRow(null); setHoveredMonth(null); setHoveredMetric(null) }}
                >
                  <TableCell className="font-medium py-3 border-r">
                    <span className={cn(isSubtotalDescription(description) && "font-bold text-foreground")}>
                      {description}
                    </span>
                  </TableCell>
                  {months.map(month => {
                    const f = descForecasts.find(m => m.month === month)
                    const isCurrent = month === currentMonth
                    const isClickable = editable && onUpdateForecast && f && isLeafDescription(description) && !BUDGET_ONLY_DESCS.has(normDesc(description))

                    return (
                      <Fragment key={month}>
                        {showForecast && <TableCell
                          className={cn(
                            "text-center p-2 relative group border-l",
                            isCurrent && "bg-primary/5",
                            isClickable && "cursor-pointer hover:bg-muted/40 transition-colors"
                          )}
                          onClick={() => isClickable && handleCellClick(description, month, f.forecastValue)}
                          onMouseEnter={() => { setHoveredMonth(month); setHoveredMetric('Forecast') }}
                        >
                          <span className="text-xs font-semibold">
                            {f ? formatCurrency(f.forecastValue) : "-"}
                          </span>
                          {isClickable && (
                            <Pencil className="h-2.5 w-2.5 absolute top-1 right-1 opacity-0 group-hover:opacity-30" />
                          )}
                        </TableCell>}
                        {showBudget && <TableCell className={cn("text-center p-2 text-muted-foreground", isCurrent && "bg-primary/5")} onMouseEnter={() => { setHoveredMonth(month); setHoveredMetric('Budget') }}>
                          <span className="text-xs">{f ? formatCurrency(f.budgetValue) : "-"}</span>
                        </TableCell>}
                        {showLastYear && <TableCell className={cn("text-center p-2 text-muted-foreground", isCurrent && "bg-primary/5")} onMouseEnter={() => { setHoveredMonth(month); setHoveredMetric('Last Year') }}>
                          <span className="text-xs">{f ? formatCurrency(f.lastYearValue) : "-"}</span>
                        </TableCell>}
                        {showLastMonth && <TableCell className={cn("text-center p-2 text-muted-foreground", isCurrent && "bg-primary/5")} onMouseEnter={() => { setHoveredMonth(month); setHoveredMetric('Actuals') }}>
                          <span className="text-xs">{(() => {
                            const key = `${description}\t${month}`
                            const val = lastMonthActuals?.get(key)
                            return val !== undefined ? formatCurrency(val) : "-"
                          })()}</span>
                        </TableCell>}
                      </Fragment>
                    )
                  })}
                  {showForecast && <TableCell className="text-right font-bold bg-muted/10 border-l" onMouseEnter={() => { setHoveredMonth(0); setHoveredMetric('Forecast') }}>
                    {formatCurrency(ytdForecast)}
                  </TableCell>}
                  {showBudget && <TableCell className="text-right font-bold bg-muted/10 text-muted-foreground" onMouseEnter={() => { setHoveredMonth(0); setHoveredMetric('Budget') }}>
                    {formatCurrency(ytdBudget)}
                  </TableCell>}
                </TableRow>
              )
            })}

            {/* Grand Total row */}
            <TableRow className="bg-muted/50 font-bold border-t-2">
              <TableCell className="border-r">
                <div className="flex flex-col">
                  <span>Grand Total</span>
                  <span className="text-[10px] font-normal text-muted-foreground uppercase tracking-tight">
                    {viewMode === "both" ? "Rev + Exp" : viewMode}
                  </span>
                </div>
              </TableCell>
              {months.map(month => {
                const monthF = forecasts.filter(f => f.month === month && totalFilter(f)).reduce((sum, f) => sum + f.forecastValue, 0)
                const monthB = forecasts.filter(f => f.month === month && totalFilter(f)).reduce((sum, f) => sum + f.budgetValue, 0)
                return (
                  <Fragment key={month}>
                    {showForecast && <TableCell className={cn("text-center p-2 border-l", month === currentMonth && "bg-primary/5")}>
                      <span className="text-xs">{formatCurrency(monthF)}</span>
                    </TableCell>}
                    {showBudget && <TableCell className={cn("text-center p-2 text-muted-foreground", month === currentMonth && "bg-primary/5")}>
                      <span className="text-xs">{formatCurrency(monthB)}</span>
                    </TableCell>}
                    {showLastYear && <TableCell className={cn("text-center p-2 text-muted-foreground", month === currentMonth && "bg-primary/5")}>
                      <span className="text-xs">{formatCurrency(forecasts.filter(f => f.month === month && totalFilter(f)).reduce((sum, f) => sum + f.lastYearValue, 0))}</span>
                    </TableCell>}
                    {showLastMonth && <TableCell className={cn("text-center p-2 text-muted-foreground", month === currentMonth && "bg-primary/5")}>
                      <span className="text-xs">-</span>
                    </TableCell>}
                  </Fragment>
                )
              })}
              {showForecast && <TableCell className="text-right bg-muted/20 border-l">
                {formatCurrency(forecasts.filter(f => totalFilter(f)).reduce((sum, f) => sum + f.forecastValue, 0))}
              </TableCell>}
              {showBudget && <TableCell className="text-right bg-muted/20 text-muted-foreground">
                {formatCurrency(forecasts.filter(f => totalFilter(f)).reduce((sum, f) => sum + f.budgetValue, 0))}
              </TableCell>}
            </TableRow>
          </TableBody>
        </Table>
      </div>

      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Adjust Forecast</DialogTitle>
            <DialogDescription>
              {editingCell && (
                <>
                  Modify the forecast value for <strong>{editingCell.description}</strong> in{" "}
                  <strong>{getShortMonthName(editingCell.month)}</strong>
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="forecast-value">Forecast Value</Label>
              <Input
                id="forecast-value"
                type="number"
                step="0.01"
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSave()
                  if (e.key === "Escape") handleCancel()
                }}
                autoFocus
              />
            </div>
            {editingCell && (
              <div className="text-sm text-muted-foreground space-y-1">
                <p>Original value: {formatCurrency(editingCell.currentValue)}</p>
                {editValue && !isNaN(parseFloat(editValue)) && (
                  <p>
                    Change: {" "}
                    <span className={parseFloat(editValue) >= editingCell.currentValue ? "text-accent" : "text-destructive"}>
                      {parseFloat(editValue) >= editingCell.currentValue ? "+" : ""}
                      {formatCurrency(parseFloat(editValue) - editingCell.currentValue)}
                    </span>
                  </p>
                )}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={handleCancel} disabled={saving}>
              <X className="mr-2 h-4 w-4" />
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving || !editValue || isNaN(parseFloat(editValue))}>
              {saving ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Check className="mr-2 h-4 w-4" />
              )}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
