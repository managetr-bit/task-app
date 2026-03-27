-- ══════════════════════════════════════════════════════════
--  Cost Module Migration
--  Adds: budget_lines, cost_transactions
--  Alters: boards (currency), members (role)
-- ══════════════════════════════════════════════════════════

-- 1. Add role column to members
ALTER TABLE members
  ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'member'
  CHECK (role IN ('member', 'admin', 'creator'));

-- 2. Add currency column to boards
ALTER TABLE boards
  ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'USD'
  CHECK (currency IN ('TRY', 'USD'));

-- 3. Budget lines — the planned cost envelope per category/phase
CREATE TABLE IF NOT EXISTS budget_lines (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id         UUID NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  name             TEXT NOT NULL,
  category         TEXT NOT NULL DEFAULT 'other'
                   CHECK (category IN ('labor','materials','equipment','subcontractor',
                                       'professional_fees','revenue','contingency','other')),
  type             TEXT NOT NULL DEFAULT 'expense'
                   CHECK (type IN ('expense','income')),
  budgeted_amount  NUMERIC NOT NULL DEFAULT 0,
  milestone_id     UUID REFERENCES milestones(id) ON DELETE SET NULL,
  notes            TEXT,
  position         INT NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_budget_lines_board ON budget_lines(board_id);
CREATE INDEX IF NOT EXISTS idx_budget_lines_milestone ON budget_lines(milestone_id);

ALTER TABLE budget_lines ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS budget_lines_public ON budget_lines;
CREATE POLICY budget_lines_public ON budget_lines FOR ALL TO anon USING (true) WITH CHECK (true);

-- 4. Cost transactions — actual cash in / cash out events
CREATE TABLE IF NOT EXISTS cost_transactions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id         UUID NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  budget_line_id   UUID REFERENCES budget_lines(id) ON DELETE SET NULL,
  type             TEXT NOT NULL CHECK (type IN ('cash_in','cash_out')),
  amount           NUMERIC NOT NULL,
  date             DATE NOT NULL,
  description      TEXT NOT NULL DEFAULT '',
  milestone_id     UUID REFERENCES milestones(id) ON DELETE SET NULL,
  task_id          UUID REFERENCES tasks(id) ON DELETE SET NULL,
  is_forecast      BOOLEAN NOT NULL DEFAULT false,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cost_tx_board ON cost_transactions(board_id);
CREATE INDEX IF NOT EXISTS idx_cost_tx_date ON cost_transactions(date);
CREATE INDEX IF NOT EXISTS idx_cost_tx_milestone ON cost_transactions(milestone_id);

ALTER TABLE cost_transactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS cost_transactions_public ON cost_transactions;
CREATE POLICY cost_transactions_public ON cost_transactions FOR ALL TO anon USING (true) WITH CHECK (true);
