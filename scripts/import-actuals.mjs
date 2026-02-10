/**
 * Import actuals from scripts/data/three-years.xlsm into Supabase.
 *
 * Prerequisites:
 *   - .env with NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY
 *   - scripts/data/three-years.xlsm (or pass --file path)
 *
 * Usage:
 *   node scripts/import-actuals.mjs --inspect
 *     → Print sheet names and first rows (to see file structure).
 *
 *   node scripts/import-actuals.mjs [--year 2024] [--dry-run]
 *     → Import data. Sheet name is matched to branch code or branch name.
 *     → Row 1 = header, row 2+ = Description, Jan..Dec.
 *     → If a row has column A = 2023|2024|2025, it starts a new year block.
 *     → Otherwise use --year for the whole sheet.
 */

import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"
import { createClient } from "@supabase/supabase-js"
import * as XLSX from "xlsx"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.join(__dirname, "..")

// Load .env
const envPath = path.join(rootDir, ".env")
if (fs.existsSync(envPath)) {
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
}

const args = process.argv.slice(2)
const inspect = args.includes("--inspect")
const dryRun = args.includes("--dry-run")
const yearArg = args.find((a) => a === "--year") ? args[args.indexOf("--year") + 1] : null
const fileArg = args.find((a) => a === "--file") ? args[args.indexOf("--file") + 1] : null

const defaultFile = path.join(rootDir, "scripts", "data", "three_years.xlsx")
const excelPath = fileArg
  ? path.resolve(rootDir, fileArg)
  : defaultFile

if (!fs.existsSync(excelPath)) {
  console.error("❌ File not found:", excelPath)
  console.error("   Put your Excel in scripts/data/three_years.xlsx or use --file path")
  process.exit(1)
}

function parseSheetToRows(workbook, sheetName) {
  const sheet = workbook.Sheets[sheetName]
  if (!sheet) return []
  const json = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" })
  return json
}

function extractYearBlocks(rows) {
  const blocks = []
  let currentYear = null
  let currentRows = []

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    const colA = row && row[0] != null ? String(row[0]).trim() : ""

    const yearMatch = /^(202[0-9]|201[0-9])$/.test(colA)
    if (yearMatch) {
      const y = parseInt(colA, 10)
      if (currentYear !== null && currentRows.length > 0) {
        blocks.push({ year: currentYear, rows: currentRows })
      }
      currentYear = y
      currentRows = []
      continue
    }

    if (currentYear !== null && colA && typeof row[1] !== "undefined") {
      currentRows.push(row)
    } else if (currentYear === null && i > 0 && colA && typeof row[1] !== "undefined") {
      currentRows.push(row)
    }
  }
  if (currentYear !== null && currentRows.length > 0) {
    blocks.push({ year: currentYear, rows: currentRows })
  }
  return blocks
}

// Detect three_years.xlsx layout: row with "Description" and "January".."December"
function findDescriptionAndMonthHeader(rows) {
  const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]
  for (let r = 0; r < Math.min(rows.length, 20); r++) {
    const row = rows[r] || []
    const descIdx = row.findIndex((c) => String(c || "").trim().toLowerCase() === "description")
    if (descIdx === -1) continue
    const monthCols = []
    for (const name of monthNames) {
      const idx = row.findIndex((c) => String(c || "").trim().toLowerCase() === name.toLowerCase())
      if (idx === -1) break
      monthCols.push(idx)
    }
    if (monthCols.length === 12) return { headerRow: r, descriptionCol: descIdx, monthCols }
  }
  return null
}

// Parse numeric value from cell
function toNum(val) {
  if (val === undefined || val === null || val === "") return null
  if (typeof val === "number" && !Number.isNaN(val)) return val
  const n = parseFloat(String(val).replace(/,/g, ""))
  return Number.isNaN(n) ? null : n
}

// Extract year from sheet (e.g. "November 30, 2025" in first rows)
function detectYearFromSheet(rows) {
  for (let r = 0; r < Math.min(rows.length, 10); r++) {
    const row = rows[r] || []
    for (let c = 0; c < row.length; c++) {
      const s = String(row[c] || "")
      const match = s.match(/\b(202[0-9]|201[0-9])\b/)
      if (match) return parseInt(match[1], 10)
    }
  }
  return null
}

