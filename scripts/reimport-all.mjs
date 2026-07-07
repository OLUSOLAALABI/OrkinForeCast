/**
 * Re-import all data: 2023-2025 actuals + 2026 budget from P&L workbooks.
 *
 * Usage:
 *   node scripts/reimport-all.mjs --dry-run   # Preview only, no DB changes
 *   node scripts/reimport-all.mjs              # Real import
 *
 * Prerequisites:
 *   - Run backup-db.mjs first!
 *   - .env with NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY
 *   - Data files in branchData/new_data_P&L/
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

const dryRun = process.argv.includes("--dry-run")

// ═══════════════════════════════════════════════════════════
// DATA FILES
// ═══════════════════════════════════════════════════════════
const DATA_FILES = [
  { year: 2023, path: "branchData/new_data_P&L/Orkin Canada P&L FINAL 12-2023.xlsm", type: "actuals" },
  { year: 2024, path: "branchData/new_data_P&L/Orkin Canada P&L 12-2024.xlsm", type: "actuals" },
  { year: 2025, path: "branchData/new_data_P&L/Orkin Canada P&L 12-2025.xlsm", type: "actuals" },
  { year: 2026, path: "branchData/new_data_P&L/2026 Orkin Canada Budget.xlsm", type: "budget" },
]

// ═══════════════════════════════════════════════════════════
// ALL 100 BRANCHES (code, display name, region)
// ═══════════════════════════════════════════════════════════
const ALL_BRANCHES = [
  // PACIFIC REGION (12)
  { code: "042", name: "42 PAC OH", region: "PACIFIC REGION" },
  { code: "942", name: "942 PAC CC", region: "PACIFIC REGION" },
  { code: "442", name: "442 PAC QA", region: "PACIFIC REGION" },
  { code: "642", name: "642 PAC SALES", region: "PACIFIC REGION" },
  { code: "024", name: "24 ATLAS E", region: "PACIFIC REGION" },
  { code: "028", name: "28 ATLAS W", region: "PACIFIC REGION" },
  { code: "025", name: "25 WESTSIDE", region: "PACIFIC REGION" },
  { code: "026", name: "26 BC INT C", region: "PACIFIC REGION" },
  { code: "027", name: "27 BC INT N", region: "PACIFIC REGION" },
  { code: "029", name: "29 VPC", region: "PACIFIC REGION" },
  { code: "032", name: "32 BC INT S", region: "PACIFIC REGION" },
  { code: "034", name: "34 VCR ISLAND", region: "PACIFIC REGION" },

  // GVR REGION (8)
  { code: "049", name: "49 GVR OH", region: "GVR REGION" },
  { code: "949", name: "949 GVR CC", region: "GVR REGION" },
  { code: "449", name: "449 GVR QA", region: "GVR REGION" },
  { code: "649", name: "649 GVR SALES", region: "GVR REGION" },
  { code: "030", name: "30 RICHMOND", region: "GVR REGION" },
  { code: "031", name: "31 VCR", region: "GVR REGION" },
  { code: "033", name: "33 VALLEY", region: "GVR REGION" },
  { code: "036", name: "36 BURNABY", region: "GVR REGION" },

  // PRAIRIE REGION (14)
  { code: "035", name: "35 PRA OH", region: "PRAIRIE REGION" },
  { code: "935", name: "935 PRA CC", region: "PRAIRIE REGION" },
  { code: "435", name: "435 PRA QA", region: "PRAIRIE REGION" },
  { code: "635", name: "635 PRA SALES", region: "PRAIRIE REGION" },
  { code: "037", name: "37 EDM S", region: "PRAIRIE REGION" },
  { code: "047", name: "47 EDM C", region: "PRAIRIE REGION" },
  { code: "046", name: "46 EDM N", region: "PRAIRIE REGION" },
  { code: "038", name: "38 CAL S", region: "PRAIRIE REGION" },
  { code: "039", name: "39 SASK", region: "PRAIRIE REGION" },
  { code: "040", name: "40 CAL N", region: "PRAIRIE REGION" },
  { code: "041", name: "41 CAL RES", region: "PRAIRIE REGION" },
  { code: "043", name: "43 PRA FUM", region: "PRAIRIE REGION" },
  { code: "044", name: "44 MANITOBA", region: "PRAIRIE REGION" },
  { code: "045", name: "45 REGINA", region: "PRAIRIE REGION" },

  // ONTARIO REGION (15)
  { code: "971", name: "971 ON OH", region: "ONTARIO REGION" },
  { code: "972", name: "972 ON CC", region: "ONTARIO REGION" },
  { code: "471", name: "471 ON QA", region: "ONTARIO REGION" },
  { code: "671", name: "671 ON SALES", region: "ONTARIO REGION" },
  { code: "006", name: "6 STONEY CR", region: "ONTARIO REGION" },
  { code: "008", name: "8 NIAGARA FALLS", region: "ONTARIO REGION" },
  { code: "009", name: "9 SUDBURY", region: "ONTARIO REGION" },
  { code: "010", name: "10 SE ON", region: "ONTARIO REGION" },
  { code: "014", name: "14 CAMBRIDGE", region: "ONTARIO REGION" },
  { code: "015", name: "15 NORTH BAY", region: "ONTARIO REGION" },
  { code: "020", name: "20 BARRIE RES", region: "ONTARIO REGION" },
  { code: "016", name: "16 BARRIE", region: "ONTARIO REGION" },
  { code: "017", name: "17 ON FUM", region: "ONTARIO REGION" },
  { code: "018", name: "18 LONDON", region: "ONTARIO REGION" },
  { code: "019", name: "19 WINDSOR", region: "ONTARIO REGION" },

  // GTA REGION (13)
  { code: "973", name: "973 GTA OH", region: "GTA REGION" },
  { code: "974", name: "974 GTA CC", region: "GTA REGION" },
  { code: "473", name: "473 GTA QA", region: "GTA REGION" },
  { code: "673", name: "673 GTA SALES", region: "GTA REGION" },
  { code: "001", name: "1 TOR W", region: "GTA REGION" },
  { code: "002", name: "2 HI-RISE", region: "GTA REGION" },
  { code: "003", name: "3 TOR E", region: "GTA REGION" },
  { code: "004", name: "4 GTA RES E", region: "GTA REGION" },
  { code: "013", name: "13 GTA RES W", region: "GTA REGION" },
  { code: "005", name: "5 MISSISSAUGA", region: "GTA REGION" },
  { code: "007", name: "7 TOR N", region: "GTA REGION" },
  { code: "011", name: "11 BRAMPTON", region: "GTA REGION" },
  { code: "012", name: "12 DOWNTOWN", region: "GTA REGION" },

  // QUEBEC REGION (10)
  { code: "957", name: "957 QC OH", region: "QUEBEC REGION" },
  { code: "958", name: "958 QC CC", region: "QUEBEC REGION" },
  { code: "457", name: "457 QC QA", region: "QUEBEC REGION" },
  { code: "657", name: "657 QC SALES", region: "QUEBEC REGION" },
  { code: "050", name: "50 S SHORE-MTL", region: "QUEBEC REGION" },
  { code: "051", name: "51 N SHORE-QC CITY", region: "QUEBEC REGION" },
  { code: "053", name: "53 OTT W", region: "QUEBEC REGION" },
  { code: "054", name: "54 OTT E", region: "QUEBEC REGION" },
  { code: "056", name: "56 REGIONEX", region: "QUEBEC REGION" },
  { code: "064", name: "64 QC FUM", region: "QUEBEC REGION" },

  // ATLANTIC REGION (9)
  { code: "967", name: "967 ATL OH", region: "ATLANTIC REGION" },
  { code: "968", name: "968 ATL CC", region: "ATLANTIC REGION" },
  { code: "467", name: "467 ATL QA", region: "ATLANTIC REGION" },
  { code: "667", name: "667 ATL SALES", region: "ATLANTIC REGION" },
  { code: "060", name: "60 PEI", region: "ATLANTIC REGION" },
  { code: "061", name: "61 NB", region: "ATLANTIC REGION" },
  { code: "062", name: "62 NS", region: "ATLANTIC REGION" },
  { code: "063", name: "63 NF LAB E", region: "ATLANTIC REGION" },
  { code: "065", name: "65 NF LAB W", region: "ATLANTIC REGION" },

  // FUNCTIONALS (19)
  { code: "947", name: "947 CAN OH", region: "FUNCTIONALS" },
  { code: "976", name: "976 BMT", region: "FUNCTIONALS" },
  { code: "678", name: "678 NA SALES", region: "FUNCTIONALS" },
  { code: "878", name: "878 NA BILLING", region: "FUNCTIONALS" },
  { code: "978", name: "978 NA ADMIN", region: "FUNCTIONALS" },
  { code: "980", name: "980 COMPLIANCE", region: "FUNCTIONALS" },
  { code: "491", name: "491 TRAIN", region: "FUNCTIONALS" },
  { code: "979", name: "979 FLEET", region: "FUNCTIONALS" },
  { code: "981", name: "981 H&S", region: "FUNCTIONALS" },
  { code: "991", name: "991 NA QA", region: "FUNCTIONALS" },
  { code: "992", name: "992 MKTG", region: "FUNCTIONALS" },
  { code: "993", name: "993 HR", region: "FUNCTIONALS" },
  { code: "994", name: "994 PAY", region: "FUNCTIONALS" },
  { code: "996", name: "996 IT", region: "FUNCTIONALS" },
  { code: "997", name: "997 ACCTG", region: "FUNCTIONALS" },
  { code: "998", name: "998 DATA", region: "FUNCTIONALS" },
  { code: "999", name: "999 CASH APPS", region: "FUNCTIONALS" },
  { code: "990", name: "990 CORP ADMIN", region: "FUNCTIONALS" },
  { code: "995", name: "995 CORP AR", region: "FUNCTIONALS" },
]

// ═══════════════════════════════════════════════════════════
// TAB NAME → BRANCH CODE OVERRIDES (for mismatched names)
// ═══════════════════════════════════════════════════════════
const TAB_OVERRIDES = {
  "47 GTA C":     "047",  // 2024 typo — actually EDM C
  "47 GTA C ":    "047",  // with trailing space
  "8 NIAG FALLS": "008",  // 2026 budget abbreviation
  "4 GTA RES":    "004",  // 2023 combined (was 4 GTA RES E + 13 GTA RES W)
  "991 NTL QA":   "991",  // 2026 budget alt name
  "999 AR":       "999",  // 2026 budget alt name
}

// ═══════════════════════════════════════════════════════════
// TABS TO SKIP
// ═══════════════════════════════════════════════════════════
const SKIP_TABS = new Set([
  "ToC", "TOC", "Inputs", "Travel", "Mktg Dept by GL",
  "ORKIN CANADA",
  "NTL ACCTS (total)",
])

const REGION_TABS = new Set([
  "PACIFIC REGION", "GVR REGION", "PRAIRIE REGION", "ONTARIO REGION",
  "GTA REGION", "QUEBEC REGION", "ATLANTIC REGION", "FUNCTIONALS",
  // Alternate names in older files
  "EASTERN REGION", "QUEBEC BRANCHES", "ATLANTIC BRANCHES",
])

function isTTL(name) {
  const n = name.trim().toUpperCase()
  return n.startsWith("TTL ") || n === "TTL"
}

function shouldSkip(tabName) {
  const trimmed = tabName.trim()
  return SKIP_TABS.has(trimmed) || REGION_TABS.has(trimmed) || isTTL(trimmed)
}

// ═══════════════════════════════════════════════════════════
// DESCRIPTION HANDLING
// ═══════════════════════════════════════════════════════════

// Descriptions that appear twice in P&L — disambiguate by occurrence order
const DUPLICATE_RENAMES = {
  "COMMERCIAL BED BUG REVENUE": { first: "COMMERCIAL BED BUG REVENUE (recur)", second: "COMMERCIAL BED BUG REVENUE" },
  "DEPRECIATION": { first: "DEPRECIATION", second: "DEPRECIATION (fixed)" },
}

// Normalize variant description names to canonical form
const DESCRIPTION_NORMALIZE = {
  "COMMERCIAL BED BUG REVENUE (odd job)": "COMMERCIAL BED BUG REVENUE",
  "PAYROLL SERVICE FEES": "ULTIPRO COST",
  "ADMIN INCENTIVE PAID": "MANAGERS INCENTIVES PAID",
  "PC MGMT FAILURE": "PC COMM MGMT FAILURE",
  "ULTIPRO FEES": "ULTIPRO COST",
}

const SKIP_DESCRIPTIONS = new Set([
  "line of bus", "district", "gl", "period", "orkin canada", "spare row", "*",
])

// ═══════════════════════════════════════════════════════════
// PARSING
// ═══════════════════════════════════════════════════════════

function toNum(val) {
  if (val === undefined || val === null || val === "") return null
  if (typeof val === "number" && !Number.isNaN(val)) return val
  const n = parseFloat(String(val).replace(/,/g, ""))
  return Number.isNaN(n) ? null : n
}

/**
 * Extract branch code from a tab name.
 * "042 PAC OH" → "042", "42 PAC OH" → "042", "1 TOR W" → "001"
 */
