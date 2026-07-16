/**
 * Rebuild 2026 forecast_value using Seasonal naive + growth + driver-based layer,
 * blended with budget figures for stability.
 * Uses 2023–2025 historical data. Growth = 2024→2025 YoY; prior fallback to 2023.
 * Drivers: working days (wd_2026/wd_2025).
 *
 * Budget blend: final = alpha × statistical + (1-alpha) × budget.
 * Default alpha = 0.5 (equal weight). Use --alpha=0.7 to lean more on history.
 *
 * Usage: node scripts/rebuild-2026-forecast-ets.mjs [--alpha=0.5] [--no-working-days] [--no-seasonal-index] [--force]
 *
 *   --force   Overwrite cells that a branch user has manually edited in the UI.
 *             By default the script PROTECTS any (branch, description, year, month)
 *             that has a row in `forecast_audit_log`, so a rebuild never wipes
 *             hours of branch-user work — especially on new branches where the
 *             algorithm has no history and would otherwise reset every cell to 0.
 */

import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"
import { createClient } from "@supabase/supabase-js"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.join(__dirname, "..")
const dataDir = path.join(__dirname, "data")

const useWorkingDays = !process.argv.includes("--no-working-days")
const useSeasonalIndex = !process.argv.includes("--no-seasonal-index")
const FORCE_OVERWRITE_MANUAL = process.argv.includes("--force")

// Budget blend alpha: 1.0 = pure statistical, 0.0 = pure budget, 0.5 = equal blend
const alphaArg = process.argv.find(a => a.startsWith("--alpha="))
const BLEND_ALPHA = alphaArg ? Math.max(0, Math.min(1, Number(alphaArg.split("=")[1]))) : 0.5
let WORKING_DAYS = null
if (useWorkingDays) {
  try {
    const wdPath = path.join(dataDir, "working_days.json")
    if (fs.existsSync(wdPath)) {
      WORKING_DAYS = JSON.parse(fs.readFileSync(wdPath, "utf8"))
    }
  } catch (_) { }
}
const envPath = path.join(rootDir, ".env")