function rowsToActualsWithHeader(rows, year, header) {
  const actuals = []
  const { headerRow, descriptionCol, monthCols } = header
  for (let i = headerRow + 1; i < rows.length; i++) {
    const row = rows[i] || []
    const description = row[descriptionCol] != null ? String(row[descriptionCol]).trim() : ""
    if (!description || /^\d+$/.test(description)) continue
    for (let m = 0; m < 12; m++) {
      const colIdx = monthCols[m]
      const value = toNum(row[colIdx])
      if (value === null) continue
      actuals.push({ description, year, month: m + 1, value })
    }
  }
  return actuals
}

function rowsToActuals(rows, year) {
  const actuals = []
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    const description = row && row[0] != null ? String(row[0]).trim() : ""
    if (!description) continue
    for (let m = 0; m < 12; m++) {
      const raw = row[m + 1]
      if (raw === undefined || raw === null || raw === "") continue
      const value = typeof raw === "number" ? raw : parseFloat(String(raw).replace(/,/g, "")) || 0
      actuals.push({ description, year, month: m + 1, value })
    }
  }
  return actuals
}

function matchBranch(sheetName, branches) {
  const normalized = sheetName.trim().toUpperCase().replace(/\s+/g, " ")
  for (const b of branches) {
    if (b.code && String(b.code).trim().toUpperCase() === normalized) return b
    if (b.name && String(b.name).trim().toUpperCase() === normalized) return b
    if (b.code && normalized.includes(String(b.code).trim().toUpperCase())) return b
    if (b.name && normalized.includes(String(b.name).trim().toUpperCase())) return b
  }
  return null
}

