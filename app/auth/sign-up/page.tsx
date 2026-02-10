"use client"

import React from "react"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import Image from "next/image"
import { Loader2, Eye, EyeOff } from "lucide-react"

type Region = {
  id: string
  name: string
}

type Branch = {
  id: string
  name: string
  region_id: string
}

export default function SignUpPage() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [fullName, setFullName] = useState("")
  const [regionId, setRegionId] = useState<string>("")
  const [branchId, setBranchId] = useState<string>("")
  const [regions, setRegions] = useState<Region[]>([])
  const [branches, setBranches] = useState<Branch[]>([])
  const [filteredBranches, setFilteredBranches] = useState<Branch[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  // Public sign-up is for Branch Users only. HQ Admin and Region Admin are
  // created by an existing HQ admin (Dashboard → Users or Supabase).
  const role = "branch_user"

  useEffect(() => {
    const fetchData = async () => {
      const supabase = createClient()
      const [regionsRes, branchesRes] = await Promise.all([
        supabase.from("regions").select("*").order("name"),
        supabase.from("branches").select("*").order("name"),
      ])
      if (regionsRes.data) setRegions(regionsRes.data)
      if (branchesRes.data) setBranches(branchesRes.data)
    }
    fetchData()
  }, [])

  useEffect(() => {
    if (regionId) {
      setFilteredBranches(branches.filter((b) => b.region_id === regionId))
      setBranchId("")
    } else {
      setFilteredBranches([])
    }
  }, [regionId, branches])

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    if (!regionId || !branchId) {
      setError("Please select your region and branch")
      setLoading(false)
      return
    }

    const supabase = createClient()
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo:
          process.env.NEXT_PUBLIC_APP_URL
            ? `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback?next=/dashboard`
            : `${window.location.origin}/auth/callback?next=/dashboard`,
        data: {
          full_name: fullName,
          role: role,
        },
      },
    })

    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }

    // Update profile with region/branch after signup
    const { data: userData } = await supabase.auth.getUser()
    if (userData.user) {
      await supabase
        .from("profiles")
        .update({
          region_id: regionId || null,
          branch_id: branchId || null,
        })
        .eq("id", userData.user.id)
    }

    router.push(`/auth/sign-up-success?email=${encodeURIComponent(email.trim())}`)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <Image src="/orkinlogo.png" alt="Orkin" width={140} height={40} className="h-10 w-auto" priority />
          </div>
          <CardTitle className="text-2xl">Create account</CardTitle>
          <CardDescription>Sign up as a Branch User to access the Orkin forecasting system</CardDescription>
        </CardHeader>
        <form onSubmit={handleSignUp}>
          <CardContent className="space-y-4">
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <div className="space-y-2">
              <Label htmlFor="fullName">Full Name</Label>
              <Input
                id="fullName"
                placeholder="John Doe"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="Create a password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pr-10"
                  required
                  minLength={6}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                  onClick={() => setShowPassword((prev) => !prev)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <Eye className="h-4 w-4 text-muted-foreground" />
                  )}
                </Button>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="region">Region</Label>
              <Select value={regionId} onValueChange={setRegionId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select your region" />
                </SelectTrigger>
                <SelectContent>
                  {regions.map((region) => (
                    <SelectItem key={region.id} value={region.id}>
                      {region.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="branch">Branch</Label>
              <Select
                value={branchId}
                onValueChange={setBranchId}
                disabled={!regionId}
              >
                <SelectTrigger>
                  <SelectValue placeholder={regionId ? "Select your branch" : "Select a region first"} />
                </SelectTrigger>
                <SelectContent>
                  {regionId ? (
                    filteredBranches.length > 0 ? (
                      filteredBranches.map((branch) => (
                        <SelectItem key={branch.id} value={branch.id}>
                          {branch.name}
                        </SelectItem>
                      ))
                    ) : (
                      <div className="py-2 px-2 text-sm text-muted-foreground">No branches in this region</div>
                    )
                  ) : (
                    <div className="py-2 px-2 text-sm text-muted-foreground">Select a region first</div>
                  )}
                </SelectContent>
              </Select>
              {regionId && !branchId && (
                <p className="text-sm text-muted-foreground">Select a branch in your region</p>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Need an HQ Admin or Region Admin account? Ask your administrator to create one from the Dashboard or Supabase.
            </p>
          </CardContent>
          <CardFooter className="flex flex-col gap-4">
            <Button type="submit" className="w-full" disabled={loading || !regionId || !branchId}>
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating account...
                </>
              ) : (
                "Create account"
              )}
            </Button>
            <p className="text-sm text-muted-foreground text-center">
              Already have an account?{" "}
              <Link href="/auth/login" className="text-primary hover:underline font-medium">
                Sign in
              </Link>
            </p>
          </CardFooter>
        </form>
      </Card>
    </div>
  )
}
