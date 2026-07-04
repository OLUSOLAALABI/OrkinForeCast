"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { ActualsReportForm } from "@/components/dashboard/actuals-report-form"
import { Loader2, ClipboardList, Info } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"

type Branch = {
    id: string
    name: string
    code: string
    region_id: string
}

type Profile = {
    role: string
    branch_id: string | null
    region_id: string | null
}

type BranchAccessRow = {
    branch_id: string
    branches: {
        id: string
        name: string
        code: string
        region_id: string
    }[] | {
        id: string
        name: string
        code: string
        region_id: string
    } | null
}

function normalizeAssignedBranches(rows: BranchAccessRow[]): Branch[] {
    const byId = new Map<string, Branch>()

    rows.forEach((row) => {
        const branch = Array.isArray(row.branches) ? (row.branches[0] ?? null) : row.branches
        if (!branch) return
        byId.set(branch.id, {
            id: branch.id,
            name: branch.name,
            code: branch.code,
            region_id: branch.region_id,
        })
    })

    return [...byId.values()]
}

export default function ActualsPage() {
    const [profile, setProfile] = useState<Profile | null>(null)
    const [branches, setBranches] = useState<Branch[]>([])
    const [selectedBranch, setSelectedBranch] = useState<string>("")
    const [loading, setLoading] = useState(true)
    const [year] = useState(2026) // Default year
    const supabase = createClient()

    useEffect(() => {
        async function fetchProfileAndBranches() {
            setLoading(true)
            try {
                const { data: { user } } = await supabase.auth.getUser()
                if (!user) return

                const { data: p } = await supabase
                    .from("profiles")
                    .select("role, branch_id, region_id")
                    .eq("id", user.id)
                    .single()

                setProfile(p)

                const res = await fetch("/api/branches", { cache: "no-store" })
                const { branches: branchData } = res.ok ? await res.json().catch(() => ({})) : { branches: [] }
                let availableBranches = Array.isArray(branchData) ? branchData : []

                if (p?.role === "branch_user" && availableBranches.length === 0) {
                    const { data: accessRows } = await supabase
                        .from("user_branch_access")
                        .select("branch_id, branches(id, name, code, region_id)")
                        .eq("user_id", user.id)

                    availableBranches = normalizeAssignedBranches((accessRows ?? []) as BranchAccessRow[])
                }

                setBranches(availableBranches)

                if (availableBranches.length > 0) {
                    setSelectedBranch(availableBranches[0].id)
                } else if (p?.role === "branch_user" && p.branch_id) {
                    setSelectedBranch(p.branch_id)
                } else {
                    setSelectedBranch("")
                }
            } catch (err) {
                console.error("Error fetching profile:", err)
            } finally {
                setLoading(false)
            }
        }
        fetchProfileAndBranches()
    }, [supabase])

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        )
    }

    const isBranchUser = profile?.role === "branch_user"
    const canReport = isBranchUser || profile?.role === "hq_admin" || profile?.role === "region_admin" // Admins can report for any branch they see

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-4">
                <div>
                    <h1 className="text-3xl font-bold flex items-center gap-3">
                        <ClipboardList className="h-8 w-8 text-primary" />
                        Monthly Actuals
                    </h1>
                    <p className="text-muted-foreground mt-1">
                        Report the actual income and expenditure for your branch for the month.
                    </p>
                </div>

                {((!isBranchUser || branches.length > 1) && branches.length > 0) && (
                    <div className="flex flex-col sm:flex-row sm:items-center gap-2 max-w-sm">
                        <Label htmlFor="branch-select" className="text-sm font-medium whitespace-nowrap">
                            Reporting for Branch:
                        </Label>
                        <Select value={selectedBranch} onValueChange={setSelectedBranch}>
                            <SelectTrigger id="branch-select">
                                <SelectValue placeholder="Select Branch" />
                            </SelectTrigger>
                            <SelectContent>
                                {branches.map((b) => (
                                    <SelectItem key={b.id} value={b.id}>
                                        {b.name} ({b.code})
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                )}
            </div>

            {!canReport ? (
                <Alert>
                    <Info className="h-4 w-4" />
                    <AlertDescription>
                        You do not have permission to report actuals.
                    </AlertDescription>
                </Alert>
            ) : selectedBranch ? (
                <ActualsReportForm branchId={selectedBranch} year={year} />
            ) : (
                <Alert>
                    <Info className="h-4 w-4" />
                    <AlertDescription>
                        No branch selected or assigned. Please contact your administrator.
                    </AlertDescription>
                </Alert>
            )}
        </div>
    )
}
