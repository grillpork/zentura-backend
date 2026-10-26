const { costAt } = require("./packageCosts.js");
const { seatList } = require("../lib/seats.js");

function summarizePackage(pkg) {
  const bookings = pkg.bookings || [];
  const active = bookings.filter((booking) => booking.status !== "CANCELLED");
  const reservedTravelers = active.reduce((sum, booking) => sum + booking.adult_count + booking.child_count, 0);
  // Legacy STRIPE_CARD rows have no session ID, so their live/test origin cannot be verified.
  const realPayment = (payment) => payment.status === "APPROVED" && ["STRIPE_LIVE_CARD", "BANK_TRANSFER_VERIFIED"].includes(payment.payment_method);
  const paid = active.filter((booking) => booking.status === "CONFIRMED" && booking.payments?.some(realPayment) && booking.payments.filter(realPayment).reduce((sum, payment) => sum + Math.round(payment.amount * 100), 0) >= Math.round(booking.total_price * 100));
  const unverifiedBookingCount = active.filter((booking) => !paid.includes(booking) && booking.payments?.some((payment) => payment.status === "APPROVED" && !realPayment(payment))).length;
  const paidAdults = paid.reduce((sum, booking) => sum + booking.adult_count, 0);
  const paidChildren = paid.reduce((sum, booking) => sum + booking.child_count, 0);
  const receivedSatang = paid.reduce((sum, booking) => sum + booking.payments.filter(realPayment).reduce((amount, payment) => amount + Math.round(payment.amount * 100), 0), 0);
  const packageRevenueSatang = paid.reduce((sum, booking) => sum + Math.max(0, Math.round((booking.total_price - booking.addon_total) * 100) - booking.insurance_total_satang), 0);
  const items = pkg.costItems || [];
  const totalDepositSatang = pkg.minimum_travelers == null && items.some((item) => item.pricing_mode === "PER_PERSON")
    ? null
    : items.reduce((sum, item) => sum + (item.deposit_satang || 0) * (item.pricing_mode === "PER_PERSON" ? pkg.minimum_travelers : 1), 0);
  const capacity = pkg.packageBuses ? pkg.packageBuses.reduce((sum, row) => sum + seatList(row.bus.layout).length, 0) : pkg.target_travelers;
  const fixedSatang = items.filter((item) => item.pricing_mode === "FIXED").reduce((sum, item) => sum + item.amount_satang, 0);
  const variableSatang = items.filter((item) => item.pricing_mode === "PER_PERSON").reduce((sum, item) => sum + item.amount_satang, 0);
  const priceSatang = Math.round(Number(pkg.price || 0) * 100);
  const currentCostSatang = costAt(items, paidAdults + paidChildren);
  const marginSatang = priceSatang - variableSatang;
  const gapSatang = Math.max(0, currentCostSatang - packageRevenueSatang);
  const additionalAdults = !items.length || marginSatang <= 0 ? null : Math.max(paidAdults > 0 ? 0 : 1, Math.ceil(gapSatang / marginSatang));
  return {
    bookingCount: active.length,
    reservedTravelers,
    paidBookingCount: paid.length,
    paidAdults,
    paidChildren,
    paidTravelers: paidAdults + paidChildren,
    pendingPaymentCount: active.filter((booking) => booking.status === "PENDING_PAYMENT").length,
    unverifiedBookingCount,
    exceptionCount: active.filter((booking) => booking.status === "AWAITING_VERIFICATION").length,
    receivedSatang,
    packageRevenueSatang,
    costConfigured: items.length > 0,
    targetTravelers: capacity || null,
    minimumTravelers: pkg.minimum_travelers,
    costAtMinimumSatang: pkg.minimum_travelers ? costAt(items, pkg.minimum_travelers) : null,
    costAtTargetSatang: capacity ? costAt(items, capacity) : null,
    totalDepositSatang,
    currentCostSatang,
    supplierPaidSatang: items.reduce((sum, item) => sum + item.paid_deposit_satang + item.paid_balance_satang, 0),
    breakEvenAdults: additionalAdults === null ? null : paidAdults + additionalAdults,
    moreAdultsNeeded: additionalAdults,
    canBreakEvenAtCapacity: additionalAdults !== null && (capacity == null || paidAdults + paidChildren + additionalAdults <= capacity),
  };
}

module.exports = { summarizePackage };
