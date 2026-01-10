// app/parkings/new/NewParkingClient.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/app/providers/AuthProvider";
import { UI } from "@/app/components/ui";
import PhotoUploader from "@/app/components/PhotoUploader";
import MapPicker from "@/app/components/MapPicker";
import AddressSearch from "@/app/components/AddressSearch";

type ParkingType = "outdoor" | "indoor" | "garage";

function buildAddress(args: {
  street: string;
  streetNumber?: string;
  postalCode?: string;
  city: string;
}) {
  const a1 = `${args.street}${args.streetNumber ? " " + args.streetNumber : ""}`.trim();
  const a2 = `${args.postalCode ? args.postalCode + " " : ""}${args.city}`.trim();
  return [a1, a2].filter(Boolean).join(", ");
}

// Best-effort parsing depuis display_name (ça marche bien en CH mais pas parfait)
function guessPartsFromDisplayName(displayName: string) {
  // Exemple: "Rue du Rhône 12, 1204 Genève, Suisse"
  const parts = displayName.split(",").map((x) => x.trim());
  const first = parts[0] ?? "";
  const second = parts[1] ?? "";
  const third = parts[2] ?? "";

  // Try extract street + number from first
  const m = first.match(/^(.*?)(\s+\d+[a-zA-Z]?)$/);
  const street = m ? m[1].trim() : first;
  const streetNumber = m ? m[2].trim() : "";

  // Try extract postal + city from second or third
  const pcCity = (second.match(/^(\d{4,5})\s+(.*)$/)
    ? second
    : third.match(/^(\d{4,5})\s+(.*)$/)
    ? third
    : null) as RegExpMatchArray | null;

  const postalCode = pcCity?.[1] ?? "";
  const city = pcCity?.[2] ?? "";

  return { street, streetNumber, postalCode, city };
}

