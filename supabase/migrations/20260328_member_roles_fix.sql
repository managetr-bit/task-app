-- Fix member roles: add visitor, and promote first-joined member to creator where none exists

-- 1. Drop old check constraint so we can add 'visitor'
ALTER TABLE members DROP CONSTRAINT IF EXISTS members_role_check;

-- 2. Add updated constraint with all four roles
ALTER TABLE members
  ADD CONSTRAINT members_role_check
  CHECK (role IN ('visitor', 'member', 'admin', 'creator'));

-- 3. Fix existing boards: set role='creator' for the earliest-joined member
--    of each board that has no creator yet
UPDATE members m
SET role = 'creator'
WHERE joined_at = (
  SELECT MIN(m2.joined_at)
  FROM members m2
  WHERE m2.board_id = m.board_id
)
AND NOT EXISTS (
  SELECT 1 FROM members m3
  WHERE m3.board_id = m.board_id
    AND m3.role = 'creator'
);
