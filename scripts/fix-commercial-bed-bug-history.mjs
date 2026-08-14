import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"
import { createClient } from "@supabase/supabase-js"
import * as XLSX from "xlsx"
import { normalizeDescription } from "./description-utils.mjs"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.join(__dirname, "..")

const DRY_RUN = process.argv.includes("--dry-run")

const WORKBOOKS = [
  { year: 2023, path: path.join(rootDir, "branchData", "new_data_P&L", "Orkin Canada P&L FINAL 12-2023.xlsm") },
  { year: 2024, path: path.join(rootDir, "branchData", "new_data_P&L", "Orkin Canada P&L 12-2024.xlsm") },
  { year: 2025, path: path.join(rootDir, "branchData", "new_data_P&L", "Orkin Canada P&L 12-2025.xlsm") },
]

const TARGET_DESCRIPTIONS = [
  "COMMERCIAL BED BUG REVENUE (recur)",
  "COMMERCIAL BED BUG REVENUE",
]

const envPath = path.join(rootDir, ".env")
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, "utf8").split("\n").forEach((line) => {
    const t = line.trim()
    if (t && !t.startsWith("#") && t.includes("=")) {
      const eq = t.indexOf("=")
      const key = t.slice(0, eq).trim()
      let value = t.slice(eq + 1).trim()
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

function toNum(val) {
  if (val === undefined || val === null || val === "") return 0
  if (typeof val === "number" && !Number.isNaN(val)) return val
  const n = parseFloat(String(val).replace(/,/g, ""))
  return Number.isNaN(n) ? 0 : n
}

function extractCode(tabName) {
  const match = String(tabName ?? "").trim().match(/^(\d+)/)
  return match ? match[1].padStart(3, "0") : null
}

function findLayout(rows) {
  const months = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"]
  for (let r = 0; r < Math.min(rows.length, 15); r++) {
    const row = rows[r] || []
    for (let c = 0; c < row.length; c++) {
      if (String(row[c] || "").trim().toLowerCase() !== "january") continue
      let ok = true
      for (let m = 1; m < 12; m++) {
        if (String(row[c + m] || "").trim().toLowerCase() !== months[m]) {
          ok = false
          break
        }
      }
      if (!ok) continue
      let descCol = c > 0 ? c - 1 : 0
      for (let dc = 0; dc < c; dc++) {
        if (String(row[dc] || "").trim().toLowerCase() === "description") {
          descCol = dc
          break
        }
      }
      return { headerRow: r, descCol, monthCols: Array.from({ length: 12 }, (_, i) => c + i) }
    }
  }
  return null
}

function parseBedBugMonths(rows, layout) {
  const seenDescriptions = new Map()
  const valuesByDescription = new Map(TARGET_DESCRIPTIONS.map((desc) => [desc, new Array(12).fill(0)]))

  for (let i = layout.headerRow + 1; i < rows.length; i++) {
    const row = rows[i] || []
    const rawDescription = row[layout.descCol] != null ? String(row[layout.descCol]).trim() : ""
    if (!rawDescription || /^\d+$/.test(rawDescription)) continue

    const description = normalizeDescription(rawDescription, seenDescriptions)
    if (!valuesByDescription.has(description)) continue

    const monthValues = valuesByDescription.get(description)
    for (let m = 0; m < 12; m++) {
      monthValues[m] = toNum(row[layout.monthCols[m]])
    }
  }

  return valuesByDescription
}

async function fetchAllForecastsForDescriptions(descriptions) {
  const rows = []
  const PAGE = 1000
  for (const year of [2023, 2024, 2025, 2026]) {
    for (const description of descriptions) {
      let from = 0
      while (true) {
        const { data, error } = await supabase
          .from("forecasts")
          .select("branch_id,description,year,month,forecast_value,budget_value,last_year_value,last_month_value")
          .eq("year", year)
          .eq("description", description)
          .order("branch_id")
          .order("month")
          .range(from, from + PAGE - 1)
        if (error) throw error
        const chunk = data ?? []
        rows.push(...chunk)
        if (chunk.length < PAGE) break
        from += PAGE
      }
    }
  }
  return rows
}

async function backupRows(rows) {
  const backupDir = path.join(rootDir, "backup")
  if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true })
  const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)
  const filePath = path.join(backupDir, `commercial_bed_bug_fix_${ts}.ndjson`)
  fs.writeFileSync(filePath, rows.map((row) => JSON.stringify(row)).join("\n") + "\n", "utf8")
  return filePath
}

