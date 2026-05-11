import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { randomBytes } from "crypto"

/** Generates a random 12-character password: letters + digits. */
function generateTempPassword(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789"
  return Array.from(randomBytes(12))
    .map((b) => chars[b % chars.length])
    .join("")
}

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
    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : ""
    if (!email) {
      return NextResponse.json(
        { error: "Email is required" },
        { status: 400 }
      )
    }

    const role = body?.role === "hq_admin" || body?.role === "region_admin" || body?.role === "branch_user" ? body.role : null
    const regionId = typeof body?.region_id === "string" ? body.region_id : null
    const branchId = typeof body?.branch_id === "string" ? body.branch_id : null

    const appUrl =
      process.env.NEXT_PUBLIC_APP_URL ||
      request.headers.get("origin") ||
      "http://localhost:3000"
    // After the invite link is clicked, the callback will sign them out and
    // redirect to the login page — so the user always signs in with email + password.
    const redirectTo = `${appUrl.replace(/\/$/, "")}/auth/callback?invited=true`

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

    // Generate a secure temporary password for the user
    const tempPassword = generateTempPassword()

    const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
      redirectTo,
      data: { temp_password: tempPassword }, // available in Supabase email template as {{ .Data.temp_password }}
    })

    if (error) {
      return NextResponse.json(
        { error: error.message || "Failed to send invite" },
        { status: 400 }
      )
    }

    // Set the temp password on the newly created user so they can sign in with it
    if (data?.user?.id) {
      await admin.auth.admin.updateUserById(data.user.id, { password: tempPassword })
    }

    if (role) {
      await admin
        .from("pending_invites")
        .insert({
          email,
          role,
          region_id: regionId || null,
          branch_id: branchId || null,
        })
      // If insert fails (e.g. migration not run), invite still sent; HQ can set role on Users page
    }

    const roleMessage =
      role === "hq_admin"
        ? "They will have full HQ Admin access when they sign in."
        : role === "region_admin"
          ? "They will have Region Admin access for the selected region when they sign in."
          : role === "branch_user"
            ? "They will have Branch User access for the selected branch when they sign in."
            : "When they sign in, edit their profile on the Users page to set role, region, and branch."

    return NextResponse.json({
      success: true,
      message: `Invite sent. ${roleMessage}`,
      tempPassword,
      email,
    })
  } catch (e) {
    console.error("Invite error:", e)
    return NextResponse.json(
      { error: "Something went wrong" },
      { status: 500 }
    )
  }
}
