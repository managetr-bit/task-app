-- Add project info fields to boards
ALTER TABLE boards
  ADD COLUMN IF NOT EXISTS description      text,
  ADD COLUMN IF NOT EXISTS location_address text,
  ADD COLUMN IF NOT EXISTS location_lat     float8,
  ADD COLUMN IF NOT EXISTS location_lng     float8,
  ADD COLUMN IF NOT EXISTS photos           text[];
