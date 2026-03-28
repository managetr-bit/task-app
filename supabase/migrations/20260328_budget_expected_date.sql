-- Add expected_date to budget_lines
-- This allows budget items to be positioned on the cash flow chart
-- at their expected realization date (independent of payment installments)

ALTER TABLE budget_lines
  ADD COLUMN IF NOT EXISTS expected_date DATE;
