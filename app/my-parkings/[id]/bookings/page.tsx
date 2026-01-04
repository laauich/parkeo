import BookingsClient from "./bookings-client";

export default async function ParkingBookingsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const p = await params;
  return <BookingsClient parkingId={p.id} />;
}
