/**
 * EU/EEA member states for maritime EU ETS applicability.
 * Used as a robust fallback when API flags (is_eu_eea, eca_zone) are missing.
 */

export const EU_EEA_COUNTRIES: Set<string> = new Set([
  // EU Member States
  "Austria", "Belgium", "Bulgaria", "Croatia", "Cyprus", "Czech Republic",
  "Czechia", "Denmark", "Estonia", "Finland", "France", "Germany", "Greece",
  "Hungary", "Ireland", "Italy", "Latvia", "Lithuania", "Luxembourg",
  "Malta", "Netherlands", "Poland", "Portugal", "Romania", "Slovakia",
  "Slovenia", "Spain", "Sweden",
  // EEA (non-EU)
  "Iceland", "Liechtenstein", "Norway",
]);

/**
 * Determine if a port is in the EU/EEA based on available data.
 * Priority: explicit API flag > eca_zone flag > country name lookup
 */
export function isPortEuEea(options: {
  isEuEea?: boolean;
  ecaZone?: boolean;
  country?: string;
}): boolean {
  if (options.isEuEea === true) return true;
  if (options.ecaZone === true) return true;
  if (options.country && EU_EEA_COUNTRIES.has(options.country)) return true;
  return false;
}
