/**
 * Speed-context helpers.
 *
 * A speed context is two letters: <speed profile><fuel>
 *   E = Eco speed, F = Full speed
 *   V = VLSFO, L = LSMGO, H = HSFO (scrubber-fitted vessels only)
 *
 * Scrubber-fitted vessels may burn HSFO inside ECA zones too, so the ECA
 * column accepts EH / FH as well.
 */
export type ContextFuel = "hsfo" | "vlsfo" | "lsmgo";

export const contextProfile = (ctx?: string): "eco" | "full" =>
  (ctx || "").toUpperCase().startsWith("F") ? "full" : "eco";

export function contextFuel(ctx: string | undefined, fallback: ContextFuel): ContextFuel {
  const letter = (ctx || "").toUpperCase().slice(1, 2);
  if (letter === "H") return "hsfo";
  if (letter === "V") return "vlsfo";
  if (letter === "L") return "lsmgo";
  return fallback;
}

export const buildContext = (profile: "eco" | "full", fuel: ContextFuel): string =>
  `${profile === "eco" ? "E" : "F"}${fuel === "hsfo" ? "H" : fuel === "lsmgo" ? "L" : "V"}`;

export const FUEL_LABEL: Record<ContextFuel, string> = {
  hsfo: "HSFO + Scrubber",
  vlsfo: "VLSFO",
  lsmgo: "LSMGO",
};
