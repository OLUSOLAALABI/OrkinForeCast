"use client"

import { useEffect, useState, useCallback } from "react"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { LocalDate } from "@/components/local-date"
import { formatCurrency } from "@/lib/forecasting"
import { Pencil, Loader2, ChevronLeft, ChevronRight } from "lucide-react"

const PAGE_SIZE = 50
const MONTH_NAMES = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

type AuditEntry = {
  id: string
  user_id: string
  created_at: string
  description: string
  year: number
  month: number
  old_value: number
  new_value: number
  branches?: { name: string } | null
}

export function ForecastAuditTable() {
  const [rows, setRows] = useState<AuditEntry[]>([])
  const [userMap, setUserMap] = useState<Map<string, string>>(new Map())
  const [page, setPage] = useState(0)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)

  const fetchPage = useCallback(async (pageNum: number) => {
    setLoading(true)
    const supabase = createClient()
    const from = pageNum * PAGE_SIZE
    const to = from + PAGE_SIZE - 1

    const { data, count } = await supabase
      .from("forecast_audit_log")
      .select("*, branches(name)", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(from, to)

    const entries = data ?? []
    setRows(entries)
    setTotal(count ?? 0)

    // Resolve user names
    const userIds = [...new Set(entries.map((e) => e.user_id))]
    if (userIds.length > 0) {
      const { data: profiles } = await supabase.rpc("resolve_user_names", { user_ids: userIds })
      setUserMap(new Map((profiles ?? []).map((p: { id: string; display_name: string }) => [p.id, p.display_name])))
    } else {
      setUserMap(new Map())
    }

    setLoading(false)
  }, [])

  useEffect(() => {
    fetchPage(page)
  }, [page, fetchPage])

  const totalPages = Math.ceil(total / PAGE_SIZE)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Pencil className="h-5 w-5" />
          Forecast edit history
        </CardTitle>
        <CardDescription>
          Manual adjustments to forecast values by user and branch
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : rows.length === 0 && page === 0 ? (
          <div className="flex flex-col items-center justify-center py-12">
            <Pencil className="h-12 w-12 text-muted-foreground mb-4" />
            <h2 className="text-xl font-semibold">No forecast changes yet</h2>
            <p className="text-muted-foreground mt-2">
              Edits to forecast values will appear here.
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
                  <TableHead>Description</TableHead>
                  <TableHead>Month</TableHead>
                  <TableHead className="text-right">Old Value</TableHead>
                  <TableHead className="text-right">New Value</TableHead>
                  <TableHead className="text-right">Change</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((entry) => {
                  const userName = userMap.get(entry.user_id) ?? "Unknown"
                  const change = Number(entry.new_value) - Number(entry.old_value)
                  return (
                    <TableRow key={entry.id}>
                      <TableCell className="text-muted-foreground whitespace-nowrap">
                        <LocalDate date={entry.created_at} />
                      </TableCell>
                      <TableCell>{userName}</TableCell>
                      <TableCell>{entry.branches?.name ?? "-"}</TableCell>
                      <TableCell className="font-medium">{entry.description}</TableCell>
                      <TableCell>{MONTH_NAMES[entry.month]} {entry.year}</TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        {formatCurrency(Number(entry.old_value))}
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {formatCurrency(Number(entry.new_value))}
                      </TableCell>
                      <TableCell className={`text-right font-medium ${change >= 0 ? "text-green-600" : "text-red-600"}`}>
                        {change >= 0 ? "+" : ""}{formatCurrency(change)}
                      </TableCell>
                    </TableRow>
                  )
                })}
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
                  onClick={() => setPage((p) => p - 1)}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                {Array.from({ length: totalPages }, (_, i) => {
                  // Show first, last, current, and neighbors; ellipsis for gaps
                  const show = i === 0 || i === totalPages - 1 || Math.abs(i - page) <= 1
                  const prevShown = i === 0 || i === 1 || i === totalPages - 1 || Math.abs(i - 1 - page) <= 1
                  if (!show) {
                    // Show ellipsis only once per gap
                    if (prevShown) return <span key={i} className="px-1 text-sm text-muted-foreground">...</span>
                    return null
                  }
                  return (
                    <Button
                      key={i}
                      variant={i === page ? "default" : "outline"}
                      size="sm"
                      className="min-w-8"
                      onClick={() => setPage(i)}
                    >
                      {i + 1}
                    </Button>
                  )
                })}
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page + 1 >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
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
