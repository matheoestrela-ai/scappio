
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS plan text NOT NULL DEFAULT 'free',
  ADD COLUMN IF NOT EXISTS boards_generated_this_month integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS recordings_this_month integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS month_reset_date date NOT NULL DEFAULT (date_trunc('month', now()) + interval '1 month')::date,
  ADD COLUMN IF NOT EXISTS stripe_customer_id text,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id text,
  ADD COLUMN IF NOT EXISTS subscription_status text;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_plan_check
  CHECK (plan IN ('free','creator','studio','lifetime'));

CREATE INDEX IF NOT EXISTS idx_profiles_stripe_customer ON public.profiles(stripe_customer_id);
CREATE INDEX IF NOT EXISTS idx_profiles_stripe_subscription ON public.profiles(stripe_subscription_id);

-- Atomic helpers: reset (if needed) and increment counters
CREATE OR REPLACE FUNCTION public.consume_board_quota(_user uuid, _free_limit int DEFAULT 4)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  p public.profiles%ROWTYPE;
BEGIN
  SELECT * INTO p FROM public.profiles WHERE id = _user FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'no_profile');
  END IF;

  IF p.month_reset_date <= CURRENT_DATE THEN
    UPDATE public.profiles
       SET boards_generated_this_month = 0,
           recordings_this_month = 0,
           month_reset_date = (date_trunc('month', now()) + interval '1 month')::date
     WHERE id = _user
     RETURNING * INTO p;
  END IF;

  IF p.plan = 'free' AND p.boards_generated_this_month >= _free_limit THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'limit_reached',
                              'plan', p.plan, 'used', p.boards_generated_this_month, 'limit', _free_limit);
  END IF;

  UPDATE public.profiles
     SET boards_generated_this_month = boards_generated_this_month + 1
   WHERE id = _user
   RETURNING * INTO p;

  RETURN jsonb_build_object('allowed', true, 'plan', p.plan, 'used', p.boards_generated_this_month);
END;
$$;

CREATE OR REPLACE FUNCTION public.consume_recording_quota(_user uuid, _free_limit int DEFAULT 10)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  p public.profiles%ROWTYPE;
BEGIN
  SELECT * INTO p FROM public.profiles WHERE id = _user FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'no_profile');
  END IF;

  IF p.month_reset_date <= CURRENT_DATE THEN
    UPDATE public.profiles
       SET boards_generated_this_month = 0,
           recordings_this_month = 0,
           month_reset_date = (date_trunc('month', now()) + interval '1 month')::date
     WHERE id = _user
     RETURNING * INTO p;
  END IF;

  IF p.plan = 'free' AND p.recordings_this_month >= _free_limit THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'limit_reached',
                              'plan', p.plan, 'used', p.recordings_this_month, 'limit', _free_limit);
  END IF;

  UPDATE public.profiles
     SET recordings_this_month = recordings_this_month + 1
   WHERE id = _user
   RETURNING * INTO p;

  RETURN jsonb_build_object('allowed', true, 'plan', p.plan, 'used', p.recordings_this_month, 'watermark', p.plan = 'free');
END;
$$;

GRANT EXECUTE ON FUNCTION public.consume_board_quota(uuid, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.consume_recording_quota(uuid, int) TO authenticated;
