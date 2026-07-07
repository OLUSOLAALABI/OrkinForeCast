"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
    getShortMonthName,
    formatCurrency,
    normDesc,
    isRevenueLine,
    isSubtotalDescription,
    isLeafDescription
} from "@/lib/forecasting"
import { Loader2, Check, X, ClipboardList, TrendingUp, TrendingDown, Landmark, Search } from "lucide-react"
import { cn } from "@/lib/utils"

// Use the same template order as forecast table
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
    "PC COMM MGMT FAILURE",
    "RESIDENTIAL MGMT FAILURE",
    "YEAR IN ADVANCE",
    "PC SALES DISC",
    "TOTAL ALLOWANCES",
    "NET CONTRACT REVENUE",
    "MISCELLANEOUS REVENUE",
    "RESIDENTIAL BED BUG REVENUE",
    "COMMERCIAL BED BUG REVENUE",
    "RESIDENTIAL SPECIAL SERVICES",
    "COMMERCIAL SPECIAL SERVICES",
    "PRODUCT SALES",
    "FUMIGATION PC",
    "TOTAL MISC REVENUE",
    "TOTAL NET PC REVENUE",
    "TERMITE (TC) REVENUE",
    "TERMITE TREATING",
    "TC MGMT FAILURE",
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
    "ODOUR/AIRE",
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
    "NON RECURRING FEES",
    "ULTIPRO COST",
    "EXTERNAL PROFIT",
    "FOREIGN EXCHANGE GAIN/LOSS",
    "ROYALTY FEES",
    "INTEREST EXPENSE ORKIN",
    "CANADIAN TAXES",
    "NON-OP INT EXP/(REV)",
    "NET PROFIT",
]

type ActualRow = {
    description: string
    value: number
}

