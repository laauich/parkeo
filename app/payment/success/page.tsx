import Link from "next/link";

export default async function PaymentSuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ bookingId?: string; session_id?: string }>;
}) {
  const sp = await searchParams;
  const bookingId = sp.bookingId ?? "";
  const sessionId = sp.session_id ?? "";

  return (
    <main className="max-w-2xl mx-auto p-6 space-y-4">
      <h1 className="text-2xl font-semibold">Paiement confirmé ✅</h1>

      <p className="text-gray-700">
        Merci ! Ton paiement a été accepté. La réservation sera confirmée dès que le webhook Stripe
        est traité.
      </p>

      <div className="text-xs border rounded p-3 space-y-1 text-gray-600">
        <div>
          <b>bookingId :</b> {bookingId || "(vide)"}
        </div>
        <div>
          <b>session_id :</b> {sessionId || "(vide)"}
        </div>
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
