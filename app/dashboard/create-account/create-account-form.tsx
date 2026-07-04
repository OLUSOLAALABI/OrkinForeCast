"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Loader2, UserPlus } from "lucide-react"

type Region = { id: string; name: string }
type Branch = { id: string; name: string; region_id: string; regions?: { name: string } | null }

export function CreateAccountForm({ regions, branches }: { regions: Region[]; branches: Branch[] }) {
  const router = useRouter()
  const [fullName, setFullName] = useState("")
  const [email, setEmail] = useState("")
  const [role, setRole] = useState<"hq_admin" | "region_admin" | "branch_user" | "">("")
  const [regionId, setRegionId] = useState("")
  const [branchIds, setBranchIds] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const branchesByRegion = branches.reduce((groups, branch) => {
    const label = branch.regions?.name ?? "Other"
    const existing = groups.get(label) ?? []
    existing.push(branch)
    groups.set(label, existing)
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
    const trimmed = email.trim()
    if (!trimmed) {
      setError("Email is required")
      return
    }
    if (!role) {
      setError("Please select a role")
      return
    }
    if (role === "region_admin" && !regionId) {
      setError("Please select a region")
      return
    }
    if (role === "branch_user" && branchIds.length === 0) {
      setError("Please select at least one branch for Branch User")
      return
    }

    setLoading(true)
    setError(null)
    setSuccess(null)

    try {
      const res = await fetch("/api/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: trimmed,
          full_name: fullName.trim() || null,
          role,
          region_id: role === "region_admin" ? regionId || null : null,
          branch_ids: role === "branch_user" ? branchIds : [],
        }),
      })
      const data = await res.json().catch(() => ({}))

      if (!res.ok) {
        setError(data.error || "Failed to send invite")
        return
      }

      setSuccess(data.message || "Account created. The user will receive an email with their temporary password.")
      setFullName("")
      setEmail("")
      setRole("")
      setRegionId("")
      setBranchIds([])
      router.refresh()
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card className="max-w-md">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <UserPlus className="h-5 w-5" />
          Create account
        </CardTitle>
        <CardDescription>
          Enter their email and choose the role (HQ Admin, Region Admin, or Branch User). They will receive an email with a temporary password and can sign in right away.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          {success && (
            <Alert className="border-green-500/50 bg-green-500/10 text-green-700 dark:text-green-400">
              <AlertDescription>{success}</AlertDescription>
            </Alert>
          )}

          <div className="space-y-2">
            <Label htmlFor="role">Role</Label>
            <Select value={role} onValueChange={(v) => {
              setRole(v as "hq_admin" | "region_admin" | "branch_user" | "")
              setRegionId("")
              setBranchIds([])
            }}>
              <SelectTrigger id="role">
                <SelectValue placeholder="Select role" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="hq_admin">
                  HQ Admin — full access to all regions and branches
                </SelectItem>
                <SelectItem value="region_admin">
                  Region Admin — access to one region and its branches
                </SelectItem>
                <SelectItem value="branch_user">
                  Branch User — access to one or more specific branches
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {role === "region_admin" && (
            <div className="space-y-2">
              <Label htmlFor="region">Region</Label>
              <Select value={regionId} onValueChange={setRegionId}>
                <SelectTrigger id="region">
                  <SelectValue placeholder="Select region" />
                </SelectTrigger>
                <SelectContent>
                  {regions.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {role === "branch_user" && (
            <div className="space-y-2">
              <Label>Assigned Branches</Label>
              <div className="max-h-72 space-y-4 overflow-y-auto rounded-md border border-border p-3">
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
                Branch users can be assigned one or more specific branches under a single account.
              </p>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="full-name">Full name</Label>
            <Input
              id="full-name"
              type="text"
              placeholder="Jane Smith"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              placeholder="admin@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Creating account…
              </>
            ) : (
              <>
                <UserPlus className="mr-2 h-4 w-4" />
                Create account
              </>
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
