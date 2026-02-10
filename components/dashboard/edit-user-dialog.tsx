"use client"

import { useState, useEffect } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Loader2 } from "lucide-react"
import { updateUserProfile } from "@/app/dashboard/users/actions"

type Region = { id: string; name: string }
type Branch = { id: string; name: string; region_id: string; regions?: { name: string } | null }
type UserRow = {
  id: string
  email: string
  full_name: string | null
  role: string
  region_id: string | null
  branch_id: string | null
  regions?: { name: string } | null
  branches?: { name: string } | null
}

type Props = {
  user: UserRow
  regions: Region[]
  branches: Branch[]
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function EditUserDialog({ user, regions, branches, open, onOpenChange }: Props) {
  const [role, setRole] = useState(user.role)
  const [regionId, setRegionId] = useState(user.region_id ?? "")
  const [branchId, setBranchId] = useState(user.branch_id ?? "")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setRole(user.role)
      setRegionId(user.region_id ?? "")
      setBranchId(user.branch_id ?? "")
      setError(null)
    }
  }, [open, user])

  const filteredBranches = regionId
    ? branches.filter((b) => b.region_id === regionId)
    : []

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if ((role === "region_admin" || role === "branch_user") && !regionId) {
      setError("Select a region for this role")
      return
    }
    if (role === "branch_user" && !branchId) {
      setError("Select a branch for branch user")
      return
    }
    setSaving(true)
    setError(null)
    const result = await updateUserProfile(user.id, {
      role,
      region_id: role === "hq_admin" ? null : regionId || null,
      branch_id: role === "branch_user" ? branchId || null : null,
    })
    setSaving(false)
    if (result.error) {
      setError(result.error)
      return
    }
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit user</DialogTitle>
          <DialogDescription>
            {user.full_name || "Unnamed"} ({user.email})
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}
          <div className="space-y-2">
            <Label>Role</Label>
            <Select value={role} onValueChange={setRole}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="hq_admin">HQ Admin</SelectItem>
                <SelectItem value="region_admin">Region Admin</SelectItem>
                <SelectItem value="branch_user">Branch User</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {(role === "region_admin" || role === "branch_user") && (
            <>
              <div className="space-y-2">
                <Label>Region</Label>
                <Select value={regionId} onValueChange={(v) => { setRegionId(v); setBranchId("") }}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select region" />
                  </SelectTrigger>
                  <SelectContent>
                    {regions.map((r) => (
                      <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {role === "branch_user" && (
                <div className="space-y-2">
                  <Label>Branch</Label>
                  <Select value={branchId} onValueChange={setBranchId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select branch" />
                    </SelectTrigger>
                    <SelectContent>
                      {filteredBranches.map((b) => (
                        <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
