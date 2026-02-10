# Seed / import data

Your file `three_years.xlsx` is here. To import it into Supabase:

## 1. See how the file is structured

From the project root:

```bash
node scripts/import-actuals.mjs --inspect
```

This prints sheet names and the first rows so we can match sheets to branches and years.

## 2. Import (dry run, then real)

- **Sheet names** are matched to branch **name** (e.g. sheet `25 WESTSIDE` → branch 25 WESTSIDE). The first sheet ("Summary & Index") and region/summary sheets are skipped.
- **Layout:** The script auto-detects a row with **Description** and **January** … **December** (e.g. row 8). Data rows below that row are read; year is taken from the sheet (e.g. "November 30, 2025") or use `--year 2025`.

```bash
# Dry run (no writes)
node scripts/import-actuals.mjs --dry-run

# Or if the whole file is one year:
node scripts/import-actuals.mjs --year 2024 --dry-run

# Real import (needs SUPABASE_SERVICE_ROLE_KEY in .env)
node scripts/import-actuals.mjs
```

## 3. .env

Add `SUPABASE_SERVICE_ROLE_KEY` to `.env` (Supabase → Settings → API → service_role). The script uses it to insert into `actuals` for all branches.
