async function markInsurancePaid(tx, bookingId) {
  await tx.insuranceEnrollment.updateMany({
    where: { booking_id: bookingId, status: "AWAITING_PAYMENT" },
    data: { status: "PENDING_ISSUANCE" }
  });
}

async function markInsuranceCancelled(tx, bookingId) {
  await tx.insuranceEnrollment.updateMany({
    where: { booking_id: bookingId, status: { in: ["AWAITING_PAYMENT", "PENDING_ISSUANCE", "ISSUANCE_FAILED"] } },
    data: { status: "CANCELLED" }
  });
  await tx.insuranceEnrollment.updateMany({
    where: { booking_id: bookingId, status: "ACTIVE" },
    data: { status: "CANCELLATION_REQUESTED" }
  });
}

module.exports = { markInsurancePaid, markInsuranceCancelled };
