import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

/**
 * Auth callback: exchanges code from Supabase (email confirm, password reset, etc.)
 * and redirects to the `next` URL or dashboard.
 */
export async function GET(request: Request) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get("code")
  const next = requestUrl.searchParams.get("next") ?? "/dashboard"

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      return NextResponse.redirect(new URL(next, requestUrl.origin))
    }
  }

  // No code or exchange failed: redirect to login with error
  const redirectUrl = new URL("/auth/login", requestUrl.origin)
  redirectUrl.searchParams.set("error", "auth_callback_failed")
  return NextResponse.redirect(redirectUrl)
}
