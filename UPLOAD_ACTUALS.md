# Upload Actuals — Architecture & Mapping Guide

## Overview

HQ admins can upload a monthly P&L Excel file (`.xlsm`) to populate the "Last Month" actuals column in the forecast table. The file is parsed client-side, then sent as JSON to the API for storage.

## Excel File Structure

The source file is a **Total Company P&L** workbook (e.g. `03-2026 Total Company P&L.xlsm`) containing ~122 sheets:

- **ORKIN CANADA** — company-wide totals (the master sheet)
- **Region sheets** — e.g. `PACIFIC REGION`, `PRAIRIE REGION`, `GTA REGION`, etc.
- **Branch sheets** — e.g. `001 TOR W`, `025 WESTSIDE`, `050 S SHORE-MTL`, etc.
- **Overhead/support sheets** — e.g. `042 PAC OH`, `949 GVR CC`, `442 PAC QA`, `649 GVR SALES`
- **FUNCTIONALS branches** — e.g. `947 CAN OH`, `976 BMT`, `991 NA QA`, `993 HR`

### Column Layout (same across all sheets)

| Column | Index | Content |
|--------|-------|---------|
| I | 8 | Raw description (GL-level names, may have duplicates/different names) |
| T | 19 | **Canonical description** — disambiguated, human-friendly names |
| U | 20 | January values |
| V | 21 | February values |
| ... | ... | ... |
| AF | 31 | December values |

**Row 8** is the header row. Data rows start at row 9 (0-indexed).

### Why Column T, Not Column I

Column I has raw GL descriptions that can be duplicated or inconsistent across sheets:

| Row | Column I (raw) | Column T (canonical) |
|-----|---|---|
| 16/136 | `ORKIN/AIRE` / `ORKIN/AIRE` | `ORKIN/AIRE` / `ORKIN/AIRE (M&S)` |
| 155/198 | `DEPRECIATION` / `DEPRECIATION` | `DEPRECIATION` / `DEPRECIATION (fixed)` |
| 265 | `PAYROLL SERVICE FEES` | `ULTIPRO COST` |
| 46 | `COMMERCIAL BED BUG REVENUE (odd job)` | `COMMERCIAL BED BUG REVENUE` |
| 81 | `ADMIN INCENTIVE PAID` | `MANAGERS INCENTIVES PAID` |

Column T is only fully disambiguated on the **ORKIN CANADA** sheet. Branch and region sheets still have duplicates in column T.

## Parsing Strategy: ORKIN CANADA as Single Source of Truth

1. **Parse ORKIN CANADA first** — read column T to build a `rowIndex → description` map
2. **For every other sheet** — use the same row indices, look up the canonical description from the master map, and read values from the month columns
3. **No rename hacks needed** — all description names flow from one authoritative source

This works because all sheets share an identical row layout. Every P&L line item is at the same row index across all 122 sheets.

## Tab-to-Entity Matching (API side)

The API (`/api/upload-actuals`) maps each sheet tab to a database entity:

| Excel Tab | Matching Logic |
|---|---|
| `ORKIN CANADA` | Stored as `is_company_wide = true` |
| `TTL ATLAS` | Exact match to branch name in DB |
| Region names (e.g. `PACIFIC REGION`) | Exact match to `regions.name` (case-insensitive) |
| Branch tabs (e.g. `025 WESTSIDE`) | Strip leading zeros → match to `branches.name` |

### Skipped Tabs

Only true non-data tabs are skipped:

- Prefix: `ToC`, `Travel`, `Mktg Dept`
- Exact: `NTL ACCTS (total)`, `TTL QA`, `Inputs`
- Region subtotals starting with `TTL`: `TTL PAC_GVR`, `TTL ISLAND`, `TTL BARRIE`, `TTL EDM`, `TTL SASK & REG`, `TTL GTA RES`, `TTL NFLD`

**All OH, CC, QA, SALES, and FUNCTIONALS branches are now included** (100 branches total). Any tab not matching a DB branch/region is silently skipped and reported in the API response's `skippedTabs` array.

## Database Schema

Table: `last_month_actuals` (see `scripts/013_last_month_actuals.sql`)

- Each row is scoped to exactly one of: `branch_id`, `region_id`, or `is_company_wide`
- Unique constraints prevent duplicate `(scope, description, year, month)` combinations
- RLS: all authenticated users can read; only HQ admins can insert/delete

## Upload Flow

```
Browser                              API (/api/upload-actuals)
  │                                      │
  ├─ User selects .xlsm file            │
  ├─ User clicks "Upload"               │
  ├─ xlsx parses file in browser         │
  ├─ Builds master desc map from         │
  │  ORKIN CANADA col T                  │
  ├─ Detects year + last month           │
  │  with data                           │
  ├─ Extracts all months (1..N)          │
  │  for each non-skipped sheet          │
  ├─ POST JSON ─────────────────────►    │
  │  { year, months[], sheets[] }        ├─ Auth check (HQ admin)
  │                                      ├─ Load branches + regions
  │                                      ├─ Delete existing rows for year+months
  │                                      ├─ Match tabs → branch/region/company
  │                                      ├─ Bulk insert (200/batch, 3 retries)
  │  ◄──────────────────────────────     ├─ Return summary
  ├─ Show success toast                  │
  ├─ Refresh actuals from DB             │
  └─ Table shows Last Month values       │
```

## Adding a New Description Rename

If a future Excel changes a description name in column I but ORKIN CANADA's column T already has the correct name — **no code change needed**. The master map picks it up automatically.

If ORKIN CANADA's column T itself changes a name, the uploaded actuals will use the new name. You may need to update the forecast template order in `forecast-table.tsx` (`TEMPLATE_ORDER`) and the P&L recalculation formulas in `forecast/page.tsx` to match.

## Adding a New Branch

1. Add the branch to the `branches` table in Supabase
2. Ensure the Excel tab name (after stripping leading zeros) matches the branch name exactly (case-insensitive)
3. No code changes needed
