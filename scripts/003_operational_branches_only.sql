-- Keep only 49 operational branches (remove functional/corporate OH, CC, QA, SALES, TTL).
-- Run this in Supabase SQL Editor if you already have the old 77-branch schema and want to trim to 49.

-- Operational branch names (49)
DO $$
DECLARE
  operational_names TEXT[] := ARRAY[
    '25 WESTSIDE', '26 BC INT C', '27 BC INT N', '28 ATLAS', '29 VPC', '30 RICHMOND',
    '31 VCR', '32 BC INT S', '33 VALLEY', '34 VCR ISLAND', '36 BURNABY',
    '37 EDM S', '46 EDM N', '38 CAL S', '39 SASK', '40 CAL N', '41 CAL RES',
    '43 PRA FUM', '44 MANITOBA', '45 REGINA',
    '6 STONEY CR', '8 NIAGARA FALLS', '9 SUDBURY', '10 SE ON', '14 CAMBRIDGE',
    '15 NORTH BAY', '16 BARRIE', '17 ON FUM', '18 LONDON', '19 WINDSOR',
    '1 TOR W', '2 HI-RISE', '3 TOR E', '4 GTA RES', '5 MISSISSAUGA', '7 TOR N',
    '11 BRAMPTON', '12 DOWNTOWN',
    '50 S SHORE-MTL', '51 N SHORE-QC CITY', '53 OTT W', '54 OTT E', '56 REGIONEX', '64 QC FUM',
    '60 PEI', '61 NB', '62 NS', '63 NF LAB E', '65 NF LAB W'
  ];
BEGIN
  -- Clear references so we can delete branches
  DELETE FROM public.actuals WHERE branch_id IN (SELECT id FROM public.branches WHERE name != ALL(operational_names));
  DELETE FROM public.forecasts WHERE branch_id IN (SELECT id FROM public.branches WHERE name != ALL(operational_names));
  DELETE FROM public.uploads WHERE branch_id IN (SELECT id FROM public.branches WHERE name != ALL(operational_names));
  UPDATE public.profiles SET branch_id = NULL WHERE branch_id IN (SELECT id FROM public.branches WHERE name != ALL(operational_names));
  DELETE FROM public.branches WHERE name != ALL(operational_names);
END $$;
