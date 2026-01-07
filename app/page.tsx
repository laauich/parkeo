import Link from "next/link";
import { createClient } from "@supabase/supabase-js";
import { UI } from "@/app/components/ui";

type ParkingCardRow = {
  id: string;
  title: string;
  address: string | null;
  price_hour: number | null;
  price_day: number | null;
  created_at: string;
  is_active: boolean | null;
};

export default async function HomePage() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const { data: parkings } = await supabase
    .from("parkings")
    .select("id,title,address,price_hour,price_day,created_at,is_active")
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(6);

  const rows = (parkings ?? []) as ParkingCardRow[];

  return (
    <main className={UI.page}>
      <div className={[UI.container, UI.section].join(" ")}>
        {/* HERO */}
        <section className={[UI.card, UI.cardPad, "relative overflow-hidden"].join(" ")}>
          {/* ✅ Background image (méthode 2) */}
          <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
            {/* Image */}
            <div
              className="absolute inset-0 bg-cover bg-center"
              style={{ backgroundImage: "url('/home-bg.jpg')" }}
            />
            {/* Overlay lisibilité */}
           <div className="absolute inset-0 bg-white/10" />
            {/* Petit glow premium (tu l’avais déjà, je le garde) */}
            <div className="absolute -top-24 -right-24 h-80 w-80 rounded-full bg-violet-500/12 blur-3xl" />
            <div className="absolute -bottom-28 -left-28 h-80 w-80 rounded-full bg-fuchsia-400/10 blur-3xl" />
          </div>

          <div className="relative">
            <div className="flex flex-wrap items-center gap-2">
              <span className={UI.chip}>📍 Genève</span>
              <span className={UI.chip}>Carte interactive</span>
              <span className={UI.chip}>Réservation rapide</span>
            </div>

            <h1 className={[UI.h1, "mt-4 max-w-3xl"].join(" ")}>
              Parkeo — des places de parking disponibles, au bon endroit.
            </h1>

 <p className="mt-3 max-w-2xl text-base text-slate-900">
  Réservez à l’heure ou à la journée. Propriétaires et pros : mettez
  vos places à disposition en quelques minutes.
</p>



            {/* 2 CTA */}
            <div className="mt-6 flex flex-col sm:flex-row gap-3">
              <Link href="/map" className={[UI.btnBase, UI.btnPrimary].join(" ")}>
                Voir la carte
              </Link>

              <Link href="/parkings/new" className={[UI.btnBase, UI.btnGhost].join(" ")}>
                Proposer ma place
              </Link>
            </div>

          </div>
        </section>

        {/* PREVIEW */}
        <section className="mt-8">
          <div className={UI.sectionTitleRow}>
            <h2 className={UI.h2}>Dernières places</h2>
            <Link href="/parkings" className={UI.link}>
              Voir tout
            </Link>
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {rows.length > 0 ? (
              rows.map((p) => (
                <Link
                  key={p.id}
                  href={`/parkings/${p.id}`}
                  className={[UI.card, UI.cardHover, "block"].join(" ")}
                >
                  <div className={UI.cardPad}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="font-semibold text-slate-900 truncate">
                          {p.title}
                        </div>
                        <div className="mt-1 text-xs text-slate-500">
                          {p.address || "Adresse non renseignée"}
                        </div>
                      </div>

                      <div className="shrink-0 text-right">
                        {p.price_hour !== null ? (
                          <div className="text-sm font-semibold text-slate-900">
                            {p.price_hour} CHF/h
                          </div>
                        ) : (
                          <div className="text-sm text-slate-400">—</div>
                        )}
                        {p.price_day !== null ? (
                          <div className="text-xs text-slate-500">
                            {p.price_day} CHF/j
                          </div>
                        ) : null}
                      </div>
                    </div>

                    <div className="mt-4 flex items-center justify-between">
                      <span className="text-xs text-slate-500">Voir détails →</span>
                      <span className={UI.chip}>Disponible</span>
                    </div>
                  </div>
                </Link>
              ))
            ) : (
              <div className={[UI.card, UI.cardPad].join(" ")}>
                <p className={UI.p}>Aucune place disponible pour le moment.</p>
                <div className="mt-4">
                  <Link
                    href="/parkings/new"
                    className={[UI.btnBase, UI.btnPrimary].join(" ")}
                  >
                    Proposer une place
                  </Link>
                </div>
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
