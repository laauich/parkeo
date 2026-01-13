import { Html, Body, Container, Text, Preview } from "@react-email/components";

export default function NewMessageEmail({
  senderName,
  message,
}: {
  senderName: string;
  message: string;
}) {
  return (
    <Html>
      <Preview>Nouveau message sur Parkeo</Preview>
      <Body style={{ fontFamily: "Arial, sans-serif" }}>
        <Container>
          <Text>Bonjour 👋</Text>

          <Text>
            <strong>{senderName}</strong> t’a envoyé un nouveau message :
          </Text>

          <Text
            style={{
              background: "#f4f4f5",
              padding: "12px",
              borderRadius: "8px",
            }}
          >
            {message}
          </Text>

          <Text>
            Connecte-toi à Parkeo pour répondre.
          </Text>

          <Text style={{ fontSize: "12px", color: "#666" }}>
            — Parkeo
          </Text>
        </Container>
      </Body>
    </Html>
  );
}
