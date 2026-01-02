"use client";

import dynamic from "next/dynamic";

type Props = {
  value: { lat: number; lng: number } | null;
  onChange: (pos: { lat: number; lng: number } | null) => void;
};

const MapPickerLeaflet = dynamic(() => import("./MapPickerLeaflet"), {
  ssr: false,
  loading: () => (
    <div className="h-[320px] w-full flex items-center justify-center text-sm text-gray-600">
      Chargement de la carte…
    </div>
  ),
});

export default function MapPicker(props: Props) {
  return <MapPickerLeaflet {...props} />;
}
