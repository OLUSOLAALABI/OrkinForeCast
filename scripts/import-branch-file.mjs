/**
 * Import budget/forecast data for a single branch from one Excel file.
 * Use this when you have one file per branch (not the bulk 2026 workbook).
 *
 * Prerequisites: .env with NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY
 *
 * Usage:
 *   node scripts/import-branch-file.mjs --branch "25 WESTSIDE" --file path/to/branch-25.xlsx
 *   node scripts/import-branch-file.mjs --branch 60 --file ./PEI-2026.xlsx --year 2026
 *   node scripts/import-branch-file.mjs --branch "60 PEI" --file ./data/PEI.xlsx --dry-run
 *
 * File layout: Same as BUDGET_STRUCTURE.md — first sheet with a row containing
 * "Description" and January..December (or "budget month 1"..12), or a Total column after Dec.
 * Column O = budget total when present.
 */

import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"
import { createClient } from "@supabase/supabase-js"
import * as XLSX from "xlsx"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.join(__dirname, "..")

const envPath = path.join(rootDir, ".env")
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, "utf8")
    .split("\n")
    .forEach((line) => {
      const t = line.trim()
      if (t && !t.startsWith("#")) {
        const eq = t.indexOf("=")
        if (eq > 0) {
          const k = t.slice(0, eq).trim()
          let v = t.slice(eq + 1).trim()
          if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
          process.env[k] = v
        }
      }
    })
}

const args = process.argv.slice(2)
const branchArg = args.find((a) => a === "--branch") ? args[args.indexOf("--branch") + 1] : null
const fileArg = args.find((a) => a === "--file") ? args[args.indexOf("--file") + 1] : null
const yearArg = args.find((a) => a === "--year") ? args[args.indexOf("--year") + 1] : null
const dryRun = args.includes("--dry-run")
const budgetOnly = args.includes("--budget-only")

const YEAR = yearArg ? parseInt(yearArg, 10) : 2026

if (!branchArg || !fileArg) {
  console.error("Usage: node scripts/import-branch-file.mjs --branch <code or name> --file <path> [--year 2026] [--dry-run] [--budget-only]")
  console.error('Example: node scripts/import-branch-file.mjs --branch "25 WESTSIDE" --file ./branch-25.xlsx')
  process.exit(1)
}

const excelPath = path.resolve(process.cwd(), fileArg)
if (!fs.existsSync(excelPath)) {
  console.error("❌ File not found:", excelPath)
  process.exit(1)
}

const FULL_MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]
const SHORT_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
// Explicit totals only; do not treat YTD as annual total.
const TOTAL_HEADERS = ["total", "total budget", "year total", "annual total", "annual"]
const SKIP_DESCRIPTIONS = new Set(["line of bus", "district", "gl", "period", "orkin canada", "spare row", "*"])

function cellMatchesMonth(cell, i) {
  const s = String(cell ?? "").trim().toLowerCase()
  return s === FULL_MONTHS[i].toLowerCase() || s === SHORT_MONTHS[i].toLowerCase()
}
function cellMatchesBudgetMonth(cell, i) {
  return String(cell ?? "").trim().toLowerCase() === "budget month " + (i + 1)
}
function toNum(val) {
  if (val === undefined || val === null || val === "") return null
  if (typeof val === "number" && !Number.isNaN(val)) return val
  const n = parseFloat(String(val).replace(/,/g, ""))
  return Number.isNaN(n) ? null : n
}

