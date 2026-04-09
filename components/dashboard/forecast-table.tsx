"use client"

import { useState } from "react"
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

// Items hidden from display (below External Profit + duplicates)
const HIDDEN_BELOW_EXTERNAL = new Set([
  "FOREIGN EXCHANGE GAIN/LOSS",
  "ROYALTY FEES",
  "INTEREST EXPENSE ORKIN",
  "CANADIAN TAXES",
  "NON-OP INT EXP/(REV)",
  "NET PROFIT",
  "COMMERCIAL BED BUG REVENUE",  // only the (recur) version should display
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
  "ULTIPRO FEES",
])

// Template order from branchData Excel files (e.g. branchData/2026Budget/8.xlsx) — column 0, row order
const TEMPLATE_ORDER = [
  "PEST CONTROL REVENUE",
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
  "PC MGMT FAILURE",
  "YEAR IN ADVANCE",
  "PC SALES DISC",
  "TOTAL ALLOWANCES",
  "NET CONTRACT REVENUE",
  "MISCELLANEOUS REVENUE",
  "RESIDENTIAL BED BUG REVENUE",
  "RESIDENTIAL SPECIAL SERVICES",
  "COMMERCIAL SPECIAL SERVICES",
  "PRODUCT SALES",
  "FUMIGATION PC",
  "TOTAL MISC REVENUE",
  "TOTAL NET PC REVENUE",
  "TERMITE (TC) REVENUE",
  "TERMITE TREATING",
  "PRETREAT",
  "INSPECTION FEES",
  "TOTAL NET TC REVENUE",
  "TOTAL NET REVENUE",
  "PAYROLL",
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
  "PERSONNEL RELATED",
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
  "MATERIALS AND SUPPLIES",
  "PC CHEMICALS",
  "FREIGHT IN",
  "PC TOOLS & EQUIPMENT",
  "ORKIN/AIRE (M&S)",
  "M&S FLY LIGHTS",
  "SUB TOTAL M&S",
  "COGS PRODUCTS & EQUIPMENT",
  "TOTAL MATERIAL & SUPPLIES",
  "VEHICLE EXPENSES",
  "GASOLINE",
  "TIRES",
  "OIL CHANGE",
  "OTHER OPERATING EXPENSES",
  "TOTAL VEHICLE OPERATING",
  "VEHICLE STANDING EXPENSES",
  "LEASE",
  "DEPRECIATION",
  "VEH GAIN / LOSS",
  "LICENSES / TAXES",
  "TOTAL STAND EXPENSES",
  "TOTAL VEHICLE EXPENSE",
  "AUTO ALLOWANCE",
  "PER USE DEDUCTIONS",
  "TOTAL FLEET",
  "INSURANCE & CLAIMS",
  "VEHICLE ACCIDENT",
  "CLAIMS - GENERAL  LIABILITY",
  "INS - GENERAL LIABILITY",
  "INS - AUTO LIABILITY",
  "INS - WORKERS COMPENSATION",
  "SUBTOTAL INSURANCE & CLAIMS",
  "CATASTROPHIC ACCRUAL",
  "TOTAL INSURANCE & CLAIMS",
  "BAD DEBTS",
  "BAD DEBT EXPENSE",
  "RECOVERIES",
  "SUBTOTAL BAD DEBTS",
  "BAD DEBT ACCRUAL",
  "OUT OF POLICY",
  "TOTAL BAD DEBTS",
  "OTHER EXPENSES",
  "FIXED EXPENSES",
  "ADVERTISING DIRECT",
  "RENT - BRANCH",
  "DEPRECIATION (fixed)",
  "TAXES PROP/OTHER",
  "TOTAL FIXED EXPENSE",
  "CONTROLLABLE EXPENSES",
  "OFFICE SUPPLIES",
  "PRINTING & FORMS",
  "COMPUTER SUPPLIES",
  "TRAVEL",
  "CONFERENCE",
  "TELEPHONE & UTILITIES",
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
  "OVERHEAD ALLOCATIONS",
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
  "ULTIPRO FEES",
  "EXTERNAL PROFIT",
  "FOREIGN EXCHANGE GAIN/LOSS",
  "ROYALTY FEES",
  "INTEREST EXPENSE ORKIN",
  "CANADIAN TAXES",
  "NON-OP INT EXP/(REV)",
  "NET PROFIT",
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
  editable = true
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
  const [showActual, setShowActual] = useState(false)

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
                <Checkbox checked={showActual} onCheckedChange={(v) => setShowActual(!!v)} />
                <span className="text-sm font-bold text-primary">Actuals</span>
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

      <div className="overflow-x-auto border rounded-lg">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/30">
              <TableHead className="sticky left-0 bg-muted/80 backdrop-blur-sm z-10 min-w-[200px]">Description</TableHead>
              {months.map(month => (
                <TableHead
                  key={month}
                  className={cn(
                    "text-center min-w-[120px] font-bold",
                    month === currentMonth && "bg-primary/5"
                  )}
                >
                  {getShortMonthName(month)}
                </TableHead>
              ))}
              <TableHead className="text-right min-w-[120px] bg-muted/50 font-bold">Annual total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {descriptions.map(description => {
              const descForecasts = filteredForecasts.filter(f => f.description === description)
              // Annual total based on current metrics
              const ytdTotal = descForecasts.reduce((sum, f) => {
                if (showActual && f.actualValue) return sum + f.actualValue
                return sum + f.forecastValue
              }, 0)

              return (
                <TableRow key={description} className="hover:bg-muted/20">
                  <TableCell className="sticky left-0 bg-background/95 backdrop-blur-sm z-10 font-medium py-3 border-r">
                    <span className={cn(isSubtotalDescription(description) && "font-bold text-foreground")}>
                      {description}
                    </span>
                  </TableCell>
                  {months.map(month => {
                    const f = descForecasts.find(m => m.month === month)
                    const isCurrent = month === currentMonth
                    const isClickable = editable && onUpdateForecast && f && isLeafDescription(description) && !BUDGET_ONLY_DESCS.has(normDesc(description))

                    return (
                      <TableCell
                        key={month}
                        className={cn(
                          "text-center p-2 relative group",
                          isCurrent && "bg-primary/5",
                          isClickable && "cursor-pointer hover:bg-muted/40 transition-colors"
                        )}
                        onClick={() => isClickable && handleCellClick(description, month, f.forecastValue)}
                      >
                        <div className="flex flex-col gap-1 text-[11px]">
                          {showActual && (
                            <div className="flex flex-col">
                              <span className="text-primary font-bold text-sm">
                                {f?.actualValue ? formatCurrency(f.actualValue) : "$0"}
                              </span>
                              {f?.actualValue && f.forecastValue > 0 && (
                                <span className={cn("text-[9px] font-medium", (f.actualValue - f.forecastValue) >= 0 ? "text-accent" : "text-destructive")}>
                                  vs F: {formatPercent((f.actualValue - f.forecastValue) / f.forecastValue)}
                                </span>
                              )}
                            </div>
                          )}
                          {showForecast && (
                            <div className="flex flex-col border-t border-dotted border-border/50 pt-1 mt-1">
                              <span className={cn("text-xs font-semibold", !showActual && "text-sm")}>
                                {f ? formatCurrency(f.forecastValue) : "-"}
                              </span>
                              {showForecast && !showActual && f && f.variancePercent !== 0 && (
                                <span className={cn("text-[9px]", f.variancePercent >= 0 ? "text-accent" : "text-destructive")}>
                                  vs B: {formatPercent(f.variancePercent)}
                                </span>
                              )}
                            </div>
                          )}
                          {showBudget && (
                            <div className="text-[10px] text-muted-foreground italic">
                              B: {f ? formatCurrency(f.budgetValue) : "-"}
                            </div>
                          )}
                        </div>
                        {isClickable && showForecast && (
                          <Pencil className="h-2.5 w-2.5 absolute top-1 right-1 opacity-0 group-hover:opacity-30" />
                        )}
                      </TableCell>
                    )
                  })}
                  <TableCell className="text-right font-bold bg-muted/10 border-l">
                    {formatCurrency(ytdTotal)}
                  </TableCell>
                </TableRow>
              )
            })}

            {/* Totals Row */}
            <TableRow className="bg-muted/50 font-bold border-t-2">
              <TableCell className="sticky left-0 bg-muted/80 backdrop-blur-sm z-10 border-r">
                <div className="flex flex-col">
                  <span>Grand Total</span>
                  <span className="text-[10px] font-normal text-muted-foreground uppercase tracking-tight">
                    {viewMode === "both" ? "Rev + Exp" : viewMode}
                  </span>
                </div>
              </TableCell>
              {months.map(month => {
                const monthF = forecasts
                  .filter(f => f.month === month && totalFilter(f))
                  .reduce((sum, f) => sum + f.forecastValue, 0)
                const monthB = forecasts
                  .filter(f => f.month === month && totalFilter(f))
                  .reduce((sum, f) => sum + f.budgetValue, 0)
                const monthA = forecasts
                  .filter(f => f.month === month && totalFilter(f))
                  .reduce((sum, f) => sum + (f.actualValue || 0), 0)

                return (
                  <TableCell key={month} className={cn("text-center p-2", month === currentMonth && "bg-primary/5")}>
                    <div className="flex flex-col gap-1 text-[11px]">
                      {showActual && <span className="text-primary font-bold text-sm">{formatCurrency(monthA)}</span>}
                      {showForecast && <span className={cn("text-xs", !showActual && "text-sm")}>{formatCurrency(monthF)}</span>}
                      {showBudget && <span className="text-muted-foreground text-[10px]">{formatCurrency(monthB)}</span>}
                    </div>
                  </TableCell>
                )
              })}
              <TableCell className="text-right bg-muted/20 border-l">
                {formatCurrency(
                  forecasts
                    .filter(f => totalFilter(f))
                    .reduce((sum, f) => {
                      if (showActual && f.actualValue) return sum + f.actualValue
                      return sum + f.forecastValue
                    }, 0)
                )}
              </TableCell>
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
