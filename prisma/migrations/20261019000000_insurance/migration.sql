ALTER TABLE "bookings" ADD COLUMN "insurance_total_satang" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "bookings" ADD COLUMN "insurance_terms_accepted_at" TIMESTAMP(3);
ALTER TABLE "payments" ADD COLUMN "stripe_session_id" TEXT;
CREATE UNIQUE INDEX "payments_stripe_session_id_key" ON "payments"("stripe_session_id");
ALTER TABLE "booking_travelers" ADD COLUMN "passenger_type" TEXT NOT NULL DEFAULT 'adult', ADD COLUMN "date_of_birth" DATE;

CREATE TABLE "insurance_plan" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "insurer_name" TEXT NOT NULL,
    "plan_name" TEXT NOT NULL,
    "master_policy_no" TEXT,
    "premium_satang" INTEGER NOT NULL,
    "min_age" INTEGER NOT NULL,
    "max_age" INTEGER NOT NULL,
    "terms_url" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "insurance_plan_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "insurance_enrollments" (
    "id" SERIAL NOT NULL,
    "booking_id" INTEGER NOT NULL,
    "traveler_id" INTEGER NOT NULL,
    "insurer_name" TEXT NOT NULL,
    "plan_name" TEXT NOT NULL,
    "master_policy_no" TEXT,
    "terms_url" TEXT NOT NULL,
    "premium_satang" INTEGER NOT NULL,
    "coverage_start" DATE NOT NULL,
    "coverage_end" DATE NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'AWAITING_PAYMENT',
    "certificate_no" TEXT,
    "failure_reason" TEXT,
    "issued_at" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "insurance_enrollments_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "insurance_enrollments_traveler_id_key" ON "insurance_enrollments"("traveler_id");
CREATE INDEX "insurance_enrollments_booking_id_idx" ON "insurance_enrollments"("booking_id");

CREATE TABLE "insurance_claims" (
    "id" SERIAL NOT NULL,
    "enrollment_id" INTEGER NOT NULL,
    "category" TEXT NOT NULL,
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "description" TEXT NOT NULL,
    "claimed_amount_satang" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'REPORTED',
    "insurer_claim_no" TEXT,
    "insurer_note" TEXT,
    "reported_by_emp_id" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "insurance_claims_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "insurance_claims_enrollment_id_idx" ON "insurance_claims"("enrollment_id");

CREATE TABLE "insurance_events" (
    "id" SERIAL NOT NULL,
    "enrollment_id" INTEGER NOT NULL,
    "claim_id" INTEGER,
    "action" TEXT NOT NULL,
    "detail" TEXT,
    "actor_emp_id" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "insurance_events_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "insurance_events_enrollment_id_createdAt_idx" ON "insurance_events"("enrollment_id","createdAt");

ALTER TABLE "insurance_enrollments" ADD CONSTRAINT "insurance_enrollments_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "insurance_enrollments" ADD CONSTRAINT "insurance_enrollments_traveler_id_fkey" FOREIGN KEY ("traveler_id") REFERENCES "booking_travelers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "insurance_claims" ADD CONSTRAINT "insurance_claims_enrollment_id_fkey" FOREIGN KEY ("enrollment_id") REFERENCES "insurance_enrollments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "insurance_events" ADD CONSTRAINT "insurance_events_enrollment_id_fkey" FOREIGN KEY ("enrollment_id") REFERENCES "insurance_enrollments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "insurance_events" ADD CONSTRAINT "insurance_events_claim_id_fkey" FOREIGN KEY ("claim_id") REFERENCES "insurance_claims"("id") ON DELETE CASCADE ON UPDATE CASCADE;
