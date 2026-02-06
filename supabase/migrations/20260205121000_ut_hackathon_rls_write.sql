-- Allow write access for sync process (adjust as needed for stricter auth)

CREATE POLICY "Allow public insert on VIDEO_ANALITYC"
  ON public."VIDEO_ANALITYC"
  FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Allow public update on VIDEO_ANALITYC"
  ON public."VIDEO_ANALITYC"
  FOR UPDATE
  USING (true);

CREATE POLICY "Allow public insert on EXCAVATOR_TYPE"
  ON public."EXCAVATOR_TYPE"
  FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Allow public update on EXCAVATOR_TYPE"
  ON public."EXCAVATOR_TYPE"
  FOR UPDATE
  USING (true);

CREATE POLICY "Allow public insert on DUMP_TRUCK_TYPE"
  ON public."DUMP_TRUCK_TYPE"
  FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Allow public update on DUMP_TRUCK_TYPE"
  ON public."DUMP_TRUCK_TYPE"
  FOR UPDATE
  USING (true);

CREATE POLICY "Allow public insert on EXCAVATOR_DATA"
  ON public."EXCAVATOR_DATA"
  FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Allow public update on EXCAVATOR_DATA"
  ON public."EXCAVATOR_DATA"
  FOR UPDATE
  USING (true);

CREATE POLICY "Allow public insert on DUMP_TRUCK_DATA"
  ON public."DUMP_TRUCK_DATA"
  FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Allow public update on DUMP_TRUCK_DATA"
  ON public."DUMP_TRUCK_DATA"
  FOR UPDATE
  USING (true);
