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
  const pcCity = (second.match(/^(\d{4,5})\s+(.*)$/) ? second : third.match(/^(\d{4,5})\s+(.*)$/) ? third : null) as
    | RegExpMatchArray
    | null;

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

  if (!ready) {
    return (
      <main className="max-w-3xl mx-auto p-6">
        <p className="text-sm text-gray-600">Chargement…</p>
      </main>
    );
  }

  if (!session) {
    return (
      <main className="max-w-3xl mx-auto p-6 space-y-3">
        <h1 className="text-2xl font-semibold">Proposer une place</h1>
        <p className="text-sm text-gray-600">Tu dois être connecté.</p>
        <Link className="underline" href="/login">
          Se connecter
        </Link>
      </main>
    );
  }

  return (
    <main className="max-w-3xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Proposer une place</h1>
        <Link className={UI.btnGhost} href="/parkings">
          Retour
        </Link>
      </div>

      {error && <p className="text-sm text-red-600">Erreur : {error}</p>}

      <form onSubmit={onCreate} className="space-y-6">
        <section className="border rounded p-4 space-y-4">
          <h2 className="font-semibold">Infos</h2>

          <div className="space-y-2">
            <label className="text-sm font-medium">Titre</label>
            <input
              className="border rounded px-3 py-2 w-full"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex: Place couverte proche Plainpalais"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Instructions</label>
            <textarea
              className="border rounded px-3 py-2 w-full"
              rows={3}
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              placeholder="Ex: accès via badge, code portail, étage -1…"
            />
          </div>
        </section>

        <section className="border rounded p-4 space-y-4">
          <h2 className="font-semibold">Adresse</h2>

          {/* ✅ Recherche auto */}
          <AddressSearch
            query={addressSearch}
            onQueryChange={setAddressSearch}
            onPick={(p) => {
              setPos({ lat: p.lat, lng: p.lng });

              // best-effort : remplir champs adresse
              const guessed = guessPartsFromDisplayName(p.displayName);
              if (guessed.street) setStreet(guessed.street);
              if (guessed.streetNumber) setStreetNumber(guessed.streetNumber);
              if (guessed.postalCode) setPostalCode(guessed.postalCode);
              if (guessed.city) setCity(guessed.city);
            }}
            placeholder="Ex: Rue du Rhône 12, Genève"
          />

          {/* Champs manuels (toujours dispo) */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2">
            <div className="md:col-span-2 space-y-2">
              <label className="text-sm font-medium">Rue</label>
              <input
                className="border rounded px-3 py-2 w-full"
                value={street}
                onChange={(e) => setStreet(e.target.value)}
                placeholder="Ex: Rue du Rhône"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">N°</label>
              <input
                className="border rounded px-3 py-2 w-full"
                value={streetNumber}
                onChange={(e) => setStreetNumber(e.target.value)}
                placeholder="Ex: 12"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="space-y-2">
              <label className="text-sm font-medium">Code postal</label>
              <input
                className="border rounded px-3 py-2 w-full"
                value={postalCode}
                onChange={(e) => setPostalCode(e.target.value)}
                placeholder="Ex: 1204"
              />
            </div>

            <div className="md:col-span-2 space-y-2">
              <label className="text-sm font-medium">Ville</label>
              <input
                className="border rounded px-3 py-2 w-full"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="Ex: Genève"
              />
            </div>
          </div>

          <div className="text-xs text-gray-600">
            Address (auto) : <b>{previewAddress || "—"}</b>
          </div>
        </section>

        <section className="border rounded p-4 space-y-4">
          <h2 className="font-semibold">Caractéristiques</h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-2">
              <label className="text-sm font-medium">Type</label>
              <select
                className="border rounded px-3 py-2 w-full"
                value={parkingType}
                onChange={(e) => setParkingType(e.target.value as ParkingType)}
              >
                <option value="outdoor">Extérieur</option>
                <option value="indoor">Intérieur</option>
                <option value="garage">Garage</option>
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Couvert</label>
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={isCovered}
                  onChange={(e) => setIsCovered(e.target.checked)}
                />
                <span className="text-sm text-gray-700">
                  {isCovered ? "Oui" : "Non"}
                </span>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-4 text-sm">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={hasEvCharger}
                onChange={(e) => setHasEvCharger(e.target.checked)}
              />
              ⚡ Borne EV
            </label>

            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={isSecure}
                onChange={(e) => setIsSecure(e.target.checked)}
              />
              🔒 Sécurisé
            </label>

            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={isLit}
                onChange={(e) => setIsLit(e.target.checked)}
              />
              💡 Éclairé
            </label>
          </div>
        </section>

        <section className="border rounded p-4 space-y-4">
          <h2 className="font-semibold">Prix</h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-2">
              <label className="text-sm font-medium">Prix / heure (CHF)</label>
              <input
                className="border rounded px-3 py-2 w-full"
                value={priceHour}
                onChange={(e) => setPriceHour(e.target.value)}
                placeholder="Ex: 5"
                inputMode="decimal"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Prix / jour (CHF)</label>
              <input
                className="border rounded px-3 py-2 w-full"
                value={priceDay}
                onChange={(e) => setPriceDay(e.target.value)}
                placeholder="Ex: 25 (optionnel)"
                inputMode="decimal"
              />
            </div>
          </div>
        </section>

        <section className="border rounded p-4 space-y-4">
          <h2 className="font-semibold">Photos</h2>
          <PhotoUploader
            parkingId={tempId}
            value={photos}
            onChange={setPhotos}
            maxPhotos={3}
          />
        </section>

        <section className="border rounded p-4 space-y-4">
          <h2 className="font-semibold">Carte</h2>
          <p className="text-sm text-gray-600">
            Sélectionne l’emplacement (auto si tu choisis une adresse).
          </p>

          <div className="border rounded overflow-hidden">
            <MapPicker value={pos} onChange={setPos} />
          </div>

          <div className="text-xs text-gray-500">
            lat: {pos?.lat ?? "—"} / lng: {pos?.lng ?? "—"}
          </div>
        </section>

        <div className="flex items-center gap-3">
          <button className={UI.btnPrimary} disabled={saving} type="submit">
            {saving ? "Création…" : "Créer la place"}
          </button>

          <Link className={UI.btnGhost} href="/my-parkings">
            Mes places
          </Link>
        </div>
      </form>
    </main>
  );
}