function extractCode(tabName) {
  const trimmed = tabName.trim()

  // Check overrides first
  if (TAB_OVERRIDES[trimmed]) return TAB_OVERRIDES[trimmed]

  const match = trimmed.match(/^(\d+)/)
  if (!match) return null
  return match[1].padStart(3, "0")
}

/**
 * Find header row and column positions in a sheet.
 * Returns { descCol, monthCols[12] } or null.
 */
function findLayout(rows) {
  const MONTHS = ["january", "february", "march", "april", "may", "june",
    "july", "august", "september", "october", "november", "december"]

  for (let r = 0; r < Math.min(rows.length, 15); r++) {
    const row = rows[r] || []
    // Find January column
    for (let c = 0; c < row.length; c++) {
      const val = String(row[c] || "").trim().toLowerCase()
      if (val === "january") {
        // Verify all 12 months follow consecutively
        let ok = true
        for (let m = 1; m < 12; m++) {
          const mVal = String(row[c + m] || "").trim().toLowerCase()
          if (mVal !== MONTHS[m]) { ok = false; break }
        }
        if (ok) {
          // Description column: look for "Description" header, else col before January
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
      // Also check "budget month 1" style headers
      if (val === "budget month 1") {
        let ok = true
        for (let m = 1; m < 12; m++) {
          const mVal = String(row[c + m] || "").trim().toLowerCase()
          if (mVal !== `budget month ${m + 1}`) { ok = false; break }
        }
        if (ok) {
          const descCol = c > 0 ? c - 1 : 0
          return { headerRow: r, descCol, monthCols: Array.from({ length: 12 }, (_, i) => c + i) }
        }
      }
    }
  }
  return null
}

/**
 * Parse a sheet into forecast rows: [{ description, month, value }]
 */
function parseSheet(rows, layout) {
  const { headerRow, descCol, monthCols } = layout
  const results = []
  const seenDescs = new Map()

  for (let i = headerRow + 1; i < rows.length; i++) {
    const row = rows[i] || []
    let desc = row[descCol] != null ? String(row[descCol]).trim() : ""
    if (!desc || desc.length < 2 || /^\d+$/.test(desc)) continue
    if (SKIP_DESCRIPTIONS.has(desc.toLowerCase())) continue

    // Normalize known variant names
    const normKey = Object.keys(DESCRIPTION_NORMALIZE).find(
      (k) => k.toUpperCase() === desc.toUpperCase()
    )
    if (normKey) desc = DESCRIPTION_NORMALIZE[normKey]

    // Handle duplicate descriptions (same name appears twice in P&L)
    const upperDesc = desc.toUpperCase()
    const rename = DUPLICATE_RENAMES[upperDesc]
    if (rename) {
      const count = (seenDescs.get(upperDesc) || 0) + 1
      seenDescs.set(upperDesc, count)
      desc = count === 1 ? rename.first : rename.second
    }

    for (let m = 0; m < 12; m++) {
      const value = toNum(row[monthCols[m]])
      if (value === null) continue
      results.push({ description: desc, month: m + 1, value })
    }
  }

  return results
}

// ═══════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════

async function main() {
  console.log(dryRun ? "=== DRY RUN (no DB changes) ===" : "=== REAL IMPORT ===")
  console.log("")

  // Verify all data files exist
  for (const f of DATA_FILES) {
    const full = path.join(rootDir, f.path)
    if (!fs.existsSync(full)) {
      console.error(`File not found: ${f.path}`)
      process.exit(1)
    }
  }

  // Connect to Supabase
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) { console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env"); process.exit(1) }
  const supabase = createClient(url, key)

  // ─── Step 1: Seed regions & branches ───────────────────
  console.log("Step 1: Seeding regions & branches...")

  const { data: existingRegions } = await supabase.from("regions").select("id, name")
  const regionMap = new Map(existingRegions.map((r) => [r.name, r.id]))

  // Add FUNCTIONALS region if missing
  const neededRegions = [...new Set(ALL_BRANCHES.map((b) => b.region))]
  for (const regionName of neededRegions) {
    if (!regionMap.has(regionName)) {
      if (dryRun) {
        console.log(`  [dry-run] Would add region: ${regionName}`)
        regionMap.set(regionName, "dry-run-id")
      } else {
        const { data, error } = await supabase.from("regions").insert({ name: regionName }).select("id").single()
        if (error) { console.error(`  Add region ${regionName}:`, error.message); process.exit(1) }
        regionMap.set(regionName, data.id)
        console.log(`  Added region: ${regionName}`)
      }
    }
  }

  // Sync branches
  const { data: existingBranches } = await supabase.from("branches").select("id, code, name, region_id")
  const branchByCode = new Map(existingBranches.map((b) => [b.code, b]))

  let added = 0, updated = 0, unchanged = 0
  for (const def of ALL_BRANCHES) {
    const regionId = regionMap.get(def.region)
    const existing = branchByCode.get(def.code)

    if (existing) {
      // Check if name or region needs updating
      if (existing.name !== def.name || existing.region_id !== regionId) {
        if (dryRun) {
          console.log(`  [dry-run] Would update branch ${def.code}: "${existing.name}" → "${def.name}"`)
        } else {
          const { error } = await supabase.from("branches").update({ name: def.name, region_id: regionId }).eq("id", existing.id)
          if (error) console.error(`  Update branch ${def.code}:`, error.message)
          else console.log(`  Updated branch ${def.code}: "${existing.name}" → "${def.name}"`)
        }
        updated++
      } else {
        unchanged++
      }
    } else {
      // Insert new branch
      if (dryRun) {
        console.log(`  [dry-run] Would add branch: ${def.code} "${def.name}" (${def.region})`)
      } else {
        const { error } = await supabase.from("branches").insert({ code: def.code, name: def.name, region_id: regionId })
        if (error) console.error(`  Add branch ${def.code}:`, error.message)
        else console.log(`  Added branch: ${def.code} "${def.name}" (${def.region})`)
      }
      added++
    }
  }
  console.log(`  Branches: ${added} added, ${updated} updated, ${unchanged} unchanged`)

  // Re-fetch branches after seeding (need UUIDs for foreign keys)
  const { data: allBranches } = await supabase.from("branches").select("id, code, name")
  const branchLookup = new Map(allBranches.map((b) => [b.code, b]))

  // ─── Step 2: Clear forecasts ───────────────────────────
  if (!dryRun) {
    console.log("\nStep 2: Clearing forecasts table...")
    let deleted = 0
    while (true) {
      const { data, error } = await supabase.from("forecasts").delete().neq("id", "00000000-0000-0000-0000-000000000000").select("id").limit(5000)
      if (error) { console.error("  Delete error:", error.message); break }
      deleted += data.length
      process.stdout.write(`  Deleted ${deleted} rows...\r`)
      if (data.length < 5000) break
    }
    console.log(`  Cleared ${deleted} forecast rows`)
  } else {
    console.log("\nStep 2: [dry-run] Would clear all forecasts")
  }

  // ─── Step 3: Import each year ──────────────────────────
  console.log("\nStep 3: Importing data from P&L files...\n")

  let grandTotal = 0
  const summary = []

  for (const fileInfo of DATA_FILES) {
    const { year, type } = fileInfo
    const filePath = path.join(rootDir, fileInfo.path)
    console.log(`── ${year} (${type}) ──`)
    console.log(`   File: ${fileInfo.path}`)

    const buf = fs.readFileSync(filePath)
    const wb = XLSX.read(buf, { type: "buffer", bookVBA: true })
    console.log(`   Sheets: ${wb.SheetNames.length}`)

    let yearTotal = 0
    let sheetsImported = 0
    let sheetsSkipped = 0
    const matched = new Set()
    const unmatched = []

    for (const tabName of wb.SheetNames) {
      if (shouldSkip(tabName)) { sheetsSkipped++; continue }

      const code = extractCode(tabName)
      if (!code) { sheetsSkipped++; unmatched.push(tabName); continue }

      const branch = branchLookup.get(code)
      if (!branch) { sheetsSkipped++; unmatched.push(`${tabName} (code ${code} not in DB)`); continue }

      matched.add(code)

      // Parse the sheet
      const sheet = wb.Sheets[tabName]
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" })
      const layout = findLayout(rows)

      if (!layout) {
        console.log(`   ⚠ No header found in "${tabName}", skipping`)
        sheetsSkipped++
        continue
      }

      const parsed = parseSheet(rows, layout)

      if (parsed.length === 0) {
        sheetsSkipped++
        continue
      }

      // Deduplicate by (description, month) — sum values for same key
      const deduped = new Map()
      for (const row of parsed) {
        const key = `${row.description}|${row.month}`
        if (deduped.has(key)) {
          deduped.get(key).value += row.value
        } else {
          deduped.set(key, { ...row })
        }
      }

      const toInsert = [...deduped.values()].map((r) => ({
        branch_id: branch.id,
        description: r.description,
        year,
        month: r.month,
        budget_value: r.value,
        forecast_value: r.value,
        last_month_value: 0,
        last_year_value: 0,
      }))

      if (dryRun) {
        console.log(`   ✓ ${tabName} → ${branch.name} | ${toInsert.length} rows`)
      } else {
        // Batch insert
        const BATCH = 200
        let ok = true
        for (let i = 0; i < toInsert.length; i += BATCH) {
          const batch = toInsert.slice(i, i + BATCH)
          const { error } = await supabase.from("forecasts").upsert(batch, {
            onConflict: "branch_id,description,year,month",
            ignoreDuplicates: false,
          })
          if (error) {
            console.error(`   ✗ ${tabName} batch ${i}: ${error.message}`)
            ok = false
            break
          }
        }
        if (ok) {
          process.stdout.write(`   ✓ ${tabName} → ${branch.name} | ${toInsert.length} rows\n`)
        }
      }

      yearTotal += toInsert.length
      sheetsImported++
    }

    // Report unmatched tabs
    if (unmatched.length > 0) {
      console.log(`   Unmatched tabs: ${unmatched.join(", ")}`)
    }

    // Report branches with no data in this year
    const missingBranches = ALL_BRANCHES.filter((b) => !matched.has(b.code))
    if (missingBranches.length > 0) {
      console.log(`   Branches with no tab (will be 0): ${missingBranches.map((b) => b.code + " " + b.name).join(", ")}`)
    }

    console.log(`   Total: ${sheetsImported} sheets imported, ${sheetsSkipped} skipped, ${yearTotal} rows`)
    console.log("")

    summary.push({ year, sheets: sheetsImported, rows: yearTotal, missing: missingBranches.length })
    grandTotal += yearTotal
  }

  // ─── Step 4: Summary ──────────────────────────────────
  console.log("═══════════════════════════════════════")
  console.log("SUMMARY")
  console.log("═══════════════════════════════════════")
  for (const s of summary) {
    console.log(`  ${s.year}: ${s.sheets} sheets, ${s.rows} rows, ${s.missing} branches with no data`)
  }
  console.log(`  Grand total: ${grandTotal} rows`)
  console.log("")

  if (dryRun) {
    console.log("DRY RUN complete — no data was written.")
    console.log("Run without --dry-run to perform the real import.")
  } else {
    // Verify counts
    const { count: fCount } = await supabase.from("forecasts").select("*", { count: "exact", head: true })
    console.log(`Verification: ${fCount} rows in forecasts table`)
    console.log("\n✓ Import complete!")
  }
}

main().catch((err) => { console.error(err); process.exit(1) })
