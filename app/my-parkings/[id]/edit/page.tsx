import { createClient } from "@supabase/supabase-js";
import EditParkingClient from "./edit-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ParkingRow = {
  id: string;
  owner_id: string;
  title: string;
  instructions: string | null;
  address: string;

  street: string | null;
  street_number: string | null;
  postal_code: string | null;
  city: string | null;

  parking_type: "outdoor" | "indoor" | "garage" | null;
  is_covered: boolean | null;
  has_ev_charger: boolean | null;
  is_secure: boolean | null;
  is_lit: boolean | null;

  price_hour: number | null;
  price_day: number | null;

  photos: string[] | null;

  lat: number | null;
  lng: number | null;

  is_active: boolean | null;
};

export default async function EditParkingPage({
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
    .select(
      "id,owner_id,title,instructions,address,street,street_number,postal_code,city,parking_type,is_covered,has_ev_charger,is_secure,is_lit,price_hour,price_day,photos,lat,lng,is_active"
    )
    .eq("id", id)
    .maybeSingle();

  if (error || !parking) {
    return (
      <main className="max-w-3xl mx-auto p-6">
        <p className="text-red-600">Parking introuvable.</p>
        <a className="underline" href="/my-parkings">
          Retour
        </a>
      </main>
    );
  }

  return <EditParkingClient initialParking={parking as ParkingRow} />;
}
