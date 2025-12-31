import Link from "next/link";

export default async function PaymentCancelPage({
  searchParams,
}: {
  searchParams: Promise<{ bookingId?: string }>;
}) {
  const sp = await searchParams;
  const bookingId = sp.bookingId ?? "";

  return (
    <main className="max-w-2xl mx-auto p-6 space-y-4">
      <h1 className="text-2xl font-semibold">Paiement annulé</h1>

      <p className="text-gray-700">
        Le paiement a été annulé. Ta réservation est restée en attente.
      </p>

      <div className="text-xs border rounded p-3 text-gray-600">
        <b>bookingId :</b> {bookingId || "(vide)"}
      </div>

      <div className="flex gap-4">
        <Link className="underline" href="/my-bookings">
          Voir mes réservations
        </Link>
        <Link className="underline" href="/parkings">
          Retour aux parkings
        </Link>
      </div>
    </main>
  );
}
