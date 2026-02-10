"use client"

import { useState } from "react"
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
import { EditUserDialog } from "@/components/dashboard/edit-user-dialog"
import { Users, Pencil } from "lucide-react"

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
}

export function UsersTable({ users, regions, branches }: Props) {
  const [editingUser, setEditingUser] = useState<UserRow | null>(null)

  return (
    <>
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
          {users.map((u) => {
            const initials = u.full_name
              ?.split(" ")
              .map((n: string) => n[0])
              .join("")
              .toUpperCase() || u.email[0].toUpperCase()
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
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => setEditingUser(u)}
                    aria-label="Edit user"
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
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
    </>
  )
}
