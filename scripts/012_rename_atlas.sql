-- Rename "28 ATLAS" to "TTL ATLAS"
-- The Excel file uses TTL ATLAS (combined 024 + 028) as the single source of truth.
UPDATE public.branches SET name = 'TTL ATLAS' WHERE name = '28 ATLAS';
