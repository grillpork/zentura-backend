-- Give existing packages one matching catalog plan when they still have no plan
-- or only a DEMO plan. Catalog plans remain inactive until insurer authorization.
WITH matching_plan AS (
  SELECT p."id" AS package_id, plan."id" AS plan_id
  FROM "packages" p
  LEFT JOIN "insurance_plan" current_plan ON current_plan."id" = p."insurance_plan_id"
  JOIN "insurance_plan" plan
    ON plan."insurer_name" = 'บริษัท เมืองไทยประกันภัย จำกัด (มหาชน)'
   AND plan."plan_name" LIKE 'TA ปันสุข แบบเดี่ยว แผน 1 (%'
   AND plan."is_demo" = false
   AND plan."active" = false
   AND (p."end_date"::date - p."start_date"::date + 1)
       BETWEEN plan."min_trip_days" AND plan."max_trip_days"
  WHERE p."start_date" IS NOT NULL
    AND p."end_date" IS NOT NULL
    AND (p."insurance_plan_id" IS NULL OR current_plan."is_demo" = true)
)
UPDATE "packages" p
SET "insurance_plan_id" = matching_plan.plan_id
FROM matching_plan
WHERE p."id" = matching_plan.package_id;