async function batchUpsert(rows) {
  const deduped = new Map()
  for (const row of rows) {
    deduped.set(`${row.branch_id}|${row.description}|${row.year}|${row.month}`, row)
  }
  const uniqueRows = Array.from(deduped.values())

  const BATCH = 500
  let updated = 0
  for (let i = 0; i < uniqueRows.length; i += BATCH) {
    const batch = uniqueRows.slice(i, i + BATCH)
    const { error } = await supabase
      .from("forecasts")
      .upsert(batch, { onConflict: "branch_id,description,year,month", ignoreDuplicates: false })
    if (error) throw error
    updated += batch.length
  }
  return updated
}

async function main() {
  console.log(DRY_RUN ? "=== DRY RUN: commercial bed bug history fix ===" : "=== LIVE: commercial bed bug history fix ===")

  const { data: branches, error: branchError } = await supabase
    .from("branches")
    .select("id, code, name")

  if (branchError) {
    console.error("❌ Failed to load branches:", branchError.message)
    process.exit(1)
  }

  const branchByCode = new Map((branches ?? []).map((branch) => [branch.code, branch]))
  const correctedValues = new Map()
  const sourceBranchYears = new Set()
  let parsedSheets = 0

  for (const workbookInfo of WORKBOOKS) {
    if (!fs.existsSync(workbookInfo.path)) {
      console.error("❌ Workbook not found:", workbookInfo.path)
      process.exit(1)
    }

    const workbook = XLSX.read(fs.readFileSync(workbookInfo.path), { type: "buffer", bookVBA: true })
    for (const sheetName of workbook.SheetNames) {
      const code = extractCode(sheetName)
      if (!code) continue
      const branch = branchByCode.get(code)
      if (!branch) continue

      const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: "" })
      const layout = findLayout(rows)
      if (!layout) continue

      const valuesByDescription = parseBedBugMonths(rows, layout)
      parsedSheets++
      sourceBranchYears.add(`${branch.id}|${workbookInfo.year}`)

      for (const description of TARGET_DESCRIPTIONS) {
        const monthValues = valuesByDescription.get(description) || new Array(12).fill(0)
        for (let month = 1; month <= 12; month++) {
          correctedValues.set(`${branch.id}|${workbookInfo.year}|${description}|${month}`, monthValues[month - 1])
        }
      }
    }
  }

  const existingRows = await fetchAllForecastsForDescriptions(TARGET_DESCRIPTIONS)
  if (!DRY_RUN) {
    const backupPath = await backupRows(existingRows)
    console.log(`Backed up ${existingRows.length} existing rows to ${backupPath}`)
  }

  const historyUpserts = []
  for (const branch of branches ?? []) {
    for (const year of [2023, 2024, 2025]) {
      if (!sourceBranchYears.has(`${branch.id}|${year}`)) continue
      for (const description of TARGET_DESCRIPTIONS) {
        for (let month = 1; month <= 12; month++) {
          const value = correctedValues.get(`${branch.id}|${year}|${description}|${month}`) ?? 0
          const lastYearValue = year > 2023
            ? (correctedValues.get(`${branch.id}|${year - 1}|${description}|${month}`) ?? 0)
            : 0
          historyUpserts.push({
            branch_id: branch.id,
            description,
            year,
            month,
            forecast_value: value,
            budget_value: value,
            last_year_value: lastYearValue,
            last_month_value: 0,
          })
        }
      }
    }
  }

  const rows2026 = existingRows.filter((row) => row.year === 2026)
  const lastYearUpserts = []
  for (const row of rows2026) {
    const correctedLastYear = correctedValues.get(`${row.branch_id}|2025|${row.description}|${row.month}`) ?? 0
    if (Math.abs(Number(row.last_year_value) - correctedLastYear) <= 0.005) continue
    lastYearUpserts.push({
      branch_id: row.branch_id,
      description: row.description,
      year: row.year,
      month: row.month,
      forecast_value: Number(row.forecast_value),
      budget_value: Number(row.budget_value),
      last_month_value: Number(row.last_month_value),
      last_year_value: correctedLastYear,
    })
  }

  console.log(`Parsed ${parsedSheets} branch sheets across 2023-2025 workbooks`)
  console.log(`Historical rows to upsert: ${historyUpserts.length}`)
  console.log(`2026 last_year_value rows to update: ${lastYearUpserts.length}`)

  if (DRY_RUN) {
    console.log("Dry run complete. No database changes were written.")
    return
  }

  const historyCount = await batchUpsert(historyUpserts)
  const lastYearCount = await batchUpsert(lastYearUpserts)

  console.log(`Updated historical rows: ${historyCount}`)
  console.log(`Updated 2026 last_year_value rows: ${lastYearCount}`)
  console.log("Commercial bed bug history fix complete.")
}

main().catch((error) => {
  console.error("Fatal:", error)
  process.exit(1)
})