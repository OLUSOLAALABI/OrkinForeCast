# Data Re-Import: 2023–2025 Actuals + 2026 Budget

## Overview

Full re-import of all financial data from the client's P&L workbooks. Replaces the previous per-branch `.xlsx` file approach with direct import from the company-wide P&L workbooks.

## Why

- Client wants **all branch tabs** imported as-is — including OH, CC, QA, SALES (previously excluded)
- **TTL (total) tabs** should be excluded — client's boss wants individual branches, not combined totals
- **FUNCTIONALS** is a new region with 19 branches (corporate departments)
- Previous data was imported from individual per-branch Excel files; new data comes from 4 company-wide P&L workbooks

## Data Sources

| Year | File | Location | Type |
|------|------|----------|------|
| 2023 | Orkin Canada P&L FINAL 12-2023.xlsm | `branchData/new_data_P&L/` | Full year actuals |
| 2024 | Orkin Canada P&L 12-2024.xlsm | `branchData/new_data_P&L/` | Full year actuals |
| 2025 | Orkin Canada P&L 12-2025.xlsm | `branchData/new_data_P&L/` | Full year actuals |
| 2026 | 2026 Orkin Canada Budget.xlsm | `branchData/new_data_P&L/` | Full year budget |
| 2026 actuals | 03-2026 Total Company P&L.xlsm | `branchData/last_month/` | Jan–Mar actuals (uploaded via UI) |

### File Layouts

**Actuals (2023–2025):** Row 8 = header. Description at column index 8. Monthly values (Jan–Dec) at column indices 20–31.

**Budget (2026):** Row 8 = header. Description at column index 1. Monthly values (Jan–Dec) at column indices 2–13.

## What Changed

### Regions: 7 → 8

Added **FUNCTIONALS** as a new region.

### Branches: 46 → 100

| Region | Count | New Branches |
|--------|-------|-------------|
| PACIFIC REGION | 12 | 042 PAC OH, 942 PAC CC, 442 PAC QA, 642 PAC SALES, 024 ATLAS E |
| GVR REGION | 8 | 049 GVR OH, 949 GVR CC, 449 GVR QA, 649 GVR SALES |
| PRAIRIE REGION | 14 | 035 PRA OH, 935 PRA CC, 435 PRA QA, 635 PRA SALES, 047 EDM C, 043 PRA FUM |
| ONTARIO REGION | 15 | 971 ON OH, 972 ON CC, 471 ON QA, 671 ON SALES, 020 BARRIE RES, 017 ON FUM |
| GTA REGION | 13 | 973 GTA OH, 974 GTA CC, 473 GTA QA, 673 GTA SALES, 013 GTA RES W |
| QUEBEC REGION | 10 | 957 QC OH, 958 QC CC, 457 QC QA, 657 QC SALES, 064 QC FUM |
| ATLANTIC REGION | 9 | 967 ATL OH, 968 ATL CC, 467 ATL QA, 667 ATL SALES |
| FUNCTIONALS | 19 | 947 CAN OH, 976 BMT, 678 NA SALES, 878 NA BILLING, 978 NA ADMIN, 980 COMPLIANCE, 491 TRAIN, 979 FLEET, 981 H&S, 991 NA QA, 992 MKTG, 993 HR, 994 PAY, 996 IT, 997 ACCTG, 998 DATA, 999 CASH APPS, 990 CORP ADMIN, 995 CORP AR |

Branch 028 renamed from "TTL ATLAS" → "28 ATLAS W".

### Tabs Skipped

- `ToC`, `TOC`, `Inputs`, `Travel`, `Mktg Dept by GL` — non-data tabs
- `ORKIN CANADA` — HQ total (dashboard aggregates from branches)
- Region tabs — dashboard aggregates from branches
- All `TTL` tabs — client wants individual branches only
- `NTL ACCTS (total)` — client excluded

### Tab Name Mismatches (auto-mapped)

| File | Tab Name | Mapped To |
|------|----------|-----------|
| 2023 | `4 GTA RES` | 004 GTA RES E |
| 2024 | `47 GTA C` | 047 EDM C |
| 2026 Budget | `8 NIAG FALLS` | 008 NIAGARA FALLS |
| 2026 Budget | `991 NTL QA` | 991 NA QA |
| 2026 Budget | `999 AR` | 999 CASH APPS |

### Branches Missing in Some Years (get 0)

Branches that didn't exist in a given year (e.g. due to branch splits) have no tab in that year's file. They get 0 values.

Key splits:
- **024 ATLAS E** — was combined with 028 before the split
- **047 EDM C** — was combined with 046
- **020 BARRIE RES** — was combined with 016
- **013 GTA RES W** — was combined with 004

## Scripts

| Script | Purpose |
|--------|---------|
| `scripts/backup-db.mjs` | Export current DB (regions, branches, forecasts, last_month_actuals) to JSON in `backup/<timestamp>/` |
| `scripts/restore-db.mjs --dir backup/<timestamp>` | Restore DB from a backup directory |
| `scripts/reimport-all.mjs --dry-run` | Preview import — reads all files, maps tabs, reports counts, writes nothing |
| `scripts/reimport-all.mjs` | Real import — seeds regions/branches, clears forecasts, imports all 4 files |

