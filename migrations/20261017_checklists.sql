CREATE TABLE IF NOT EXISTS checklist_templates (
  id UUID PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL DEFAULT 'MANAGER',
  schedule TEXT NOT NULL DEFAULT 'daily' CHECK (schedule IN ('daily','manual')),
  items JSONB NOT NULL DEFAULT '[]'::jsonb,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS checklist_runs (
  id UUID PRIMARY KEY,
  template_id UUID NOT NULL REFERENCES checklist_templates(id) ON DELETE RESTRICT,
  actor_id TEXT NOT NULL,
  work_date DATE NOT NULL,
  title TEXT NOT NULL,
  items JSONB NOT NULL,
  answers JSONB NOT NULL DEFAULT '{}'::jsonb,
  completed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(template_id, actor_id, work_date)
);
CREATE INDEX IF NOT EXISTS checklist_runs_work_date_idx ON checklist_runs(work_date DESC);
