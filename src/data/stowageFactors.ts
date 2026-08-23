/**
 * Standard cargo stowage factors (ft³/ton).
 * Users can extend this list with their own cargoes (persisted in localStorage).
 */

export interface StowageFactorOption {
  name: string;
  sf: number; // ft3/ton
  custom?: boolean;
}

export const STOWAGE_FACTORS: StowageFactorOption[] = [
  { name: "Agriprods", sf: 53.0 },
  { name: "Agriprods : ble", sf: 44.0 },
  { name: "Agriprods : mais", sf: 56.0 },
  { name: "Alumina", sf: 0.0 },
  { name: "Alu Products", sf: 33.5 },
  { name: "Ammonium Nitrate", sf: 32.5 },
  { name: "Ammonium Sulphate", sf: 36.0 },
  { name: "Ammonium Sulphur", sf: 0.0 },
  { name: "Asbestos Bagged", sf: 107.5 },
  { name: "Bauxite", sf: 29.5 },
  { name: "Billets", sf: 0.0 },
  { name: "Bulk Clay", sf: 19.5 },
  { name: "Bulk concentrates", sf: 0.0 },
  { name: "bulk fertilizer", sf: 54.0 },
  { name: "Canola Seeds", sf: 0.0 },
  { name: "Cashewnuts bagged", sf: 0.0 },
  { name: "Cement", sf: 24.5 },
  { name: "Cement Bagged", sf: 0.0 },
  { name: "Cement Clinkers", sf: 27.5 },
  { name: "Coal", sf: 42.5 },
  { name: "Coal : Black", sf: 40.0 },
  { name: "Coal : Grey", sf: 42.0 },
  { name: "Coils", sf: 0.0 },
  { name: "Coke", sf: 80.0 },
  { name: "Cokebreeze", sf: 0.0 },
  { name: "Coking coal", sf: 43.5 },
  { name: "Copper", sf: 17.5 },
  { name: "Corn", sf: 49.5 },
  { name: "Corn Gluten Feed", sf: 1.0 },
  { name: "Cotton in bales", sf: 0.0 },
  { name: "Di-Amonium Phosphate", sf: 43.5 },
  { name: "Ferro Alloys", sf: 0.0 },
  { name: "Ferro Chrome", sf: 0.0 },
  { name: "Fertilizers in bags", sf: 54.0 },
  { name: "Furnace slag", sf: 0.0 },
  { name: "Grain", sf: 52.0 },
  { name: "Gypsum", sf: 41.5 },
  { name: "HSS", sf: 49.5 },
  { name: "Hvy Grain", sf: 0.0 },
  { name: "Iron Ore", sf: 14.0 },
  { name: "Limestone", sf: 27.0 },
  { name: "Logs", sf: 0.0 },
  { name: "Maize", sf: 49.5 },
  { name: "Manganese ore", sf: 17.5 },
  { name: "Muriate Of Potash", sf: 30.0 },
  { name: "Nickel", sf: 20.0 },
  { name: "Nitrates in bags", sf: 0.0 },
  { name: "Oats", sf: 0.0 },
  { name: "Paper On Pallets", sf: 0.0 },
  { name: "Petroleum Coke", sf: 49.5 },
  { name: "Pig Iron", sf: 0.0 },
  { name: "Pumice", sf: 60.0 },
  { name: "Rebars", sf: 0.0 },
  { name: "Rice", sf: 58.0 },
  { name: "Rice - Bagged", sf: 0.0 },
  { name: "Salt", sf: 35.0 },
  { name: "Sands", sf: 19.5 },
  { name: "Scrap", sf: 36.0 },
  { name: "Slabs", sf: 0.0 },
  { name: "Soda Ash Bagged", sf: 41.5 },
  { name: "Sorghum", sf: 46.5 },
  { name: "Soya Bagged", sf: 31.5 },
  { name: "Soybeans", sf: 50.0 },
  { name: "Steam Coal", sf: 0.0 },
  { name: "Steel billets", sf: 0.0 },
  { name: "Steel plates", sf: 0.0 },
  { name: "Steel profiles", sf: 0.0 },
  { name: "Steel slabs", sf: 0.0 },
  { name: "Steels", sf: 0.0 },
  { name: "Sugar", sf: 41.5 },
  { name: "Sugar Bagged", sf: 0.0 },
  { name: "Sugar Bagged : Test", sf: 27.0 },
  { name: "Sulphur", sf: 31.0 },
  { name: "Sunflowerseeds", sf: 87.5 },
  { name: "Tapioca", sf: 52.5 },
  { name: "Timber", sf: 50.0 },
  { name: "Urea", sf: 52.0 },
  { name: "Wheat", sf: 46.5 },
  { name: "Wheat flour Bagged", sf: 0.0 },
  { name: "Wood Chips", sf: 0.0 },
  { name: "Wric", sf: 55.0 },
  { name: "Zinc Billets", sf: 0.0 },
];

const CUSTOM_KEY = "custom-stowage-factors";

export function loadCustomStowageFactors(): StowageFactorOption[] {
  try {
    const raw = localStorage.getItem(CUSTOM_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((p) => p && typeof p.name === "string" && typeof p.sf === "number")
      .map((p) => ({ name: p.name as string, sf: p.sf as number, custom: true }));
  } catch {
    return [];
  }
}

export function saveCustomStowageFactor(entry: { name: string; sf: number }): StowageFactorOption[] {
  const existing = loadCustomStowageFactors().filter(
    (e) => e.name.toLowerCase() !== entry.name.toLowerCase(),
  );
  const next = [...existing, { ...entry, custom: true }].sort((a, b) => a.name.localeCompare(b.name));
  try {
    localStorage.setItem(CUSTOM_KEY, JSON.stringify(next.map(({ name, sf }) => ({ name, sf }))));
  } catch {
    /* ignore quota errors */
  }
  return next;
}

export function removeCustomStowageFactor(name: string): StowageFactorOption[] {
  const next = loadCustomStowageFactors().filter((e) => e.name !== name);
  try {
    localStorage.setItem(CUSTOM_KEY, JSON.stringify(next.map(({ name: n, sf: s }) => ({ name: n, sf: s }))));
  } catch {
    /* ignore */
  }
  return next;
}