async function main() {
  console.log("Reading", excelPath, "\n")
  const buf = fs.readFileSync(excelPath)
  const workbook = XLSX.read(buf, { type: "buffer", bookVBA: true })

  if (inspect) {
    console.log("Sheet names:", workbook.SheetNames.length)
    workbook.SheetNames.slice(0, 15).forEach((name, i) => {
      console.log("  ", i + 1, name)
    })
    if (workbook.SheetNames.length > 15) {
      console.log("  ... and", workbook.SheetNames.length - 15, "more")
    }
    console.log("")
    const first = workbook.SheetNames[0]
    const rows = parseSheetToRows(workbook, first)
    console.log("First sheet:", first)
    console.log("First 5 rows (preview):")
    rows.slice(0, 5).forEach((row, i) => {
      console.log("  Row", i, ":", JSON.stringify(row.slice(0, 8)))
    })
    console.log("")
    const skipSheets = new Set(["ToC", "Summary & Index", "Inputs", "Travel", "Mktg Dept by GL", "ORKIN CANADA", "PACIFIC REGION", "PRAIRIE REGION", "ONTARIO REGION", "GTA REGION", "QUEBEC REGION", "ATLANTIC REGION"])
    const branchSheet = workbook.SheetNames.find((n) => !skipSheets.has(n))
    if (branchSheet) {
      const branchRows = parseSheetToRows(workbook, branchSheet)
      console.log("Branch sheet:", branchSheet, "| rows:", branchRows.length, "| cols:", branchRows[0]?.length ?? 0)
      console.log("Row 0 (all columns):")
      console.log("  ", JSON.stringify(branchRows[0]))
      console.log("Row 8 (all columns):")
      console.log("  ", JSON.stringify(branchRows[8]))
      console.log("Rows 10-14 (sample data):")
      branchRows.slice(10, 15).forEach((row, i) => {
        console.log("  Row", i + 10, ":", JSON.stringify(row.slice(0, 20)))
      })
      const blocks = extractYearBlocks(branchRows)
      console.log("")
      console.log("Year blocks in this sheet:", blocks.length, blocks.map((b) => b.year + " (" + b.rows.length + " rows)"))
    } else {
      const blocks = extractYearBlocks(rows)
      console.log("Year blocks (first sheet):", blocks.length, blocks.map((b) => b.year + " (" + b.rows.length + " rows)"))
    }
    return
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url) {
    console.error("❌ Set NEXT_PUBLIC_SUPABASE_URL in .env (Supabase → Settings → API → Project URL)")
    process.exit(1)
  }

  // Dry-run can use anon key to fetch branches; real import needs service role
  const key = serviceKey || (dryRun ? anonKey : null)
  if (!key) {
    if (dryRun) {
      console.error("❌ For dry-run set NEXT_PUBLIC_SUPABASE_ANON_KEY or SUPABASE_SERVICE_ROLE_KEY in .env")
    } else {
      console.error("❌ Real import requires SUPABASE_SERVICE_ROLE_KEY in .env")
      console.error("   Get it from: Supabase Dashboard → your project → Settings → API → service_role (secret)")
      console.error("   Add to .env: SUPABASE_SERVICE_ROLE_KEY=eyJ...")
    }
    process.exit(1)
  }

  const supabase = createClient(url, key)

  const { data: branches, error: branchesError } = await supabase
    .from("branches")
    .select("id, code, name")
  if (branchesError) {
    console.error("❌ Failed to fetch branches:", branchesError.message)
    if (dryRun && !serviceKey) {
      console.error("   Tip: Use SUPABASE_SERVICE_ROLE_KEY in .env, or ensure RLS allows anon to read branches.")
    }
    process.exit(1)
  }
  console.log("Branches in DB:", branches.length)
  if (dryRun && !serviceKey) {
    console.log("(dry-run using anon key; no data will be written)\n")
  }

  const skipSheets = new Set(["ToC", "Summary & Index", "Inputs", "Travel", "Mktg Dept by GL", "ORKIN CANADA", "PACIFIC REGION", "PRAIRIE REGION", "ONTARIO REGION", "GTA REGION", "QUEBEC REGION", "ATLANTIC REGION"])
  let totalInserted = 0
  let sheetsProcessed = 0
  let sheetsSkipped = 0

  for (const sheetName of workbook.SheetNames) {
    if (skipSheets.has(sheetName)) {
      sheetsSkipped++
      continue
    }
    const branch = matchBranch(sheetName, branches)
    if (!branch) {
      sheetsSkipped++
      continue
    }

    const rows = parseSheetToRows(workbook, sheetName)
    const header = findDescriptionAndMonthHeader(rows)
    const singleYear = yearArg ? parseInt(yearArg, 10) : null
    const detectedYear = detectYearFromSheet(rows)

    let toInsert = []
    if (header) {
      const year = singleYear ?? detectedYear ?? 2025
      toInsert = rowsToActualsWithHeader(rows, year, header).map((a) => ({
        branch_id: branch.id,
        description: a.description,
        year: a.year,
        month: a.month,
        value: a.value,
      }))
    } else {
      const blocks = extractYearBlocks(rows)
      if (blocks.length > 0) {
        for (const { year, rows: blockRows } of blocks) {
          toInsert.push(...rowsToActuals(blockRows, year).map((a) => ({
            branch_id: branch.id,
            description: a.description,
            year: a.year,
            month: a.month,
            value: a.value,
          })))
        }
      } else if (singleYear) {
        const dataRows = rows.slice(1).filter((row) => row && row[0])
        toInsert = rowsToActuals(dataRows, singleYear).map((a) => ({
          branch_id: branch.id,
          description: a.description,
          year: a.year,
          month: a.month,
          value: a.value,
        }))
      }
    }

    // Dedupe by (branch_id, description, year, month) — sum values when same key (avoids "cannot affect row a second time")
    const key = (r) => `${r.branch_id}|${String(r.description).trim()}|${r.year}|${r.month}`
    const seen = new Map()
    for (const r of toInsert) {
      const k = key(r)
      if (seen.has(k)) seen.get(k).value += Number(r.value) || 0
      else seen.set(k, { ...r, value: Number(r.value) || 0 })
    }
    toInsert = [...seen.values()]

    if (toInsert.length === 0) {
      sheetsSkipped++
      continue
    }

    if (dryRun) {
      console.log("  [dry-run]", sheetName, "→", branch.name, "|", toInsert.length, "rows")
      totalInserted += toInsert.length
      sheetsProcessed++
      continue
    }

    const batchSize = 200
    let sheetOk = true
    for (let i = 0; i < toInsert.length; i += batchSize) {
      const batch = toInsert.slice(i, i + batchSize)
      const { error } = await supabase.from("actuals").upsert(batch, {
        onConflict: "branch_id,description,year,month",
        ignoreDuplicates: false,
      })
      if (error) {
        console.error("  ❌", sheetName, error.message)
        sheetOk = false
        break
      }
    }
    if (sheetOk) {
      totalInserted += toInsert.length
      sheetsProcessed++
      console.log("  ✓", sheetName, "→", branch.name, "|", toInsert.length, "actuals")
    }
  }

  console.log("")
  console.log("Done. Sheets processed:", sheetsProcessed, "| Skipped:", sheetsSkipped, "| Total actuals:", totalInserted)
  if (dryRun) console.log("(dry-run: no data written)")
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
