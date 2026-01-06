import Link from "next/link";
import { createClient } from "@supabase/supabase-js";
import BookingForm from "./booking-form";
import { UI } from "@/app/components/ui";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ParkingType = "outdoor" | "indoor" | "garage";

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

  parking_type: ParkingType | null;
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

function typeLabel(t: ParkingRow["parking_type"]) {
  if (t === "indoor") return "Intérieur";
  if (t === "garage") return "Garage";
  return "Extérieur";
}

function fullAddress(p: ParkingRow) {
  const a = (p.address ?? "").trim();
  if (a) return a;

  const a1 = `${p.street ?? ""}${p.street_number ? " " + p.street_number : ""}`.trim();
  const a2 = `${p.postal_code ? p.postal_code + " " : ""}${p.city ?? ""}`.trim();
  return [a1, a2].filter(Boolean).join(", ");
}

function isNonEmptyArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.length > 0;
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
      <main className={UI.page}>
        <div className={[UI.container, UI.section].join(" ")}>
          <div className={[UI.card, UI.cardPad].join(" ")}>
            <p className="text-rose-600 text-sm">Parking introuvable.</p>
            <Link className={[UI.btnBase, UI.btnGhost, "mt-3 inline-flex"].join(" ")} href="/parkings">
              ← Retour aux parkings
            </Link>
          </div>
        </div>
      </main>
    );
  }

  const p = parking as ParkingRow;

  const addr = fullAddress(p);
  const photos = isNonEmptyArray(p.photos) ? p.photos : [];
  const hasCoords = typeof p.lat === "number" && typeof p.lng === "number";

  return (
    <main className={UI.page}>
      <div className={[UI.container, UI.section].join(" ")}>
        {/* Top bar */}
        <div className="flex items-center justify-between gap-3">
          <Link className={[UI.btnBase, UI.btnGhost].join(" ")} href="/parkings">
            ← Retour
          </Link>

          <div className="flex gap-2">
            {hasCoords ? (
              <Link
                className={[UI.btnBase, UI.btnGhost].join(" ")}
                href={`/map?focus=${encodeURIComponent(p.id)}`}
              >
                Voir sur la carte
              </Link>
            ) : null}

            <Link className={[UI.btnBase, UI.btnPrimary].join(" ")} href="/parkings/new">
              Proposer une place
            </Link>
          </div>
        </div>

        {/* Hero */}
        <section className={[UI.card, UI.cardPad, "mt-6"].join(" ")}>
          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
            <div className="min-w-0">
              <h1 className="text-2xl md:text-3xl font-semibold text-slate-900">
                {p.title}
              </h1>

              <div className="mt-2 text-sm text-slate-600">
                {addr || "Adresse non renseignée"}
              </div>

              {/* Chips */}
              <div className="mt-4 flex flex-wrap gap-2">
                <span className={UI.chip}>{typeLabel(p.parking_type)}</span>
                <span className={UI.chip}>{p.is_covered ? "Couverte" : "Non couverte"}</span>
                {p.has_ev_charger ? <span className={UI.chip}>⚡ Borne EV</span> : null}
                {p.is_secure ? <span className={UI.chip}>🔒 Sécurisée</span> : null}
                {p.is_lit ? <span className={UI.chip}>💡 Éclairée</span> : null}
              </div>

              {/* Detail line */}
              {(p.street || p.city || p.postal_code) ? (
                <div className="mt-3 text-xs text-slate-500">
                  {p.street ? (
                    <>
                      {p.street}
                      {p.street_number ? ` ${p.street_number}` : ""}
                      {p.postal_code ? `, ${p.postal_code}` : ""}
                      {p.city ? ` ${p.city}` : ""}
                    </>
                  ) : null}
                </div>
              ) : null}
            </div>

            {/* Price box */}
            <div className="shrink-0">
              <div className="rounded-2xl border bg-gradient-to-b from-violet-50 to-white p-4 shadow-sm min-w-[220px]">
                <div className="text-xs text-slate-600">À partir de</div>
                <div className="mt-1 text-2xl font-semibold text-slate-900">
                  {p.price_hour} CHF
                  <span className="text-sm font-medium text-slate-600"> / h</span>
                </div>

                {p.price_day ? (
                  <div className="mt-1 text-sm text-slate-600">
                    {p.price_day} CHF / jour
                  </div>
                ) : (
                  <div className="mt-1 text-sm text-slate-400">Tarif jour: —</div>
                )}

                <div className="mt-3 text-xs text-slate-500">
                  Paiement sécurisé (Stripe)
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Gallery */}
        <section className="mt-6">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-slate-900">Photos</h2>
            {photos.length > 0 ? (
              <span className="text-xs text-slate-500">{photos.length} photo(s)</span>
            ) : (
              <span className="text-xs text-slate-500">Aucune photo</span>
            )}
          </div>

          {photos.length > 0 ? (
            <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {photos.slice(0, 6).map((url) => (
                <div
                  key={url}
                  className="overflow-hidden rounded-2xl border bg-slate-100 shadow-sm"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={url}
                    alt=""
                    className="w-full h-44 object-cover hover:scale-[1.02] transition"
                    loading="lazy"
                  />
                </div>
              ))}
            </div>
          ) : (
            <div className={[UI.card, UI.cardPad, "mt-3"].join(" ")}>
              <p className="text-sm text-slate-600">
                Le propriétaire n’a pas encore ajouté de photos.
              </p>
            </div>
          )}

          {photos.length > 6 ? (
            <p className="mt-2 text-xs text-slate-500">
              +{photos.length - 6} photo(s) non affichée(s)
            </p>
          ) : null}
        </section>

        {/* Content grid */}
        <div className="mt-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left */}
          <section className="lg:col-span-2 space-y-6">
            {/* Details card */}
            <div className={[UI.card, UI.cardPad].join(" ")}>
              <h2 className="text-lg font-semibold text-slate-900">Détails</h2>

              <div className="mt-3 grid sm:grid-cols-2 gap-3">
                <div className="rounded-2xl border bg-white p-3">
                  <div className="text-xs text-slate-500">Adresse</div>
                  <div className="mt-1 text-sm text-slate-900">{addr || "—"}</div>
                </div>

                <div className="rounded-2xl border bg-white p-3">
                  <div className="text-xs text-slate-500">Type</div>
                  <div className="mt-1 text-sm text-slate-900">
                    {typeLabel(p.parking_type)} · {p.is_covered ? "Couverte" : "Non couverte"}
                  </div>
                </div>

                <div className="rounded-2xl border bg-white p-3">
                  <div className="text-xs text-slate-500">Équipements</div>
                  <div className="mt-1 text-sm text-slate-900">
                    {p.has_ev_charger ? "⚡ EV " : ""}
                    {p.is_secure ? "🔒 Sécurisée " : ""}
                    {p.is_lit ? "💡 Éclairée " : ""}
                    {!p.has_ev_charger && !p.is_secure && !p.is_lit ? "—" : null}
                  </div>
                </div>

                <div className="rounded-2xl border bg-white p-3">
                  <div className="text-xs text-slate-500">Coordonnées</div>
                  <div className="mt-1 text-sm text-slate-900">
                    {hasCoords ? (
                      <>
                        lat {p.lat} · lng {p.lng}
                      </>
                    ) : (
                      "—"
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Instructions */}
            {p.instructions ? (
              <div className={[UI.card, UI.cardPad].join(" ")}>
                <h2 className="text-lg font-semibold text-slate-900">
                  Instructions d’accès
                </h2>
                <p className="mt-3 text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">
                  {p.instructions}
                </p>
              </div>
            ) : null}

            {/* Small note */}
            <div className={[UI.card, UI.cardPad].join(" ")}>
              <h3 className="font-semibold text-slate-900">Bon à savoir</h3>
              <p className="mt-2 text-sm text-slate-600">
                Une fois le paiement confirmé, la réservation est automatiquement validée.
                Tu peux ensuite annuler selon les règles de remboursement.
              </p>
            </div>
          </section>

          {/* Right / Booking */}
          <aside className="h-fit">
            <div className="rounded-3xl border bg-white shadow-sm overflow-hidden">
              <div className="p-5 bg-gradient-to-b from-violet-50 to-white border-b">
                <h2 className="text-lg font-semibold text-slate-900">Réserver</h2>
                <p className="mt-1 text-sm text-slate-600">
                  Choisis une date/heure, puis paie pour confirmer.
                </p>
              </div>

              <div className="p-5 space-y-4">
                <BookingForm
                  parkingId={p.id}
                  parkingTitle={p.title}
                  priceHour={Number(p.price_hour)}
                  priceDay={p.price_day ? Number(p.price_day) : null}
                />

                <div className="text-xs text-slate-500">
                  Paiement via Stripe. Confirmation automatique après paiement.
                </div>

                <div className="pt-2">
                  <Link
                    href="/my-bookings"
                    className={[UI.btnBase, UI.btnGhost, "w-full justify-center"].join(" ")}
                  >
                    Voir mes réservations
                  </Link>
                </div>
              </div>
            </div>
          </aside>
        </div>

        {/* Bottom back */}
        <div className="mt-8">
          <Link className={[UI.btnBase, UI.btnGhost].join(" ")} href="/parkings">
            ← Retour aux parkings
          </Link>
        </div>
      </div>
    </main>
  );
}