function findDescriptionAndMonthHeader(rows) {
  let fallback = null
  const addTotal = (res) => {
    if (!res || res.monthCols.length !== 12) return res
    const last = res.monthCols[11]
    const row = rows[res.headerRow] || []
    let totalCol = null
    for (let c = last + 1; c < Math.min(row.length, last + 5); c++) {
      const cell = String(row[c] ?? "").trim().toLowerCase()
      if (TOTAL_HEADERS.some((h) => cell === h || cell.includes(h))) {
        totalCol = c
        break
      }
    }
    return { ...res, totalColIndex: totalCol }
  }
  for (let r = 0; r < Math.min(rows.length, 65); r++) {
    const row = rows[r] || []
    const descIdx = row.findIndex((c) => String(c || "").trim().toLowerCase() === "description")
    if (descIdx !== -1) {
      const monthCols = []
      for (let m = 0; m < 12; m++) {
        const idx = row.findIndex((c) => {
          const s = String(c || "").trim().toLowerCase()
          return s === FULL_MONTHS[m].toLowerCase() || s === SHORT_MONTHS[m].toLowerCase()
        })
        if (idx === -1) break
        monthCols.push(idx)
      }
      if (monthCols.length === 12) return addTotal({ headerRow: r, descriptionCol: descIdx, monthCols, expenseColIndex: null })
    }
    for (let c = 0; c <= (row.length - 12); c++) {
      if (!cellMatchesMonth(row[c], 0)) continue
      let ok = true
      for (let m = 1; m < 12; m++) if (!cellMatchesMonth(row[c + m], m)) { ok = false; break }
      if (ok) return addTotal({ headerRow: r, descriptionCol: c > 0 ? c - 1 : 0, monthCols: Array.from({ length: 12 }, (_, i) => c + i), expenseColIndex: null })
    }
    if (!fallback) {
      for (let c = 0; c <= (row.length - 12); c++) {
        if (!cellMatchesBudgetMonth(row[c], 0)) continue
        let ok = true
        for (let m = 1; m < 12; m++) if (!cellMatchesBudgetMonth(row[c + m], m)) { ok = false; break }
        if (ok) {
          fallback = addTotal({ headerRow: r, descriptionCol: c > 0 ? c - 1 : 0, monthCols: Array.from({ length: 12 }, (_, i) => c + i), expenseColIndex: null })
          break
        }
      }
    }
  }
  return fallback ? addTotal(fallback) : null
}

// Descriptions that appear in multiple P&L sections.
// Map: original name → { first: rename for 1st occurrence, second: rename for 2nd occurrence }
const DUPLICATE_RENAMES = {
  "COMMERCIAL BED BUG REVENUE": { first: "COMMERCIAL BED BUG REVENUE (recur)", second: "COMMERCIAL BED BUG REVENUE" },
  "DEPRECIATION": { first: "DEPRECIATION", second: "DEPRECIATION (fixed)" },
}

function rowsToForecasts(rows, year, header) {
  const out = []
  const seenDescs = new Map() // track how many times each description has been seen
  const { headerRow, descriptionCol, monthCols, totalColIndex } = header
  for (let i = headerRow + 1; i < rows.length; i++) {
    const row = rows[i] || []
    let description = row[descriptionCol] != null ? String(row[descriptionCol]).trim() : ""
    if (!description || description.length < 2 || /^\d+$/.test(description) || SKIP_DESCRIPTIONS.has(description.toLowerCase())) continue

    // Disambiguate known duplicate descriptions
    const upperDesc = description.toUpperCase()
    const rename = DUPLICATE_RENAMES[upperDesc]
    if (rename) {
      const count = (seenDescs.get(upperDesc) || 0) + 1
      seenDescs.set(upperDesc, count)
      description = count === 1 ? rename.first : rename.second
    }

    const monthVals = monthCols.map((c) => toNum(row[c]))
    const hasAnyMonth = monthVals.some((v) => v !== null)
    const totalVal = totalColIndex != null ? toNum(row[totalColIndex]) : null

    if (!hasAnyMonth && totalVal !== null) {
      const perMonth = totalVal / 12
      for (let m = 0; m < 12; m++) {
        out.push({ description, year, month: m + 1, budget_value: perMonth, forecast_value: perMonth, last_month_value: 0, last_year_value: 0 })
      }
    } else {
      for (let m = 0; m < 12; m++) {
        const v = monthVals[m]
        if (v === null) continue
        out.push({ description, year, month: m + 1, budget_value: v, forecast_value: v, last_month_value: 0, last_year_value: 0 })
      }
    }
  }
  return out
}

