"use client";

import Link from "next/link";
import { useAuth } from "../providers/AuthProvider";

export default function NavLinksClient() {
  const { ready, session } = useAuth();

  if (!ready) return null;
  if (!session) return null;

  return (
    <Link className="underline" href="/create-parking">
      Créer une place
    </Link>
  );
}
