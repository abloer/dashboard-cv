-- ==========================================
-- SETUP DATABASE DASHBOARD CV
-- Jalankan script ini di SQL Editor Supabase
-- ==========================================

-- 1. Buat ENUM Types
CREATE TYPE public.fleet_status AS ENUM ('Active', 'Idle', 'Maintenance');
CREATE TYPE public.equipment_type AS ENUM ('Excavator', 'Dump Truck', 'Loader', 'Dozer');
CREATE TYPE public.activity_result_type AS ENUM ('success', 'warning', 'info', 'error');

-- 2. Buat Tabel fleet_units
CREATE TABLE public.fleet_units (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    unit_id VARCHAR(20) NOT NULL UNIQUE,
    type equipment_type NOT NULL,
    location VARCHAR(100) NOT NULL,
    status fleet_status NOT NULL DEFAULT 'Idle',
    operator VARCHAR(100),
    productivity DECIMAL(5,2),
    last_update TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- 3. Buat Tabel activity_logs
CREATE TABLE public.activity_logs (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    unit_id VARCHAR(20) REFERENCES public.fleet_units(unit_id) ON DELETE CASCADE,
    timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    activity VARCHAR(200) NOT NULL,
    result VARCHAR(100) NOT NULL,
    result_type activity_result_type NOT NULL DEFAULT 'info',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- 4. Buat Tabel productivity_metrics
CREATE TABLE public.productivity_metrics (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    unit_id VARCHAR(20) REFERENCES public.fleet_units(unit_id) ON DELETE CASCADE,
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    hour INTEGER CHECK (hour >= 0 AND hour <= 23),
    productivity_percentage DECIMAL(5,2),
    cycle_time_dig DECIMAL(6,2),
    cycle_time_swing DECIMAL(6,2),
    cycle_time_dump DECIMAL(6,2),
    loads_count INTEGER DEFAULT 0,
    volume_m3 DECIMAL(10,2),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- 5. Buat Tabel daily_summary
CREATE TABLE public.daily_summary (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    date DATE NOT NULL DEFAULT CURRENT_DATE UNIQUE,
    total_excavators INTEGER DEFAULT 0,
    active_excavators INTEGER DEFAULT 0,
    total_dump_trucks INTEGER DEFAULT 0,
    active_dump_trucks INTEGER DEFAULT 0,
    avg_cycle_time DECIMAL(6,2),
    overall_efficiency DECIMAL(5,2),
    total_loads INTEGER DEFAULT 0,
    total_volume_m3 DECIMAL(12,2),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- 6. Buat Tabel reports
CREATE TABLE public.reports (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    name VARCHAR(200) NOT NULL,
    report_type VARCHAR(50) NOT NULL,
    date_generated TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    date_range_start DATE,
    date_range_end DATE,
    file_size VARCHAR(20),
    file_path TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- 7. Aktifkan RLS (Keamanan)
ALTER TABLE public.fleet_units ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.productivity_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_summary ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;

-- 8. Buat Kebijakan Akses Baca Publik
CREATE POLICY "Allow public read access on fleet_units" ON public.fleet_units FOR SELECT USING (true);
CREATE POLICY "Allow public read access on activity_logs" ON public.activity_logs FOR SELECT USING (true);
CREATE POLICY "Allow public read access on productivity_metrics" ON public.productivity_metrics FOR SELECT USING (true);
CREATE POLICY "Allow public read access on daily_summary" ON public.daily_summary FOR SELECT USING (true);
CREATE POLICY "Allow public read access on reports" ON public.reports FOR SELECT USING (true);

-- 9. Fungsi Update Timestamp Otomatis
CREATE OR REPLACE FUNCTION public.update_fleet_last_update()
RETURNS TRIGGER AS $$
BEGIN
    NEW.last_update = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- 10. Trigger untuk Update Timestamp
CREATE TRIGGER update_fleet_units_last_update
BEFORE UPDATE ON public.fleet_units
FOR EACH ROW
EXECUTE FUNCTION public.update_fleet_last_update();

-- 11. Aktifkan Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.activity_logs;
ALTER PUBLICATION supabase_realtime ADD TABLE public.fleet_units;

-- 12. Dummy Data (Opsional - agar dashboard tidak kosong)
INSERT INTO public.fleet_units (unit_id, type, location, status, operator, productivity) VALUES
('EXC-001', 'Excavator', 'Sektor Utara', 'Active', 'Budi', 85.50),
('DT-005', 'Dump Truck', 'Sektor Timur', 'Idle', 'Sandi', 0.00);
