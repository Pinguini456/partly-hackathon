// The vehicles the bundled dataset actually covers. Split deliberately:
// the first group has full OEM catalogues (so parts get real part numbers
// and highlighted diagrams), the second has damage footage only. Uploading
// one of the second group is the brief's own low-coverage edge case, and
// the pipeline falls back to reading part names off the transcript rather
// than failing — see identify-parts' freeform path.

export type VehicleEntry = {
  slug: string;
  label: string;
  plate: string;
  hasCatalogue: boolean;
};

export const VEHICLES: VehicleEntry[] = [
  { slug: "toyota-yaris-qmn16", label: "Toyota Yaris", plate: "QMN16", hasCatalogue: true },
  { slug: "toyota-prius-pkw74", label: "Toyota Prius", plate: "PKW74", hasCatalogue: true },
  { slug: "toyota-hiace-nye733", label: "Toyota Hiace", plate: "NYE733", hasCatalogue: true },
  { slug: "hyundai-iload-ezu765", label: "Hyundai iLoad", plate: "EZU765", hasCatalogue: true },
  { slug: "hyundai-santafe-pns53", label: "Hyundai Santa Fe", plate: "PNS53", hasCatalogue: true },
  { slug: "jaguar-epace-rfh447", label: "Jaguar E-Pace", plate: "RFH447", hasCatalogue: true },
  { slug: "mitsubishi-outlander-rlp440", label: "Mitsubishi Outlander", plate: "RLP440", hasCatalogue: true },
  { slug: "nissan-silvia-rft360", label: "Nissan Silvia", plate: "RFT360", hasCatalogue: true },
  { slug: "holden-barina-nue975", label: "Holden Barina", plate: "NUE975", hasCatalogue: false },
  { slug: "nissan-juke-jzu83", label: "Nissan Juke", plate: "JZU83", hasCatalogue: false },
  { slug: "renault-pbu474", label: "Renault", plate: "PBU474", hasCatalogue: false },
  { slug: "suzuki-nns414", label: "Suzuki", plate: "NNS414", hasCatalogue: false },
];

export function findVehicle(slug: string | null | undefined): VehicleEntry | null {
  if (!slug) return null;
  return VEHICLES.find((v) => v.slug === slug) ?? null;
}

/** Human-readable name for a slug, falling back to de-slugging the plate off. */
export function vehicleLabel(slug: string | null | undefined): string {
  if (!slug) return "Vehicle pending";
  const known = findVehicle(slug);
  if (known) return known.label;
  const words = slug.split("-").slice(0, -1);
  if (!words.length) return slug;
  return words.map((w) => w[0]?.toUpperCase() + w.slice(1)).join(" ");
}

export function vehiclePlate(slug: string | null | undefined): string | null {
  return findVehicle(slug)?.plate ?? null;
}
