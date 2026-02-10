import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Users, Shield, Building2, MapPin } from "lucide-react"
import { UsersTable } from "@/components/dashboard/users-table"
import { InviteUserButton } from "@/components/dashboard/invite-user-dialog"

export default async function UsersPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect("/auth/login")

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single()

  if (profile?.role !== "hq_admin") {
    redirect("/dashboard")
  }

  // Fetch all users with their regions and branches
  const { data: users } = await supabase
    .from("profiles")
    .select("*, regions(name), branches(name)")
    .order("created_at", { ascending: false })

  // Fetch regions and branches for edit dropdowns
  const { data: regions } = await supabase
    .from("regions")
    .select("id, name")
    .order("name")
  const { data: branches } = await supabase
    .from("branches")
    .select("id, name, region_id, regions(name)")
    .order("name")

  // Calculate stats
  const totalUsers = users?.length || 0
  const hqAdmins = users?.filter(u => u.role === "hq_admin").length || 0
  const regionAdmins = users?.filter(u => u.role === "region_admin").length || 0
  const branchUsers = users?.filter(u => u.role === "branch_user").length || 0

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-foreground">User Management</h1>
        <p className="text-muted-foreground mt-1">
          View and manage all users in the system
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Users
            </CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalUsers}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              HQ Admins
            </CardTitle>
            <Shield className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{hqAdmins}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Region Admins
            </CardTitle>
            <MapPin className="h-4 w-4 text-accent" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{regionAdmins}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Branch Users
            </CardTitle>
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{branchUsers}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between space-y-0 gap-4">
          <div>
            <CardTitle>All Users</CardTitle>
            <CardDescription>Complete list of registered users. Invite new users or click Edit to change role, region, or branch.</CardDescription>
          </div>
          <InviteUserButton />
        </CardHeader>
        <CardContent>
          {users && users.length > 0 ? (
            <UsersTable
              users={users}
              regions={regions ?? []}
              branches={branches ?? []}
            />
          ) : (
            <div className="flex flex-col items-center justify-center py-12">
              <Users className="h-12 w-12 text-muted-foreground mb-4" />
              <h2 className="text-xl font-semibold">No Users Found</h2>
              <p className="text-muted-foreground mt-2">
                No users have registered yet.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
