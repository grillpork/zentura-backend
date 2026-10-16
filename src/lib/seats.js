// ผังที่นั่งรถ: layout = { decks: [["111011", ...], ...] }  (1 = ที่นั่ง, 0 = ว่าง/ทางเดิน)
// ตั้งชื่อ: อักษรแถวนับต่อเนื่องข้ามชั้น (ข้ามแถวที่ไม่มีที่นั่ง) + ลำดับที่นั่งในแถว เช่น a1, a2, b1 ...
// ต้องตรงกับ package-tour/src/components/bus/SeatMap.jsx (buildSeats)

const MAX_DECKS = 2;
const MAX_ROWS = 30;
const MAX_COLS = 10;
const MAX_SEAT_ROWS = 26; // a-z

// คืน decks ของ grid ที่ cell = ชื่อที่นั่ง หรือ null
const buildSeats = (layout) => {
  let letter = 0;
  return layout.decks.map((deck) =>
    deck.map((row) => {
      let n = 0;
      const hasSeat = row.includes("1");
      const cells = [...row].map((c) => (c === "1" ? `${String.fromCharCode(97 + letter)}${++n}` : null));
      if (hasSeat) letter++;
      return cells;
    })
  );
};

const seatList = (layout) => buildSeats(layout).flat(2).filter(Boolean);

// คืนข้อความ error หรือ null ถ้าถูกต้อง
const validateLayout = (layout) => {
  const decks = layout?.decks;
  if (!Array.isArray(decks) || decks.length < 1 || decks.length > MAX_DECKS) {
    return `รถมีได้ 1-${MAX_DECKS} ชั้น`;
  }
  for (const deck of decks) {
    if (!Array.isArray(deck) || deck.length < 1 || deck.length > MAX_ROWS) {
      return `แต่ละชั้นต้องมี 1-${MAX_ROWS} แถว`;
    }
    const cols = deck[0]?.length;
    if (!cols || cols > MAX_COLS || deck.some((r) => typeof r !== "string" || r.length !== cols || /[^01]/.test(r))) {
      return `ผังไม่ถูกต้อง (แต่ละแถวต้องกว้างเท่ากัน ไม่เกิน ${MAX_COLS} ช่อง)`;
    }
  }
  const rowsWithSeats = decks.flat().filter((r) => r.includes("1")).length;
  if (rowsWithSeats === 0) return "ต้องมีที่นั่งอย่างน้อย 1 ที่";
  if (rowsWithSeats > MAX_SEAT_ROWS) return `มีแถวที่นั่งได้ไม่เกิน ${MAX_SEAT_ROWS} แถวรวมทุกชั้น`;
  return null;
};

module.exports = { buildSeats, seatList, validateLayout };
