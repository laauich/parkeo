import { createClient } from "@supabase/supabase-js";
import BookingForm from "./booking-form";

export default async function ParkingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const { data: parking, error } = await supabase
    .from("parkings")
    .select("id,title,address,price_hour,price_day,instructions,is_active")
    .eq("id", id)
    .single();

  if (error || !parking) {
    return (
      <main className="max-w-3xl mx-auto p-6">
        <p className="text-red-600">Parking introuvable.</p>
        {error && <pre className="mt-3 text-xs">{error.message}</pre>}
        <a className="underline" href="/parkings">Retour</a>
      </main>
    );
  }

  return (
    <main className="max-w-3xl mx-auto p-6 space-y-6">
      <div className="border rounded p-4">
        <h1 className="text-2xl font-semibold">{parking.title}</h1>
        <p className="text-sm text-gray-600">{parking.address}</p>
        <p className="mt-2">
          💰 {parking.price_hour} CHF / h
          {parking.price_day ? ` · ${parking.price_day} CHF / jour` : ""}
        </p>
        {parking.instructions && (
          <p className="mt-3 text-sm">
            <span className="font-medium">Instructions :</span>{" "}
            {parking.instructions}
          </p>
        )}
      </div>

      <div className="border rounded p-4">
        <h2 className="text-lg font-semibold">Réserver</h2>
        <BookingForm
          parkingId={parking.id}
          priceHour={Number(parking.price_hour)}
          priceDay={parking.price_day ? Number(parking.price_day) : null}
        />
      </div>

      <a className="underline" href="/parkings">← Retour à la liste</a>
    </main>
  );
}
