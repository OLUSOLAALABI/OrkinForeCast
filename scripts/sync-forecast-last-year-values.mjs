import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"
import { createClient } from "@supabase/supabase-js"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.join(__dirname, "..")

const args = process.argv.slice(2)
const DRY_RUN = args.includes("--dry-run")
const targetYearArg = args.find((arg) => arg.startsWith("--target-year="))
const sourceYearArg = args.find((arg) => arg.startsWith("--source-year="))
const TARGET_YEAR = targetYearArg ? Number(targetYearArg.split("=")[1]) : 2026
const SOURCE_YEAR = sourceYearArg ? Number(sourceYearArg.split("=")[1]) : TARGET_YEAR - 1

const envPath = path.join(rootDir, ".env")
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, "utf8").split("\n").forEach((line) => {
    const trimmed = line.trim()
    if (trimmed && !trimmed.startsWith("#") && trimmed.includes("=")) {
      const eq = trimmed.indexOf("=")
      const key = trimmed.slice(0, eq).trim()
      let value = trimmed.slice(eq + 1).trim()
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1)
      }
      process.env[key] = value
    }
  })
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error("❌ Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env")
  process.exit(1)
}

const supabase = createClient(url, key)

function toNum(value) {
  return Number(value || 0)
}

async function fetchForecastRows(year, selectColumns) {
  const rows = []
  const PAGE = 1000
  let from = 0

  while (true) {
    const { data, error } = await supabase
      .from("forecasts")
      .select(selectColumns)
      .eq("year", year)
      .order("branch_id")
      .order("description")
      .order("month")
      .range(from, from + PAGE - 1)

    if (error) throw error

    const chunk = data ?? []
    rows.push(...chunk)
    if (chunk.length < PAGE) break
    from += PAGE
  }

  return rows
}

async function backupRows(rows) {
  const backupDir = path.join(rootDir, "backup")
  if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true })
  const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)
  const filePath = path.join(backupDir, `last_year_sync_${SOURCE_YEAR}_to_${TARGET_YEAR}_${ts}.ndjson`)
  fs.writeFileSync(filePath, rows.map((row) => JSON.stringify(row)).join("\n") + "\n", "utf8")
  return filePath
}

async function batchUpsert(rows) {
  const BATCH = 500
  let updated = 0

  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH)
    const { error } = await supabase
      .from("forecasts")
      .upsert(batch, { onConflict: "branch_id,description,year,month", ignoreDuplicates: false })

    if (error) throw error
    updated += batch.length
  }

  return updated
}

async function main() {
  console.log(DRY_RUN
    ? `=== DRY RUN: sync last_year_value from ${SOURCE_YEAR} to ${TARGET_YEAR} ===`
    : `=== LIVE: sync last_year_value from ${SOURCE_YEAR} to ${TARGET_YEAR} ===`)

  const sourceRows = await fetchForecastRows(SOURCE_YEAR, "branch_id,description,month,forecast_value")
  const targetRows = await fetchForecastRows(TARGET_YEAR, "branch_id,description,year,month,forecast_value,budget_value,last_month_value,last_year_value")

  const sourceByKey = new Map()
  for (const row of sourceRows) {
    sourceByKey.set(`${row.branch_id}|${row.description}|${row.month}`, toNum(row.forecast_value))
  }

  const updates = []
  for (const row of targetRows) {
    const expected = sourceByKey.get(`${row.branch_id}|${row.description}|${row.month}`) ?? 0
    if (Math.abs(toNum(row.last_year_value) - expected) <= 0.005) continue

    updates.push({
      branch_id: row.branch_id,
      description: row.description,
      year: row.year,
      month: row.month,
      forecast_value: toNum(row.forecast_value),
      budget_value: toNum(row.budget_value),
      last_month_value: toNum(row.last_month_value),
      last_year_value: expected,
    })
  }

  console.log(`Source rows (${SOURCE_YEAR}): ${sourceRows.length}`)
  console.log(`Target rows (${TARGET_YEAR}): ${targetRows.length}`)
  console.log(`Rows needing last_year_value sync: ${updates.length}`)

  if (DRY_RUN) {
    console.log("Dry run complete. No database changes were written.")
    return
  }

  const backupPath = await backupRows(targetRows)
  console.log(`Backed up ${targetRows.length} target rows to ${backupPath}`)

  const updated = await batchUpsert(updates)
  console.log(`Updated rows: ${updated}`)
  console.log("Last year value sync complete.")
}

main().catch((error) => {
  console.error("Fatal:", error)
  process.exit(1)
})