if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, "utf8")
  envContent.split("\n").forEach((line) => {
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
const HIST_YEARS = [2023, 2024, 2025]
const TARGET_YEAR = 2026
const MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]

const MAX_DECIMAL = 1000000000 // Cap at 1 Billion to avoid explosions
const n = (v) => Number(v || 0)
const r2 = (v) => {
  const x = Math.round((Number(v) || 0) * 100) / 100
  if (!Number.isFinite(x)) return 0
  // Allow negative values (allowances, deductions, etc.)
  if (x < 0) return Math.max(-MAX_DECIMAL, x)
  return Math.min(MAX_DECIMAL, x)
}

function normDesc(s) {
  return String(s || "")
    .toUpperCase()
    .replace(/&/g, " AND ")
    .replace(/[^A-Z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function findHistoryRows(historyByDesc, budgetDesc) {
  if (historyByDesc.has(budgetDesc)) return historyByDesc.get(budgetDesc)
  const nd = normDesc(budgetDesc)
  const out = []
  for (const [desc, rows] of historyByDesc.entries()) {
    if (normDesc(desc) === nd) out.push(...rows)
  }
  return out
}

/**
 * Seasonal naive + growth + working-days driver.
 * forecast = last_year[m] × (1 + growth) × (wd_2026[m] / wd_2025[m]).
 *
 * NOTE: Seasonal index is intentionally NOT applied per-month here because the
 * base (last_year[m]) already embeds the seasonal shape. Applying it again would
 * double-count seasonality, creating artificial dips in low months.
 */
function seasonalNaiveGrowthDrift(histRows, seasonalIndex = null) {
  const by = new Map()
  for (const r of histRows) {
    const k = `${r.year}|${r.month}`
    const v = n(r.forecast_value)
    // Use max of absolute values to pick the "bigger" entry, preserving sign
    const prev = by.get(k)
    if (prev === undefined || Math.abs(v) > Math.abs(prev)) by.set(k, v)
  }
  const lastYear = MONTHS.map((m) => by.get("2025|" + m) ?? by.get("2024|" + m) ?? 0)
  const priorYear = MONTHS.map((m) => by.get("2024|" + m) ?? by.get("2023|" + m) ?? 0)
  const lastSum = lastYear.reduce((a, b) => a + b, 0)
  const priorSum = priorYear.reduce((a, b) => a + b, 0)
  if (lastSum === 0) return lastYear
  // When prior year has no data, skip growth to avoid explosion
  const growth = Math.abs(priorSum) > 1 ? lastSum / priorSum - 1 : 0
  let preds = lastYear.map((v) => v * (1 + growth))
  if (WORKING_DAYS?.["2025"] && WORKING_DAYS?.["2026"]) {
    const wd2025 = MONTHS.map((m) => Number(WORKING_DAYS["2025"][String(m)]) || 21)
    const wd2026 = MONTHS.map((m) => Number(WORKING_DAYS["2026"][String(m)]) || 21)
    preds = preds.map((v, i) => (wd2025[i] > 0 ? v * (wd2026[i] / wd2025[i]) : v))
  }
  // Seasonal index: only used when --no-seasonal-index is NOT set and base year has no data
  // (i.e., fallback distribution of annual total). Skipped for seasonal naive to avoid double-count.
  return preds.map((v) => r2(v))
}

/** Compute global seasonal index from 2023-2025 history: month_m / yearly_avg, normalized to mean=1. */
async function computeSeasonalIndex() {
  if (!useSeasonalIndex) return null
  const pageSize = 1000
  let from = 0
  const all = []
  while (true) {
    const { data } = await supabase
      .from("forecasts")
      .select("branch_id,description,year,month,forecast_value")
      .in("year", HIST_YEARS)
      .range(from, from + pageSize - 1)
    const rows = data ?? []
    all.push(...rows)
    if (rows.length < pageSize) break
    from += pageSize
  }
  const byKey = new Map()
  for (const r of all) {
    const k = `${r.branch_id}|${r.description}`
    if (!byKey.has(k)) byKey.set(k, { sum: 0, byMonth: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] })
    const b = byKey.get(k)
    const v = n(r.forecast_value)
    b.sum += v
    b.byMonth[r.month - 1] += v
  }
  const monthSums = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
  for (const b of byKey.values()) {
    if (b.sum <= 0) continue
    const avg = b.sum / 12
    for (let m = 0; m < 12; m++) monthSums[m] += b.byMonth[m] / avg
  }
  const total = monthSums.reduce((a, b) => a + b, 0)
  if (total <= 0) return null
  return monthSums.map((v) => v / (total / 12))
}

async function fetchAllForecasts(branchId) {
  const pageSize = 1000
  let from = 0
  const all = []
  while (true) {
    const { data, error } = await supabase
      .from("forecasts")
      .select("branch_id, description, year, month, forecast_value, budget_value")
      .eq("branch_id", branchId)
      .in("year", [...HIST_YEARS, TARGET_YEAR])
      .range(from, from + pageSize - 1)
    if (error) throw error
    const rows = data ?? []
    all.push(...rows)
    if (rows.length < pageSize) break
    from += pageSize
  }
  return all
}

async function main() {
  const { data: branches, error: bErr } = await supabase
    .from("branches")
    .select("id, code, name")
    .order("code")
  if (bErr) {
    console.error("❌ branches:", bErr.message)
    process.exit(1)
  }
  if (!branches?.length) {
    console.error("❌ No branches found")
    process.exit(1)
  }

  const seasonalIndex = await computeSeasonalIndex()
  const drivers = [
    useWorkingDays && WORKING_DAYS && "working days",
    useSeasonalIndex && seasonalIndex && "seasonal index",
  ].filter(Boolean)
  console.log(`Rebuilding 2026 forecasts (Seasonal naive + growth${drivers.length ? " + " + drivers.join(" + ") : ""}, budget blend alpha=${BLEND_ALPHA}) for all ${branches.length} branches...`)
  console.log("")

  let totalUpserted = 0
  let touched = 0

  for (const branch of branches) {
    let rows = []
    try {
      rows = await fetchAllForecasts(branch.id)
    } catch (e) {
      console.error(`❌ fetch ${branch.code} ${branch.name}:`, e.message)
      process.exit(1)
    }

    const historyByDesc = new Map()
    const budgetByDesc = new Map()
    for (const r of rows) {
      const d = String(r.description || "").trim()
      if (!d) continue
      if (r.year === TARGET_YEAR) {
        if (!budgetByDesc.has(d)) budgetByDesc.set(d, [])
        budgetByDesc.get(d).push(r)
      } else {
        if (!historyByDesc.has(d)) historyByDesc.set(d, [])
        historyByDesc.get(d).push(r)
      }
    }

    const meta = []

    for (const [desc, budgetRows] of budgetByDesc.entries()) {
      const budgetYearTotal = MONTHS.reduce(
        (s, m) => s + n(budgetRows.find((r) => r.month === m)?.budget_value),
        0
      )
      if (budgetYearTotal === 0) continue

      const histRows = findHistoryRows(historyByDesc, desc)
      meta.push({ desc, budgetRows, histRows })
    }

    if (meta.length === 0) continue

    const upserts = []
    for (const { desc, budgetRows, histRows } of meta) {
      const preds = seasonalNaiveGrowthDrift(histRows, seasonalIndex)
      const map2025 = {}
      for (const r of histRows) {
        map2025[`${r.year}|${r.month}`] = n(r.forecast_value)
      }
      for (let j = 0; j < MONTHS.length; j++) {
        const month = MONTHS[j]
        const budget = n(budgetRows.find((r) => r.month === month)?.budget_value)
        const statistical = preds[j] ?? 0
        // Blend statistical forecast with budget: alpha=1 → pure statistical, alpha=0 → pure budget
        // Blend statistical forecast with budget, handling negative lines (allowances, deductions)
        const bothNonZero = budget !== 0 && statistical !== 0
        const sameSign = (budget >= 0) === (statistical >= 0)
        const blended = bothNonZero && sameSign
          ? statistical * BLEND_ALPHA + budget * (1 - BLEND_ALPHA)
          : statistical !== 0 ? statistical : budget
        const lastYear = map2025["2025|" + month] ?? 0
        const lastMonth = month === 1 ? (map2025["2025|12"] ?? 0) : (map2025["2025|" + (month - 1)] ?? 0)
        upserts.push({
          branch_id: branch.id,
          description: desc,
          year: TARGET_YEAR,
          month,
          forecast_value: r2(blended),
          budget_value: r2(budget),
          last_month_value: r2(lastMonth),
          last_year_value: r2(lastYear),
        })
      }
    }

    // Zero-budget lines: force forecast 0
    for (const [desc, budgetRows] of budgetByDesc.entries()) {
      const budgetYearTotal = MONTHS.reduce(
        (s, m) => s + n(budgetRows.find((r) => r.month === m)?.budget_value),
        0
      )
      if (budgetYearTotal !== 0) continue
      for (const month of MONTHS) {
        const budget = n(budgetRows.find((r) => r.month === month)?.budget_value)
        upserts.push({
          branch_id: branch.id,
          description: desc,
          year: TARGET_YEAR,
          month,
          forecast_value: 0,
          budget_value: r2(budget),
          last_month_value: 0,
          last_year_value: 0,
        })
      }
    }

    // ── Protect manually-edited cells ───────────────────────────────────
    // If a branch user has ever edited a (branch, description, year, month)
    // in the UI, there will be a row in `forecast_audit_log` for that key.
    // Removing those keys from `upserts` means the rebuild will NOT overwrite
    // the user's saved value with the algorithm's output (which, for a brand
    // new branch with no history, would just be 0). HQ can opt back in with
    // --force when they explicitly want to reset manual edits.
    if (!FORCE_OVERWRITE_MANUAL && upserts.length > 0) {
      const keyIndex = new Map()
      upserts.forEach((u, i) => {
        keyIndex.set(`${u.branch_id}|${u.description}|${u.year}|${u.month}`, i)
      })
      const protectedKeys = new Set()
      let auditFrom = 0
      const AUDIT_PAGE = 1000
      while (true) {
        const { data: auditChunk, error: auditErr } = await supabase
          .from("forecast_audit_log")
          .select("branch_id, description, year, month")
          .eq("branch_id", branch.id)
          .range(auditFrom, auditFrom + AUDIT_PAGE - 1)
        if (auditErr) {
          console.error(`❌ audit-log fetch ${branch.code} ${branch.name}:`, auditErr.message)
          process.exit(1)
        }
        const rows = auditChunk ?? []
        for (const r of rows) {
          const k = `${r.branch_id}|${r.description}|${r.year}|${r.month}`
          if (keyIndex.has(k)) protectedKeys.add(k)
        }
        if (rows.length < AUDIT_PAGE) break
        auditFrom += AUDIT_PAGE
      }
      if (protectedKeys.size > 0) {
        const before = upserts.length
        for (let i = upserts.length - 1; i >= 0; i--) {
          const u = upserts[i]
          const k = `${u.branch_id}|${u.description}|${u.year}|${u.month}`
          if (protectedKeys.has(k)) upserts.splice(i, 1)
        }
        console.log(`  ↳ protected ${before - upserts.length} manually-edited cells for ${branch.code} ${branch.name}`)
      }
    }

    if (upserts.length > 0) {
      touched += 1
      for (let i = 0; i < upserts.length; i += 500) {
        const batch = upserts.slice(i, i + 500)
        const { error: uErr } = await supabase
          .from("forecasts")
          .upsert(batch, { onConflict: "branch_id,description,year,month", ignoreDuplicates: false })
        if (uErr) {
          console.error(`❌ upsert ${branch.code} ${branch.name}:`, uErr.message)
          process.exit(1)
        }
      }
      totalUpserted += upserts.length
      console.log(`✓ ${branch.code} ${branch.name}: updated ${upserts.length} rows`)
    }
  }

  console.log("")
  console.log(`Done. Branches touched: ${touched}`)
  console.log(`Rows upserted: ${totalUpserted}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
