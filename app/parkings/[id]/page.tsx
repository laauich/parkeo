import { createClient } from "@supabase/supabase-js";
import BookingForm from "./booking-form";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function ParkingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anon) {
    return (
      <main className="max-w-3xl mx-auto p-6 space-y-3">
        <p className="text-red-600 font-medium">Config Supabase manquante sur Vercel.</p>
        <p className="text-sm text-gray-700">
          Vérifie les variables : <b>NEXT_PUBLIC_SUPABASE_URL</b> et{" "}
          <b>NEXT_PUBLIC_SUPABASE_ANON_KEY</b>.
        </p>
        <p className="text-xs text-gray-500">id: {id}</p>
        <Link className="underline" href="/parkings">Retour</Link>
      </main>
    );
  }

  const supabase = createClient(url, anon);

  const { data: parking, error } = await supabase
    .from("parkings")
    .select("id,title,address,city,price_hour,price_day,instructions,is_active")
    .eq("id", id)
    .single();

  if (error || !parking) {
    return (
      <main className="max-w-3xl mx-auto p-6 space-y-3">
        <p className="text-red-600 font-medium">Parking introuvable.</p>
        <p className="text-sm text-gray-700">
          Cela arrive si l’ID n’existe pas dans Supabase, ou si Vercel pointe vers un autre projet.
        </p>

        <div className="text-xs text-gray-600 border rounded p-3 space-y-1">
          <div><b>id reçu :</b> {id}</div>
          <div><b>Supabase URL :</b> {url}</div>
          <div><b>Erreur Supabase :</b> {error?.message ?? "(aucune)"} </div>
        </div>

        <Link className="underline" href="/parkings">Retour</Link>
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

      <Link className="underline" href="/parkings">← Retour à la liste</Link>
    </main>
  );
}
