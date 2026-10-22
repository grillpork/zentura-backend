ALTER TABLE "packages" ADD COLUMN "target_travelers" INTEGER,
ADD COLUMN "minimum_travelers" INTEGER;

CREATE TABLE "package_cost_items" (
  "id" SERIAL NOT NULL,
  "package_id" INTEGER NOT NULL,
  "category" TEXT NOT NULL,
  "supplier_name" TEXT NOT NULL,
  "pricing_mode" TEXT NOT NULL DEFAULT 'FIXED',
  "amount_satang" INTEGER NOT NULL,
  "deposit_satang" INTEGER NOT NULL DEFAULT 0,
  "paid_deposit_satang" INTEGER NOT NULL DEFAULT 0,
  "paid_balance_satang" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "package_cost_items_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "package_cost_items_package_id_fkey" FOREIGN KEY ("package_id") REFERENCES "packages"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "package_cost_items_package_id_idx" ON "package_cost_items"("package_id");