export function ActualsReportForm({ branchId, year }: { branchId: string, year: number }) {
    const [month, setMonth] = useState<number>(new Date().getMonth() + 1)
    const [actuals, setActuals] = useState<Record<string, number>>({})
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [search, setSearch] = useState("")
    const supabase = createClient()

    useEffect(() => {
        async function loadActuals() {
            setLoading(true)
            setError(null)
            try {
                const { data, error: fetchError } = await supabase
                    .from("actuals")
                    .select("description, value")
                    .eq("branch_id", branchId)
                    .eq("year", year)
                    .eq("month", month)

                if (fetchError) throw fetchError

                const initialActuals: Record<string, number> = {}
                TEMPLATE_ORDER.forEach(desc => {
                    initialActuals[desc] = 0
                })

                data?.forEach(row => {
                    initialActuals[row.description] = Number(row.value)
                })

                setActuals(initialActuals)
            } catch (err: any) {
                console.error("Error loading actuals:", err)
                setError("Failed to load actuals")
            } finally {
                setLoading(false)
            }
        }

        if (branchId) {
            loadActuals()
        }
    }, [branchId, year, month, supabase])

    const handleValueChange = (desc: string, val: string) => {
        const numVal = parseFloat(val) || 0
        const updated = { ...actuals, [desc]: numVal }

        // Recalculate subtotals
        // Pattern: Each subtotal row sums all leaf values above it until the previous subtotal row
        let currentSum = 0
        TEMPLATE_ORDER.forEach(item => {
            if (isLeafDescription(item)) {
                currentSum += updated[item] || 0
            } else if (isSubtotalDescription(item)) {
                // Special case: some rows are "Grand Totals" or have non-standard accumulation
                // For actuals reporting, we follow the simple sum-of-leafs-above
                updated[item] = currentSum

                // If it's a major total reset, we might reset currentSum, 
                // but usually the subtotals in our template are progressive.
                // However, "TOTAL NET REVENUE" vs "TOTAL PAYROLL" etc. are distinct.
                // Looking at the template, it's better to calculate specific subtotals.
            }
        })

        // Refined P&L Subtotal Logic (Matching forecasting engine)
        let totalNetRevenue = 0
        let totalPayroll = 0
        let totalPersonnelExpenses = 0
        let totalMaterialSupplies = 0
        let totalVehicleOperating = 0
        let totalVehicleStanding = 0
        let totalInsuranceClaims = 0
        let totalBadDebts = 0
        let totalFixedExpenses = 0
        let totalControllable = 0
        let totalOverhead = 0

        TEMPLATE_ORDER.forEach(item => {
            const val = updated[item] || 0
            const n = normDesc(item)
            if (isLeafDescription(item)) {
                if (isRevenueLine(item)) totalNetRevenue += val
                else if (item.includes("PAYROLL")) totalPayroll += val
                else if (item.includes("PERSONNEL")) totalPersonnelExpenses += val
                else if (item.includes("MATERIAL")) totalMaterialSupplies += val
                else if (n.includes("VEHICLE OPERATING") || n.includes("GASOLINE") || n.includes("TIRES") || n.includes("OIL CHANGE")) totalVehicleOperating += val
                else if (n.includes("VEHICLE STANDING") || n.includes("LEASE") || n.includes("DEPRECIATION")) totalVehicleStanding += val
                else if (item.includes("INSURANCE") || item.includes("CLAIMS")) totalInsuranceClaims += val
                else if (item.includes("BAD DEBT")) totalBadDebts += val
                else if (n.includes("ADVERTISING") || n.includes("RENT") || n.includes("TAXES PROP")) totalFixedExpenses += val
                else if (n.includes("OFFICE SUPPLIES") || n.includes("TELEPHONE") || n.includes("UTILITIES") || n.includes("CONTROLLABLE")) totalControllable += val
                else if (item.includes("ALLOCATIONS")) totalOverhead += val
            }
        })

        // Simplified but robust derived row logic for the reporting form
        const totalExpenses = totalPayroll + totalPersonnelExpenses + totalMaterialSupplies +
            totalVehicleOperating + totalVehicleStanding + totalInsuranceClaims +
            totalBadDebts + totalFixedExpenses + totalControllable

        const contribution = totalNetRevenue - totalExpenses
        const operatingProfit = contribution - totalOverhead

        // Additional deductions below operating profit
        const overheadReversal = updated["OVERHEAD ALLOCATION REVERSAL"] || 0
        const homeOffice = updated["HOME OFFICE OVERHEAD"] || 0
        const acquisitionCost = updated["ACQUISITION COST"] || 0
        const ultiproFees = updated["ULTIPRO COST"] || 0
        const foreignExchange = updated["FOREIGN EXCHANGE GAIN/LOSS"] || 0
        const royaltyFees = updated["ROYALTY FEES"] || 0
        const interestExpense = updated["INTEREST EXPENSE ORKIN"] || 0
        const canadianTaxes = updated["CANADIAN TAXES"] || 0
        const nonOpInt = updated["NON-OP INT EXP/(REV)"] || 0

        const bonusOperatingProfit = operatingProfit - overheadReversal
        const externalProfit = bonusOperatingProfit - homeOffice - acquisitionCost - ultiproFees
        const netProfit = externalProfit - foreignExchange - royaltyFees - interestExpense - canadianTaxes - nonOpInt

        updated["TOTAL NET REVENUE"] = totalNetRevenue
        updated["TOTAL PAYROLL"] = totalPayroll
        updated["TOTAL EXPENSES"] = totalExpenses
        updated["CONTRIBUTION B/4 OVERHEAD"] = contribution
        updated["TOTAL OVERHEAD ALLOCATIONS"] = totalOverhead
        updated["OPERATING PROFIT"] = operatingProfit
        updated["BONUS OPERATING PROFIT"] = bonusOperatingProfit
        updated["EXTERNAL PROFIT"] = externalProfit
        updated["NET PROFIT"] = netProfit

        setActuals(updated)
    }

    const handleSave = async () => {
        setSaving(true)
        setError(null)
        try {
            const updates = Object.entries(actuals).map(([desc, val]) => ({
                branch_id: branchId,
                year,
                month,
                description: desc,
                value: val,
                updated_at: new Date().toISOString()
            }))

            const { error: upsertError } = await supabase
                .from("actuals")
                .upsert(updates, { onConflict: "branch_id,year,month,description" })

            if (upsertError) throw upsertError

            // Record activity
            try {
                const { data: { user } } = await supabase.auth.getUser()
                if (user) {
                    await supabase.from("activity_logs").insert({
                        user_id: user.id,
                        action: "update_actuals",
                        description: `Updated actuals for ${getShortMonthName(month)} ${year}`,
                        metadata: { branch_id: branchId, month, year }
                    })
                }
            } catch (loggingErr) {
                console.warn("Activity logging failed:", loggingErr)
            }

        } catch (err: any) {
            console.error("Error saving actuals:", err)
            setError("Failed to save actuals")
        } finally {
            setSaving(false)
        }
    }

    // Recalculate totals for summary
    const summary = (() => {
        let rev = 0
        let exp = 0
        Object.entries(actuals).forEach(([desc, val]) => {
            if (!isLeafDescription(desc)) return
            if (isRevenueLine(desc)) {
                rev += val
            } else {
                exp += val
            }
        })
        return { rev, exp, profit: rev - exp }
    })()

    const filteredRows = TEMPLATE_ORDER.filter(desc =>
        desc.toLowerCase().includes(search.toLowerCase())
    )

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                    <Select value={month.toString()} onValueChange={(val) => setMonth(parseInt(val))}>
                        <SelectTrigger className="w-[180px]">
                            <SelectValue placeholder="Select Month" />
                        </SelectTrigger>
                        <SelectContent>
                            {Array.from({ length: 12 }, (_, i) => (
                                <SelectItem key={i + 1} value={(i + 1).toString()}>
                                    {getShortMonthName(i + 1)}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <div className="relative flex-1 sm:max-w-xs">
                        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                            placeholder="Search items..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="pl-9 h-10"
                        />
                    </div>
                </div>
                <Button onClick={handleSave} disabled={saving || loading} className="w-full sm:w-auto">
                    {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}
                    Save Actuals
                </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card className="bg-primary/5 border-primary/20">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium flex items-center gap-2">
                            <TrendingUp className="h-4 w-4 text-accent" />
                            Actual Revenue
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{formatCurrency(summary.rev)}</div>
                    </CardContent>
                </Card>
                <Card className="bg-destructive/5 border-destructive/20">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium flex items-center gap-2">
                            <TrendingDown className="h-4 w-4 text-destructive" />
                            Actual Expenses
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{formatCurrency(summary.exp)}</div>
                    </CardContent>
                </Card>
                <Card className="bg-accent/5 border-accent/20">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium flex items-center gap-2">
                            <Landmark className="h-4 w-4 text-primary" />
                            Actual Net Profit
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{formatCurrency(summary.profit)}</div>
                    </CardContent>
                </Card>
            </div>

            {error && (
                <Alert variant="destructive">
                    <AlertDescription>{error}</AlertDescription>
                </Alert>
            )}

            <Card>
                <CardHeader>
                    <CardTitle>Income & Expenditure Details</CardTitle>
                    <CardDescription>Enter the actual figures for {getShortMonthName(month)} {year}</CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                    <div className="max-h-[60vh] overflow-y-auto">
                        <Table>
                            <TableHeader className="sticky top-0 bg-background z-10">
                                <TableRow>
                                    <TableHead className="w-2/3">Description</TableHead>
                                    <TableHead className="text-right">Actual Value</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {loading ? (
                                    <TableRow>
                                        <TableCell colSpan={2} className="h-32 text-center">
                                            <Loader2 className="h-8 w-8 animate-spin mx-auto text-muted-foreground" />
                                        </TableCell>
                                    </TableRow>
                                ) : filteredRows.map(desc => {
                                    const isTotal = isSubtotalDescription(desc)
                                    return (
                                        <TableRow key={desc} className={cn(isTotal && "bg-muted/50 font-bold")}>
                                            <TableCell className="py-2">{desc}</TableCell>
                                            <TableCell className="py-2 text-right">
                                                {isTotal ? (
                                                    <span className="text-sm px-3">{formatCurrency(actuals[desc] || 0)}</span>
                                                ) : (
                                                    <Input
                                                        type="number"
                                                        step="0.01"
                                                        value={actuals[desc] || ""}
                                                        onChange={(e) => handleValueChange(desc, e.target.value)}
                                                        className="w-32 ml-auto text-right h-8"
                                                        onFocus={(e) => e.target.select()}
                                                    />
                                                )}
                                            </TableCell>
                                        </TableRow>
                                    )
                                })}
                            </TableBody>
                        </Table>
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}
