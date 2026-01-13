// app/emails/BookingClientEmail.tsx
import * as React from "react";

export default function BookingClientEmail(props: {
  clientEmail: string;
  parkingTitle: string;
  startTime: string;
  endTime: string;
  totalPrice: number | null;
  currency: string | null;
  bookingId: string;
  appUrl: string;
}) {
  const money =
    props.totalPrice === null ? "—" : `${props.totalPrice} ${(props.currency ?? "CHF").toUpperCase()}`;

  return (
    <div style={{ fontFamily: "Arial, sans-serif", lineHeight: 1.5 }}>
      <h2>Confirmation de réservation</h2>
      <p>Ta réservation a bien été créée :</p>

      <ul>
        <li><b>Place :</b> {props.parkingTitle}</li>
        <li><b>Début :</b> {props.startTime}</li>
        <li><b>Fin :</b> {props.endTime}</li>
        <li><b>Total :</b> {money}</li>
        <li><b>Booking ID :</b> {props.bookingId}</li>
      </ul>

      <p>
        Voir tes réservations :{" "}
        <a href={`${props.appUrl}/my-bookings`}>Mes réservations</a>
      </p>

      <p style={{ color: "#666", fontSize: 12 }}>
        Email envoyé à {props.clientEmail}
      </p>
    </div>
  );
}
