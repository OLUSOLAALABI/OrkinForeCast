/**
 * Create HQ Admin user (one-off).
 * Run from project root: node scripts/create-hq-admin.mjs
 * Requires: SUPABASE_SERVICE_ROLE_KEY in .env
 */
import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"
import { createClient } from "@supabase/supabase-js"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.join(__dirname, "..")
const envPath = path.join(rootDir, ".env")

if (!fs.existsSync(envPath)) {
  console.error("❌ .env not found at", envPath)
  process.exit(1)
}

const envContent = fs.readFileSync(envPath, "utf8")
envContent.split("\n").forEach((line) => {
  const trimmed = line.trim()
  if (trimmed && !trimmed.startsWith("#")) {
    const eq = trimmed.indexOf("=")
    if (eq > 0) {
      const key = trimmed.slice(0, eq).trim()
      let value = trimmed.slice(eq + 1).trim()
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1)
      }
      process.env[key] = value
    }
  }
})

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !serviceKey) {
  console.error("❌ Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env")
  process.exit(1)
}

const EMAIL = "olusola.alabi@orkincanada.com"
const PASSWORD = "orkinhq*#admin"
const FULL_NAME = "Olusola Alabi"

async function main() {
  const supabase = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })

  console.log("Creating HQ Admin user...")
  console.log("  Email:", EMAIL)
  console.log("  Name:", FULL_NAME)
  console.log("")

  const { data: userData, error: createError } = await supabase.auth.admin.createUser({
    email: EMAIL,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: FULL_NAME },
  })

  if (createError) {
    if (createError.message?.includes("already been registered") || createError.message?.includes("already exists")) {
      console.log("⚠️  User already exists. Updating profile to HQ Admin...")
      const { data: existing } = await supabase.auth.admin.listUsers()
      const user = existing?.users?.find((u) => u.email === EMAIL)
      if (!user) {
        console.error("❌ Could not find existing user. Error:", createError.message)
        process.exit(1)
      }
      const { error: updateError } = await supabase
        .from("profiles")
        .update({ role: "hq_admin", full_name: FULL_NAME, region_id: null, branch_id: null })
        .eq("id", user.id)
      if (updateError) {
        console.error("❌ Failed to update profile:", updateError.message)
        process.exit(1)
      }
      console.log("✅ Profile updated. You can sign in with:")
      console.log("   Email:", EMAIL)
      console.log("   Password: (the one you set previously, or reset in Supabase Auth → Users)")
      process.exit(0)
      return
    }
    console.error("❌ Failed to create user:", createError.message)
    process.exit(1)
  }

  const user = userData?.user
  if (!user) {
    console.error("❌ No user returned")
    process.exit(1)
  }

  const { error: updateError } = await supabase
    .from("profiles")
    .update({ role: "hq_admin", full_name: FULL_NAME, region_id: null, branch_id: null })
    .eq("id", user.id)

  if (updateError) {
    console.error("❌ User created but failed to set HQ Admin role:", updateError.message)
    console.log("   Fix in Supabase: Table Editor → profiles → set role = hq_admin for", EMAIL)
    process.exit(1)
  }

  console.log("✅ HQ Admin created. Sign in at http://localhost:3000/auth/login with:")
  console.log("   Email:", EMAIL)
  console.log("   Password:", PASSWORD)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
