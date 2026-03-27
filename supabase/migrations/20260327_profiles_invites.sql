-- ── Persistent user profiles ───────────────────────────────────────────────
-- id is a client-generated UUID stored in the browser's localStorage.
-- This allows identity persistence without server-side auth.
CREATE TABLE IF NOT EXISTS profiles (
  id           UUID PRIMARY KEY,
  display_name TEXT        NOT NULL,
  email        TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles_public" ON profiles FOR ALL USING (true) WITH CHECK (true);

-- ── Invite tokens ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS invite_tokens (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id    UUID        NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  created_by  UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  label       TEXT        NOT NULL DEFAULT 'Invite',
  max_uses    INT,                         -- NULL = unlimited
  uses        INT         NOT NULL DEFAULT 0,
  expires_at  TIMESTAMPTZ,                 -- NULL = never
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE invite_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "invite_tokens_public" ON invite_tokens FOR ALL USING (true) WITH CHECK (true);

-- ── Link members to profiles ────────────────────────────────────────────────
ALTER TABLE members ADD COLUMN IF NOT EXISTS profile_id UUID REFERENCES profiles(id) ON DELETE SET NULL;
