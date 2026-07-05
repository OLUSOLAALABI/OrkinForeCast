"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { LocalDate } from "@/components/local-date"
import { CheckCircle2, Clock3, Loader2, RotateCcw } from "lucide-react"

const YEARS = [2024, 2025, 2026, 2027, 2028]
const MONTHS = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

type BranchRow = {
  id: string
  name: string
  code: string
}

type StatusRow = {
  branch_id: string
  month: number
  is_completed: boolean
  completed_at: string | null
  completed_by: string | null
  unlocked_at: string | null
  unlocked_by: string | null
}

type DisplayRow = {
  branchId: string
  branchName: string
  branchCode: string
  status: "completed" | "rework" | "pending"
  completedAt: string | null
  completedByName: string | null
  unlockedAt: string | null
  unlockedByName: string | null
}

export function ForecastVerificationStatusTable() {
  const [year, setYear] = useState(2026)
  const [month, setMonth] = useState(new Date().getMonth() + 1)
  const [rows, setRows] = useState<DisplayRow[]>([])
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  const loadRows = useCallback(async () => {
    setLoading(true)

    const [{ data: branches, error: branchError }, { data: statuses, error: statusError }] = await Promise.all([
      supabase.from("branches").select("id, name, code").order("name"),
      supabase
        .from("forecast_month_status")
        .select("branch_id, month, is_completed, completed_at, completed_by, unlocked_at, unlocked_by")
        .eq("year", year)
        .eq("month", month),
    ])

    if (branchError) {
      console.error("Error loading verification branches:", branchError)
      setRows([])
      setLoading(false)
      return
    }

    if (statusError) {
      console.error("Error loading verification status:", statusError)
      setRows([])
      setLoading(false)
      return
    }

    const userIds = [...new Set(
      (statuses ?? []).flatMap((row) => [row.completed_by, row.unlocked_by]).filter((value): value is string => Boolean(value))
    )]

    const { data: nameRows } = userIds.length > 0
      ? await supabase.rpc("resolve_user_names", { user_ids: userIds })
      : { data: [] }

    const nameMap = new Map<string, string>(
      (nameRows ?? []).map((row: { id: string; display_name: string }) => [row.id, row.display_name])
    )

    const statusByBranch = new Map<string, StatusRow>()
    for (const row of (statuses ?? []) as StatusRow[]) {
      statusByBranch.set(row.branch_id, row)
    }

    const nextRows = ((branches ?? []) as BranchRow[]).map((branch) => {
      const status = statusByBranch.get(branch.id)
      const rowStatus: DisplayRow["status"] = status?.is_completed
        ? "completed"
        : status?.unlocked_at
          ? "rework"
          : "pending"

      return {
        branchId: branch.id,
        branchName: branch.name,
        branchCode: branch.code,
        status: rowStatus,
        completedAt: status?.completed_at ?? null,
        completedByName: status?.completed_by ? (nameMap.get(status.completed_by) ?? "Unknown") : null,
        unlockedAt: status?.unlocked_at ?? null,
        unlockedByName: status?.unlocked_by ? (nameMap.get(status.unlocked_by) ?? "Unknown") : null,
      }
    })

    setRows(nextRows)
    setLoading(false)
  }, [month, supabase, year])

  useEffect(() => {
    loadRows()
  }, [loadRows])

  const completedCount = useMemo(
    () => rows.filter((row) => row.status === "completed").length,
    [rows]
  )

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5" />
              Verification Status
            </CardTitle>
            <CardDescription>
              Current completion snapshot by branch for {MONTHS[month]} {year}.
            </CardDescription>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Select value={String(year)} onValueChange={(value) => setYear(Number(value))}>
              <SelectTrigger className="w-[110px]">
                <SelectValue placeholder="Year" />
              </SelectTrigger>
              <SelectContent>
                {YEARS.map((option) => (
                  <SelectItem key={option} value={String(option)}>{option}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={String(month)} onValueChange={(value) => setMonth(Number(value))}>
              <SelectTrigger className="w-[120px]">
                <SelectValue placeholder="Month" />
              </SelectTrigger>
              <SelectContent>
                {MONTHS.slice(1).map((label, index) => (
                  <SelectItem key={label} value={String(index + 1)}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12">
            <Clock3 className="h-12 w-12 text-muted-foreground mb-4" />
            <h2 className="text-xl font-semibold">No branches available</h2>
            <p className="text-muted-foreground mt-2">
              No branch data is available for the selected scope.
            </p>
          </div>
        ) : (
          <>
            <div className="mb-4 text-sm text-muted-foreground">
              {completedCount} of {rows.length} branches completed for {MONTHS[month]} {year}.
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Branch</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Completed By</TableHead>
                  <TableHead>Completed At</TableHead>
                  <TableHead>Last Unlocked</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.branchId}>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-medium">{row.branchName}</span>
                        <span className="text-xs text-muted-foreground uppercase">{row.branchCode}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      {row.status === "completed" ? (
                        <Badge>Completed</Badge>
                      ) : row.status === "rework" ? (
                        <Badge variant="secondary">Open for Rework</Badge>
                      ) : (
                        <Badge variant="outline">Pending</Badge>
                      )}
                    </TableCell>
                    <TableCell>{row.completedByName ?? <span className="text-muted-foreground">-</span>}</TableCell>
                    <TableCell>
                      {row.completedAt ? <LocalDate date={row.completedAt} /> : <span className="text-muted-foreground">-</span>}
                    </TableCell>
                    <TableCell>
                      {row.unlockedAt ? (
                        <div className="flex flex-col">
                          <span>{row.unlockedByName ?? "Unknown"}</span>
                          <span className="text-xs text-muted-foreground">
                            <LocalDate date={row.unlockedAt} />
                          </span>
                        </div>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </>
        )}
      </CardContent>
    </Card>
  )
}