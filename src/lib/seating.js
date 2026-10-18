const { seatList } = require("./seats.js");

const travelDay = (value) => {
  const date = new Date(value);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const part = (type) => parts.find((item) => item.type === type).value;
  return new Date(`${part("year")}-${part("month")}-${part("day")}T00:00:00.000Z`);
};

const validateAssignments = (assignments, passengerCount, buses) => {
  if (!Array.isArray(assignments)) return "รายการที่นั่งไม่ถูกต้อง";
  const busById = new Map(buses.map((bus) => [bus.id, bus]));
  const passengers = new Set();
  const seats = new Set();
  for (const item of assignments) {
    if (!item || typeof item !== "object") return "รายการที่นั่งไม่ถูกต้อง";
    const bus = busById.get(item.bus_id);
    if (!Number.isInteger(item.passenger_index) || item.passenger_index < 0 || item.passenger_index >= passengerCount || passengers.has(item.passenger_index)) {
      return "หมายเลขผู้โดยสารไม่ถูกต้องหรือซ้ำกัน";
    }
    if (!bus || bus.status !== "ACTIVE" || typeof item.seat_code !== "string" || !seatList(bus.layout).includes(item.seat_code)) {
      return "รถบัสหรือเลขที่นั่งไม่ถูกต้อง";
    }
    const key = `${bus.id}:${item.seat_code}`;
    if (seats.has(key)) return "เลือกที่นั่งซ้ำกัน";
    passengers.add(item.passenger_index);
    seats.add(key);
  }
  return null;
};

module.exports = { travelDay, validateAssignments };
