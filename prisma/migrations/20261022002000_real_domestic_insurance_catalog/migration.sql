ALTER TABLE "insurance_plan" ADD COLUMN "min_trip_days" INTEGER;
ALTER TABLE "insurance_plan" ADD COLUMN "max_trip_days" INTEGER;

-- Published individual premiums for 1–4 days. Keep inactive until Zentura has
-- an authorized sales/issuance arrangement with the insurer.
INSERT INTO "insurance_plan" (
  "insurer_name", "plan_name", "master_policy_no", "premium_satang",
  "min_age", "max_age", "min_trip_days", "max_trip_days",
  "terms_url", "active", "is_demo", "updatedAt"
)
SELECT 'บริษัท เมืองไทยประกันภัย จำกัด (มหาชน)', source."plan_name", NULL,
       source."premium_satang", 1, 85, 1, 4,
       'https://www.muangthaiinsurance.com/th/product/travel-insurance/travel-individual-punsuk',
       false, false, CURRENT_TIMESTAMP
FROM (VALUES
  ('TA ปันสุข แบบเดี่ยว แผน 1 (1–4 วัน)', 4800),
  ('TA ปันสุข แบบเดี่ยว แผน 2 (1–4 วัน)', 9500),
  ('TA ปันสุข แบบเดี่ยว แผน 3 (1–4 วัน)', 16000)
) AS source("plan_name", "premium_satang")
WHERE NOT EXISTS (
  SELECT 1 FROM "insurance_plan" existing
  WHERE existing."insurer_name" = 'บริษัท เมืองไทยประกันภัย จำกัด (มหาชน)'
    AND existing."plan_name" = source."plan_name"
);
