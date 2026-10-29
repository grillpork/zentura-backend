-- AlterTable
ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "refund_reason" TEXT;
ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "refund_amount" DOUBLE PRECISION;
ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "refunded_at" TIMESTAMP(3);
ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "refund_slip_url" TEXT;
ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "refunded_by" INTEGER;
