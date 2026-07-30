/**
 * Bunker pricing engine.
 *
 * Three fuel accounting options:
 *  - "average"  : weighted average of BOB + all bunkering port lots (quantity weighted
 *                 when quantities are known, otherwise a simple mean of the prices).
 *  - "fifo"     : consumption is drawn from BOB first (BOB price), then from each
 *                 bunkering port lot in sequence order (new port price applies once
 *                 the earlier lot is exhausted).
 *  - ignoreBOB  : BOB is excluded entirely; only bunkering port prices are used.
 */

export type FuelKey = "hsfo" | "vlsfo" | "lsmgo";

export interface FuelLot {
  quantity: number;
  price: number;
}

export interface BunkerPricingInput {
  bob: FuelLot;                 // { quantity: robStart, price }
  portLots: FuelLot[];          // in voyage/bunkering order
  fuelMode?: "average" | "fifo";
  ignoreBOB?: boolean;
}

/** Lots actually usable given the ignoreBOB flag. */
function activeLots({ bob, portLots, ignoreBOB }: BunkerPricingInput): FuelLot[] {
  const lots: FuelLot[] = [];
  if (!ignoreBOB && bob && bob.price > 0) lots.push(bob);
  for (const lot of portLots) if (lot && lot.price > 0) lots.push(lot);
  return lots;
}

/** Weighted-average price across BOB + all bunkering lots. */
export function averagePrice(input: BunkerPricingInput): number {
  const lots = activeLots(input);
  if (lots.length === 0) return input.ignoreBOB ? 0 : input.bob?.price || 0;

  const totalQty = lots.reduce((s, l) => s + Math.max(0, l.quantity || 0), 0);
  if (totalQty > 0) {
    const totalValue = lots.reduce((s, l) => s + Math.max(0, l.quantity || 0) * l.price, 0);
    return totalValue / totalQty;
  }
  // No quantities entered — simple mean of the available prices.
  return lots.reduce((s, l) => s + l.price, 0) / lots.length;
}

/**
 * FIFO cost for a given consumption: BOB is burnt first at BOB price, then each
 * bunkering lot in order. A lot with no quantity entered is treated as unlimited.
 */
export function fifoCost(input: BunkerPricingInput, consumption: number): number {
  const lots = activeLots(input);
  if (consumption <= 0) return 0;
  if (lots.length === 0) return 0;

  let remaining = consumption;
  let cost = 0;

  for (let i = 0; i < lots.length; i++) {
    const lot = lots[i];
    const isLast = i === lots.length - 1;
    const qty = lot.quantity > 0 ? lot.quantity : (i === 0 && !input.ignoreBOB && lots[0] === input.bob ? 0 : Infinity);
    const take = isLast ? remaining : Math.min(remaining, qty);
    cost += take * lot.price;
    remaining -= take;
    if (remaining <= 0) break;
  }

  if (remaining > 0) cost += remaining * lots[lots.length - 1].price;
  return cost;
}

/** Effective $/t applied to the whole consumption for the selected mode. */
export function effectivePrice(input: BunkerPricingInput, consumption: number): number {
  if (input.fuelMode === "fifo") {
    if (consumption <= 0) return averagePrice(input);
    return fifoCost(input, consumption) / consumption;
  }
  return averagePrice(input);
}

/** Build the pricing input for one fuel from a bunker state-like object. */
export function buildFuelPricing(
  bunker: {
    hsfo: { price: number; robStart: number };
    vlsfo: { price: number; robStart: number };
    lsmgo: { price: number; robStart: number };
    fuelMode?: "average" | "fifo";
    ignoreBOB?: boolean;
    portBunkering?: Array<{ hsfo: FuelLot; vlsfo: FuelLot; lsmgo: FuelLot }>;
  },
  fuel: FuelKey,
): BunkerPricingInput {
  return {
    bob: { quantity: bunker[fuel].robStart || 0, price: bunker[fuel].price || 0 },
    portLots: (bunker.portBunkering || []).map((p) => ({
      quantity: p[fuel]?.quantity || 0,
      price: p[fuel]?.price || 0,
    })),
    fuelMode: bunker.fuelMode || "average",
    ignoreBOB: bunker.ignoreBOB || false,
  };
}
