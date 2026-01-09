// app/components/ui.ts
export const UI = {
  /* =========================
     Layout
  ========================= */

  // Page = fond global (prend toute la largeur + toute la hauteur sous la navbar)
  page:
    "min-h-[calc(100vh-64px)] w-full " +
    "bg-gradient-to-b from-violet-200/80 via-white to-white",

  /**
   * Container FULL WIDTH :
   * - occupe 100% de la largeur
   * - padding responsive
   * (Si tu veux un max-width plus tard, on remet max-w-7xl ou max-w-[1400px])
   */
  container: "w-full px-4 sm:px-6 lg:px-8",

  section: "py-8 sm:py-10 lg:py-12",
  sectionTitleRow:
    "flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3",

  /* =========================
     Typography
  ========================= */

  h1:
    "text-3xl sm:text-4xl lg:text-5xl " +
    "font-semibold tracking-tight text-slate-900",

  h2:
    "text-xl sm:text-2xl lg:text-3xl " +
    "font-semibold tracking-tight text-slate-900",

  p: "text-sm sm:text-base text-slate-600 leading-relaxed",
  subtle: "text-xs text-slate-500",

  /* =========================
     Surfaces
  ========================= */

  card:
    "bg-white/85 backdrop-blur " +
    "border border-slate-200/70 " +
    "shadow-sm rounded-2xl",

  cardPad: "p-5 sm:p-6 lg:p-7",

  cardHover:
    "transition " +
    "hover:shadow-md hover:-translate-y-[1px] " +
    "hover:border-slate-300/70 hover:bg-white",

  divider: "border-t border-slate-200/70",

  /* =========================
     Buttons
  ========================= */

  btnBase:
    "inline-flex items-center justify-center gap-2 " +
    "font-medium transition " +
    "rounded-xl px-5 py-2.5 text-sm " +
    "focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",

  // Primary (violet premium)
  btnPrimary:
    "bg-violet-600 text-white " +
    "hover:bg-violet-700 " +
    "focus-visible:ring-violet-300 " +
    "disabled:bg-violet-300 disabled:cursor-not-allowed",

  // Secondary (dark)
  btnSecondary:
    "bg-slate-900 text-white " +
    "hover:bg-slate-800 " +
    "focus-visible:ring-slate-400 " +
    "disabled:bg-slate-400 disabled:cursor-not-allowed",

  // Ghost
  btnGhost:
    "bg-white/80 text-slate-900 " +
    "border border-slate-200 " +
    "hover:bg-slate-50 " +
    "focus-visible:ring-slate-300 " +
    "disabled:opacity-60 disabled:cursor-not-allowed",

  // Danger
  btnDanger:
    "bg-rose-600 text-white " +
    "hover:bg-rose-700 " +
    "focus-visible:ring-rose-300 " +
    "disabled:bg-rose-300 disabled:cursor-not-allowed",

  /* =========================
     Links & Nav
  ========================= */

  link:
    "text-violet-700 hover:text-violet-800 " +
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

  /* =========================
     Inputs
  ========================= */

  input:
    "w-full rounded-xl border border-slate-200 bg-white " +
    "px-4 py-3 text-sm outline-none " +
    "focus:ring-2 focus:ring-violet-200 focus:border-violet-300",

  select:
    "w-full rounded-xl border border-slate-200 bg-white " +
    "px-3 py-3 text-sm outline-none " +
    "focus:ring-2 focus:ring-violet-200 focus:border-violet-300",
};
