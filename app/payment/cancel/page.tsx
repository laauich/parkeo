import Link from "next/link";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function PaymentCancelPage({
  searchParams,
}: {
  searchParams: Promise<{ bookingId?: string }>;
}) {
  const sp = await searchParams;
  const bookingId = sp.bookingId ?? "";

  return (
    <main className="max-w-2xl mx-auto p-6 space-y-4">
      <h1 className="text-2xl font-semibold">Paiement annulé ❌</h1>

      <p className="text-gray-700">
        Aucun paiement n’a été effectué. Ta réservation n’est pas confirmée.
      </p>

      <div className="text-xs border rounded p-3 space-y-1 text-gray-600">
        <div>
          <b>bookingId :</b> {bookingId || "(vide)"}
        </div>
      </div>

      <div className="flex gap-4 pt-2">
        <Link className="underline" href="/parkings">
          Retour aux parkings
        </Link>
        <Link className="underline" href="/my-bookings">
          Mes réservations
        </Link>
      </div>

      <p className="text-xs text-gray-500">
        Astuce : si tu veux réserver, relance la réservation et paie pour confirmer.
      </p>
    </main>
  );
}
