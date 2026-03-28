-- Add completed_at to milestones
-- Supports both manual completion and auto-completion when all linked tasks are done.

ALTER TABLE milestones
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;