function matchBranch(branchArg, branches) {
  const raw = String(branchArg).trim()
  const normalized = raw.toUpperCase().replace(/\s+/g, " ")
  const codePadded = /^\d{1,3}$/.test(raw) ? raw.padStart(3, "0") : null
  for (const b of branches) {
    const bc = b.code ? String(b.code).trim().toUpperCase() : ""
    const bn = b.name ? String(b.name).trim().toUpperCase() : ""
    if (bc && (bc === normalized || (codePadded && bc === codePadded.toUpperCase()))) return b
    if (bn && bn === normalized) return b
    if (bc && normalized.includes(bc)) return b
    if (bn && normalized.includes(bn)) return b
  }
  return null
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    console.error("❌ Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env")
    process.exit(1)
  }

  const supabase = createClient(url, key)
  const { data: branches, error: brErr } = await supabase.from("branches").select("id, code, name")
  if (brErr) {
    console.error("❌ Branches:", brErr.message)
    process.exit(1)
  }
  const branch = matchBranch(branchArg, branches)
  if (!branch) {
    console.error("❌ Branch not found:", branchArg, "— check code or name (e.g. \"25 WESTSIDE\" or 60)")
    process.exit(1)
  }

  const buf = fs.readFileSync(excelPath)
  const workbook = XLSX.read(buf, { type: "buffer", bookVBA: true })
  const sheetName = workbook.SheetNames[0]
  if (!sheetName) {
    console.error("❌ No sheet in file:", excelPath)
    process.exit(1)
  }
  const sheet = workbook.Sheets[sheetName]
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" })
  const header = findDescriptionAndMonthHeader(rows)
  if (!header) {
    console.error("❌ No header row with Description + Jan..Dec (or budget month 1..12) in first sheet.")
    process.exit(1)
  }

  let items = rowsToForecasts(rows, YEAR, header)
  const keyFn = (r) => `${r.description}|${r.year}|${r.month}`
  const seen = new Map()
  for (const r of items) {
    const k = keyFn(r)
    if (seen.has(k)) {
      const cur = seen.get(k)
      cur.budget_value += Number(r.budget_value) || 0
      cur.forecast_value += Number(r.forecast_value) || 0
    } else {
      seen.set(k, { ...r, budget_value: Number(r.budget_value) || 0, forecast_value: Number(r.forecast_value) || 0 })
    }
  }
  const toInsertBase = [...seen.values()].map((r) => ({
    branch_id: branch.id,
    description: r.description,
    year: r.year,
    month: r.month,
    budget_value: r.budget_value,
  }))

  let toInsert = []
  if (budgetOnly) {
    const { data: existingRows, error: existingErr } = await supabase
      .from("forecasts")
      .select("description, month, forecast_value, last_month_value, last_year_value")
      .eq("branch_id", branch.id)
      .eq("year", YEAR)
    if (existingErr) {
      console.error("❌ Existing forecast lookup:", existingErr.message)
      process.exit(1)
    }
    const existingByKey = new Map(
      (existingRows || []).map((r) => [`${r.description}|${YEAR}|${r.month}`, r])
    )
    toInsert = toInsertBase.map((r) => {
      const key = `${r.description}|${r.year}|${r.month}`
      const ex = existingByKey.get(key)
      return {
        ...r,
        forecast_value: ex?.forecast_value ?? 0,
        last_month_value: ex?.last_month_value ?? 0,
        last_year_value: ex?.last_year_value ?? 0,
      }
    })
  } else {
    toInsert = toInsertBase.map((r) => ({
      ...r,
      forecast_value: r.budget_value,
      last_month_value: 0,
      last_year_value: 0,
    }))
  }

  if (toInsert.length === 0) {
    console.error("❌ No data rows found under the header.")
    process.exit(1)
  }

  console.log("Branch:", branch.name, "| Year:", YEAR, "| Rows:", toInsert.length, "| Mode:", budgetOnly ? "budget-only" : "forecast+budget")
  if (dryRun) {
    console.log("(dry-run: no data written)")
    return
  }

  const batchSize = 100
  for (let i = 0; i < toInsert.length; i += batchSize) {
    const batch = toInsert.slice(i, i + batchSize)
    const { error } = await supabase.from("forecasts").upsert(batch, { onConflict: "branch_id,description,year,month", ignoreDuplicates: false })
    if (error) {
      console.error("❌ Upsert:", error.message)
      process.exit(1)
    }
  }
  console.log("✓ Imported", toInsert.length, "forecast rows for", branch.name)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
