"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Loader2, UserPlus, Shield, MapPin } from "lucide-react"

type Region = { id: string; name: string }

export function CreateAccountForm({ regions }: { regions: Region[] }) {
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [role, setRole] = useState<"hq_admin" | "region_admin" | "">("")
  const [regionId, setRegionId] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = email.trim()
    if (!trimmed) {
      setError("Email is required")
      return
    }
    if (!role) {
      setError("Please select a role (HQ Admin or Region Admin)")
      return
    }
    if (role === "region_admin" && !regionId) {
      setError("Please select a region for Region Admin")
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
          role,
          region_id: role === "region_admin" ? regionId : null,
        }),
      })
      const data = await res.json().catch(() => ({}))

      if (!res.ok) {
        setError(data.error || "Failed to send invite")
        return
      }

      setSuccess(data.message || "Invite sent.")
      setEmail("")
      setRole("")
      setRegionId("")
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
          Create HQ or Region Admin account
        </CardTitle>
        <CardDescription>
          Enter their email and choose the role. They will receive an invite and get the right access when they sign in.
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
            <Select value={role} onValueChange={(v) => { setRole(v as "hq_admin" | "region_admin" | ""); setRegionId("") }}>
              <SelectTrigger id="role">
                <SelectValue placeholder="Select role" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="hq_admin">
                  <span className="flex items-center gap-2">
                    <Shield className="h-4 w-4" />
                    HQ Admin — full access to all regions and branches
                  </span>
                </SelectItem>
                <SelectItem value="region_admin">
                  <span className="flex items-center gap-2">
                    <MapPin className="h-4 w-4" />
                    Region Admin — access to one region and its branches
                  </span>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {role === "region_admin" && (
            <div className="space-y-2">
              <Label htmlFor="region">Region</Label>
              <Select value={regionId} onValueChange={setRegionId} required={role === "region_admin"}>
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
                Sending invite…
              </>
            ) : (
              <>
                <UserPlus className="mr-2 h-4 w-4" />
                Send invite
              </>
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
