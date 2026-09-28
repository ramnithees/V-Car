ALTER TABLE public.simulations
  DROP CONSTRAINT IF EXISTS simulations_road_id_fkey,
  DROP CONSTRAINT IF EXISTS simulations_vehicle_id_fkey;

ALTER TABLE public.simulations
  ADD CONSTRAINT simulations_road_id_fkey FOREIGN KEY (road_id) REFERENCES public.roads(id) ON DELETE RESTRICT,
  ADD CONSTRAINT simulations_vehicle_id_fkey FOREIGN KEY (vehicle_id) REFERENCES public.vehicles(id) ON DELETE RESTRICT;