-- ============================================================
-- task.omercimen.com — Supabase Database Schema
-- Run this in your Supabase project:
--   Dashboard → SQL Editor → New query → paste → Run
-- ============================================================

-- 1. Boards
CREATE TABLE IF NOT EXISTS boards (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Columns (supports default + custom)
CREATE TABLE IF NOT EXISTS columns (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id   UUID NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  position   INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Members (no auth — just a nickname + color)
CREATE TABLE IF NOT EXISTS members (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id   UUID NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  nickname   TEXT NOT NULL,
  color      TEXT NOT NULL,
  joined_at  TIMESTAMPTZ DEFAULT now()
);

-- 4. Tasks
CREATE TABLE IF NOT EXISTS tasks (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id     UUID NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  column_id    UUID NOT NULL REFERENCES columns(id) ON DELETE CASCADE,
  title        TEXT NOT NULL,
  description  TEXT,
  assigned_to  UUID REFERENCES members(id) ON DELETE SET NULL,
  created_by   UUID REFERENCES members(id) ON DELETE SET NULL,
  priority     TEXT NOT NULL DEFAULT 'medium'
                 CHECK (priority IN ('low', 'medium', 'high')),
  due_date     DATE,
  position     INTEGER NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ
);

-- ── Indexes for performance ──
CREATE INDEX IF NOT EXISTS idx_columns_board_id ON columns(board_id);
CREATE INDEX IF NOT EXISTS idx_members_board_id ON members(board_id);
CREATE INDEX IF NOT EXISTS idx_tasks_board_id   ON tasks(board_id);
CREATE INDEX IF NOT EXISTS idx_tasks_column_id  ON tasks(column_id);

-- ── Row Level Security (public read/write via UUID obscurity) ──
ALTER TABLE boards  ENABLE ROW LEVEL SECURITY;
ALTER TABLE columns ENABLE ROW LEVEL SECURITY;
ALTER TABLE members ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks   ENABLE ROW LEVEL SECURITY;

-- Allow all operations for the anon role (access control = link sharing)
CREATE POLICY "public_all_boards"  ON boards  FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "public_all_columns" ON columns FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "public_all_members" ON members FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "public_all_tasks"   ON tasks   FOR ALL TO anon USING (true) WITH CHECK (true);

-- ── Enable Realtime ──
-- After running this SQL, go to:
--   Supabase Dashboard → Database → Replication
-- and toggle ON the following tables:
--   ✓ tasks
--   ✓ members
--   ✓ columns
