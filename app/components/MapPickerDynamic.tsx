import dynamic from "next/dynamic";

const MapPickerDynamic = dynamic(() => import("./MapPicker"), { ssr: false });

export default MapPickerDynamic;
