-- Migration 2: Researcher Auth attribution & Community Feedback Wall
ALTER TABLE public.damage_assessments
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS analyst_name text NOT NULL DEFAULT 'Guest Researcher';

CREATE INDEX IF NOT EXISTS idx_damage_assessments_user_id ON public.damage_assessments (user_id);

CREATE POLICY "Users delete own assessments"
  ON public.damage_assessments FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.project_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  author_name text NOT NULL CHECK (char_length(trim(author_name)) BETWEEN 1 AND 80),
  author_role text NOT NULL DEFAULT 'Visitor' CHECK (char_length(author_role) <= 60),
  category text NOT NULL DEFAULT 'General' CHECK (category IN ('General', 'Model & AI', 'Dataset', 'UI & UX', 'Collaboration')),
  message text NOT NULL CHECK (char_length(trim(message)) BETWEEN 3 AND 600),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_project_feedback_created_at ON public.project_feedback (created_at DESC);

ALTER TABLE public.project_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read project_feedback"
  ON public.project_feedback FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Public insert project_feedback"
  ON public.project_feedback FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    char_length(trim(author_name)) BETWEEN 1 AND 80
    AND char_length(trim(message)) BETWEEN 3 AND 600
  );

CREATE POLICY "Users delete own feedback"
  ON public.project_feedback FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);
