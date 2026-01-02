"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/app/providers/AuthProvider";
import { UI } from "@/app/components/ui";
import PhotoUploader from "@/app/components/PhotoUploader";
import MapPicker from "@/app/components/MapPicker";
import AddressSearch from "@/app/components/AddressSearch";

type ParkingRow = {
  id: string;
  owner_id: string;

  title: string;
  instructions: string | null;

  // legacy (NOT NULL)
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

  price_hour: number | null;
  price_day: number | null;

  photos: string[] | null;

  lat: number | null;
  lng: number | null;

  is_active: boolean | null;
};

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

// Best-effort parsing depuis display_name (Nominatim)
function guessPartsFromDisplayName(displayName: string) {
  // Exemple: "Rue du Rhône 12, 1204 Genève, Suisse"
  const parts = displayName.split(",").map((x) => x.trim());
  const first = parts[0] ?? "";
  const second = parts[1] ?? "";
  const third = parts[2] ?? "";

  const m = first.match(/^(.*?)(\s+\d+[a-zA-Z]?)$/);
  const street = m ? m[1].trim() : first;
  const streetNumber = m ? m[2].trim() : "";

  const pcCity =
    (second.match(/^(\d{4,5})\s+(.*)$/) ? second : third.match(/^(\d{4,5})\s+(.*)$/) ? third : null) as
      | RegExpMatchArray
      | null;

  const postalCode = pcCity?.[1] ?? "";
  const city = pcCity?.[2] ?? "";

  return { street, streetNumber, postalCode, city };
}

