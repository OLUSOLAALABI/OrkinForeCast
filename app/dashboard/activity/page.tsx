import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { History, FileSpreadsheet } from "lucide-react"

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

  // Fetch user names from profiles (uploads.user_id = profiles.id)
  const userIds = [...new Set(rows.map((u: { user_id: string }) => u.user_id))]
  const { data: profilesList } = userIds.length > 0
    ? await supabase.from("profiles").select("id, full_name, email").in("id", userIds)
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
                      {new Date(upload.created_at).toLocaleString()}
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
              <h2 className="text-xl font-semibold">No activity yet</h2>
              <p className="text-muted-foreground mt-2">
                Activity will appear here when data is imported or changed.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
