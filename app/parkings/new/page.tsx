// app/parkings/new/page.tsx
import NewClient from "./NewParkingClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default function NewParkingPage() {
  return <NewClient />;
}
