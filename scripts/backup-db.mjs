/**
 * Backup current DB state (regions, branches, forecasts, last_month_actuals)
 * to JSON files in backup/ directory.
 *
 * Usage:  node scripts/backup-db.mjs
 */
import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"
import { createClient } from "@supabase/supabase-js"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.join(__dirname, "..")

// Load .env
const envPath = path.join(rootDir, ".env")
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, "utf8").split("\n").forEach((line) => {
    const t = line.trim()
    if (t && !t.startsWith("#")) {
      const eq = t.indexOf("=")
      if (eq > 0) {
        let k = t.slice(0, eq).trim(), v = t.slice(eq + 1).trim()
        if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
        process.env[k] = v
      }
    }
  })
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) { console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env"); process.exit(1) }
const supabase = createClient(url, key)

async function fetchAll(table) {
  const rows = []
  const PAGE = 1000
  let from = 0
  while (true) {
    const { data, error } = await supabase.from(table).select("*").range(from, from + PAGE - 1)
    if (error) throw new Error(`Fetch ${table}: ${error.message}`)
    rows.push(...data)
    if (data.length < PAGE) break
    from += PAGE
    if (from % 10000 === 0) process.stdout.write(`  ${table}: ${rows.length} rows...\r`)
  }
  return rows
}

async function main() {
  const backupDir = path.join(rootDir, "backup")
  if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true })

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)
  const dir = path.join(backupDir, timestamp)
  fs.mkdirSync(dir, { recursive: true })

  console.log(`Backing up to backup/${timestamp}/\n`)

  // Regions
  console.log("Fetching regions...")
  const regions = await fetchAll("regions")
  fs.writeFileSync(path.join(dir, "regions.json"), JSON.stringify(regions, null, 2))
  console.log(`  regions: ${regions.length} rows`)

  // Branches
  console.log("Fetching branches...")
  const branches = await fetchAll("branches")
  fs.writeFileSync(path.join(dir, "branches.json"), JSON.stringify(branches, null, 2))
  console.log(`  branches: ${branches.length} rows`)

  // Forecasts (large — write as NDJSON)
  console.log("Fetching forecasts (this may take a minute)...")
  const forecasts = await fetchAll("forecasts")
  const forecastStream = fs.createWriteStream(path.join(dir, "forecasts.ndjson"))
  for (const row of forecasts) {
    forecastStream.write(JSON.stringify(row) + "\n")
  }
  forecastStream.end()
  console.log(`  forecasts: ${forecasts.length} rows`)

  // Last month actuals
  console.log("Fetching last_month_actuals...")
  const lma = await fetchAll("last_month_actuals")
  const lmaStream = fs.createWriteStream(path.join(dir, "last_month_actuals.ndjson"))
  for (const row of lma) {
    lmaStream.write(JSON.stringify(row) + "\n")
  }
  lmaStream.end()
  console.log(`  last_month_actuals: ${lma.length} rows`)

  console.log(`\n✓ Backup complete: backup/${timestamp}/`)
  console.log(`  To restore: node scripts/restore-db.mjs --dir backup/${timestamp}`)
}

main().catch((err) => { console.error(err); process.exit(1) })