export default function EditParkingClient({
  initialParking,
}: {
  initialParking: ParkingRow;
}) {
  const router = useRouter();
  const { ready, session, supabase } = useAuth();

  const parkingId = initialParking.id;

  const [title, setTitle] = useState(initialParking.title ?? "");
  const [instructions, setInstructions] = useState(initialParking.instructions ?? "");

  const [street, setStreet] = useState(initialParking.street ?? "");
  const [streetNumber, setStreetNumber] = useState(initialParking.street_number ?? "");
  const [postalCode, setPostalCode] = useState(initialParking.postal_code ?? "");
  const [city, setCity] = useState(initialParking.city ?? "Genève");

  const [parkingType, setParkingType] = useState<"outdoor" | "indoor" | "garage">(
    initialParking.parking_type ?? "outdoor"
  );

  const [isCovered, setIsCovered] = useState(Boolean(initialParking.is_covered));
  const [hasEvCharger, setHasEvCharger] = useState(Boolean(initialParking.has_ev_charger));
  const [isSecure, setIsSecure] = useState(Boolean(initialParking.is_secure));
  const [isLit, setIsLit] = useState(Boolean(initialParking.is_lit));

  const [priceHour, setPriceHour] = useState<string>(
    initialParking.price_hour !== null && initialParking.price_hour !== undefined
      ? String(initialParking.price_hour)
      : ""
  );
  const [priceDay, setPriceDay] = useState<string>(
    initialParking.price_day !== null && initialParking.price_day !== undefined
      ? String(initialParking.price_day)
      : ""
  );

  const [photos, setPhotos] = useState<string[]>(
    Array.isArray(initialParking.photos) ? initialParking.photos : []
  );

  const [lat, setLat] = useState<number | null>(
    typeof initialParking.lat === "number" ? initialParking.lat : null
  );
  const [lng, setLng] = useState<number | null>(
    typeof initialParking.lng === "number" ? initialParking.lng : null
  );

  const [isActive, setIsActive] = useState<boolean>(initialParking.is_active !== false);

  // Recherche d’adresse (input libre)
  const [addressSearch, setAddressSearch] = useState("");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const notOwner = useMemo(() => {
    if (!ready) return false;
    if (!session?.user?.id) return true;
    return session.user.id !== initialParking.owner_id;
  }, [ready, session?.user?.id, initialParking.owner_id]);

  const previewAddress = useMemo(() => {
    if (!street.trim() || !city.trim()) return "";
    return buildAddress({
      street: street.trim(),
      streetNumber: streetNumber.trim() || undefined,
      postalCode: postalCode.trim() || undefined,
      city: city.trim(),
    });
  }, [street, streetNumber, postalCode, city]);

  const onSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!ready) return;
    if (!session) {
      setError("Tu dois être connecté.");
      return;
    }
    if (notOwner) {
      setError("Accès refusé : tu n’es pas le propriétaire de cette place.");
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

    if (ph !== null && (Number.isNaN(ph) || ph <= 0)) {
      setError("Prix heure invalide.");
      return;
    }
    if (pd !== null && (Number.isNaN(pd) || pd <= 0)) {
      setError("Prix jour invalide (si renseigné, doit être > 0).");
      return;
    }

    // ✅ address (NOT NULL) recalculé au save
    const address = buildAddress({
      street: street.trim(),
      streetNumber: streetNumber.trim() || undefined,
      postalCode: postalCode.trim() || undefined,
      city: city.trim(),
    });

    setSaving(true);

    const { error: upErr } = await supabase
      .from("parkings")
      .update({
        title: title.trim(),
        instructions: instructions.trim() || null,

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

        lat,
        lng,

        is_active: isActive,
      })
      .eq("id", parkingId);

    setSaving(false);

    if (upErr) {
      setError(upErr.message);
      return;
    }

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
        <h1 className="text-2xl font-semibold">Modifier ma place</h1>
        <p className="text-sm text-gray-600">Tu dois être connecté.</p>
        <Link className="underline" href="/login">
          Se connecter
        </Link>
      </main>
    );
  }

  if (notOwner) {
    return (
      <main className="max-w-3xl mx-auto p-6 space-y-3">
        <h1 className="text-2xl font-semibold">Modifier ma place</h1>
        <p className="text-sm text-red-600">
          Accès refusé : tu n’es pas le propriétaire de cette place.
        </p>
        <Link className="underline" href="/my-parkings">
          Retour à mes places
        </Link>
      </main>
    );
  }

  return (
    <main className="max-w-3xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Modifier ma place</h1>
        <Link className={UI.btnGhost} href="/my-parkings">
          Retour
        </Link>
      </div>

      {error && <p className="text-sm text-red-600">Erreur : {error}</p>}

      <form onSubmit={onSave} className="space-y-6">
        <section className="border rounded p-4 space-y-4">
          <h2 className="font-semibold">Infos</h2>

          <div className="space-y-2">
            <label className="text-sm font-medium">Titre</label>
            <input
              className="border rounded px-3 py-2 w-full"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Instructions</label>
            <textarea
              className="border rounded px-3 py-2 w-full"
              rows={3}
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
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
              setLat(p.lat);
              setLng(p.lng);

              const guessed = guessPartsFromDisplayName(p.displayName);
              if (guessed.street) setStreet(guessed.street);
              if (guessed.streetNumber) setStreetNumber(guessed.streetNumber);
              if (guessed.postalCode) setPostalCode(guessed.postalCode);
              if (guessed.city) setCity(guessed.city);
            }}
            placeholder="Ex: Rue du Rhône 12, Genève"
          />

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2">
            <div className="md:col-span-2 space-y-2">
              <label className="text-sm font-medium">Rue</label>
              <input
                className="border rounded px-3 py-2 w-full"
                value={street}
                onChange={(e) => setStreet(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">N°</label>
              <input
                className="border rounded px-3 py-2 w-full"
                value={streetNumber}
                onChange={(e) => setStreetNumber(e.target.value)}
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
              />
            </div>

            <div className="md:col-span-2 space-y-2">
              <label className="text-sm font-medium">Ville</label>
              <input
                className="border rounded px-3 py-2 w-full"
                value={city}
                onChange={(e) => setCity(e.target.value)}
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
                onChange={(e) =>
                  setParkingType(e.target.value as "outdoor" | "indoor" | "garage")
                }
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
                <span className="text-sm text-gray-700">{isCovered ? "Oui" : "Non"}</span>
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
                inputMode="decimal"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Prix / jour (CHF)</label>
              <input
                className="border rounded px-3 py-2 w-full"
                value={priceDay}
                onChange={(e) => setPriceDay(e.target.value)}
                inputMode="decimal"
              />
            </div>
          </div>
        </section>

        <section className="border rounded p-4 space-y-4">
          <h2 className="font-semibold">Photos</h2>
          <PhotoUploader
            parkingId={parkingId}
            value={photos ?? []}
            onChange={setPhotos}
            maxPhotos={3}
          />
        </section>

        <section className="border rounded p-4 space-y-4">
          <h2 className="font-semibold">Carte</h2>

          <div className="border rounded overflow-hidden">
            <MapPicker
              value={lat !== null && lng !== null ? { lat, lng } : null}
              onChange={(p) => {
                setLat(p?.lat ?? null);
                setLng(p?.lng ?? null);
              }}
            />
          </div>

          <div className="text-xs text-gray-500">
            lat: {lat ?? "—"} / lng: {lng ?? "—"}
          </div>
        </section>

        <section className="border rounded p-4 space-y-3">
          <h2 className="font-semibold">Visibilité</h2>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
            />
            Publier cette place (visible dans la recherche)
          </label>
        </section>

        <div className="flex items-center gap-3">
          <button className={UI.btnPrimary} disabled={saving} type="submit">
            {saving ? "Sauvegarde…" : "Enregistrer"}
          </button>

          <Link className={UI.btnGhost} href={`/parkings/${parkingId}`}>
            Voir la page
          </Link>
        </div>
      </form>
    </main>
  );
}
