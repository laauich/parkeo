import Link from "next/link";
import { createClient } from "@supabase/supabase-js";
import BookingForm from "./booking-form";

export const runtime = "nodejs";

type ParkingRow = {
  id: string;
  title: string;
  address: string;
  price_hour: number;
  price_day: number | null;
  instructions: string | null;
  is_active: boolean;
};

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
    .maybeSingle();

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

  const p = parking as ParkingRow;

  return (
    <main className="max-w-3xl mx-auto p-6 space-y-6">
      <div className="border rounded p-4 space-y-2">
        <h1 className="text-2xl font-semibold">{p.title}</h1>
        <p className="text-sm text-gray-600">{p.address}</p>
        <p className="text-sm">
          💰 <b>{Number(p.price_hour).toFixed(2)} CHF</b> / h
          {p.price_day ? (
            <>
              {" "}
              · <b>{Number(p.price_day).toFixed(2)} CHF</b> / jour
            </>
          ) : null}
        </p>

        {p.instructions ? (
          <p className="text-sm">
            <span className="font-medium">Instructions :</span> {p.instructions}
          </p>
        ) : null}
      </div>

      <div className="border rounded p-4">
        <h2 className="text-lg font-semibold mb-3">Réserver</h2>

        <BookingForm
          parkingId={p.id}
          parkingTitle={p.title}
          priceHour={Number(p.price_hour)}
          priceDay={p.price_day ? Number(p.price_day) : null}
        />
      </div>

      <Link className="underline" href="/parkings">
        ← Retour à la liste
      </Link>
    </main>
  );
}
