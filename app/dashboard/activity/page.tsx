import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
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
import { Badge } from "@/components/ui/badge"
import { History, FileSpreadsheet, Pencil } from "lucide-react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { formatCurrency } from "@/lib/forecasting"

export default async function ActivityPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect("/auth/login")

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, branch_id, region_id")
    .eq("id", user.id)
    .single()

  if (!profile) redirect("/auth/login")

  // Fetch uploads with branch name (RLS scopes by role)
  let query = supabase
    .from("uploads")
    .select("*, branches(name)")
    .order("created_at", { ascending: false })
    .limit(100)

  if (profile.role === "branch_user" && profile.branch_id) {
    query = query.eq("branch_id", profile.branch_id)
  } else if (profile.role === "region_admin" && profile.region_id) {
    const { data: regionBranches } = await supabase
      .from("branches")
      .select("id")
      .eq("region_id", profile.region_id)
    const branchIds = regionBranches?.map((b) => b.id) ?? []
    if (branchIds.length > 0) {
      query = query.in("branch_id", branchIds)
    }
  }

  const { data: uploads } = await query
  const rows = uploads ?? []

  // Fetch forecast audit log with branch name (RLS scopes by role)
  const { data: auditLogs } = await supabase
    .from("forecast_audit_log")
    .select("*, branches(name)")
    .order("created_at", { ascending: false })
    .limit(200)

  const auditRows = auditLogs ?? []

  // Fetch user names from profiles for both uploads and audit logs
  const allUserIds = [
    ...new Set([
      ...rows.map((u: { user_id: string }) => u.user_id),
      ...auditRows.map((a: { user_id: string }) => a.user_id),
    ]),
  ]
  const { data: profilesList } = allUserIds.length > 0
    ? await supabase.from("profiles").select("id, full_name, email").in("id", allUserIds)
    : { data: [] }
  const userMap = new Map(
    (profilesList ?? []).map((p: { id: string; full_name: string | null; email: string }) => [
      p.id,
      p.full_name || p.email || "Unknown",
    ])
  )

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-foreground">Activity</h1>
        <p className="text-muted-foreground mt-1">
          Activity history (imports and data changes)
        </p>
      </div>

      <Tabs defaultValue="forecast-changes" className="space-y-4">
        <TabsList>
          <TabsTrigger value="forecast-changes" className="flex items-center gap-2">
            <Pencil className="h-4 w-4" />
            Forecast Changes
          </TabsTrigger>
          <TabsTrigger value="upload-history" className="flex items-center gap-2">
            <History className="h-4 w-4" />
            Upload History
          </TabsTrigger>
        </TabsList>

        <TabsContent value="forecast-changes">
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
                  {auditRows.map((entry: {
                    id: string
                    user_id: string
                    created_at: string
                    description: string
                    year: number
                    month: number
                    old_value: number
                    new_value: number
                    branches?: { name: string } | null
                  }) => {
                    const userName = userMap.get(entry.user_id) ?? "Unknown"
                    const change = Number(entry.new_value) - Number(entry.old_value)
                    const monthNames = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
                    return (
                      <TableRow key={entry.id}>
                        <TableCell className="text-muted-foreground whitespace-nowrap">
                          <LocalDate date={entry.created_at} />
                        </TableCell>
                        <TableCell>{userName}</TableCell>
                        <TableCell>{entry.branches?.name ?? "-"}</TableCell>
                        <TableCell className="font-medium">{entry.description}</TableCell>
                        <TableCell>{monthNames[entry.month]} {entry.year}</TableCell>
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

              {auditRows.length === 0 && (
                <div className="flex flex-col items-center justify-center py-12">
                  <Pencil className="h-12 w-12 text-muted-foreground mb-4" />
                  <h2 className="text-xl font-semibold">No forecast changes yet</h2>
                  <p className="text-muted-foreground mt-2">
                    Edits to forecast values will appear here.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="upload-history">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <History className="h-5 w-5" />
                Upload history
              </CardTitle>
              <CardDescription>
                Record of data imports by user and branch
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>User</TableHead>
                    <TableHead>Branch</TableHead>
                    <TableHead>File</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Year</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((upload: {
                    id: string
                    user_id: string
                    created_at: string
                    file_name: string
                    upload_type: string
                    year: number
                    branches?: { name: string } | null
                  }) => {
                    const userName = userMap.get(upload.user_id) ?? "Unknown"
                    return (
                      <TableRow key={upload.id}>
                        <TableCell className="text-muted-foreground whitespace-nowrap">
                          <LocalDate date={upload.created_at} />
                        </TableCell>
                        <TableCell>{userName}</TableCell>
                        <TableCell>{upload.branches?.name ?? "-"}</TableCell>
                        <TableCell className="flex items-center gap-2">
                          <FileSpreadsheet className="h-4 w-4 text-muted-foreground" />
                          {upload.file_name}
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary">{upload.upload_type}</Badge>
                        </TableCell>
                        <TableCell>{upload.year}</TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>

              {(!rows || rows.length === 0) && (
                <div className="flex flex-col items-center justify-center py-12">
                  <History className="h-12 w-12 text-muted-foreground mb-4" />
                  <h2 className="text-xl font-semibold">No uploads yet</h2>
                  <p className="text-muted-foreground mt-2">
                    Activity will appear here when data is imported.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
