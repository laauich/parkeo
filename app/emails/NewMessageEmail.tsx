// app/emails/NewMessageEmail.tsx
import * as React from "react";

export default function NewMessageEmail(props: {
  toEmail: string;
  fromLabel: string; // "Client" ou "Propriétaire"
  preview: string;
  conversationId: string;
  appUrl: string;
}) {
  return (
    <div style={{ fontFamily: "Arial, sans-serif", lineHeight: 1.5 }}>
      <h2>Nouveau message</h2>
      <p>
        Tu as reçu un nouveau message de <b>{props.fromLabel}</b>.
      </p>

      <div style={{ padding: 12, background: "#f6f6f6", borderRadius: 8 }}>
        <i>{props.preview}</i>
      </div>

      <p style={{ marginTop: 16 }}>
        Ouvrir la conversation :{" "}
        <a href={`${props.appUrl}/messages/${props.conversationId}`}>Voir le chat</a>
      </p>

      <p style={{ color: "#666", fontSize: 12 }}>
        Email envoyé à {props.toEmail}
      </p>
    </div>
  );
}
