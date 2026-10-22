-- Public individual TA ปันสุข prices for longer domestic trips. Sales remain off.
INSERT INTO "insurance_plan" (
  "insurer_name", "plan_name", "master_policy_no", "premium_satang",
  "min_age", "max_age", "min_trip_days", "max_trip_days",
  "terms_url", "active", "is_demo", "updatedAt"
)
SELECT 'บริษัท เมืองไทยประกันภัย จำกัด (มหาชน)', source."plan_name", NULL,
       source."premium_satang", 1, 85, source."min_trip_days", source."max_trip_days",
       'https://www.muangthaiinsurance.com/th/product/travel-insurance/travel-individual-punsuk',
       false, false, CURRENT_TIMESTAMP
FROM (VALUES
  ('TA ปันสุข แบบเดี่ยว แผน 1 (5–7 วัน)', 7900, 5, 7),
  ('TA ปันสุข แบบเดี่ยว แผน 2 (5–7 วัน)', 18500, 5, 7),
  ('TA ปันสุข แบบเดี่ยว แผน 3 (5–7 วัน)', 31000, 5, 7),
  ('TA ปันสุข แบบเดี่ยว แผน 1 (8–10 วัน)', 11000, 8, 10),
  ('TA ปันสุข แบบเดี่ยว แผน 2 (8–10 วัน)', 25800, 8, 10),
  ('TA ปันสุข แบบเดี่ยว แผน 3 (8–10 วัน)', 45000, 8, 10),
  ('TA ปันสุข แบบเดี่ยว แผน 1 (11–14 วัน)', 15000, 11, 14),
  ('TA ปันสุข แบบเดี่ยว แผน 2 (11–14 วัน)', 35200, 11, 14),
  ('TA ปันสุข แบบเดี่ยว แผน 3 (11–14 วัน)', 64200, 11, 14)
) AS source("plan_name", "premium_satang", "min_trip_days", "max_trip_days")
WHERE NOT EXISTS (
  SELECT 1 FROM "insurance_plan" existing
  WHERE existing."insurer_name" = 'บริษัท เมืองไทยประกันภัย จำกัด (มหาชน)'
    AND existing."plan_name" = source."plan_name"
);
