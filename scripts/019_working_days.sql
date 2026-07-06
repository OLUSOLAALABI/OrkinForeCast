-- Ontario Canada Working Days schema and 2026 default seed data
CREATE TABLE IF NOT EXISTS public.working_days (
  year INTEGER NOT NULL,
  month INTEGER NOT NULL CHECK (month >= 1 AND month <= 12),
  days INTEGER NOT NULL CHECK (days >= 0 AND days <= 31),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (year, month)
);

ALTER TABLE public.working_days ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "working_days_select_all" ON public.working_days;
CREATE POLICY "working_days_select_all" ON public.working_days FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "working_days_manage_hq" ON public.working_days;
CREATE POLICY "working_days_manage_hq" ON public.working_days FOR ALL TO authenticated USING (
  public.get_user_role() = 'hq_admin'
);

GRANT SELECT ON public.working_days TO authenticated;
GRANT ALL ON public.working_days TO authenticated;

-- Seed Ontario 2026 default working days
INSERT INTO public.working_days (year, month, days) VALUES
  (2026, 1, 21),
  (2026, 2, 19),
  (2026, 3, 22),
  (2026, 4, 21),
  (2026, 5, 20),
  (2026, 6, 22),
  (2026, 7, 22),
  (2026, 8, 21),
  (2026, 9, 21),
  (2026, 10, 21),
  (2026, 11, 21),
  (2026, 12, 21)
ON CONFLICT (year, month) DO NOTHING;

NOTIFY pgrst, 'reload schema';
