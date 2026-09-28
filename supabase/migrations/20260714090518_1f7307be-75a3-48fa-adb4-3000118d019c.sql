
-- ============ Enums ============
CREATE TYPE public.road_type AS ENUM ('highway','mountain','hairpin','race_track','off_road','urban','village');
CREATE TYPE public.fuel_type AS ENUM ('petrol','diesel','electric','hybrid','cng');
CREATE TYPE public.vehicle_category AS ENUM ('sedan','suv','truck','sports','off_road','motorcycle','commercial','ev');
CREATE TYPE public.sim_status AS ENUM ('draft','running','completed','failed');

-- ============ updated_at helper ============
CREATE OR REPLACE FUNCTION public.tg_set_updated_at() RETURNS TRIGGER
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

-- ============ profiles ============
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  full_name TEXT,
  organization TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles_self_read" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "profiles_self_update" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
CREATE POLICY "profiles_self_insert" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
CREATE TRIGGER profiles_updated BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name',''))
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END; $$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============ vehicles ============
CREATE TABLE public.vehicles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  is_public BOOLEAN NOT NULL DEFAULT false,
  name TEXT NOT NULL,
  manufacturer TEXT,
  category public.vehicle_category NOT NULL,
  mass_kg NUMERIC(8,2) NOT NULL CHECK (mass_kg > 0),
  wheelbase_m NUMERIC(5,3) NOT NULL CHECK (wheelbase_m > 0),
  track_m NUMERIC(5,3) NOT NULL CHECK (track_m > 0),
  cog_height_m NUMERIC(5,3) NOT NULL CHECK (cog_height_m > 0),
  frontal_area_m2 NUMERIC(5,2) NOT NULL CHECK (frontal_area_m2 > 0),
  drag_coeff NUMERIC(4,3) NOT NULL CHECK (drag_coeff > 0),
  rolling_resist_coeff NUMERIC(5,4) NOT NULL DEFAULT 0.012,
  tire_friction_mu NUMERIC(4,3) NOT NULL DEFAULT 0.9,
  max_power_kw NUMERIC(7,2) NOT NULL CHECK (max_power_kw > 0),
  max_torque_nm NUMERIC(7,2) NOT NULL CHECK (max_torque_nm > 0),
  top_speed_kmh NUMERIC(6,2),
  fuel_type public.fuel_type NOT NULL,
  engine_efficiency NUMERIC(4,3) NOT NULL DEFAULT 0.30,
  fuel_energy_mj_per_l NUMERIC(5,2) NOT NULL DEFAULT 32.0,
  tank_capacity_l NUMERIC(6,2),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX vehicles_owner_idx ON public.vehicles(owner_id);
CREATE INDEX vehicles_public_idx ON public.vehicles(is_public) WHERE is_public;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vehicles TO authenticated;
GRANT ALL ON public.vehicles TO service_role;
ALTER TABLE public.vehicles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "vehicles_read" ON public.vehicles FOR SELECT TO authenticated
  USING (is_public OR owner_id = auth.uid());
CREATE POLICY "vehicles_write_own" ON public.vehicles FOR INSERT TO authenticated
  WITH CHECK (owner_id = auth.uid() AND is_public = false);
CREATE POLICY "vehicles_update_own" ON public.vehicles FOR UPDATE TO authenticated
  USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE POLICY "vehicles_delete_own" ON public.vehicles FOR DELETE TO authenticated
  USING (owner_id = auth.uid());
