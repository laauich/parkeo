import Link from "next/link";
import MyParkingsClient from "./my-parkings-client";
import { UI } from "@/app/components/ui";

export default function MyParkingsPage() {
  return (
    <main className="max-w-5xl mx-auto p-6 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Mes places</h1>
          <p className="text-sm text-gray-600">
            Active/désactive et modifie tes places.
          </p>
        </div>

        <div className="flex gap-3">
          <Link href="/parkings/new" className={UI.btnPrimary}>
            + Créer une place
          </Link>
          <Link href="/parkings" className={UI.btnGhost}>
            Trouver une place
          </Link>
        </div>
      </div>

      <MyParkingsClient />
    </main>
  );
}
