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

    const fullName = typeof body?.full_name === "string" ? body.full_name.trim() : ""
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

    // Check if a user with this email already exists
    const { data: existingUsers } = await admin.auth.admin.listUsers()
    const alreadyExists = existingUsers?.users?.some(
      (u) => u.email?.toLowerCase() === email
    )
    if (alreadyExists) {
      return NextResponse.json(
        { error: "A user with this email already exists. Edit their profile on the Users page to change their role, region, or branch." },
        { status: 400 }
      )
    }

    // Generate a secure temporary password for the user
    const tempPassword = generateTempPassword()

    // Insert pending_invites BEFORE creating the user, because
    // inviteUserByEmail triggers handle_new_user() which reads pending_invites
    // to assign role/region/branch to the profile.
    if (role) {
      // Clean up any orphan rows from previous failed attempts
      await admin.from("pending_invites").delete().eq("email", email)
      await admin
        .from("pending_invites")
        .insert({
          email,
          role,
          region_id: regionId || null,
          branch_id: branchId || null,
        })
    }

    const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
      redirectTo,
      data: { temp_password: tempPassword, full_name: fullName || null }, // available in Supabase email template as {{ .Data.temp_password }}
    })

    if (error) {
      console.error("inviteUserByEmail error:", error)
      // Clean up pending_invites if user creation failed
      if (role) {
        await admin.from("pending_invites").delete().eq("email", email)
      }
      return NextResponse.json(
        { error: error.message || "Failed to send invite" },
        { status: 400 }
      )
    }

    // Set the temp password AND confirm the email immediately so the user can
    // sign in even if the invite link expires.
    if (data?.user?.id) {
      await admin.auth.admin.updateUserById(data.user.id, {
        password: tempPassword,
        email_confirm: true,
      })

      // Directly upsert the profile with role/region/branch.
      // The on_auth_user_created trigger may not fire if Supabase reactivates
      // a previously deleted user, so we ensure the profile is always correct.
      if (role) {
        await admin
          .from("profiles")
          .upsert({
            id: data.user.id,
            email,
            full_name: fullName || null,
            role,
            region_id: regionId || null,
            branch_id: branchId || null,
          }, { onConflict: "id" })

        // Clean up pending_invites since we've set the profile directly
        await admin.from("pending_invites").delete().eq("email", email)
      }
    }

    const roleMessage =
      role === "hq_admin"
        ? "They will have full HQ Admin access."
        : role === "region_admin"
          ? "They will have Region Admin access for the selected region."
          : role === "branch_user"
            ? "They will have Branch User access for the selected branch."
            : "Edit their profile on the Users page to set role, region, and branch."

    return NextResponse.json({
      success: true,
      message: `Account created. ${roleMessage} A temporary password has been sent to their email.`,
    })
  } catch (e) {
    console.error("Invite error:", e)
    return NextResponse.json(
      { error: "Something went wrong" },
      { status: 500 }
    )
  }
}
