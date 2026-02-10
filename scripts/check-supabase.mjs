/**
 * Report what's currently in your Supabase (regions, branches, profiles, uploads, actuals, forecasts).
 * Run from project root: node scripts/check-supabase.mjs
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
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const key = serviceKey || anonKey

if (!url || !key) {
  console.error("❌ Missing NEXT_PUBLIC_SUPABASE_URL and (SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_ANON_KEY) in .env")
  process.exit(1)
}

async function main() {
  const supabase = createClient(url, key)
  console.log("Supabase URL:", url.replace(/\/\/.*@/, "//***@"))
  console.log("Using:", serviceKey ? "service_role key (full counts)" : "anon key (RLS may hide some rows)")
  console.log("")

  try {
    const { data: regions, error: eR } = await supabase.from("regions").select("id, name").order("name")
    if (eR) {
      console.log("regions: table missing or RLS –", eR.message)
    } else {
      console.log("Regions:", regions?.length ?? 0)
      regions?.forEach((r) => console.log("  -", r.name))
      console.log("")
    }

    const { data: branches, error: eB } = await supabase
      .from("branches")
      .select("id, name, code, region_id")
      .order("name")
    if (eB) {
      console.log("branches: table missing or RLS –", eB.message)
    } else {
      console.log("Branches:", branches?.length ?? 0)
      const byRegion = {}
      branches?.forEach((b) => {
        const rid = b.region_id || "none"
        if (!byRegion[rid]) byRegion[rid] = []
        byRegion[rid].push(b.name)
      })
      const regionIds = regions?.map((r) => r.id) || []
      regionIds.forEach((rid) => {
        const names = byRegion[rid] || []
        const regionName = regions?.find((r) => r.id === rid)?.name || rid
        console.log("  ", regionName + ":", names.length, "branches")
      })
      if (Object.keys(byRegion).some((k) => k === "none")) {
        console.log("  (no region):", (byRegion["none"] || []).length)
      }
      console.log("")
    }

    const { count: profilesCount, error: eP } = await supabase
      .from("profiles")
      .select("id", { count: "exact", head: true })
    if (eP) console.log("profiles: ", eP.message)
    else console.log("Profiles (users):", profilesCount ?? 0)

    const { count: uploadsCount, error: eU } = await supabase
      .from("uploads")
      .select("id", { count: "exact", head: true })
    if (eU) console.log("uploads: ", eU.message)
    else console.log("Uploads:", uploadsCount ?? 0)

    const { count: actualsCount, error: eA } = await supabase
      .from("actuals")
      .select("id", { count: "exact", head: true })
    if (eA) console.log("actuals: ", eA.message)
    else console.log("Actuals:", actualsCount ?? 0)

    const { count: forecastsCount, error: eF } = await supabase
      .from("forecasts")
      .select("id", { count: "exact", head: true })
    if (eF) console.log("forecasts: ", eF.message)
    else console.log("Forecasts:", forecastsCount ?? 0)

    console.log("")
    if (branches?.length === 77) {
      console.log("💡 You have 77 branches. To keep only 49 operational branches, run scripts/003_operational_branches_only.sql in Supabase SQL Editor.")
    } else if (branches?.length === 49) {
      console.log("✓ Branch count is 49 (operational set).")
    }
  } catch (err) {
    console.error("Error:", err.message)
    process.exit(1)
  }
}

main()
