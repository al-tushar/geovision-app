-- GeoVision Supabase Schema Migration
-- Project: yyulucwyzlaczlchulbp (al-tushar's Org)

CREATE TABLE IF NOT EXISTS public.crop_manifests (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  building_id text NOT NULL,
  split text NOT NULL CHECK (split IN ('train', 'val')),
  image_name text NOT NULL,
  disaster_event text NOT NULL,
  disaster_category text NOT NULL,
  damage_label text NOT NULL CHECK (damage_label IN ('no-damage', 'minor-damage', 'major-damage', 'destroyed')),
  original_width integer NOT NULL CHECK (original_width > 0),
  original_height integer NOT NULL CHECK (original_height > 0),
  crop_area integer GENERATED ALWAYS AS (original_width * original_height) STORED,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT crop_manifests_split_building_unique UNIQUE (split, building_id)
);

CREATE INDEX IF NOT EXISTS idx_crop_manifests_split ON public.crop_manifests (split);
CREATE INDEX IF NOT EXISTS idx_crop_manifests_damage_label ON public.crop_manifests (damage_label);
CREATE INDEX IF NOT EXISTS idx_crop_manifests_disaster_event ON public.crop_manifests (disaster_event);
CREATE INDEX IF NOT EXISTS idx_crop_manifests_image_name ON public.crop_manifests (image_name);
CREATE INDEX IF NOT EXISTS idx_crop_manifests_building_id ON public.crop_manifests (building_id);

CREATE TABLE IF NOT EXISTS public.model_checkpoints (
  slug text PRIMARY KEY,
  name text NOT NULL,
  filename text NOT NULL,
  architecture text NOT NULL,
  parameter_count integer NOT NULL,
  input_size integer NOT NULL DEFAULT 128,
  epochs integer NOT NULL,
  training_strategy text NOT NULL,
  train_crops integer NOT NULL,
  val_crops integer NOT NULL,
  accuracy numeric(6,4),
  macro_f1 numeric(6,4) NOT NULL,
  weighted_f1 numeric(6,4),
  classes jsonb NOT NULL,
  class_metrics jsonb NOT NULL,
  confusion_matrix jsonb,
  storage_path text,
  is_recommended boolean NOT NULL DEFAULT false,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.pipeline_stages (
  stage_order integer PRIMARY KEY,
  stage_key text NOT NULL UNIQUE,
  title text NOT NULL,
  record_count integer NOT NULL,
  image_count integer,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.damage_assessments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sample_name text NOT NULL DEFAULT 'Uploaded Crop',
  model_slug text NOT NULL DEFAULT 'geovision_pilot_cnn_balanced',
  predicted_label text NOT NULL CHECK (predicted_label IN ('no-damage', 'minor-damage', 'major-damage', 'destroyed')),
  confidence real NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  probabilities jsonb NOT NULL,
  baseline_prediction jsonb,
  original_width integer,
  original_height integer,
  crop_image_url text,
  inference_ms real,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_damage_assessments_created_at ON public.damage_assessments (created_at DESC);

ALTER TABLE public.crop_manifests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.model_checkpoints ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pipeline_stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.damage_assessments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read crop_manifests" ON public.crop_manifests FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Public read model_checkpoints" ON public.model_checkpoints FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Public read pipeline_stages" ON public.pipeline_stages FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Public read damage_assessments" ON public.damage_assessments FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Public insert damage_assessments" ON public.damage_assessments FOR INSERT TO anon, authenticated
  WITH CHECK (predicted_label IN ('no-damage', 'minor-damage', 'major-damage', 'destroyed') AND confidence >= 0 AND confidence <= 1);
