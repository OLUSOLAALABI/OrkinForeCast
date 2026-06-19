"use client"

import { useState, useMemo } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { EditUserDialog } from "@/components/dashboard/edit-user-dialog"
import { Users, Pencil, Trash2, Loader2 } from "lucide-react"
import { deleteUser } from "@/app/dashboard/users/actions"

type Region = { id: string; name: string }
type Branch = { id: string; name: string; region_id: string; regions?: { name: string } | null }
type UserRow = {
  id: string
  email: string
  full_name: string | null
  role: string
  region_id: string | null
  branch_id: string | null
  created_at: string
  regions?: { name: string } | null
  branches?: { name: string } | null
}

const roleLabels: Record<string, { label: string; variant: "default" | "secondary" | "outline" }> = {
  hq_admin: { label: "HQ Admin", variant: "default" },
  region_admin: { label: "Region Admin", variant: "secondary" },
  branch_user: { label: "Branch User", variant: "outline" },
}

type Props = {
  users: UserRow[]
  regions: Region[]
  branches: Branch[]
  currentUserId?: string
}

export function UsersTable({ users, regions, branches, currentUserId }: Props) {
  const router = useRouter()
  const [editingUser, setEditingUser] = useState<UserRow | null>(null)
  const [deletingUser, setDeletingUser] = useState<UserRow | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [roleFilter, setRoleFilter] = useState<string>("all")

  const filteredUsers = useMemo(
    () => roleFilter === "all" ? users : users.filter((u) => u.role === roleFilter),
    [users, roleFilter]
  )

  return (
    <>
      <div className="flex items-center gap-2 mb-4">
        <Select value={roleFilter} onValueChange={setRoleFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Filter by role" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Roles</SelectItem>
            <SelectItem value="hq_admin">HQ Admin</SelectItem>
            <SelectItem value="region_admin">Region Admin</SelectItem>
            <SelectItem value="branch_user">Branch User</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>User</TableHead>
            <TableHead>Role</TableHead>
            <TableHead>Region</TableHead>
            <TableHead>Branch</TableHead>
            <TableHead>Joined</TableHead>
            <TableHead className="w-[80px]">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filteredUsers.map((u) => {
            const initials =
              u.full_name
                ?.split(" ")
                .map((n: string) => n[0])
                .join("")
                .toUpperCase() ||
              (u.email?.[0]?.toUpperCase() ?? "?")
            const role = roleLabels[u.role] || roleLabels.branch_user
            return (
              <TableRow key={u.id}>
                <TableCell>
                  <div className="flex items-center gap-3">
                    <Avatar className="h-8 w-8">
                      <AvatarFallback className="bg-primary/10 text-primary text-sm">
                        {initials}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="font-medium">{u.full_name || "Unnamed"}</p>
                      <p className="text-sm text-muted-foreground">{u.email}</p>
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant={role.variant}>{role.label}</Badge>
                </TableCell>
                <TableCell>
                  {u.regions?.name ?? <span className="text-muted-foreground">-</span>}
                </TableCell>
                <TableCell>
                  {u.branches?.name ?? <span className="text-muted-foreground">-</span>}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {new Date(u.created_at).toLocaleDateString()}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => setEditingUser(u)}
                      aria-label="Edit user"
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    {currentUserId && u.id !== currentUserId && (
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => setDeletingUser(u)}
                        aria-label="Delete user"
                        className="text-destructive hover:text-destructive hover:bg-destructive/10"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>

      {editingUser && (
        <EditUserDialog
          user={editingUser}
          regions={regions}
          branches={branches}
          open={!!editingUser}
          onOpenChange={(open) => !open && setEditingUser(null)}
        />
      )}

      <AlertDialog open={!!deletingUser} onOpenChange={(open) => !open && setDeletingUser(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete user</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete {deletingUser?.full_name || "Unnamed"} ({deletingUser?.email})?
              This will remove their account and they will no longer be able to sign in.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <Button
              variant="destructive"
              disabled={deleting}
              onClick={async () => {
                if (!deletingUser) return
                setDeleting(true)
                const result = await deleteUser(deletingUser.id)
                setDeleting(false)
                if (result.error) {
                  alert(result.error)
                  return
                }
                setDeletingUser(null)
                router.refresh()
              }}
            >
              {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Delete"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
