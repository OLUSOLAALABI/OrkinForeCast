/**
 * Restore DB from a backup directory created by backup-db.mjs.
 *
 * Usage:  node scripts/restore-db.mjs --dir backup/2026-04-27T12-00-00
 *
 * This will:
 *   1. Delete all forecasts
 *   2. Delete all branches not in the backup
 *   3. Restore branches (upsert by code)
 *   4. Restore regions (upsert by name)
 *   5. Re-insert all forecasts from backup
 */
import fs from "fs"
import path from "path"
import readline from "readline"
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

const dirArg = process.argv.find((a) => a === "--dir") ? process.argv[process.argv.indexOf("--dir") + 1] : null
if (!dirArg) { console.error("Usage: node scripts/restore-db.mjs --dir backup/<timestamp>"); process.exit(1) }
const backupDir = path.resolve(rootDir, dirArg)
if (!fs.existsSync(backupDir)) { console.error("Backup dir not found:", backupDir); process.exit(1) }

async function confirm(msg) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  return new Promise((resolve) => {
    rl.question(msg + " (y/N) ", (answer) => {
      rl.close()
      resolve(answer.trim().toLowerCase() === "y")
    })
  })
}

function readNDJSON(filePath) {
  const content = fs.readFileSync(filePath, "utf8")
  return content.trim().split("\n").filter(Boolean).map((line) => JSON.parse(line))
}

async function main() {
  console.log("Restore from:", backupDir)

  const regionsFile = path.join(backupDir, "regions.json")
  const branchesFile = path.join(backupDir, "branches.json")
  const forecastsFile = path.join(backupDir, "forecasts.ndjson")

  if (!fs.existsSync(regionsFile) || !fs.existsSync(branchesFile) || !fs.existsSync(forecastsFile)) {
    console.error("Missing backup files (regions.json, branches.json, forecasts.ndjson)")
    process.exit(1)
  }

  const regions = JSON.parse(fs.readFileSync(regionsFile, "utf8"))
  const branches = JSON.parse(fs.readFileSync(branchesFile, "utf8"))
  const forecasts = readNDJSON(forecastsFile)

  console.log(`  Regions: ${regions.length}`)
  console.log(`  Branches: ${branches.length}`)
  console.log(`  Forecasts: ${forecasts.length}`)

  const ok = await confirm("\nThis will DELETE all current forecasts and restore from backup. Continue?")
  if (!ok) { console.log("Aborted."); return }

  // Step 1: Clear forecasts
  console.log("\nClearing forecasts...")
  let deleted = 0
  while (true) {
    const { data, error } = await supabase.from("forecasts").delete().neq("id", "00000000-0000-0000-0000-000000000000").select("id").limit(5000)
    if (error) { console.error("Delete forecasts:", error.message); break }
    deleted += data.length
    process.stdout.write(`  Deleted ${deleted} rows...\r`)
    if (data.length < 5000) break
  }
  console.log(`  Deleted ${deleted} forecast rows`)

  // Step 2: Remove branches that aren't in the backup
  const backupCodes = new Set(branches.map((b) => b.code))
  const { data: currentBranches } = await supabase.from("branches").select("id, code")
  const toRemove = currentBranches.filter((b) => !backupCodes.has(b.code))
  if (toRemove.length > 0) {
    console.log(`Removing ${toRemove.length} branches not in backup...`)
    for (const b of toRemove) {
      await supabase.from("branches").delete().eq("id", b.id)
    }
  }

  // Step 3: Upsert regions
  console.log("Restoring regions...")
  for (const r of regions) {
    await supabase.from("regions").upsert(r, { onConflict: "id" })
  }
  console.log(`  ${regions.length} regions restored`)

  // Step 4: Upsert branches
  console.log("Restoring branches...")
  for (const b of branches) {
    await supabase.from("branches").upsert(b, { onConflict: "id" })
  }
  console.log(`  ${branches.length} branches restored`)

  // Step 5: Re-insert forecasts
  console.log("Restoring forecasts (this may take a few minutes)...")
  const BATCH = 200
  let inserted = 0
  for (let i = 0; i < forecasts.length; i += BATCH) {
    const batch = forecasts.slice(i, i + BATCH)
    const { error } = await supabase.from("forecasts").upsert(batch, { onConflict: "branch_id,description,year,month" })
    if (error) {
      console.error(`  Batch ${i}: ${error.message}`)
      continue
    }
    inserted += batch.length
    if (inserted % 5000 === 0) process.stdout.write(`  ${inserted} / ${forecasts.length} rows...\r`)
  }
  console.log(`\n  ${inserted} forecast rows restored`)

  // Step 6: Restore last_month_actuals if backup exists
  const lmaFile = path.join(backupDir, "last_month_actuals.ndjson")
  if (fs.existsSync(lmaFile)) {
    const lma = readNDJSON(lmaFile)
    if (lma.length > 0) {
      console.log(`Restoring ${lma.length} last_month_actuals...`)
      // Only restore if current table was affected
      const { count } = await supabase.from("last_month_actuals").select("*", { count: "exact", head: true })
      if (count === 0) {
        let lmaInserted = 0
        for (let i = 0; i < lma.length; i += BATCH) {
          const batch = lma.slice(i, i + BATCH)
          const { error } = await supabase.from("last_month_actuals").insert(batch)
          if (error) { console.error(`  LMA batch ${i}: ${error.message}`); continue }
          lmaInserted += batch.length
        }
        console.log(`  ${lmaInserted} last_month_actuals restored`)
      } else {
        console.log(`  last_month_actuals already has ${count} rows, skipping`)
      }
    }
  }

  console.log("\n✓ Restore complete!")
}

main().catch((err) => { console.error(err); process.exit(1) })
