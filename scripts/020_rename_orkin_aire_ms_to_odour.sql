-- Rename the line item "ORKIN/AIRE (M&S)" to "ODOUR/AIRE" across all P&L tables.
-- The M&S suffix was previously used to disambiguate from the revenue-line "ORKIN/AIRE".
-- The client has standardised on the new name "ODOUR/AIRE" in their CSV template.
-- The revenue line "ORKIN/AIRE" is intentionally NOT changed here.

BEGIN;

UPDATE public.actuals
  SET description = 'ODOUR/AIRE'
  WHERE description = 'ORKIN/AIRE (M&S)';

UPDATE public.last_month_actuals
  SET description = 'ODOUR/AIRE'
  WHERE description = 'ORKIN/AIRE (M&S)';

UPDATE public.forecasts
  SET description = 'ODOUR/AIRE'
  WHERE description = 'ORKIN/AIRE (M&S)';

COMMIT;
