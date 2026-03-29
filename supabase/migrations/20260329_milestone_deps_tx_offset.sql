-- Milestone dependencies: tie a milestone to another with lead/lag offset
ALTER TABLE milestones
  ADD COLUMN IF NOT EXISTS depends_on_id UUID REFERENCES milestones(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS offset_days INTEGER NOT NULL DEFAULT 0;

-- Payment timing offset: days before/after milestone for a transaction
ALTER TABLE cost_transactions
  ADD COLUMN IF NOT EXISTS milestone_offset_days INTEGER NOT NULL DEFAULT 0;
