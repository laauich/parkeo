"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useAuth } from "../providers/AuthProvider";

export default function CreateParkingPage() {
  const { supabase, ready, session } = useAuth();
  const router = useRouter();

  const [title, setTitle] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("Genève");
  const [priceHour, setPriceHour] = useState("");
  const [priceDay, setPriceDay] = useState("");
  const [instructions, setInstructions] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ready) return;
    if (!session) {
      router.replace(`/login?next=${encodeURIComponent("/create-parking")}`);
    }
  }, [ready, session, router]);

  if (!ready) {
    return (
      <main className="max-w-md mx-auto p-6">
        <p className="text-sm text-gray-600">Chargement…</p>
      </main>
    );
  }

  if (!session) {
    return (
      <main className="max-w-md mx-auto p-6">
        <p className="text-sm text-gray-600">Redirection vers login…</p>
      </main>
    );
  }

  const onCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const ph = Number(priceHour);
    const pd = priceDay.trim() === "" ? null : Number(priceDay);

    if (!title.trim() || !address.trim() || !city.trim() || !priceHour.trim()) {
      setError("Merci de remplir les champs obligatoires.");
      setLoading(false);
      return;
    }
    if (Number.isNaN(ph) || ph <= 0) {
      setError("Le prix/heure doit être un nombre > 0.");
      setLoading(false);
      return;
    }
    if (pd !== null && (Number.isNaN(pd) || pd <= 0)) {
      setError("Le prix/jour doit être un nombre > 0 (ou vide).");
      setLoading(false);
      return;
    }

    const { data, error } = await supabase
      .from("parkings")
      .insert({
        title: title.trim(),
        address: address.trim(),
        city: city.trim(),
        price_hour: ph,
        price_day: pd,
        instructions: instructions.trim() ? instructions.trim() : null,
        is_active: true,
      })
      .select("id")
      .single();

    setLoading(false);

    if (error) {
      setError(error.message);
      return;
    }

    toast.success("Place créée 🎉");
    router.replace(`/parkings/${data.id}`);
  };

  return (
    <main className="max-w-3xl mx-auto p-6">
      <h1 className="text-2xl font-semibold">Créer une place</h1>

      <form onSubmit={onCreate} className="mt-6 space-y-3">
        <input
          className="w-full border rounded p-2"
          placeholder="Titre"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
        />

        <input
          className="w-full border rounded p-2"
          placeholder="Adresse"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          required
        />

        <input
          className="w-full border rounded p-2"
          placeholder="Ville"
          value={city}
          onChange={(e) => setCity(e.target.value)}
          required
        />

        <div className="flex flex-wrap gap-3">
          <input
            className="border rounded p-2 flex-1 min-w-[180px]"
            placeholder="Prix / heure (CHF)"
            type="number"
            value={priceHour}
            onChange={(e) => setPriceHour(e.target.value)}
            required
          />
          <input
            className="border rounded p-2 flex-1 min-w-[180px]"
            placeholder="Prix / jour (CHF) (optionnel)"
            type="number"
            value={priceDay}
            onChange={(e) => setPriceDay(e.target.value)}
          />
        </div>

        <textarea
          className="w-full border rounded p-2"
          placeholder="Instructions (optionnel)"
          value={instructions}
          onChange={(e) => setInstructions(e.target.value)}
          rows={4}
        />

        <button type="submit" className="border rounded px-4 py-2" disabled={loading}>
          {loading ? "Création..." : "Créer la place"}
        </button>

        {error && <p className="text-red-600 text-sm">{error}</p>}
      </form>

      <div className="mt-6">
        <Link className="underline" href="/parkings">
          ← Retour aux parkings
        </Link>
      </div>
    </main>
  );
}
