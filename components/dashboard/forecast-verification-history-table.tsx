"use client"

import { useCallback, useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { LocalDate } from "@/components/local-date"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { CheckCircle2, ChevronLeft, ChevronRight, Loader2, RotateCcw } from "lucide-react"

const PAGE_SIZE = 50
const MONTH_NAMES = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

type HistoryEntry = {
  id: string
  branch_id: string
  year: number
  month: number
  event_type: "completed" | "unlocked"
  actor_user_id: string | null
  note: string | null
  created_at: string
  branches?: { name: string } | null
}

export function ForecastVerificationHistoryTable() {
  const [rows, setRows] = useState<HistoryEntry[]>([])
  const [userMap, setUserMap] = useState<Map<string, string>>(new Map())
  const [page, setPage] = useState(0)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)

  const fetchPage = useCallback(async (pageNum: number) => {
    setLoading(true)
    const supabase = createClient()
    const from = pageNum * PAGE_SIZE
    const to = from + PAGE_SIZE - 1

    const { data, count, error } = await supabase
      .from("forecast_month_status_history")
      .select("*, branches(name)", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(from, to)

    if (error) {
      console.error("Error loading verification history:", error)
      setRows([])
      setTotal(0)
      setUserMap(new Map())
      setLoading(false)
      return
    }

    const entries = (data ?? []) as HistoryEntry[]
    setRows(entries)
    setTotal(count ?? 0)

    const userIds = [...new Set(entries.map((entry) => entry.actor_user_id).filter((value): value is string => Boolean(value)))]
    if (userIds.length > 0) {
      const { data: profiles } = await supabase.rpc("resolve_user_names", { user_ids: userIds })
      setUserMap(new Map((profiles ?? []).map((row: { id: string; display_name: string }) => [row.id, row.display_name])))
    } else {
      setUserMap(new Map())
    }

    setLoading(false)
  }, [])

  useEffect(() => {
    fetchPage(page)
  }, [fetchPage, page])

  const totalPages = Math.ceil(total / PAGE_SIZE)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CheckCircle2 className="h-5 w-5" />
          Verification History
        </CardTitle>
        <CardDescription>
          Completion and unlock events for branch forecast verification.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : rows.length === 0 && page === 0 ? (
          <div className="flex flex-col items-center justify-center py-12">
            <CheckCircle2 className="h-12 w-12 text-muted-foreground mb-4" />
            <h2 className="text-xl font-semibold">No verification events yet</h2>
            <p className="text-muted-foreground mt-2">
              Completion and unlock activity will appear here.
            </p>
          </div>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>User</TableHead>
                  <TableHead>Branch</TableHead>
                  <TableHead>Month</TableHead>
                  <TableHead>Event</TableHead>
                  <TableHead>Note</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell className="text-muted-foreground whitespace-nowrap">
                      <LocalDate date={entry.created_at} />
                    </TableCell>
                    <TableCell>{entry.actor_user_id ? (userMap.get(entry.actor_user_id) ?? "Unknown") : "Unknown"}</TableCell>
                    <TableCell>{entry.branches?.name ?? "-"}</TableCell>
                    <TableCell>{MONTH_NAMES[entry.month]} {entry.year}</TableCell>
                    <TableCell>
                      {entry.event_type === "completed" ? (
                        <Badge>Completed forecast</Badge>
                      ) : (
                        <Badge variant="secondary" className="gap-1">
                          <RotateCcw className="h-3 w-3" />
                          Unlocked for rework
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>{entry.note ?? <span className="text-muted-foreground">-</span>}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            <div className="flex items-center justify-between pt-4">
              <p className="text-sm text-muted-foreground">
                Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} of {total}
              </p>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page === 0}
                  onClick={() => setPage((current) => current - 1)}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page + 1 >= totalPages}
                  onClick={() => setPage((current) => current + 1)}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}