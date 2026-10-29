const dayKey = (value) => value ? new Date(value).toISOString().slice(0, 10) : null;

const addDays = (day, amount) => {
  const date = new Date(`${day}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
};

function buildSupplierTrips(packages, location) {
  const trips = [];

  for (const pkg of packages) {
    const stopDays = [...new Set(pkg.dayplans
      .filter((day) => day.location_id === location.id && Number.isInteger(day.day_num) && day.day_num > 0)
      .map((day) => day.day_num))];
    if (!stopDays.length) continue;

    const departures = new Map();
    const plannedDate = dayKey(pkg.start_date);
    if (plannedDate && pkg.status?.toLowerCase() === "published") {
      departures.set(plannedDate, { bookingCount: 0, adultCount: 0, childCount: 0 });
    }
    for (const booking of pkg.bookings) {
      const departure = dayKey(booking.travel_date);
      if (!departure) continue;
      const counts = departures.get(departure) || { bookingCount: 0, adultCount: 0, childCount: 0 };
      counts.bookingCount += 1;
      counts.adultCount += booking.adult_count;
      counts.childCount += booking.child_count;
      departures.set(departure, counts);
    }

    const buses = pkg.packageBuses.map(({ bus }) => ({ id: bus.id, name: bus.name, plate: bus.plate }));
    for (const [departureDate, counts] of departures) {
      for (const stopDay of stopDays) {
        trips.push({
          id: `${pkg.id}:${departureDate}:${stopDay}`,
          packageId: pkg.id,
          packageName: pkg.name,
          departureDate,
          arrivalDate: addDays(departureDate, stopDay - 1),
          stopDay,
          locationName: location.name,
          bookingCount: counts.bookingCount,
          adultCount: counts.adultCount,
          childCount: counts.childCount,
          passengerCount: counts.adultCount + counts.childCount,
          buses,
        });
      }
    }
  }

  return trips.sort((a, b) => a.arrivalDate.localeCompare(b.arrivalDate) || a.packageId - b.packageId || a.stopDay - b.stopDay);
}

module.exports = { buildSupplierTrips };
