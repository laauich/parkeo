// app/lib/resend.ts
import "server-only";
import { Resend } from "resend";

function mustEnv(name: string) {
  const v = process.env[name];
  if (!v || !v.trim()) throw new Error(`ENV manquante: ${name}`);
  return v;
}

export const resend = new Resend(mustEnv("RESEND_API_KEY"));

export function getFromEmail() {
  return mustEnv("RESEND_FROM");
}

export function getAppUrl() {
  return (process.env.APP_URL && process.env.APP_URL.trim()) || "https://parkeo.ch";
}
