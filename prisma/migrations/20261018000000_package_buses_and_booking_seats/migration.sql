CREATE TABLE "package_buses" (
    "package_id" INTEGER NOT NULL,
    "bus_id" INTEGER NOT NULL,
    CONSTRAINT "package_buses_pkey" PRIMARY KEY ("package_id","bus_id")
);

CREATE TABLE "booking_seats" (
    "id" SERIAL NOT NULL,
    "booking_id" INTEGER NOT NULL,
    "passenger_index" INTEGER NOT NULL,
    "bus_id" INTEGER NOT NULL,
    "travel_date" DATE NOT NULL,
    "seat_code" TEXT NOT NULL,
    CONSTRAINT "booking_seats_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "booking_seats_booking_id_passenger_index_key" ON "booking_seats"("booking_id","passenger_index");
CREATE UNIQUE INDEX "booking_seats_bus_id_travel_date_seat_code_key" ON "booking_seats"("bus_id","travel_date","seat_code");

ALTER TABLE "package_buses" ADD CONSTRAINT "package_buses_package_id_fkey" FOREIGN KEY ("package_id") REFERENCES "packages"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "package_buses" ADD CONSTRAINT "package_buses_bus_id_fkey" FOREIGN KEY ("bus_id") REFERENCES "buses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "booking_seats" ADD CONSTRAINT "booking_seats_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "booking_seats" ADD CONSTRAINT "booking_seats_bus_id_fkey" FOREIGN KEY ("bus_id") REFERENCES "buses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
