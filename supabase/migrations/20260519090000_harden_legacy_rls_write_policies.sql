-- Harden legacy UT hackathon tables.
-- Public/anon writes are removed. Trusted backend writes should use the
-- Supabase service role, while direct authenticated writes require an
-- application role claim of operator or admin.

DROP POLICY IF EXISTS "Allow public insert on VIDEO_ANALITYC"
  ON public."VIDEO_ANALITYC";
DROP POLICY IF EXISTS "Allow public update on VIDEO_ANALITYC"
  ON public."VIDEO_ANALITYC";
DROP POLICY IF EXISTS "Allow public insert on EXCAVATOR_TYPE"
  ON public."EXCAVATOR_TYPE";
DROP POLICY IF EXISTS "Allow public update on EXCAVATOR_TYPE"
  ON public."EXCAVATOR_TYPE";
DROP POLICY IF EXISTS "Allow public insert on DUMP_TRUCK_TYPE"
  ON public."DUMP_TRUCK_TYPE";
DROP POLICY IF EXISTS "Allow public update on DUMP_TRUCK_TYPE"
  ON public."DUMP_TRUCK_TYPE";
DROP POLICY IF EXISTS "Allow public insert on EXCAVATOR_DATA"
  ON public."EXCAVATOR_DATA";
DROP POLICY IF EXISTS "Allow public update on EXCAVATOR_DATA"
  ON public."EXCAVATOR_DATA";
DROP POLICY IF EXISTS "Allow public insert on DUMP_TRUCK_DATA"
  ON public."DUMP_TRUCK_DATA";
DROP POLICY IF EXISTS "Allow public update on DUMP_TRUCK_DATA"
  ON public."DUMP_TRUCK_DATA";

DROP POLICY IF EXISTS "Allow operator insert on VIDEO_ANALITYC"
  ON public."VIDEO_ANALITYC";
DROP POLICY IF EXISTS "Allow operator update on VIDEO_ANALITYC"
  ON public."VIDEO_ANALITYC";
DROP POLICY IF EXISTS "Allow operator insert on EXCAVATOR_TYPE"
  ON public."EXCAVATOR_TYPE";
DROP POLICY IF EXISTS "Allow operator update on EXCAVATOR_TYPE"
  ON public."EXCAVATOR_TYPE";
DROP POLICY IF EXISTS "Allow operator insert on DUMP_TRUCK_TYPE"
  ON public."DUMP_TRUCK_TYPE";
DROP POLICY IF EXISTS "Allow operator update on DUMP_TRUCK_TYPE"
  ON public."DUMP_TRUCK_TYPE";
DROP POLICY IF EXISTS "Allow operator insert on EXCAVATOR_DATA"
  ON public."EXCAVATOR_DATA";
DROP POLICY IF EXISTS "Allow operator update on EXCAVATOR_DATA"
  ON public."EXCAVATOR_DATA";
DROP POLICY IF EXISTS "Allow operator insert on DUMP_TRUCK_DATA"
  ON public."DUMP_TRUCK_DATA";
DROP POLICY IF EXISTS "Allow operator update on DUMP_TRUCK_DATA"
  ON public."DUMP_TRUCK_DATA";

CREATE OR REPLACE FUNCTION public.has_dashboard_write_role()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(
    auth.jwt() -> 'app_metadata' ->> 'role',
    auth.jwt() ->> 'role',
    ''
  ) IN ('operator', 'admin');
$$;

CREATE POLICY "Allow operator insert on VIDEO_ANALITYC"
  ON public."VIDEO_ANALITYC"
  FOR INSERT
  TO authenticated
  WITH CHECK (public.has_dashboard_write_role());

CREATE POLICY "Allow operator update on VIDEO_ANALITYC"
  ON public."VIDEO_ANALITYC"
  FOR UPDATE
  TO authenticated
  USING (public.has_dashboard_write_role())
  WITH CHECK (public.has_dashboard_write_role());

CREATE POLICY "Allow operator insert on EXCAVATOR_TYPE"
  ON public."EXCAVATOR_TYPE"
  FOR INSERT
  TO authenticated
  WITH CHECK (public.has_dashboard_write_role());

CREATE POLICY "Allow operator update on EXCAVATOR_TYPE"
  ON public."EXCAVATOR_TYPE"
  FOR UPDATE
  TO authenticated
  USING (public.has_dashboard_write_role())
  WITH CHECK (public.has_dashboard_write_role());

CREATE POLICY "Allow operator insert on DUMP_TRUCK_TYPE"
  ON public."DUMP_TRUCK_TYPE"
  FOR INSERT
  TO authenticated
  WITH CHECK (public.has_dashboard_write_role());

CREATE POLICY "Allow operator update on DUMP_TRUCK_TYPE"
  ON public."DUMP_TRUCK_TYPE"
  FOR UPDATE
  TO authenticated
  USING (public.has_dashboard_write_role())
  WITH CHECK (public.has_dashboard_write_role());

CREATE POLICY "Allow operator insert on EXCAVATOR_DATA"
  ON public."EXCAVATOR_DATA"
  FOR INSERT
  TO authenticated
  WITH CHECK (public.has_dashboard_write_role());

CREATE POLICY "Allow operator update on EXCAVATOR_DATA"
  ON public."EXCAVATOR_DATA"
  FOR UPDATE
  TO authenticated
  USING (public.has_dashboard_write_role())
  WITH CHECK (public.has_dashboard_write_role());

CREATE POLICY "Allow operator insert on DUMP_TRUCK_DATA"
  ON public."DUMP_TRUCK_DATA"
  FOR INSERT
  TO authenticated
  WITH CHECK (public.has_dashboard_write_role());

CREATE POLICY "Allow operator update on DUMP_TRUCK_DATA"
  ON public."DUMP_TRUCK_DATA"
  FOR UPDATE
  TO authenticated
  USING (public.has_dashboard_write_role())
  WITH CHECK (public.has_dashboard_write_role());
