-- Create enum for fleet status
CREATE TYPE public.fleet_status AS ENUM ('Active', 'Idle', 'Maintenance');

-- Create enum for equipment type
CREATE TYPE public.equipment_type AS ENUM ('Excavator', 'Dump Truck', 'Loader', 'Dozer');

-- Create enum for activity result type
CREATE TYPE public.activity_result_type AS ENUM ('success', 'warning', 'info', 'error');

-- Create fleet_units table
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

-- Create activity_logs table
CREATE TABLE public.activity_logs (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    unit_id VARCHAR(20) REFERENCES public.fleet_units(unit_id) ON DELETE CASCADE,
    timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    activity VARCHAR(200) NOT NULL,
    result VARCHAR(100) NOT NULL,
    result_type activity_result_type NOT NULL DEFAULT 'info',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create productivity_metrics table
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

-- Create daily_summary table
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

-- Create reports table
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

-- Enable Row Level Security (public read for dashboard)
ALTER TABLE public.fleet_units ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.productivity_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_summary ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;

-- Create policies for public read access (monitoring dashboard)
CREATE POLICY "Allow public read access on fleet_units" ON public.fleet_units FOR SELECT USING (true);
CREATE POLICY "Allow public read access on activity_logs" ON public.activity_logs FOR SELECT USING (true);
CREATE POLICY "Allow public read access on productivity_metrics" ON public.productivity_metrics FOR SELECT USING (true);
CREATE POLICY "Allow public read access on daily_summary" ON public.daily_summary FOR SELECT USING (true);
CREATE POLICY "Allow public read access on reports" ON public.reports FOR SELECT USING (true);

-- Create function to update last_update timestamp
CREATE OR REPLACE FUNCTION public.update_fleet_last_update()
RETURNS TRIGGER AS $$
BEGIN
    NEW.last_update = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_fleet_units_last_update
BEFORE UPDATE ON public.fleet_units
FOR EACH ROW
EXECUTE FUNCTION public.update_fleet_last_update();

-- Enable realtime for activity_logs
ALTER PUBLICATION supabase_realtime ADD TABLE public.activity_logs;
ALTER PUBLICATION supabase_realtime ADD TABLE public.fleet_units;