"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"

/**
 * Handles Supabase auth redirects that use the URL hash (e.g. after email confirm).
 * Supabase can redirect to Site URL with #error=... or #access_token=...; the server
 * never sees the hash, so we redirect to the right page here.
 */
export function AuthHashHandler() {
  const router = useRouter()

  useEffect(() => {
    if (typeof window === "undefined" || !window.location.hash) return

    const hash = window.location.hash.slice(1)
    const params = new URLSearchParams(hash)

    const error = params.get("error")
    const errorCode = params.get("error_code")
    const accessToken = params.get("access_token")
    const refreshToken = params.get("refresh_token")

    if (error || errorCode) {
      const search = new URLSearchParams()
      search.set("error", errorCode === "otp_expired" ? "otp_expired" : "auth_failed")
      router.replace(`/auth/login?${search.toString()}`, { scroll: true })
      return
    }

    if (accessToken && refreshToken) {
      const supabase = createClient()
      supabase.auth
        .setSession({ access_token: accessToken, refresh_token: refreshToken })
        .then(() => {
          const next = params.get("next") || "/dashboard"
          router.replace(next, { scroll: true })
        })
        .catch(() => {
          router.replace("/auth/login?error=auth_failed", { scroll: true })
        })
    }
  }, [router])

  return null
}
