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

function guessPartsFromDisplayName(displayName: string) {
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

export default function EditParkingClient({ initialParking }: { initialParking: ParkingRow }) {
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
    initialParking.price_hour !== null && initialParking.price_hour !== undefined ? String(initialParking.price_hour) : ""
  );
  const [priceDay, setPriceDay] = useState<string>(
    initialParking.price_day !== null && initialParking.price_day !== undefined ? String(initialParking.price_day) : ""
  );

  const [photos, setPhotos] = useState<string[]>(Array.isArray(initialParking.photos) ? initialParking.photos : []);

  const [lat, setLat] = useState<number | null>(typeof initialParking.lat === "number" ? initialParking.lat : null);
  const [lng, setLng] = useState<number | null>(typeof initialParking.lng === "number" ? initialParking.lng : null);

  const [isActive, setIsActive] = useState<boolean>(initialParking.is_active !== false);

  const [addressSearch, setAddressSearch] = useState("");

  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
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

  const onDelete = async () => {
    if (!session) return;
    setError(null);

    const ok = window.confirm(
      `Supprimer définitivement cette place ?\n\n` +
        `"${title || "Place"}"\n\n` +
        "Cette action est irréversible."
    );
    if (!ok) return;

    setDeleting(true);

    const { error: delErr } = await supabase
      .from("parkings")
      .delete()
      .eq("id", parkingId)
      .eq("owner_id", session.user.id);

    setDeleting(false);

    if (delErr) {
      setError(delErr.message);
      return;
    }

    router.push("/my-parkings");
    router.refresh();
  };

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
        <div className={`${UI.container} ${UI.section} space-y-3`}>
          <h1 className={UI.h2}>Modifier ma place</h1>
          <p className={UI.p}>Tu dois être connecté.</p>
          <Link className={`${UI.btnBase} ${UI.btnPrimary}`} href="/login">
            Se connecter
          </Link>
        </div>
      </main>
    );
  }

  if (notOwner) {
    return (
      <main className={UI.page}>
        <div className={`${UI.container} ${UI.section} space-y-3`}>
          <h1 className={UI.h2}>Modifier ma place</h1>
          <p className="text-sm text-rose-700">Accès refusé : tu n’es pas le propriétaire de cette place.</p>
          <Link className={`${UI.btnBase} ${UI.btnGhost}`} href="/my-parkings">
            Retour à mes places
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className={UI.page}>
      <div className={`${UI.container} ${UI.section} space-y-6 max-w-3xl mx-auto`}>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className={UI.h2}>Modifier ma place</h1>
            <p className={UI.subtle}>ID: <span className="font-mono">{parkingId}</span></p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Link className={`${UI.btnBase} ${UI.btnGhost}`} href="/my-parkings">
              Retour
            </Link>

            <Link className={`${UI.btnBase} ${UI.btnGhost}`} href={`/my-parkings/${parkingId}/availability`}>
              Planning
            </Link>

            <button
              type="button"
              className={`${UI.btnBase} ${UI.btnDanger}`}
              onClick={() => void onDelete()}
              disabled={deleting}
              title="Supprimer la place"
            >
              {deleting ? "Suppression…" : "Supprimer"}
            </button>
          </div>
        </div>

        {error ? (
          <div className={`${UI.card} ${UI.cardPad} border border-rose-200 bg-rose-50/60`}>
            <p className="text-sm text-rose-700">
              <b>Erreur :</b> {error}
            </p>
          </div>
        ) : null}

        {/* ✅ ton form : je garde ta structure, mais en style UI (tu peux laisser tes styles si tu veux) */}
        <form onSubmit={onSave} className="space-y-6">
          <section className={`${UI.card} ${UI.cardPad} space-y-4`}>
            <h2 className={UI.h2}>Infos</h2>

            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-900">Titre</label>
              <input className={UI.input} value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-900">Instructions</label>
              <textarea
                className={`${UI.input} min-h-[110px] resize-none leading-relaxed`}
                rows={3}
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
              />
            </div>
          </section>

          <section className={`${UI.card} ${UI.cardPad} space-y-4`}>
            <h2 className={UI.h2}>Adresse</h2>

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
                <label className="text-sm font-medium text-slate-900">Rue</label>
                <input className={UI.input} value={street} onChange={(e) => setStreet(e.target.value)} />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-900">N°</label>
                <input className={UI.input} value={streetNumber} onChange={(e) => setStreetNumber(e.target.value)} />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-900">Code postal</label>
                <input className={UI.input} value={postalCode} onChange={(e) => setPostalCode(e.target.value)} />
              </div>

              <div className="md:col-span-2 space-y-2">
                <label className="text-sm font-medium text-slate-900">Ville</label>
                <input className={UI.input} value={city} onChange={(e) => setCity(e.target.value)} />
              </div>
            </div>

            <div className={UI.subtle}>
              Adresse (auto) : <b className="text-slate-700">{previewAddress || "—"}</b>
            </div>
          </section>

          <section className={`${UI.card} ${UI.cardPad} space-y-4`}>
            <h2 className={UI.h2}>Caractéristiques</h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-900">Type</label>
                <select
                  className={UI.select}
                  value={parkingType}
                  onChange={(e) => setParkingType(e.target.value as "outdoor" | "indoor" | "garage")}
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

          <section className={`${UI.card} ${UI.cardPad} space-y-4`}>
            <h2 className={UI.h2}>Prix</h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-900">Prix / heure (CHF)</label>
                <input
                  className={UI.input}
                  value={priceHour}
                  onChange={(e) => setPriceHour(e.target.value)}
                  inputMode="decimal"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-900">Prix / jour (CHF)</label>
                <input
                  className={UI.input}
                  value={priceDay}
                  onChange={(e) => setPriceDay(e.target.value)}
                  inputMode="decimal"
                />
              </div>
            </div>
          </section>

          <section className={`${UI.card} ${UI.cardPad} space-y-4`}>
            <h2 className={UI.h2}>Photos</h2>
            <PhotoUploader parkingId={parkingId} value={photos ?? []} onChange={setPhotos} maxPhotos={3} />
          </section>

          <section className={`${UI.card} ${UI.cardPad} space-y-4`}>
            <h2 className={UI.h2}>Carte</h2>

            <div className="overflow-hidden rounded-2xl border border-slate-200/70 bg-white/60 backdrop-blur">
              <div className="h-[320px]">
                <MapPicker
                  value={lat !== null && lng !== null ? { lat, lng } : null}
                  onChange={(p) => {
                    setLat(p?.lat ?? null);
                    setLng(p?.lng ?? null);
                  }}
                />
              </div>
            </div>

            <div className={UI.subtle}>
              lat: {lat ?? "—"} / lng: {lng ?? "—"}
            </div>
          </section>

          <section className={`${UI.card} ${UI.cardPad} space-y-3`}>
            <h2 className={UI.h2}>Visibilité</h2>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="accent-violet-600"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
              />
              Publier cette place (visible dans la recherche)
            </label>
          </section>

          <div className="flex flex-col sm:flex-row sm:items-center gap-2">
            <button className={`${UI.btnBase} ${UI.btnPrimary}`} disabled={saving} type="submit">
              {saving ? "Sauvegarde…" : "Enregistrer"}
            </button>

            <Link className={`${UI.btnBase} ${UI.btnGhost}`} href={`/parkings/${parkingId}`}>
              Voir la page
            </Link>
          </div>
        </form>
      </div>
    </main>
  );
}