CREATE TRIGGER vehicles_updated BEFORE UPDATE ON public.vehicles FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ============ roads ============
CREATE TABLE public.roads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  is_public BOOLEAN NOT NULL DEFAULT false,
  name TEXT NOT NULL,
  road_type public.road_type NOT NULL,
  length_m NUMERIC(9,2) NOT NULL CHECK (length_m > 0),
  surface_mu NUMERIC(4,3) NOT NULL DEFAULT 0.85 CHECK (surface_mu > 0 AND surface_mu <= 1.5),
  base_slope_deg NUMERIC(5,2) NOT NULL DEFAULT 0,
  curves JSONB NOT NULL DEFAULT '[]'::jsonb,
  elevation_profile JSONB NOT NULL DEFAULT '[]'::jsonb,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX roads_owner_idx ON public.roads(owner_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.roads TO authenticated;
GRANT ALL ON public.roads TO service_role;
ALTER TABLE public.roads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "roads_read" ON public.roads FOR SELECT TO authenticated
  USING (is_public OR owner_id = auth.uid());
CREATE POLICY "roads_write_own" ON public.roads FOR INSERT TO authenticated
  WITH CHECK (owner_id = auth.uid() AND is_public = false);
CREATE POLICY "roads_update_own" ON public.roads FOR UPDATE TO authenticated
  USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE POLICY "roads_delete_own" ON public.roads FOR DELETE TO authenticated
  USING (owner_id = auth.uid());
CREATE TRIGGER roads_updated BEFORE UPDATE ON public.roads FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ============ simulations ============
CREATE TABLE public.simulations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  vehicle_id UUID NOT NULL REFERENCES public.vehicles(id) ON DELETE RESTRICT,
  road_id UUID NOT NULL REFERENCES public.roads(id) ON DELETE RESTRICT,
  name TEXT NOT NULL,
  status public.sim_status NOT NULL DEFAULT 'draft',
  params JSONB NOT NULL DEFAULT '{}'::jsonb,
  results JSONB,
  ai_summary JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX simulations_owner_idx ON public.simulations(owner_id, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.simulations TO authenticated;
GRANT ALL ON public.simulations TO service_role;
ALTER TABLE public.simulations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sim_own_all" ON public.simulations FOR ALL TO authenticated
  USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE TRIGGER sims_updated BEFORE UPDATE ON public.simulations FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ============ simulation_samples ============
CREATE TABLE public.simulation_samples (
  id BIGSERIAL PRIMARY KEY,
  simulation_id UUID NOT NULL REFERENCES public.simulations(id) ON DELETE CASCADE,
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  idx INTEGER NOT NULL,
  s_m NUMERIC(10,2) NOT NULL,
  t_s NUMERIC(10,3) NOT NULL,
  x NUMERIC(10,3) NOT NULL,
  y NUMERIC(10,3) NOT NULL,
  z NUMERIC(10,3) NOT NULL DEFAULT 0,
  heading_rad NUMERIC(8,5) NOT NULL DEFAULT 0,
  speed_mps NUMERIC(7,3) NOT NULL,
  lat_accel NUMERIC(7,3) NOT NULL DEFAULT 0,
  long_accel NUMERIC(7,3) NOT NULL DEFAULT 0,
  steering_deg NUMERIC(6,2) NOT NULL DEFAULT 0,
  fuel_rate_lps NUMERIC(8,5) NOT NULL DEFAULT 0,
  safety_score NUMERIC(5,2) NOT NULL DEFAULT 100
);
CREATE INDEX samples_sim_idx ON public.simulation_samples(simulation_id, idx);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.simulation_samples TO authenticated;
GRANT ALL ON public.simulation_samples TO service_role;
ALTER TABLE public.simulation_samples ENABLE ROW LEVEL SECURITY;
CREATE POLICY "samples_own_all" ON public.simulation_samples FOR ALL TO authenticated
  USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

-- ============ Seed vehicles ============
INSERT INTO public.vehicles (owner_id, is_public, name, manufacturer, category, mass_kg, wheelbase_m, track_m, cog_height_m, frontal_area_m2, drag_coeff, rolling_resist_coeff, tire_friction_mu, max_power_kw, max_torque_nm, top_speed_kmh, fuel_type, engine_efficiency, fuel_energy_mj_per_l, tank_capacity_l, notes) VALUES
(NULL, true, 'Corolla Altis', 'Toyota', 'sedan', 1315, 2.700, 1.535, 0.55, 2.16, 0.29, 0.011, 0.9, 103, 173, 195, 'petrol', 0.32, 32.0, 47, 'Compact sedan, benchmark efficiency'),
(NULL, true, 'Civic', 'Honda', 'sedan', 1330, 2.735, 1.545, 0.54, 2.17, 0.28, 0.011, 0.9, 116, 187, 200, 'petrol', 0.33, 32.0, 47, NULL),
(NULL, true, 'Model 3 Long Range', 'Tesla', 'ev', 1844, 2.875, 1.580, 0.46, 2.22, 0.23, 0.010, 0.95, 324, 493, 233, 'electric', 0.90, 128.0, 82, 'Dual motor EV; fuel_energy uses kWh->MJ equivalent'),
(NULL, true, 'F-150 XLT 3.5 EcoBoost', 'Ford', 'truck', 2250, 3.683, 1.750, 0.79, 3.55, 0.42, 0.014, 0.85, 298, 542, 180, 'petrol', 0.30, 32.0, 98, 'Full-size pickup'),
(NULL, true, 'Thar 4x4', 'Mahindra', 'off_road', 1870, 2.450, 1.510, 0.80, 2.85, 0.55, 0.018, 0.95, 112, 320, 155, 'diesel', 0.38, 35.8, 57, 'Off-road SUV'),
(NULL, true, '911 Carrera', 'Porsche', 'sports', 1505, 2.450, 1.552, 0.46, 2.02, 0.29, 0.011, 1.10, 283, 450, 293, 'petrol', 0.33, 32.0, 67, 'Rear-engine sports car'),
(NULL, true, 'FH 460', 'Volvo', 'commercial', 8500, 3.700, 2.040, 1.30, 10.5, 0.65, 0.006, 0.75, 343, 2300, 90, 'diesel', 0.44, 35.8, 600, 'Semi-truck tractor'),
(NULL, true, 'Continental GT 650', 'Royal Enfield', 'motorcycle', 202, 1.398, 0.720, 0.60, 0.55, 0.60, 0.020, 1.05, 35, 52, 170, 'petrol', 0.28, 32.0, 12.5, 'Parallel-twin motorcycle'),
(NULL, true, 'Innova Crysta', 'Toyota', 'suv', 1855, 2.750, 1.540, 0.72, 2.90, 0.36, 0.013, 0.88, 125, 360, 175, 'diesel', 0.36, 35.8, 55, 'MPV/SUV'),
(NULL, true, 'Nexon EV Max', 'Tata', 'ev', 1560, 2.498, 1.510, 0.62, 2.30, 0.35, 0.011, 0.92, 105, 250, 140, 'electric', 0.88, 128.0, 40.5, 'Compact EV SUV'),
(NULL, true, 'Fortuner 2.8', 'Toyota', 'suv', 2185, 2.745, 1.540, 0.82, 3.10, 0.36, 0.014, 0.88, 150, 500, 180, 'diesel', 0.38, 35.8, 80, 'Body-on-frame SUV'),
(NULL, true, 'Swift VXi', 'Maruti Suzuki', 'sedan', 950, 2.450, 1.475, 0.53, 2.00, 0.32, 0.011, 0.88, 66, 113, 165, 'petrol', 0.31, 32.0, 37, 'Hatchback'),
(NULL, true, 'Model S Plaid', 'Tesla', 'sports', 2162, 2.960, 1.662, 0.44, 2.34, 0.208, 0.010, 1.05, 760, 1420, 322, 'electric', 0.92, 128.0, 100, 'Tri-motor EV performance'),
(NULL, true, 'Range Rover Sport', 'Land Rover', 'suv', 2410, 2.923, 1.686, 0.75, 3.05, 0.34, 0.013, 0.90, 294, 550, 250, 'petrol', 0.32, 32.0, 90, 'Luxury off-road SUV'),
(NULL, true, 'Ninja ZX-10R', 'Kawasaki', 'motorcycle', 207, 1.450, 0.720, 0.58, 0.50, 0.55, 0.020, 1.15, 149, 114, 300, 'petrol', 0.30, 32.0, 17, 'Superbike');

-- ============ Seed roads ============
INSERT INTO public.roads (owner_id, is_public, name, road_type, length_m, surface_mu, base_slope_deg, curves, notes) VALUES
(NULL, true, 'NH Highway 5 km', 'highway', 5000, 0.90, 0,
  '[{"station":1200,"radius":800,"angle_deg":25,"bank_deg":2},{"station":3200,"radius":1200,"angle_deg":15,"bank_deg":2}]'::jsonb,
  'Long straights, gentle sweepers'),
(NULL, true, 'Alpine Mountain Pass', 'mountain', 8000, 0.75, 5,
  '[{"station":500,"radius":80,"angle_deg":45,"bank_deg":0},{"station":1400,"radius":60,"angle_deg":80,"bank_deg":0},{"station":2600,"radius":90,"angle_deg":60,"bank_deg":0},{"station":4000,"radius":50,"angle_deg":110,"bank_deg":0},{"station":5500,"radius":70,"angle_deg":50,"bank_deg":0},{"station":6800,"radius":100,"angle_deg":40,"bank_deg":0}]'::jsonb,
  'Elevation gain, tight curves'),
(NULL, true, 'Ghat Hairpin Circuit', 'hairpin', 4000, 0.80, 3,
  '[{"station":400,"radius":25,"angle_deg":170,"bank_deg":0},{"station":1000,"radius":22,"angle_deg":175,"bank_deg":0},{"station":1700,"radius":28,"angle_deg":160,"bank_deg":0},{"station":2400,"radius":20,"angle_deg":180,"bank_deg":0},{"station":3200,"radius":24,"angle_deg":170,"bank_deg":0}]'::jsonb,
  'Very tight U-turns'),
(NULL, true, 'Buddh International Race Track', 'race_track', 5125, 1.05, 0,
  '[{"station":700,"radius":200,"angle_deg":90,"bank_deg":5},{"station":1500,"radius":40,"angle_deg":180,"bank_deg":0},{"station":2400,"radius":300,"angle_deg":45,"bank_deg":8},{"station":3100,"radius":80,"angle_deg":120,"bank_deg":3},{"station":3900,"radius":150,"angle_deg":60,"bank_deg":4},{"station":4600,"radius":250,"angle_deg":30,"bank_deg":4}]'::jsonb,
  'High-grip surface, banked turns'),
(NULL, true, 'Rural Off-road Trail', 'off_road', 3000, 0.55, 6,
  '[{"station":400,"radius":40,"angle_deg":90,"bank_deg":0},{"station":1200,"radius":30,"angle_deg":120,"bank_deg":0},{"station":2100,"radius":35,"angle_deg":100,"bank_deg":0}]'::jsonb,
  'Low friction gravel/mud');
