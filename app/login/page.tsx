"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { useAuth } from "../providers/AuthProvider";

function safeNextPath(next: string | null): string {
  if (!next) return "/parkings";
  if (!next.startsWith("/")) return "/parkings";
  if (next.startsWith("//")) return "/parkings";
  return next;
}

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = safeNextPath(searchParams.get("next"));

  const { supabase, ready, session } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (ready && session) {
      router.replace(next);
    }
  }, [ready, session, router, next]);

  const onLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    setLoading(false);

    if (error) {
      setError(error.message);
      return;
    }

    toast.success("Connecté ✅");
    // redirection via useEffect
  };

  if (ready && session) {
    return (
      <main className="max-w-md mx-auto p-6">
        <p className="text-sm text-gray-600">Redirection…</p>
      </main>
    );
  }

  return (
    <main className="max-w-md mx-auto p-6">
      <h1 className="text-2xl font-semibold">Connexion</h1>

      <form onSubmit={onLogin} className="mt-6 space-y-3">
        <input
          className="w-full border rounded p-2"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          type="email"
          required
        />
        <input
          className="w-full border rounded p-2"
          placeholder="Mot de passe"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          type="password"
          required
        />

        <button
          type="submit"
          className="w-full border rounded p-2"
          disabled={loading}
        >
          {loading ? "Connexion..." : "Se connecter"}
        </button>

        {error && <p className="text-red-600 text-sm">{error}</p>}
      </form>

      <p className="mt-4 text-sm text-gray-600">
        Pas de compte ?{" "}
        <Link
          className="underline"
          href={`/signup?next=${encodeURIComponent(next)}`}
        >
          Créer un compte
        </Link>
      </p>
    </main>
  );
}
