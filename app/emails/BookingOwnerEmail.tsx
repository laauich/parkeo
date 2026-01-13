// app/emails/BookingOwnerEmail.tsx
import * as React from "react";

export default function BookingOwnerEmail(props: {
  ownerEmail: string;
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
      <h2>Nouvelle réservation</h2>
      <p>Tu as reçu une nouvelle réservation pour :</p>

      <ul>
        <li><b>Place :</b> {props.parkingTitle}</li>
        <li><b>Début :</b> {props.startTime}</li>
        <li><b>Fin :</b> {props.endTime}</li>
        <li><b>Total :</b> {money}</li>
        <li><b>Booking ID :</b> {props.bookingId}</li>
      </ul>

      <p>
        Ouvre Parkeo :{" "}
        <a href={`${props.appUrl}/my-parkings`}>Voir mes places</a>
      </p>

      <p style={{ color: "#666", fontSize: 12 }}>
        Email envoyé à {props.ownerEmail}
      </p>
    </div>
  );
}
