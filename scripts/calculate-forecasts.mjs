/**
 * Post-import: populate last_year_value and calculate real forecasts for 2026.
 *
 * Strategy: process one branch at a time (fetch 4 years in parallel per branch)
 * to keep memory manageable. Uses batch upserts instead of individual row updates.
 *
 * What this does:
 *   1. For each branch in 2024/2025/2026: sets last_year_value from the prior year.
 *   2. For each branch in 2026: calculates real forecast_value using blended algorithm
 *      (40% seasonal, 30% weighted-avg, 30% budget-adjusted).
 *   3. Populates last_month_value for 2026.
 *   4. Recomputes subtotals from children.
 *
 * Usage:
 *   node scripts/calculate-forecasts.mjs --dry-run   # Preview, no DB changes
 *   node scripts/calculate-forecasts.mjs              # Real update
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

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
const dryRun = process.argv.includes("--dry-run")

// ─── Constants ───
const BUDGET_ONLY_LINES = new Set([
  "SALES ALLOCATIONS", "QA ALLOCATIONS", "AR ALLOCATIONS",
  "DATA PROCESSING ALLOCATIONS", "ACCOUNTING ALLOCATIONS",
  "ADVERTISING & MKTG - ALLOCATION", "REGION SUPPORT SERVICES",
  "CANADA OVERHEAD ALLOCATIONS", "BMT ALLOCATIONS",
  "FLEET ALLOCATIONS", "CORPORATE ADMIN ALLOCATIONS",
  "HO ADMIN ALLOCATIONS", "HUMAN RESOURCES ALLOCATIONS",
  "INFORMATION TECH. ALLOCATIONS",
  "OVERHEAD ALLOCATION REVERSAL", "HOME OFFICE OVERHEAD",
  "ACQUISITION COST", "ULTIPRO COST",
].map((s) => norm(s)))

function norm(s) { return String(s ?? "").toUpperCase().replace(/\s+/g, " ").trim() }
function isBudgetOnly(desc) { return BUDGET_ONLY_LINES.has(norm(desc)) }
function isSubtotal(desc) {
  const d = norm(desc)
  return d.includes("TOTAL") || d.includes("SUBTOTAL") || d.includes("SUB TOTAL") ||
    d.includes("PROFIT") || d.includes("CONTRIBUTION") || d.includes("B/4 OVERHEAD") || d.includes("NET CONTRACT")
}

// Subtotal rules (order: children first so parents cascade)
const SUBTOTAL_RULES = [
  { desc: "SUBTOTAL MONTHLY", add: ["PEST CONTROL REVENUE", "COMMERCIAL REVENUE", "COMMERCIAL BED BUG REVENUE (recur)", "FLY CONTROL", "ORKIN/AIRE", "FEMININE HYGIENE", "DRAIN MAINTENANCE", "SOAK TANK"] },
  { desc: "SUBTOTAL/ALTERNATE/SEASONAL", add: ["RESIDENTIAL CONTRACT", "VALU PLUS COMM REVENUE", "SEASONAL REV  & OTHER"] },
  { desc: "GROSS CONTRACT REVENUE", add: ["SUBTOTAL MONTHLY", "SUBTOTAL/ALTERNATE/SEASONAL"] },
  { desc: "TOTAL ALLOWANCES", add: ["ALLOWANCES", "PC COMM MGMT FAILURE", "RESIDENTIAL MGMT FAILURE", "YEAR IN ADVANCE", "PC SALES DISC"] },
  { desc: "NET CONTRACT REVENUE", add: ["GROSS CONTRACT REVENUE", "TOTAL ALLOWANCES"] },
  { desc: "TOTAL MISC REVENUE", add: ["MISCELLANEOUS REVENUE", "RESIDENTIAL BED BUG REVENUE", "COMMERCIAL BED BUG REVENUE", "RESIDENTIAL SPECIAL SERVICES", "COMMERCIAL SPECIAL SERVICES", "PRODUCT SALES", "FUMIGATION PC"] },
  { desc: "TOTAL NET PC REVENUE", add: ["NET CONTRACT REVENUE", "TOTAL MISC REVENUE"] },
  { desc: "TOTAL NET TC REVENUE", add: ["TERMITE (TC) REVENUE", "TERMITE TREATING", "PRETREAT", "INSPECTION FEES", "TC MGMT FAILURE"] },
  { desc: "TOTAL NET REVENUE", add: ["TOTAL NET PC REVENUE", "TOTAL NET TC REVENUE"] },
  { desc: "SUBTOTALS MANAGERS", add: ["DIVISION MANAGER", "REGION MANAGER SALARY", "BRANCH MANAGER SALARY", "QUALITY ASSURANCE", "MANAGER TRAINEE"] },
  { desc: "SUBTOTAL MGR INCENTIVES", add: ["MANAGERS INCENTIVES PAID", "MGR INCENTIVE ACCRUED"] },
  { desc: "SUBTOTAL OFFICE", add: ["OFFICE SALARIES", "VAC / HOLIDAY / SICK", "OFFICE SAL FLD OT", "TEMP OFFICE PERS"] },
  { desc: "SUBTOTAL ADMIN PAYROLL", add: ["SUBTOTALS MANAGERS", "SUBTOTAL MGR INCENTIVES", "SUBTOTAL OFFICE"] },
  { desc: "SUBTOTAL SALES PAYROLL", add: ["SALESPERSON SALARIES", "ASM & NATIONAL SALES SALARIES", "SALES COMMISSIONS / BONUS", "SALES VAC / HOL / SICK", "TECHNICIAN SALES COMMISSION"] },
  { desc: "SUBTOTAL SERV PAYROLL", add: ["TECHNICIAN SERVICE SALARIES", "TECHNICIAN SERV PRODUCTION", "PC VAC / HOL / SICK", "PC SERV WAGES - OT"] },
  { desc: "TOTAL SERVICE WAGES", add: ["SUBTOTAL SERV PAYROLL", "SERV MGR SALARY", "SERV MGR BONUS"] },
  { desc: "TOTAL PAYROLL", add: ["SUBTOTAL ADMIN PAYROLL", "SUBTOTAL SALES PAYROLL", "TOTAL SERVICE WAGES"] },
  { desc: "TOTAL PERSONNEL EXPENSES", add: ["PAYROLL TAXES", "INS-GROUP BENEFITS", "INS-GROUP DEDUCTIONS", "UNIFORMS", "MOVING", "TRAINING", "PROF RECRUITING", "MEDICAL", "OTHER PERSONNEL RELATED"] },
  { desc: "TOTAL EMPL COST", add: ["TOTAL PAYROLL", "TOTAL PERSONNEL EXPENSES"] },
  { desc: "SUB TOTAL M&S", add: ["PC CHEMICALS", "FREIGHT IN", "PC TOOLS & EQUIPMENT", "ORKIN/AIRE (M&S)", "M&S FLY LIGHTS"] },
  { desc: "TOTAL MATERIAL & SUPPLIES", add: ["SUB TOTAL M&S", "COGS PRODUCTS & EQUIPMENT"] },
  { desc: "TOTAL VEHICLE OPERATING", add: ["GASOLINE", "TIRES", "OIL CHANGE", "OTHER OPERATING EXPENSES"] },
  { desc: "TOTAL STAND EXPENSES", add: ["LEASE", "DEPRECIATION", "VEH GAIN / LOSS", "LICENSES / TAXES"] },
  { desc: "TOTAL VEHICLE EXPENSE", add: ["TOTAL VEHICLE OPERATING", "TOTAL STAND EXPENSES"] },
  { desc: "TOTAL FLEET", add: ["TOTAL VEHICLE EXPENSE", "AUTO ALLOWANCE", "PER USE DEDUCTIONS"] },
  { desc: "SUBTOTAL INSURANCE & CLAIMS", add: ["VEHICLE ACCIDENT", "CLAIMS - GENERAL  LIABILITY", "INS - GENERAL LIABILITY", "INS - AUTO LIABILITY", "INS - WORKERS COMPENSATION"] },
  { desc: "TOTAL INSURANCE & CLAIMS", add: ["SUBTOTAL INSURANCE & CLAIMS", "CATASTROPHIC ACCRUAL"] },
  { desc: "SUBTOTAL BAD DEBTS", add: ["BAD DEBT EXPENSE", "RECOVERIES"] },
  { desc: "TOTAL BAD DEBTS", add: ["SUBTOTAL BAD DEBTS", "BAD DEBT ACCRUAL", "OUT OF POLICY"] },
  { desc: "TOTAL FIXED EXPENSE", add: ["ADVERTISING DIRECT", "RENT - BRANCH", "DEPRECIATION (fixed)", "TAXES PROP/OTHER"] },
  { desc: "SUBTOTAL TELEPHONE", add: ["LOCAL CENTRALIZED", "LONG DISTANCE CENTRALIZED", "CELLULAR TELEPHONE", "OTHER COMMUNICATION"] },
  { desc: "SUBTOTAL TELE. & UTILITIES", add: ["SUBTOTAL TELEPHONE", "UTILITIES"] },
  { desc: "TOTAL CONTROLLABLE", add: ["OFFICE SUPPLIES", "PRINTING & FORMS", "COMPUTER SUPPLIES", "TRAVEL", "CONFERENCE", "SUBTOTAL TELE. & UTILITIES", "PROFESSIONAL SERVICES", "MAINTENANCE & REPAIRS", "EQUIPMENT RENTAL", "POSTAGE", "BANK SERVICE CHARGES", "CREDIT CARD SERVICE FEE", "MISCELLANEOUS"] },
  { desc: "TOTAL OTHER EXPENSE", add: ["TOTAL FIXED EXPENSE", "TOTAL CONTROLLABLE"] },
  { desc: "TOTAL EXPENSES", add: ["TOTAL EMPL COST", "TOTAL MATERIAL & SUPPLIES", "TOTAL FLEET", "TOTAL INSURANCE & CLAIMS", "TOTAL BAD DEBTS", "TOTAL OTHER EXPENSE"] },
  { desc: "CONTRIBUTION B/4 OVERHEAD", add: ["TOTAL NET REVENUE"], sub: ["TOTAL EXPENSES"] },
  { desc: "TOTAL OVERHEAD ALLOCATIONS", add: ["SALES ALLOCATIONS", "QA ALLOCATIONS", "AR ALLOCATIONS", "DATA PROCESSING ALLOCATIONS", "ACCOUNTING ALLOCATIONS", "ADVERTISING & MKTG - ALLOCATION", "REGION SUPPORT SERVICES", "CANADA OVERHEAD ALLOCATIONS", "BMT ALLOCATIONS", "FLEET ALLOCATIONS", "CORPORATE ADMIN ALLOCATIONS", "HO ADMIN ALLOCATIONS", "HUMAN RESOURCES ALLOCATIONS", "INFORMATION TECH. ALLOCATIONS"] },
  { desc: "OPERATING PROFIT", add: ["CONTRIBUTION B/4 OVERHEAD"], sub: ["TOTAL OVERHEAD ALLOCATIONS"] },
  { desc: "BONUS OPERATING PROFIT", add: ["OPERATING PROFIT"], sub: ["OVERHEAD ALLOCATION REVERSAL"] },
  { desc: "EXTERNAL PROFIT", add: ["BONUS OPERATING PROFIT"], sub: ["HOME OFFICE OVERHEAD", "ACQUISITION COST", "ULTIPRO COST"] },
  { desc: "NET PROFIT", add: ["EXTERNAL PROFIT"], sub: ["FOREIGN EXCHANGE GAIN/LOSS", "ROYALTY FEES", "INTEREST EXPENSE ORKIN", "CANADIAN TAXES", "NON-OP INT EXP/(REV)"] },
]

// ─── Forecasting algorithm (mirrors lib/forecasting.ts) ───
function calcSeasonalIndex(data) {
  const t = data.reduce((a, b) => a + b, 0)
  if (t === 0) return new Array(12).fill(1 / 12)
  return data.map((v) => (v / t) * 12)
}

function computeForecast(lastYear, actuals, budget, lastActualMonth) {
  const si = calcSeasonalIndex(lastYear)
  const curYTD = actuals.slice(0, lastActualMonth)
  const lyYTD = lastYear.slice(0, lastActualMonth)
  const curSum = curYTD.reduce((a, b) => a + b, 0)
  const lySum = lyYTD.reduce((a, b) => a + b, 0)
  const trend = lastActualMonth > 0 && lySum !== 0 ? curSum / lySum : 1
  const weights = [0.4, 0.3, 0.2, 0.1]

  const result = new Array(12)
  for (let m = 0; m < 12; m++) {
    if (m < lastActualMonth) {
      result[m] = actuals[m]
    } else {
      const lyv = lastYear[m] || 0
      const bv = budget[m] || 0

      // Seasonal forecast from last year
      const sf = lyv * trend

      // Weighted average of recent months
      const recent = lastActualMonth > 0
        ? actuals.slice(Math.max(0, lastActualMonth - 4), lastActualMonth).reverse()
        : lastYear.slice(Math.max(0, 12 - 4), 12).reverse()
      let wSum = 0, ww = 0
      for (let i = 0; i < Math.min(recent.length, weights.length); i++) {
        wSum += recent[i] * weights[i]; ww += weights[i]
      }
      const wa = ww > 0 ? wSum / ww : 0
      const sa = wa * si[m]

      // Budget adjusted for trend
      const ba = bv * trend

      // Blend: 40% seasonal, 30% weighted-avg, 30% budget
      let fv = sf * 0.4 + sa * 0.3 + ba * 0.3

      // Bounds: 0.5x–2x of budget
      if (bv > 0) fv = Math.max(bv * 0.5, Math.min(bv * 2, fv))
      else if (bv < 0) fv = Math.min(bv * 0.5, Math.max(bv * 2, fv))

      result[m] = Math.round(fv * 100) / 100
    }
  }
  return result
}

// ─── Paginated fetch ───
async function fetchBranchYear(branchId, year) {
  const PAGE = 1000
  let all = [], from = 0
  while (true) {
    const { data, error } = await supabase.from("forecasts").select("*")
      .eq("branch_id", branchId).eq("year", year)
      .range(from, from + PAGE - 1)
    if (error) throw error
    if (!data || data.length === 0) break
    all.push(...data)
    if (data.length < PAGE) break
    from += PAGE
  }
  return all
}

// ─── Batch upsert ───
async function batchUpsert(rows) {
  const BATCH = 200
  let ok = 0
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH)
    const { error } = await supabase.from("forecasts").upsert(batch, {
      onConflict: "branch_id,description,year,month",
      ignoreDuplicates: false,
    })
    if (error) {
      console.error(`  Upsert error at batch ${i}: ${error.message}`)
    } else {
      ok += batch.length
    }
  }
  return ok
}

// ─── Main ───
async function main() {
  console.log(dryRun ? "=== DRY RUN ===" : "=== LIVE RUN ===")

  const { data: branchList } = await supabase.from("branches").select("id, name").order("name")
  console.log(`Branches: ${branchList.length}\n`)

  // Pre-fetch 2026 actuals (likely small or empty)
  const { data: actualRows } = await supabase.from("actuals")
    .select("branch_id, description, month, value").eq("year", 2026)
  const actualsMap = new Map()
  let maxActualMonth = 0
  for (const a of (actualRows || [])) {
    const key = `${a.branch_id}|${norm(a.description)}`
    if (!actualsMap.has(key)) actualsMap.set(key, new Array(12).fill(0))
    actualsMap.get(key)[a.month - 1] = Number(a.value)
    if (a.month > maxActualMonth) maxActualMonth = a.month
  }
  console.log(`2026 actuals: ${(actualRows || []).length} rows, last actual month: ${maxActualMonth}\n`)

  let totalLY = 0, totalFC = 0, totalLM = 0

  for (let bi = 0; bi < branchList.length; bi++) {
    const branch = branchList[bi]
    process.stdout.write(`[${bi + 1}/${branchList.length}] ${branch.name} ...`)

    // Fetch all 4 years in parallel
    const [r23, r24, r25, r26] = await Promise.all([
      fetchBranchYear(branch.id, 2023),
      fetchBranchYear(branch.id, 2024),
      fetchBranchYear(branch.id, 2025),
      fetchBranchYear(branch.id, 2026),
    ])

    // Build desc|month → value lookups
    const lk = (rows) => {
      const m = new Map()
      for (const r of rows) m.set(`${norm(r.description)}|${r.month}`, Number(r.forecast_value))
      return m
    }
    const lk23 = lk(r23), lk24 = lk(r24), lk25 = lk(r25)

    // All updates for this branch (keyed by desc|year|month to merge)
    const mergedUpdates = new Map()

    function addUpdate(r, overrides) {
      const key = `${r.description}|${r.year}|${r.month}`
      if (mergedUpdates.has(key)) {
        Object.assign(mergedUpdates.get(key), overrides)
      } else {
        mergedUpdates.set(key, {
          branch_id: r.branch_id,
          description: r.description,
          year: r.year,
          month: r.month,
          forecast_value: Number(r.forecast_value),
          budget_value: Number(r.budget_value),
          last_year_value: Number(r.last_year_value),
          last_month_value: Number(r.last_month_value),
          ...overrides,
        })
      }
    }

    // ── Step 1: last_year_value ──
    let lyCount = 0
    function setLY(rows, priorLk) {
      for (const r of rows) {
        const pv = priorLk.get(`${norm(r.description)}|${r.month}`) || 0
        if (Math.abs(Number(r.last_year_value) - pv) > 0.005) {
          addUpdate(r, { last_year_value: pv })
          lyCount++
        }
      }
    }
    setLY(r24, lk23)
    setLY(r25, lk24)
    setLY(r26, lk25)

    // ── Step 2: 2026 forecasts ──
    // Group by description
    const byDesc = new Map()
    for (const r of r26) {
      const nd = norm(r.description)
      if (!byDesc.has(nd)) byDesc.set(nd, { desc: r.description, rows: [], budget: new Array(12).fill(0) })
      const e = byDesc.get(nd)
      e.rows.push(r)
      e.budget[r.month - 1] = Number(r.budget_value)
    }

    // updatedFV tracks new forecast values for subtotal recomputation
    const updatedFV = new Map()
    let fcCount = 0

    for (const [nd, entry] of byDesc) {
      const lyArr = new Array(12).fill(0)
      for (let m = 1; m <= 12; m++) lyArr[m - 1] = lk25.get(`${nd}|${m}`) || 0
      const actArr = actualsMap.get(`${branch.id}|${nd}`) || new Array(12).fill(0)

      if (isBudgetOnly(nd)) {
        for (const r of entry.rows) {
          const bv = Number(r.budget_value)
          updatedFV.set(`${nd}|${r.month}`, bv)
          if (Math.abs(Number(r.forecast_value) - bv) > 0.005) {
            addUpdate(r, { forecast_value: bv })
            fcCount++
          }
        }
      } else if (isSubtotal(nd)) {
        // Initial: keep existing, fill updatedFV for later
        for (const r of entry.rows) updatedFV.set(`${nd}|${r.month}`, Number(r.forecast_value))
      } else {
        // Leaf: compute real forecast
        const fc = computeForecast(lyArr, actArr, entry.budget, maxActualMonth)
        for (const r of entry.rows) {
          const nv = fc[r.month - 1]
          updatedFV.set(`${nd}|${r.month}`, nv)
          if (Math.abs(Number(r.forecast_value) - nv) > 0.005) {
            addUpdate(r, { forecast_value: nv })
            fcCount++
          }
        }
      }
    }

    // Recompute subtotals
    for (let month = 1; month <= 12; month++) {
      for (const rule of SUBTOTAL_RULES) {
        const rk = norm(rule.desc)
        if (!updatedFV.has(`${rk}|${month}`)) continue
        let sum = 0
        for (const c of rule.add) sum += updatedFV.get(`${norm(c)}|${month}`) || 0
        if (rule.sub) for (const c of rule.sub) sum -= updatedFV.get(`${norm(c)}|${month}`) || 0
        updatedFV.set(`${rk}|${month}`, Math.round(sum * 100) / 100)
      }
    }

    // Collect subtotal updates
    for (const [nd, entry] of byDesc) {
      if (!isSubtotal(nd)) continue
      for (const r of entry.rows) {
        const nv = updatedFV.get(`${nd}|${r.month}`)
        if (nv !== undefined && Math.abs(Number(r.forecast_value) - nv) > 0.005) {
          addUpdate(r, { forecast_value: nv })
          fcCount++
        }
      }
    }

    // ── Step 3: last_month_value for 2026 ──
    let lmCount = 0
    for (const r of r26) {
      const nd = norm(r.description)
      let lmv = r.month > 1
        ? (updatedFV.get(`${nd}|${r.month - 1}`) ?? 0)
        : (lk25.get(`${nd}|12`) || 0)
      lmv = Math.round(lmv * 100) / 100
      if (Math.abs(Number(r.last_month_value) - lmv) > 0.005) {
        addUpdate(r, { last_month_value: lmv })
        lmCount++
      }
    }

    // ── Upsert all updates for this branch ──
    const allRows = [...mergedUpdates.values()]
    if (!dryRun && allRows.length > 0) {
      await batchUpsert(allRows)
    }

    totalLY += lyCount; totalFC += fcCount; totalLM += lmCount
    console.log(` LY:${lyCount} FC:${fcCount} LM:${lmCount} (${allRows.length} upserted)`)
  }

  console.log(`\n═══ Summary ═══`)
  console.log(`  last_year_value updates:  ${totalLY}`)
  console.log(`  forecast_value updates:   ${totalFC}`)
  console.log(`  last_month_value updates: ${totalLM}`)
  console.log(dryRun ? "\n=== DRY RUN — no DB changes ===" : "\n=== DONE ===")
}

main().catch((err) => {
  console.error("Fatal:", err)
  process.exit(1)
})
