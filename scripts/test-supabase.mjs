/**
 * Test Supabase connection using .env keys.
 * Run from project root: node scripts/test-supabase.mjs
 */
import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"
import { createClient } from "@supabase/supabase-js"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const envPath = path.join(__dirname, "..", ".env")

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
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!url || !key) {
  console.error("❌ Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY in .env")
  process.exit(1)
}

async function main() {
  console.log("Testing Supabase connection...\n")

  try {
    const supabase = createClient(url, key)

    const { error: authError } = await supabase.auth.getSession()
    if (authError) {
      console.error("❌ Auth / API unreachable or invalid key:", authError.message)
      process.exit(1)
    }
    console.log("✅ Connection OK (URL and anon key valid)\n")

    const { data, error } = await supabase.from("regions").select("id").limit(1)
    if (error) {
      console.log("⚠️  Schema: tables not found or RLS blocking")
      console.log("   → Run scripts/001_create_schema.sql in Supabase SQL Editor\n")
      console.log("   Detail:", error.message)
      process.exit(0)
    }

    console.log("✅ Schema OK (regions table exists)")
    console.log("   Ready for sign-up and dashboard.\n")
  } catch (err) {
    console.error("❌ Error:", err.message)
    process.exit(1)
  }
}

main()