export default function NewParkingClient() {
  const router = useRouter();
  const { ready, session, supabase } = useAuth();

  const [title, setTitle] = useState("");
  const [instructions, setInstructions] = useState("");

  const [street, setStreet] = useState("");
  const [streetNumber, setStreetNumber] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [city, setCity] = useState("Genève");

  const [parkingType, setParkingType] = useState<ParkingType>("outdoor");
  const [isCovered, setIsCovered] = useState(false);
  const [hasEvCharger, setHasEvCharger] = useState(false);
  const [isSecure, setIsSecure] = useState(false);
  const [isLit, setIsLit] = useState(false);

  const [priceHour, setPriceHour] = useState<string>("");
  const [priceDay, setPriceDay] = useState<string>("");

  // tempId pour photos (avant création)
  const [tempId] = useState(() => crypto.randomUUID());
  const [photos, setPhotos] = useState<string[]>([]);

  const [pos, setPos] = useState<{ lat: number; lng: number } | null>(null);

  // Address search input (libre)
  const [addressSearch, setAddressSearch] = useState("");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!city) setCity("Genève");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const previewAddress = useMemo(() => {
    if (!street.trim() || !city.trim()) return "";
    return buildAddress({
      street: street.trim(),
      streetNumber: streetNumber.trim() || undefined,
      postalCode: postalCode.trim() || undefined,
      city: city.trim(),
    });
  }, [street, streetNumber, postalCode, city]);

  const onCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!ready) return;
    if (!session) {
      setError("Tu dois être connecté pour proposer une place.");
      return;
    }

    if (!title.trim()) {
      setError("Titre requis.");
      return;
    }
    if (!street.trim() || !city.trim()) {
      setError("Adresse incomplète (rue + ville minimum).");
      return;
    }

    const ph = priceHour.trim() ? Number(priceHour) : null;
    const pd = priceDay.trim() ? Number(priceDay) : null;

    if (ph === null || Number.isNaN(ph) || ph <= 0) {
      setError("Prix heure requis et doit être un nombre > 0.");
      return;
    }
    if (pd !== null && (Number.isNaN(pd) || pd <= 0)) {
      setError("Prix jour invalide (si renseigné, doit être > 0).");
      return;
    }

    const address = buildAddress({
      street: street.trim(),
      streetNumber: streetNumber.trim() || undefined,
      postalCode: postalCode.trim() || undefined,
      city: city.trim(),
    });

    setSaving(true);

    const payload = {
      owner_id: session.user.id,

      title: title.trim(),
      instructions: instructions.trim() || null,

      // legacy NOT NULL
      address,

      street: street.trim(),
      street_number: streetNumber.trim() || null,
      postal_code: postalCode.trim() || null,
      city: city.trim(),

      parking_type: parkingType,
      is_covered: isCovered,
      has_ev_charger: hasEvCharger,
      is_secure: isSecure,
      is_lit: isLit,

      price_hour: ph,
      price_day: pd,

      photos: photos.length ? photos : [],

      lat: pos?.lat ?? null,
      lng: pos?.lng ?? null,

      is_active: true,
    };

    const { data: created, error: insErr } = await supabase
      .from("parkings")
      .insert(payload)
      .select("id")
      .single();

    setSaving(false);

    if (insErr || !created) {
      setError(insErr?.message ?? "Erreur création place.");
      return;
    }

    router.push(`/my-parkings`);
    router.refresh();
  };

  // ===== UI states =====
  if (!ready) {
    return (
      <main className={UI.page}>
        <div className={`${UI.container} ${UI.section}`}>
          <div className={`${UI.card} ${UI.cardPad}`}>
            <p className={UI.p}>Chargement…</p>
          </div>
        </div>
      </main>
    );
  }

  if (!session) {
    return (
      <main className={UI.page}>
        <div className={`${UI.container} ${UI.section} space-y-6`}>
          <div className={UI.sectionTitleRow}>
            <div>
              <h1 className={UI.h1}>Proposer une place</h1>
              <p className={UI.p}>Tu dois être connecté pour continuer.</p>
            </div>
            <Link href="/parkings" className={`${UI.btnBase} ${UI.btnGhost}`}>
              ← Retour
            </Link>
          </div>

          <div className={`${UI.card} ${UI.cardPad} space-y-4`}>
            <p className={UI.p}>Connecte-toi pour proposer une place.</p>
            <div className="flex flex-wrap gap-2">
              <Link href="/login" className={`${UI.btnBase} ${UI.btnPrimary}`}>
                Se connecter
              </Link>
              <Link href="/parkings" className={`${UI.btnBase} ${UI.btnGhost}`}>
                Voir les places
              </Link>
            </div>
          </div>
        </div>
      </main>
    );
  }

  // ===== Main form =====
  return (
    <main className={UI.page}>
      <div className={`${UI.container} ${UI.section} space-y-6`}>
        <header className={UI.sectionTitleRow}>
          <div>
            <h1 className={UI.h1}>Proposer une place</h1>
            <p className={UI.p}>
              Une fiche complète (adresse, photos, équipements) augmente les réservations.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Link href="/my-parkings" className={`${UI.btnBase} ${UI.btnGhost}`}>
              Mes places
            </Link>
            <Link href="/parkings" className={`${UI.btnBase} ${UI.btnGhost}`}>
              Parkings
            </Link>
          </div>
        </header>

        {error ? (
          <div className={`${UI.card} ${UI.cardPad} border border-rose-200 bg-rose-50/60`}>
            <p className="text-sm text-rose-700">
              <b>Erreur :</b> {error}
            </p>
          </div>
        ) : null}

        <form onSubmit={onCreate} className="space-y-6">
          {/* ===== Infos ===== */}
          <section className={`${UI.card} ${UI.cardPad} space-y-4`}>
            <div className="flex items-center justify-between gap-3">
              <h2 className={UI.h2}>Infos</h2>
              <span className={UI.chip}>Étape 1/5</span>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-900">Titre</label>
              <input
                className={UI.input}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Ex: Place couverte proche Plainpalais"
              />
              <p className={UI.subtle}>Astuce : précise un repère (gare, quartier…).</p>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-900">Instructions</label>
              <textarea
                className={`${UI.input} min-h-[110px] resize-none leading-relaxed`}
                rows={3}
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                placeholder="Ex: accès via badge, code portail, étage -1…"
              />
            </div>
          </section>

          {/* ===== Adresse ===== */}
          <section className={`${UI.card} ${UI.cardPad} space-y-4`}>
            <div className="flex items-center justify-between gap-3">
              <h2 className={UI.h2}>Adresse</h2>
              <span className={UI.chip}>Étape 2/5</span>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-900">Recherche rapide</label>
              <AddressSearch
                query={addressSearch}
                onQueryChange={setAddressSearch}
                onPick={(p) => {
                  setPos({ lat: p.lat, lng: p.lng });

                  const guessed = guessPartsFromDisplayName(p.displayName);
                  if (guessed.street) setStreet(guessed.street);
                  if (guessed.streetNumber) setStreetNumber(guessed.streetNumber);
                  if (guessed.postalCode) setPostalCode(guessed.postalCode);
                  if (guessed.city) setCity(guessed.city);
                }}
                placeholder="Ex: Rue du Rhône 12, Genève"
              />
              <p className={UI.subtle}>
                Sélectionne une adresse pour positionner automatiquement la carte.
              </p>
            </div>

            <div className={UI.divider} />

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="md:col-span-2 space-y-2">
                <label className="text-sm font-medium text-slate-900">Rue</label>
                <input
                  className={UI.input}
                  value={street}
                  onChange={(e) => setStreet(e.target.value)}
                  placeholder="Ex: Rue du Rhône"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-900">N°</label>
                <input
                  className={UI.input}
                  value={streetNumber}
                  onChange={(e) => setStreetNumber(e.target.value)}
                  placeholder="Ex: 12"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-900">Code postal</label>
                <input
                  className={UI.input}
                  value={postalCode}
                  onChange={(e) => setPostalCode(e.target.value)}
                  placeholder="Ex: 1204"
                />
              </div>

              <div className="md:col-span-2 space-y-2">
                <label className="text-sm font-medium text-slate-900">Ville</label>
                <input
                  className={UI.input}
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  placeholder="Ex: Genève"
                />
              </div>
            </div>

            <div className="flex flex-wrap gap-2 items-center">
              <span className={UI.chip}>Adresse : {previewAddress || "—"}</span>
              {pos ? (
                <span className={UI.chip}>
                  📍 {pos.lat.toFixed(5)}, {pos.lng.toFixed(5)}
                </span>
              ) : (
                <span className={UI.chip}>📍 Position : —</span>
              )}
            </div>
          </section>

          {/* ===== Caractéristiques ===== */}
          <section className={`${UI.card} ${UI.cardPad} space-y-4`}>
            <div className="flex items-center justify-between gap-3">
              <h2 className={UI.h2}>Caractéristiques</h2>
              <span className={UI.chip}>Étape 3/5</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-900">Type</label>
                <select
                  className={UI.select}
                  value={parkingType}
                  onChange={(e) => setParkingType(e.target.value as ParkingType)}
                >
                  <option value="outdoor">Extérieur</option>
                  <option value="indoor">Intérieur</option>
                  <option value="garage">Garage</option>
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-900">Couvert</label>
                <button
                  type="button"
                  onClick={() => setIsCovered((v) => !v)}
                  className={`${UI.btnBase} ${UI.btnGhost} w-full justify-between`}
                >
                  <span>{isCovered ? "✅ Oui" : "❌ Non"}</span>
                  <span className={UI.subtle}>Clique pour changer</span>
                </button>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <label className={`${UI.chip} cursor-pointer select-none`}>
                <input
                  type="checkbox"
                  className="mr-2 accent-violet-600"
                  checked={hasEvCharger}
                  onChange={(e) => setHasEvCharger(e.target.checked)}
                />
                ⚡ Borne EV
              </label>

              <label className={`${UI.chip} cursor-pointer select-none`}>
                <input
                  type="checkbox"
                  className="mr-2 accent-violet-600"
                  checked={isSecure}
                  onChange={(e) => setIsSecure(e.target.checked)}
                />
                🔒 Sécurisé
              </label>

              <label className={`${UI.chip} cursor-pointer select-none`}>
                <input
                  type="checkbox"
                  className="mr-2 accent-violet-600"
                  checked={isLit}
                  onChange={(e) => setIsLit(e.target.checked)}
                />
                💡 Éclairé
              </label>
            </div>
          </section>

          {/* ===== Prix ===== */}
          <section className={`${UI.card} ${UI.cardPad} space-y-4`}>
            <div className="flex items-center justify-between gap-3">
              <h2 className={UI.h2}>Prix</h2>
              <span className={UI.chip}>Étape 4/5</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-900">
                  Prix / heure (CHF)
                </label>
                <input
                  className={UI.input}
                  value={priceHour}
                  onChange={(e) => setPriceHour(e.target.value)}
                  placeholder="Ex: 5"
                  inputMode="decimal"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-900">
                  Prix / jour (CHF)
                </label>
                <input
                  className={UI.input}
                  value={priceDay}
                  onChange={(e) => setPriceDay(e.target.value)}
                  placeholder="Ex: 25 (optionnel)"
                  inputMode="decimal"
                />
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              {priceHour.trim() ? <span className={UI.chip}>⏱ {priceHour} CHF/h</span> : null}
              {priceDay.trim() ? <span className={UI.chip}>📅 {priceDay} CHF/j</span> : null}
            </div>
          </section>

          {/* ===== Photos + Carte ===== */}
          <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className={`${UI.card} ${UI.cardPad} space-y-4`}>
              <div className="flex items-center justify-between gap-3">
                <h2 className={UI.h2}>Photos</h2>
                <span className={UI.chip}>Étape 5/5</span>
              </div>

              <PhotoUploader
                parkingId={tempId}
                value={photos}
                onChange={setPhotos}
                maxPhotos={3}
              />

              <p className={UI.subtle}>
                Conseil : 1 à 3 photos nettes (entrée, place, accès).
              </p>
            </div>

            <div className={`${UI.card} ${UI.cardPad} space-y-3`}>
              <div>
                <h2 className={UI.h2}>Carte</h2>
                <p className={UI.p}>
                  Sélectionne l’emplacement (auto si tu choisis une adresse).
                </p>
              </div>

              <div className="overflow-hidden rounded-2xl border border-slate-200/70 bg-white/60 backdrop-blur">
                <div className="h-[360px]">
                  <MapPicker value={pos} onChange={setPos} />
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <span className={UI.chip}>lat: {pos?.lat ?? "—"}</span>
                <span className={UI.chip}>lng: {pos?.lng ?? "—"}</span>
              </div>
            </div>
          </section>

          {/* ===== Actions ===== */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-2">
            <button
              className={`${UI.btnBase} ${UI.btnPrimary} w-full sm:w-auto`}
              disabled={saving}
              type="submit"
            >
              {saving ? "Création…" : "Créer la place"}
            </button>

            <Link
              className={`${UI.btnBase} ${UI.btnGhost} w-full sm:w-auto`}
              href="/my-parkings"
            >
              Mes places
            </Link>

            <button
              type="button"
              className={`${UI.btnBase} ${UI.btnGhost} w-full sm:w-auto`}
              onClick={() => router.back()}
            >
              Retour
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}
