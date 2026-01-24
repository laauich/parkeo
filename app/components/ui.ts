// app/components/ui.ts
export const UI = {
  /* =========================
     Layout
  ========================= */

  // ✅ fond plus punchy (startup vibe)
  page:
    "min-h-[calc(100vh-64px)] min-h-[calc(100dvh-64px)] w-full " +
    "bg-[radial-gradient(1200px_circle_at_15%_-10%,rgba(99,102,241,0.30),transparent_55%),radial-gradient(900px_circle_at_95%_10%,rgba(236,72,153,0.22),transparent_55%),linear-gradient(to_bottom,#ffffff,rgba(255,255,255,0.9))]",

  /** Container FULL WIDTH */
  container: "w-full px-4 sm:px-6 lg:px-8",

  section: "py-8 sm:py-10 lg:py-12",
  sectionTitleRow:
    "flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3",

  /* =========================
     Typography
  ========================= */

  h1:
    "text-3xl sm:text-4xl lg:text-5xl " +
    "font-semibold tracking-tight text-slate-950",

  h2:
    "text-xl sm:text-2xl lg:text-3xl " +
    "font-semibold tracking-tight text-slate-950",

  p: "text-sm sm:text-base text-slate-600 leading-relaxed",
  subtle: "text-xs text-slate-500",

  /* =========================
     Surfaces
  ========================= */

  // ✅ cards plus “premium startup”
  card:
    "bg-white/80 backdrop-blur-xl " +
    "border border-slate-200/70 " +
    "shadow-[0_8px_30px_rgba(15,23,42,0.06)] rounded-2xl",

  cardPad: "p-5 sm:p-6 lg:p-7",

  cardHover:
    "transition " +
    "hover:shadow-[0_16px_50px_rgba(15,23,42,0.10)] hover:-translate-y-[1px] " +
    "hover:border-slate-300/70 hover:bg-white",

  divider: "border-t border-slate-200/70",

  /* =========================
     Buttons
  ========================= */

  btnBase:
    "inline-flex items-center justify-center gap-2 " +
    "font-medium transition select-none whitespace-nowrap " +
    "rounded-xl px-5 py-2.5 text-sm " +
    "focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 " +
    "disabled:opacity-60 disabled:cursor-not-allowed disabled:pointer-events-none",

  // ✅ Bold startup primary: gradient + glow léger
  btnPrimary:
    "text-white " +
    "bg-gradient-to-r from-indigo-600 via-violet-600 to-fuchsia-600 " +
    "hover:from-indigo-500 hover:via-violet-500 hover:to-fuchsia-500 " +
    "shadow-[0_10px_25px_rgba(79,70,229,0.20)] " +
    "focus-visible:ring-violet-300 " +
    "disabled:shadow-none disabled:from-indigo-300 disabled:via-violet-300 disabled:to-fuchsia-300",

  btnSecondary:
    "bg-slate-900 text-white " +
    "hover:bg-slate-800 " +
    "focus-visible:ring-slate-400 " +
    "disabled:bg-slate-400",

  // ✅ Ghost plus clean
  btnGhost:
    "bg-white/80 text-slate-900 " +
    "border border-slate-200/80 " +
    "hover:bg-white " +
    "focus-visible:ring-slate-300",

  btnDanger:
    "bg-rose-600 text-white " +
    "hover:bg-rose-700 " +
    "focus-visible:ring-rose-300 " +
    "disabled:bg-rose-300",

  btnSm: "px-4 py-2 text-sm rounded-xl",
  btnPill: "rounded-full",

  /* =========================
     Links & Nav
  ========================= */

  link:
    "text-violet-700 hover:text-fuchsia-600 " +
    "underline underline-offset-4 transition",

  navLink:
    "text-sm text-slate-700 " +
    "transition px-2.5 py-1.5 rounded-xl " +
    "hover:text-slate-900 hover:bg-slate-100",

  /* =========================
     Chips
  ========================= */

  chip:
    "inline-flex items-center gap-1 rounded-full " +
    "border border-slate-200 bg-slate-50 " +
    "px-2.5 py-1 text-xs text-slate-700",

  chipSuccess:
    "inline-flex items-center gap-1 rounded-full " +
    "border border-emerald-200 bg-emerald-50 " +
    "px-2.5 py-1 text-xs text-emerald-800",

  /* =========================
     Inputs
  ========================= */

  // ✅ on garde UNE seule version (iOS-friendly)
  input: [
    "w-full",
    "rounded-xl",
    "border border-slate-300",
    "bg-white",
    "text-slate-900",
    "placeholder:text-slate-400",
    "text-[16px] leading-6", // IMPORTANT iOS
    "px-3 py-2",
    "outline-none",
    "focus:ring-2 focus:ring-violet-400/40 focus:border-violet-400",
  ].join(" "),

  select:
    "w-full rounded-xl border border-slate-200 bg-white " +
    "px-3 py-3 text-sm outline-none " +
    "focus:ring-2 focus:ring-violet-300/50 focus:border-violet-400",
};
