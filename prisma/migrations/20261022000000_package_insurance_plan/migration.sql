CREATE SEQUENCE "insurance_plan_id_seq";
ALTER SEQUENCE "insurance_plan_id_seq" OWNED BY "insurance_plan"."id";
ALTER TABLE "insurance_plan" ALTER COLUMN "id" SET DEFAULT nextval('"insurance_plan_id_seq"');
SELECT setval('"insurance_plan_id_seq"', COALESCE((SELECT MAX("id") FROM "insurance_plan"), 1), EXISTS (SELECT 1 FROM "insurance_plan"));

ALTER TABLE "insurance_plan" ADD COLUMN "is_demo" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "packages" ADD COLUMN "insurance_plan_id" INTEGER;
UPDATE "packages" SET "insurance_plan_id" = 1 WHERE EXISTS (SELECT 1 FROM "insurance_plan" WHERE "id" = 1);
ALTER TABLE "packages" ADD CONSTRAINT "packages_insurance_plan_id_fkey" FOREIGN KEY ("insurance_plan_id") REFERENCES "insurance_plan"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "packages_insurance_plan_id_idx" ON "packages"("insurance_plan_id");

INSERT INTO "insurance_plan" ("insurer_name", "plan_name", "master_policy_no", "premium_satang", "min_age", "max_age", "terms_url", "active", "is_demo", "updatedAt")
SELECT sample."insurer_name", sample."plan_name", NULL, sample."premium_satang", sample."min_age", sample."max_age", 'https://example.com/', false, true, CURRENT_TIMESTAMP
FROM (VALUES
  ('ตัวอย่างบริษัทประกันภัย (DEMO)', 'แผนท่องเที่ยวมาตรฐาน (ตัวอย่าง)', 9900, 1, 75),
  ('ตัวอย่างบริษัทประกันภัย (DEMO)', 'แผนท่องเที่ยวคุ้มครองเพิ่ม (ตัวอย่าง)', 16900, 1, 75)
) AS sample("insurer_name", "plan_name", "premium_satang", "min_age", "max_age")
WHERE NOT EXISTS (SELECT 1 FROM "insurance_plan");
