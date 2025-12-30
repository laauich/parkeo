import { createClient } from "@supabase/supabase-js";
import BookingForm from "./booking-form";
import Link from "next/link";

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
    .select("id,title,address,city,price_hour,price_day,instructions,is_active")
    .eq("id", id)
    .single();

  if (error || !parking) {
    return (
      <main className="max-w-3xl mx-auto p-6">
        <p className="text-red-600">Parking introuvable.</p>
        <Link className="underline" href="/parkings">
          Retour
        </Link>
      </main>
    );
  }

  return (
    <main className="max-w-3xl mx-auto p-6 space-y-6">
      <div className="border rounded p-4">
        <h1 className="text-2xl font-semibold">{parking.title}</h1>
        <p className="text-sm text-gray-600">
          {parking.address} {parking.city ? `· ${parking.city}` : ""}
        </p>

        <p className="mt-2">
          💰 {Number(parking.price_hour).toFixed(2)} CHF / h
          {parking.price_day ? ` · ${Number(parking.price_day).toFixed(2)} CHF / jour` : ""}
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
          parkingTitle={parking.title}
          priceHour={Number(parking.price_hour)}
        />
      </div>

      <Link className="underline" href="/parkings">
        ← Retour à la liste
      </Link>
    </main>
  );
}
