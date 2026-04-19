import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"

export const maxDuration = 60

/**
 * Accepts pre-parsed actuals data (JSON) from the client.
 * The client parses the Excel file with xlsx in the browser and sends structured data.
 *
 * Body: {
 *   year: number,
 *   months: number[],
 *   sheets: Array<{ tabName: string, rows: Array<{ description: string, month: number, value: number }> }>
 * }
 */
export async function POST(request: NextRequest) {
  try {
    // 1. Auth: verify user is HQ admin
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single()

    if (!profile || profile.role !== "hq_admin") {
      return NextResponse.json(
        { error: "Only HQ administrators can upload actuals" },
        { status: 403 }
      )
    }

    // 2. Parse the JSON body
    const body = await request.json()
    const { year, months, sheets } = body as {
      year: number
      months: number[]
      sheets: Array<{ tabName: string; rows: Array<{ description: string; month: number; value: number }> }>
    }

    if (!year || !months || !Array.isArray(months) || months.length === 0 || !sheets || !Array.isArray(sheets)) {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 })
    }

    // 3. Load branches and regions from DB
    const admin = createAdminClient()

    const { data: branches, error: branchErr } = await admin
      .from("branches")
      .select("id, name, region_id")

    if (branchErr || !branches) {
      return NextResponse.json({ error: "Failed to load branches" }, { status: 500 })
    }

    const { data: regions, error: regionErr } = await admin
      .from("regions")
      .select("id, name")

    if (regionErr || !regions) {
      return NextResponse.json({ error: "Failed to load regions" }, { status: 500 })
    }

    // Build lookups
    const branchByName = new Map<string, { id: string; name: string; region_id: string }>()
    for (const b of branches) {
      branchByName.set(b.name.toLowerCase(), b)
    }

    const regionByName = new Map<string, { id: string; name: string }>()
    for (const r of regions) {
      regionByName.set(r.name.toLowerCase(), r)
    }

    // 4. Delete existing actuals for this year + all uploaded months
    for (const mo of months) {
      const { error: deleteErr } = await admin
        .from("last_month_actuals")
        .delete()
        .eq("year", year)
        .eq("month", mo)

      if (deleteErr) {
        return NextResponse.json(
          { error: "Failed to clear existing actuals: " + deleteErr.message },
          { status: 500 }
        )
      }
    }

    // 5. Classify each sheet and build insert rows
    const allRows: {
      branch_id: string | null
      region_id: string | null
      is_company_wide: boolean
      description: string
      year: number
      month: number
      value: number
      uploaded_at: string
      uploaded_by: string
    }[] = []

    const now = new Date().toISOString()
    let branchesMatched = 0
    let regionsMatched = 0
    let companyWide = false
    const skippedTabs: string[] = []
    const matchedTabs: string[] = []

    for (const sheet of sheets) {
      const lower = sheet.tabName.trim().toLowerCase()

      if (sheet.rows.length === 0) {
        skippedTabs.push(sheet.tabName)
        continue
      }

      let branchId: string | null = null
      let regionId: string | null = null
      let isCompanyWide = false

      if (lower === "orkin canada") {
        isCompanyWide = true
        companyWide = true
        matchedTabs.push(sheet.tabName)
      } else if (lower === "ttl atlas") {
        const branch = branchByName.get("ttl atlas")
        if (branch) {
          branchId = branch.id
          branchesMatched++
          matchedTabs.push(sheet.tabName)
        } else {
          skippedTabs.push(sheet.tabName + " (no matching branch)")
          continue
        }
      } else {
        // Try as region
        const region = regionByName.get(lower)
        if (region) {
          regionId = region.id
          regionsMatched++
          matchedTabs.push(sheet.tabName)
        } else {
          // Try as branch: strip leading zeros
          const stripped = sheet.tabName.trim().replace(/^0+/, "").toLowerCase()
          const branch = branchByName.get(stripped) || branchByName.get(lower)
          if (branch) {
            branchId = branch.id
            branchesMatched++
            matchedTabs.push(sheet.tabName)
          } else {
            skippedTabs.push(sheet.tabName)
            continue
          }
        }
      }

      for (const { description, month, value } of sheet.rows) {
        allRows.push({
          branch_id: branchId,
          region_id: regionId,
          is_company_wide: isCompanyWide,
          description,
          year,
          month,
          value,
          uploaded_at: now,
          uploaded_by: user.id,
        })
      }
    }

    if (allRows.length === 0) {
      return NextResponse.json(
        { error: "No matching data found. Check that tab names match known branches." },
        { status: 400 }
      )
    }

    // 6. Bulk insert in batches with retry
    const BATCH_SIZE = 200
    const MAX_RETRIES = 3
    let totalInserted = 0
    for (let i = 0; i < allRows.length; i += BATCH_SIZE) {
      const batch = allRows.slice(i, i + BATCH_SIZE)
      let lastErr = null

      for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        const { error: insertErr } = await admin
          .from("last_month_actuals")
          .insert(batch)

        if (!insertErr) {
          lastErr = null
          break
        }

        lastErr = insertErr
        console.warn(`Insert batch ${Math.floor(i / BATCH_SIZE)} attempt ${attempt + 1} failed:`, insertErr.message)
        // Wait before retry (exponential backoff)
        await new Promise(r => setTimeout(r, 1000 * (attempt + 1)))
      }

      if (lastErr) {
        console.error("Insert error at batch", Math.floor(i / BATCH_SIZE), lastErr)
        return NextResponse.json(
          { error: "Failed to insert actuals: " + lastErr.message },
          { status: 500 }
        )
      }
      totalInserted += batch.length
    }

    // 7. Return summary
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
    const firstMonth = monthNames[months[0] - 1]
    const lastMonth = monthNames[months[months.length - 1] - 1]
    const monthRange = months.length === 1 ? firstMonth : `${firstMonth}–${lastMonth}`
    return NextResponse.json({
      success: true,
      months,
      monthRange,
      year,
      branchesMatched,
      regionsMatched,
      companyWide,
      rowsInserted: totalInserted,
      matchedTabs: matchedTabs.length,
      skippedTabs,
    })
  } catch (err: unknown) {
    console.error("Upload actuals error:", err)
    const message = err instanceof Error ? err.message : "Unknown error"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
