ALTER TABLE "package_cost_items"
  ADD COLUMN "location_id" INTEGER,
  ADD COLUMN "partner_id" INTEGER;

CREATE INDEX "package_cost_items_location_id_idx" ON "package_cost_items"("location_id");
CREATE INDEX "package_cost_items_partner_id_idx" ON "package_cost_items"("partner_id");

ALTER TABLE "package_cost_items" ADD CONSTRAINT "package_cost_items_location_id_fkey"
  FOREIGN KEY ("location_id") REFERENCES "location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "package_cost_items" ADD CONSTRAINT "package_cost_items_partner_id_fkey"
  FOREIGN KEY ("partner_id") REFERENCES "partner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
