const thaiDate = (value) => new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit"
}).format(value);

const dateOnly = (value) => new Date(`${thaiDate(value)}T00:00:00.000Z`);

function prepareTravelers(travelers, adults, children, startDate, plan) {
  if (!Array.isArray(travelers) || travelers.length !== adults + children ||
      travelers.filter(t => t?.passenger_type !== "child").length !== adults) return null;
  const tripDay = thaiDate(startDate);
  const ids = new Set();
  const result = [];
  for (const input of travelers) {
    if (!input || typeof input !== "object") return null;
    const full_name = String(input.full_name || "").trim();
    const id_card_or_passport = String(input.id_card_or_passport || "").toUpperCase().replace(/[\s-]/g, "");
    const dateString = String(input.date_of_birth || "");
    const date_of_birth = /^\d{4}-\d{2}-\d{2}$/.test(dateString) ? new Date(`${dateString}T00:00:00.000Z`) : null;
    const age = date_of_birth && !Number.isNaN(date_of_birth.getTime())
      ? Number(tripDay.slice(0, 4)) - Number(dateString.slice(0, 4)) - (tripDay.slice(5) < dateString.slice(5) ? 1 : 0)
      : -1;
    if (full_name.length < 2 || !/^(\d{13}|[A-Z0-9]{6,12})$/.test(id_card_or_passport) ||
        ids.has(id_card_or_passport) || !date_of_birth || date_of_birth.toISOString().slice(0, 10) !== dateString ||
        (plan && (age < plan.min_age || age > plan.max_age))) return null;
    ids.add(id_card_or_passport);
    result.push({
      title: String(input.title || "").trim() || null,
      full_name, id_card_or_passport, date_of_birth,
      passenger_type: input.passenger_type === "child" ? "child" : "adult",
      phone: String(input.phone || "").trim() || null
    });
  }
  return result;
}

module.exports = { thaiDate, dateOnly, prepareTravelers };
