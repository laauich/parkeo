import Link from "next/link";
import { createClient } from "@supabase/supabase-js";
import BookingForm from "./booking-form";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ParkingRow = {
  id: string;
  title: string;
  instructions: string | null;

  // legacy
  address: string;

  // détaillé
  street: string | null;
  street_number: string | null;
  postal_code: string | null;
  city: string | null;

  parking_type: "outdoor" | "indoor" | "garage" | null;
  is_covered: boolean | null;
  has_ev_charger: boolean | null;
  is_secure: boolean | null;
  is_lit: boolean | null;

  price_hour: number;
  price_day: number | null;

  photos: string[] | null;

  lat: number | null;
  lng: number | null;

  is_active: boolean | null;
};

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full border px-2.5 py-1 text-xs text-gray-700">
      {children}
    </span>
  );
}

function typeLabel(t: ParkingRow["parking_type"]) {
  if (t === "indoor") return "Intérieur";
  if (t === "garage") return "Garage";
  return "Extérieur";
}

function fullAddress(p: ParkingRow) {
  // Si tu as address NOT NULL, on l’affiche en priorité
  const a = (p.address ?? "").trim();
  if (a) return a;

  // fallback au cas où
  const a1 = `${p.street ?? ""}${p.street_number ? " " + p.street_number : ""}`.trim();
  const a2 = `${p.postal_code ? p.postal_code + " " : ""}${p.city ?? ""}`.trim();
  return [a1, a2].filter(Boolean).join(", ");
}

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
    .select(
      "id,title,instructions,address,street,street_number,postal_code,city,parking_type,is_covered,has_ev_charger,is_secure,is_lit,price_hour,price_day,photos,lat,lng,is_active"
    )
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
    <main className="max-w-5xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">{p.title}</h1>
        <Link className="underline" href="/parkings">
          ← Retour
        </Link>
      </div>

      {/* Galerie */}
      {Array.isArray(p.photos) && p.photos.length > 0 ? (
        <section className="border rounded p-4">
          <h2 className="font-semibold mb-3">Photos</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {p.photos.slice(0, 6).map((url) => (
              <div key={url} className="border rounded overflow-hidden">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt="" className="w-full h-44 object-cover" />
              </div>
            ))}
          </div>
          {p.photos.length > 6 ? (
            <p className="mt-3 text-xs text-gray-500">
              {p.photos.length - 6} photo(s) supplémentaire(s) non affichée(s).
            </p>
          ) : null}
        </section>
      ) : null}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Infos */}
        <section className="lg:col-span-2 space-y-4">
          <div className="border rounded p-4 space-y-3">
            <div className="text-sm text-gray-600">Adresse</div>
            <div className="text-base">{fullAddress(p)}</div>

            <div className="text-xs text-gray-500">
              {p.street ? (
                <>
                  Détails : {p.street}
                  {p.street_number ? ` ${p.street_number}` : ""}
                  {p.postal_code ? `, ${p.postal_code}` : ""}
                  {p.city ? ` ${p.city}` : ""}
                </>
              ) : null}
            </div>

            <div className="flex flex-wrap gap-2 pt-2">
              <Badge>{typeLabel(p.parking_type)}</Badge>
              {p.is_covered ? <Badge>Couvert</Badge> : <Badge>Non couvert</Badge>}
              {p.has_ev_charger ? <Badge>⚡ Borne EV</Badge> : null}
              {p.is_secure ? <Badge>🔒 Sécurisé</Badge> : null}
              {p.is_lit ? <Badge>💡 Éclairé</Badge> : null}
            </div>

            <div className="pt-3 text-sm">
              <span className="font-medium">Prix :</span>{" "}
              {p.price_hour} CHF / h
              {p.price_day ? ` · ${p.price_day} CHF / jour` : ""}
            </div>
          </div>

          {p.instructions ? (
            <div className="border rounded p-4">
              <h2 className="font-semibold">Instructions</h2>
              <p className="mt-2 text-sm text-gray-700 whitespace-pre-wrap">
                {p.instructions}
              </p>
            </div>
          ) : null}

          {(p.lat !== null && p.lng !== null) ? (
            <div className="border rounded p-4 space-y-2">
              <h2 className="font-semibold">Localisation</h2>
              <p className="text-xs text-gray-600">
                lat: {p.lat} · lng: {p.lng}
              </p>
              <p className="text-xs text-gray-500">
                (Prochaine étape : mini-carte ici, si tu veux)
              </p>
            </div>
          ) : null}
        </section>

        {/* Réservation */}
        <aside className="border rounded p-4 space-y-3 h-fit">
          <h2 className="text-lg font-semibold">Réserver</h2>
          <p className="text-sm text-gray-600">
            Choisis une date/heure, puis paie pour confirmer.
          </p>

          <BookingForm
            parkingId={p.id}
            parkingTitle={p.title}
            priceHour={Number(p.price_hour)}
            priceDay={p.price_day ? Number(p.price_day) : null}
          />

          <p className="text-xs text-gray-500">
            Paiement sécurisé via Stripe. Confirmation automatique après paiement.
          </p>
        </aside>
      </div>
    </main>
  );
}
