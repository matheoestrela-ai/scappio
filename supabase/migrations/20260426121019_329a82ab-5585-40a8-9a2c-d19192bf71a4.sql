-- ============================================================
-- Helper: shared updated_at trigger function (idempotent)
-- ============================================================
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ============================================================
-- Creation method enum
-- ============================================================
DO $$ BEGIN
  CREATE TYPE public.board_method AS ENUM ('photo', 'voice', 'text', 'pdf', 'manual');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================
-- boards table
-- ============================================================
CREATE TABLE IF NOT EXISTS public.boards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  title TEXT NOT NULL DEFAULT 'Sans titre',
  data JSONB NOT NULL DEFAULT '{"nodes":[]}'::jsonb,
  edges JSONB NOT NULL DEFAULT '[]'::jsonb,
  method public.board_method NOT NULL DEFAULT 'manual',
  thumbnail TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS boards_user_idx ON public.boards(user_id, updated_at DESC);

ALTER TABLE public.boards ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users view own boards" ON public.boards;
CREATE POLICY "Users view own boards" ON public.boards
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users insert own boards" ON public.boards;
CREATE POLICY "Users insert own boards" ON public.boards
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users update own boards" ON public.boards;
CREATE POLICY "Users update own boards" ON public.boards
  FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users delete own boards" ON public.boards;
CREATE POLICY "Users delete own boards" ON public.boards
  FOR DELETE USING (auth.uid() = user_id);

DROP TRIGGER IF EXISTS boards_set_updated_at ON public.boards;
CREATE TRIGGER boards_set_updated_at
BEFORE UPDATE ON public.boards
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- board_versions table
-- ============================================================
CREATE TABLE IF NOT EXISTS public.board_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id UUID NOT NULL REFERENCES public.boards(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  data JSONB NOT NULL,
  edges JSONB NOT NULL DEFAULT '[]'::jsonb,
  thumbnail TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS board_versions_board_idx
  ON public.board_versions(board_id, created_at DESC);

ALTER TABLE public.board_versions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users view own versions" ON public.board_versions;
CREATE POLICY "Users view own versions" ON public.board_versions
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users insert own versions" ON public.board_versions;
CREATE POLICY "Users insert own versions" ON public.board_versions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users delete own versions" ON public.board_versions;
CREATE POLICY "Users delete own versions" ON public.board_versions
  FOR DELETE USING (auth.uid() = user_id);

-- ============================================================
-- Trigger: keep only last 10 versions per board
-- ============================================================
CREATE OR REPLACE FUNCTION public.prune_board_versions()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.board_versions
  WHERE board_id = NEW.board_id
    AND id NOT IN (
      SELECT id FROM public.board_versions
      WHERE board_id = NEW.board_id
      ORDER BY created_at DESC
      LIMIT 10
    );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS board_versions_prune ON public.board_versions;
CREATE TRIGGER board_versions_prune
AFTER INSERT ON public.board_versions
FOR EACH ROW EXECUTE FUNCTION public.prune_board_versions();