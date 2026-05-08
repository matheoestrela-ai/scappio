
-- Create shared_videos table
CREATE TABLE public.shared_videos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  video_url text NOT NULL,
  format text NOT NULL DEFAULT 'standard',
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days')
);

ALTER TABLE public.shared_videos ENABLE ROW LEVEL SECURITY;

-- Public can read non-expired videos
CREATE POLICY "Anyone can view non-expired shared videos"
ON public.shared_videos
FOR SELECT
USING (expires_at > now());

-- Anyone (anon) can create a shared video record
CREATE POLICY "Anyone can create shared videos"
ON public.shared_videos
FOR INSERT
WITH CHECK (true);

-- Create public storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('shared-videos', 'shared-videos', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies: public read, anyone can upload
CREATE POLICY "Public can read shared videos"
ON storage.objects
FOR SELECT
USING (bucket_id = 'shared-videos');

CREATE POLICY "Anyone can upload shared videos"
ON storage.objects
FOR INSERT
WITH CHECK (bucket_id = 'shared-videos');
