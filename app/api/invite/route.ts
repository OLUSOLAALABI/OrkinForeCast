import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single()

    if (profile?.role !== "hq_admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const body = await request.json()
    const email = typeof body?.email === "string" ? body.email.trim() : ""
    if (!email) {
      return NextResponse.json(
        { error: "Email is required" },
        { status: 400 }
      )
    }

    const appUrl =
      process.env.NEXT_PUBLIC_APP_URL ||
      request.headers.get("origin") ||
      "http://localhost:3000"
    const redirectTo = `${appUrl.replace(/\/$/, "")}/auth/callback`

    let admin
    try {
      admin = createAdminClient()
    } catch {
      return NextResponse.json(
        {
          error:
            "Invite not configured. Set SUPABASE_SERVICE_ROLE_KEY in .env (see SUPABASE_SETUP.md).",
        },
        { status: 503 }
      )
    }

    const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
      redirectTo,
    })

    if (error) {
      return NextResponse.json(
        { error: error.message || "Failed to send invite" },
        { status: 400 }
      )
    }

    return NextResponse.json({
      success: true,
      message:
        "Invite sent. When they sign in, edit their profile on the Users page to set role, region, and branch.",
    })
  } catch (e) {
    console.error("Invite error:", e)
    return NextResponse.json(
      { error: "Something went wrong" },
      { status: 500 }
    )
  }
}
