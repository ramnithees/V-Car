
ALTER TABLE public.roads
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS category text,
  ADD COLUMN IF NOT EXISTS preview_thumbnail text,
  ADD COLUMN IF NOT EXISTS road_width_m numeric NOT NULL DEFAULT 12,
  ADD COLUMN IF NOT EXISTS lane_count integer NOT NULL DEFAULT 2,
  ADD COLUMN IF NOT EXISTS lane_width_m numeric NOT NULL DEFAULT 3.5,
  ADD COLUMN IF NOT EXISTS shoulder_width_m numeric NOT NULL DEFAULT 1.5,
  ADD COLUMN IF NOT EXISTS median_width_m numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS surface_type text NOT NULL DEFAULT 'asphalt',
  ADD COLUMN IF NOT EXISTS slopes jsonb NOT NULL DEFAULT '[]'::jsonb;
