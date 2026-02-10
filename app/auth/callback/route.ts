import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

/**
 * Auth callback: exchanges code from Supabase (email confirm, password reset, etc.)
 * and redirects to the `next` URL or dashboard. On error, redirects to login so
 * the user always sees the sign-in page instead of a blank page.
 */
export async function GET(request: Request) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get("code")
  const errorParam = requestUrl.searchParams.get("error")
  const next = requestUrl.searchParams.get("next") ?? "/dashboard"

  const loginUrl = new URL("/auth/login", requestUrl.origin)

  if (errorParam) {
    loginUrl.searchParams.set("error", errorParam === "otp_expired" ? "otp_expired" : "auth_callback_failed")
    return NextResponse.redirect(loginUrl)
  }

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      return NextResponse.redirect(new URL(next, requestUrl.origin))
    }
  }

  loginUrl.searchParams.set("error", "auth_callback_failed")
  return NextResponse.redirect(loginUrl)
}