## How to Run

### 1. Backup (safety net)
```bash
node scripts/backup-db.mjs
```
Creates `backup/<timestamp>/` with JSON exports of all tables.

### 2. Dry Run (preview)
```bash
node scripts/reimport-all.mjs --dry-run
```
Reads all 4 Excel files, maps every tab to a branch, and prints exactly what would be imported. No DB changes.

### 3. Real Import
```bash
node scripts/reimport-all.mjs
```
Seeds regions/branches, clears forecasts table, imports all data.

### 4. Verify
Run `localhost:3000`, browse the forecast table, check branches/regions.

### 5. Rollback (if needed)
```bash
node scripts/restore-db.mjs --dir backup/2026-04-27T00-55-35
```
Restores the database to the exact state before the import.

## Description Disambiguation

Some P&L line items appear twice with the same name. The import disambiguates them by occurrence order:

| Raw Name | 1st Occurrence | 2nd Occurrence |
|----------|---------------|----------------|
| COMMERCIAL BED BUG REVENUE | COMMERCIAL BED BUG REVENUE (recur) | COMMERCIAL BED BUG REVENUE |
| DEPRECIATION | DEPRECIATION | DEPRECIATION (fixed) |

Variant names are also normalized:
- `COMMERCIAL BED BUG REVENUE (odd job)` → `COMMERCIAL BED BUG REVENUE`
- `PAYROLL SERVICE FEES` → `ULTIPRO COST`
- `ADMIN INCENTIVE PAID` → `MANAGERS INCENTIVES PAID`
- `PC MGMT FAILURE` → `PC COMM MGMT FAILURE`
- `ULTIPRO FEES` → `ULTIPRO COST`

## Recent Changes (April 2026)

### Description Name Alignment

The 03-2026 actuals P&L file is the **canonical standard** for description names. Budget files use slightly different names for some items. The reimport script's `DESCRIPTION_NORMALIZE` map handles these:

| Budget File Name | Canonical Name (Actuals) |
|-----------------|------------------------|
| PC MGMT FAILURE | PC COMM MGMT FAILURE |
| ULTIPRO FEES | ULTIPRO COST |

### TEMPLATE_ORDER (Display Ordering)

Both `forecast-table.tsx` and `actuals-report-form.tsx` have a `TEMPLATE_ORDER` array that controls the row display order. These were updated to match the exact 183-item order from the 03-2026 actuals file.

Key items that were missing or re-positioned:
- Added: PEST CONTROL REVENUE, MISCELLANEOUS REVENUE, TERMITE (TC) REVENUE, PAYROLL, PERSONNEL RELATED, MATERIALS AND SUPPLIES, VEHICLE EXPENSES, VEHICLE STANDING EXPENSES, AUTO ALLOWANCE, INSURANCE & CLAIMS, BAD DEBTS, OTHER EXPENSES, FIXED EXPENSES, CONTROLLABLE EXPENSES, TELEPHONE & UTILITIES, OVERHEAD ALLOCATIONS, NON RECURRING FEES
- Moved: TC MGMT FAILURE (to after TERMITE TREATING, before PRETREAT)
- Added duplicates: DEPRECIATION (fixed)
- Renamed: ORKIN/AIRE (M&S) → ODOUR/AIRE (M&S suffix removed since the name is no longer ambiguous; see `scripts/020_rename_orkin_aire_ms_to_odour.sql`)

### Performance: HQ-Level Aggregation (RPC Functions)

The HQ summary view previously fetched all ~196K individual forecast rows client-side and aggregated in the browser — taking 2+ minutes. This was replaced with server-side PostgreSQL aggregation via two RPC functions:

```sql
-- Returns ~2000 rows (description × month) pre-summed across all branches
aggregate_forecasts(p_branch_ids UUID[], p_year INTEGER)

-- Returns ~300 rows (3 key subtotals per branch for one month)
branch_breakdown(p_branch_ids UUID[], p_year INTEGER, p_month INTEGER)
```

SQL migration: `scripts/015_aggregate_forecasts_rpc.sql`

A composite index on `(year, branch_id)` prevents cold-cache timeouts (`scripts/016_forecasts_index.sql`). The frontend also retries automatically on timeout so users never see the error.

The HQ page now loads in 2-5 seconds instead of 2+ minutes.

### Pagination Fix

The original paginated query used `.range()` without `.order()`, causing PostgreSQL to return non-deterministic results — duplicate rows on some pages, missing rows on others. This made HQ totals show $226M instead of the correct $253M.

Fix: For HQ, replaced pagination entirely with RPC aggregation. For single-branch view, uses `.order("id").limit(5000)` (a single branch has ~2000 rows, well within limit).

### Forecast Recalculation

After any reimport, `forecast_value` gets set equal to `budget_value`. The forecast calculation script must be re-run to compute proper forecasts:

```bash
node scripts/calculate-forecasts.mjs
```

This computes 2026 forecasts using: 2025 seasonal pattern + YoY growth from 2024→2025 + working days + seasonal index.


