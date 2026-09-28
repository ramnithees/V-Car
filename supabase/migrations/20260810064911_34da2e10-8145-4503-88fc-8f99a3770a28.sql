-- 1. Clamp existing out-of-range data
UPDATE public.roads
SET base_slope_deg = GREATEST(-20, LEAST(20, base_slope_deg))
WHERE base_slope_deg < -20 OR base_slope_deg > 20;

UPDATE public.roads r
SET curves = (
  SELECT COALESCE(jsonb_agg(
    CASE WHEN c ? 'bank_deg'
      THEN jsonb_set(c, '{bank_deg}', to_jsonb(GREATEST(-15, LEAST(15, (c->>'bank_deg')::numeric))))
      ELSE c END
    ORDER BY ord
  ), '[]'::jsonb)
  FROM jsonb_array_elements(r.curves) WITH ORDINALITY AS t(c, ord)
)
WHERE jsonb_typeof(r.curves) = 'array' AND jsonb_array_length(r.curves) > 0;

UPDATE public.roads r
SET slopes = (
  SELECT COALESCE(jsonb_agg(
    CASE WHEN s ? 'bank_deg'
      THEN jsonb_set(s, '{bank_deg}', to_jsonb(GREATEST(-15, LEAST(15, (s->>'bank_deg')::numeric))))
      ELSE s END
    ORDER BY ord
  ), '[]'::jsonb)
  FROM jsonb_array_elements(r.slopes) WITH ORDINALITY AS t(s, ord)
)
WHERE jsonb_typeof(r.slopes) = 'array' AND jsonb_array_length(r.slopes) > 0;

-- 2. Structural constraint on base slope
ALTER TABLE public.roads
  ADD CONSTRAINT roads_base_slope_range CHECK (base_slope_deg >= -20 AND base_slope_deg <= 20);

-- 3. Trigger validation for JSON geometry (time/data-dependent rules belong in triggers)
CREATE OR REPLACE FUNCTION public.validate_road_geometry()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  item jsonb;
  bank numeric;
  radius numeric;
BEGIN
  IF jsonb_typeof(NEW.curves) = 'array' THEN
    FOR item IN SELECT * FROM jsonb_array_elements(NEW.curves) LOOP
      IF item ? 'bank_deg' THEN
        bank := (item->>'bank_deg')::numeric;
        IF bank < -15 OR bank > 15 THEN
          RAISE EXCEPTION 'Curve bank angle % is outside the allowed range of -15 to 15 degrees', bank;
        END IF;
      END IF;
      IF item ? 'radius' THEN
        radius := (item->>'radius')::numeric;
        IF radius <= 0 THEN
          RAISE EXCEPTION 'Curve radius must be greater than zero';
        END IF;
      END IF;
    END LOOP;
  END IF;

  IF jsonb_typeof(NEW.slopes) = 'array' THEN
    FOR item IN SELECT * FROM jsonb_array_elements(NEW.slopes) LOOP
      IF item ? 'bank_deg' THEN
        bank := (item->>'bank_deg')::numeric;
        IF bank < -15 OR bank > 15 THEN
          RAISE EXCEPTION 'Slope bank angle % is outside the allowed range of -15 to 15 degrees', bank;
        END IF;
      END IF;
      IF item ? 'angle_deg' THEN
        bank := (item->>'angle_deg')::numeric;
        IF bank < 0 OR bank > 20 THEN
          RAISE EXCEPTION 'Slope angle % is outside the allowed range of 0 to 20 degrees', bank;
        END IF;
      END IF;
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS roads_validate_geometry ON public.roads;
CREATE TRIGGER roads_validate_geometry
BEFORE INSERT OR UPDATE ON public.roads
FOR EACH ROW EXECUTE FUNCTION public.validate_road_geometry();