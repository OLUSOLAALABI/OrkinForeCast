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
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
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
  assigned_branches?: Array<{
    branch_id: string
    branches?: { id: string; name: string; region_id: string; regions?: { name: string } | null } | null
  }>
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
  const [branchIds, setBranchIds] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setRole(user.role)
      setRegionId(user.region_id ?? "")
      setBranchIds(
        user.assigned_branches && user.assigned_branches.length > 0
          ? user.assigned_branches.map((assignment) => assignment.branch_id)
          : user.branch_id
            ? [user.branch_id]
            : []
      )
      setError(null)
    }
  }, [open, user])

  const branchesByRegion = branches.reduce((groups, branch) => {
    const regionName = branch.regions?.name ?? "Other"
    const existing = groups.get(regionName) ?? []
    existing.push(branch)
    groups.set(regionName, existing)
    return groups
  }, new Map<string, Branch[]>())

  const toggleBranch = (branchId: string, checked: boolean | "indeterminate") => {
    setBranchIds((current) => {
      if (checked === true) {
        return current.includes(branchId) ? current : [...current, branchId]
      }

      return current.filter((value) => value !== branchId)
    })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (role === "region_admin" && !regionId) {
      setError("Select a region for this role")
      return
    }
    if (role === "branch_user" && branchIds.length === 0) {
      setError("Select at least one branch for Branch User")
      return
    }
    setSaving(true)
    setError(null)
    const result = await updateUserProfile(user.id, {
      role,
      region_id: role === "region_admin" ? regionId || null : null,
      branch_ids: role === "branch_user" ? branchIds : [],
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
            <Select value={role} onValueChange={(value) => {
              setRole(value)
              if (value !== "region_admin") {
                setRegionId("")
              }
              if (value !== "branch_user") {
                setBranchIds([])
              }
            }}>
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
          {role === "region_admin" && (
            <div className="space-y-2">
              <Label>Region</Label>
              <Select value={regionId} onValueChange={setRegionId}>
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
          )}
          {role === "branch_user" && (
            <div className="space-y-2">
              <Label>Assigned Branches</Label>
              <div className="max-h-64 space-y-4 overflow-y-auto rounded-md border border-border p-3">
                {[...branchesByRegion.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([regionName, regionBranches]) => (
                  <div key={regionName} className="space-y-2">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{regionName}</p>
                    <div className="space-y-2">
                      {regionBranches.map((branch) => (
                        <label key={branch.id} className="flex items-center gap-3 text-sm">
                          <Checkbox
                            checked={branchIds.includes(branch.id)}
                            onCheckedChange={(checked) => toggleBranch(branch.id, checked)}
                          />
                          <span>{branch.name}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                Branch users can be assigned one or more specific branches.
              </p>
            </div>
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
