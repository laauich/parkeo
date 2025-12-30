"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useAuth } from "../providers/AuthProvider";

export default function NavbarClient() {
  const { session, ready, signOut } = useAuth();
  const router = useRouter();

  if (!ready) return <span className="text-sm text-gray-500">…</span>;

  const email = session?.user?.email ?? null;

  const onLogout = async () => {
    await signOut();
    toast.success("Déconnecté 👋");
    router.replace("/");
  };

  return (
    <div className="flex items-center gap-3 text-sm">
      {email ? (
        <>
          <span className="text-gray-600">Connecté : {email}</span>
          <button className="underline" onClick={onLogout} type="button">
            Logout
          </button>
        </>
      ) : (
        <>
          <Link className="underline" href="/login">
            Login
          </Link>
          <Link className="underline" href="/signup">
            Signup
          </Link>
        </>
      )}
    </div>
  );
}
