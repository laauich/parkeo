import Link from "next/link";

export default async function PaymentExpiredPage({
  searchParams,
}: {
  searchParams: Promise<{ bookingId?: string; parkingId?: string }>;
}) {
  const sp = await searchParams;
  const bookingId = sp.bookingId ?? "";
  const parkingId = sp.parkingId ?? "";

  return (
    <main className="max-w-2xl mx-auto p-6 space-y-4">
      <h1 className="text-2xl font-semibold">Paiement expiré ⏳</h1>

      <p className="text-gray-700">
        Le paiement n’a pas été complété à temps. La réservation a été libérée.
      </p>

      <div className="text-xs border rounded p-3 space-y-1 text-gray-600">
        <div>
          <b>bookingId :</b> {bookingId || "(vide)"}
        </div>
        <div>
          <b>parkingId :</b> {parkingId || "(vide)"}
        </div>
      </div>

      <div className="flex gap-4 pt-2">
        {parkingId ? (
          <Link className="underline" href={`/parkings/${parkingId}`}>
            Réessayer la réservation →
          </Link>
        ) : (
          <Link className="underline" href="/parkings">
            Retour aux parkings →
          </Link>
        )}

        <Link className="underline" href="/my-bookings">
          Mes réservations
        </Link>
      </div>
    </main>
  );
}
