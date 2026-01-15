// app/lib/mailer.ts
import { Resend } from "resend";

function mustEnv(name: string) {
  const v = process.env[name];
  if (!v || !v.trim()) throw new Error(`ENV manquante: ${name}`);
  return v;
}

const resend = new Resend(mustEnv("RESEND_API_KEY"));

export function appUrl(path: string) {
  const base = mustEnv("APP_BASE_URL").replace(/\/$/, "");
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${base}${p}`;
}

export async function sendEmail(params: {
  to: string;
  subject: string;
  html: string;
}) {
  const from = mustEnv("EMAIL_FROM");

  const { error } = await resend.emails.send({
    from,
    to: [params.to],
    subject: params.subject,
    html: params.html,
  });

  if (error) {
    throw new Error(
      typeof error === "object" && error && "message" in error
        ? String((error as { message?: unknown }).message)
        : "Erreur Resend"
    );
  }
}

export function escapeHtml(s: string) {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function money(v: number | null, currency?: string | null) {
  if (v == null || Number.isNaN(v)) return "—";
  return `${v} ${(currency ?? "CHF").toUpperCase()}`;
}

function formatDateTime(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("fr-CH", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/* ---------------------------
   EXISTANTS (tu les avais)
--------------------------- */

export function bookingOwnerEmailHtml(args: {
  parkingTitle: string;
  parkingAddress?: string | null;
  startTimeIso: string;
  endTimeIso: string;
  totalPrice: number | null;
  currency: string | null;
  bookingId: string;
}) {
  const title = escapeHtml(args.parkingTitle);
  const addr = escapeHtml(args.parkingAddress ?? "—");
  const price = money(args.totalPrice, args.currency);

  const link = appUrl(`/my-parkings`);

  return `
  <div style="font-family:Arial,sans-serif;line-height:1.4">
    <h2>Nouvelle réservation</h2>
    <p>Une réservation vient d’être créée pour ta place :</p>
    <ul>
      <li><b>Place :</b> ${title}</li>
      <li><b>Adresse :</b> ${addr}</li>
      <li><b>Début :</b> ${escapeHtml(formatDateTime(args.startTimeIso))}</li>
      <li><b>Fin :</b> ${escapeHtml(formatDateTime(args.endTimeIso))}</li>
      <li><b>Total :</b> ${escapeHtml(price)}</li>
      <li><b>ID réservation :</b> ${escapeHtml(args.bookingId)}</li>
    </ul>
    <p><a href="${link}">Ouvrir Parkeo</a></p>
  </div>`;
}

export function bookingClientEmailHtml(args: {
  parkingTitle: string;
  startTimeIso: string;
  endTimeIso: string;
  totalPrice: number | null;
  currency: string | null;
  bookingId: string;
}) {
  const link = appUrl(`/my-bookings`);
  const price = money(args.totalPrice, args.currency);

  return `
  <div style="font-family:Arial,sans-serif;line-height:1.4">
    <h2>Réservation créée ✅</h2>
    <p>Ta réservation a bien été créée :</p>
    <ul>
      <li><b>Place :</b> ${escapeHtml(args.parkingTitle)}</li>
      <li><b>Début :</b> ${escapeHtml(formatDateTime(args.startTimeIso))}</li>
      <li><b>Fin :</b> ${escapeHtml(formatDateTime(args.endTimeIso))}</li>
      <li><b>Total :</b> ${escapeHtml(price)}</li>
      <li><b>ID réservation :</b> ${escapeHtml(args.bookingId)}</li>
    </ul>
    <p>Tu peux retrouver la réservation ici : <a href="${link}">Mes réservations</a></p>
  </div>`;
}

export function messageReceivedEmailHtml(args: {
  parkingTitle?: string | null;
  conversationId: string;
  preview: string;
}) {
  const link = appUrl(`/messages/${args.conversationId}`);
  const title = escapeHtml(args.parkingTitle ?? "Conversation");
  const preview = escapeHtml(args.preview);

  return `
  <div style="font-family:Arial,sans-serif;line-height:1.4">
    <h2>Nouveau message 💬</h2>
    <p><b>${title}</b></p>
    <p style="padding:12px;border:1px solid #eee;border-radius:10px;background:#fafafa">
      ${preview}
    </p>
    <p><a href="${link}">Ouvrir la conversation</a></p>
  </div>`;
}

/* ---------------------------
   NOUVEAU : EMAILS ANNULATION
   (Solution 1: on confirme juste l'annulation)
--------------------------- */

export function bookingCancelledClientEmailHtml(args: {
  parkingTitle: string;
  parkingAddress?: string | null;
  startTimeIso: string;
  endTimeIso: string;
  totalPrice: number | null;
  currency: string | null;
  bookingId: string;
  cancelledBy: "client" | "owner";
}) {
  const title = escapeHtml(args.parkingTitle);
  const addr = escapeHtml(args.parkingAddress ?? "—");
  const price = escapeHtml(money(args.totalPrice, args.currency));
  const start = escapeHtml(formatDateTime(args.startTimeIso));
  const end = escapeHtml(formatDateTime(args.endTimeIso));

  const heading =
    args.cancelledBy === "client"
      ? "Annulation confirmée ✅"
      : "Réservation annulée par le propriétaire ✅";

  const link = appUrl(`/my-bookings`);

  return `
  <div style="font-family:Arial,sans-serif;line-height:1.4">
    <h2>${heading}</h2>
    <p>Voici les détails de la réservation annulée :</p>
    <ul>
      <li><b>Place :</b> ${title}</li>
      <li><b>Adresse :</b> ${addr}</li>
      <li><b>Début :</b> ${start}</li>
      <li><b>Fin :</b> ${end}</li>
      <li><b>Total :</b> ${price}</li>
      <li><b>ID réservation :</b> ${escapeHtml(args.bookingId)}</li>
      <li><b>Statut :</b> Annulée</li>
    </ul>
    <p><a href="${link}">Voir mes réservations</a></p>
  </div>`;
}

export function bookingCancelledOwnerEmailHtml(args: {
  parkingTitle: string;
  parkingAddress?: string | null;
  startTimeIso: string;
  endTimeIso: string;
  totalPrice: number | null;
  currency: string | null;
  bookingId: string;
  cancelledBy: "client" | "owner";
}) {
  const title = escapeHtml(args.parkingTitle);
  const addr = escapeHtml(args.parkingAddress ?? "—");
  const price = escapeHtml(money(args.totalPrice, args.currency));
  const start = escapeHtml(formatDateTime(args.startTimeIso));
  const end = escapeHtml(formatDateTime(args.endTimeIso));

  const heading =
    args.cancelledBy === "client"
      ? "Le client a annulé une réservation ✅"
      : "Annulation confirmée (propriétaire) ✅";

  const link = appUrl(`/my-parkings/bookings`);

  return `
  <div style="font-family:Arial,sans-serif;line-height:1.4">
    <h2>${heading}</h2>
    <p>Voici les détails :</p>
    <ul>
      <li><b>Place :</b> ${title}</li>
      <li><b>Adresse :</b> ${addr}</li>
      <li><b>Début :</b> ${start}</li>
      <li><b>Fin :</b> ${end}</li>
      <li><b>Total :</b> ${price}</li>
      <li><b>ID réservation :</b> ${escapeHtml(args.bookingId)}</li>
      <li><b>Statut :</b> Annulée</li>
    </ul>
    <p><a href="${link}">Voir réservations (mes places)</a></p>
  </div>`;
}
