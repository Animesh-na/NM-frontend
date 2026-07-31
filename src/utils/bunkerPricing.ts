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
  /**
   * FIFO coverage: consumption (mt) burnt under each lot's price, aligned to
   * [BOB, ...portLots]. When present, FIFO pricing is the consumption-weighted
   * average of the lot prices:
   *   Σ(price_i × coverage_i) / Σ(coverage_i)
   */
  coverage?: number[];
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
 * bunkering lot in order.
 *
 * Quantities are optional in the UI (prices only). When a lot has no quantity,
 * the consumption that is left after the quantified lots (e.g. BOB ROB) is
 * shared equally between the remaining un-quantified lots, so the effective
 * price is a weighted value *between* the lot prices across the voyage rather
 * than collapsing onto a single lot's price.
 */
export function fifoCost(input: BunkerPricingInput, consumption: number): number {
  if (consumption <= 0) return 0;

  // Preferred path: consumption actually covered by each price lot.
  const weighted = coverageWeightedPrice(input);
  if (weighted !== null) return consumption * weighted;

  const lots = activeLots(input);
  if (lots.length === 0) return 0;

  let remaining = consumption;
  let cost = 0;
  const bobIncluded = !input.ignoreBOB && lots[0] === input.bob;

  // Quantities we actually know (BOB ROB + any lot with an entered quantity).
  const knownQty = lots.map((lot, i) => {
    const isBob = i === 0 && bobIncluded;
    if (isBob) return Math.max(0, lot.quantity || 0);
    return lot.quantity > 0 ? lot.quantity : 0;
  });
  const unknownCount = lots.filter((lot, i) => !(i === 0 && bobIncluded) && !(lot.quantity > 0)).length;

  // Consumption left once every quantified lot is burnt, spread evenly over the
  // un-quantified lots so each bunkering price contributes to the blend.
  const quantifiedTotal = knownQty.reduce((s, q) => s + q, 0);
  const sharePerUnknown = unknownCount > 0
    ? Math.max(0, consumption - quantifiedTotal) / unknownCount
    : 0;

  for (let i = 0; i < lots.length; i++) {
    const lot = lots[i];
    const isLast = i === lots.length - 1;
    const isBob = i === 0 && bobIncluded;
    const hasQty = isBob || lot.quantity > 0;
    const qty = hasQty ? knownQty[i] : sharePerUnknown;
    const take = isLast ? remaining : Math.min(remaining, qty);
    cost += take * lot.price;
    remaining -= take;
    if (remaining <= 0) break;
  }

  if (remaining > 0) cost += remaining * lots[lots.length - 1].price;
  return cost;
}

/**
 * Consumption-weighted price across the voyage:
 *   ((p1 × c1) + (p2 × c2) + … + (pn × cn)) / (c1 + c2 + … + cn)
 * where ci is the fuel burnt while lot i's price applies.
 * Returns null when no usable coverage was supplied.
 */
export function coverageWeightedPrice(input: BunkerPricingInput): number | null {
  const cov = input.coverage;
  if (!cov || cov.length === 0) return null;

  const prices = [input.bob?.price || 0, ...input.portLots.map((l) => l?.price || 0)];
  let value = 0;
  let qty = 0;
  let carried = 0; // coverage from skipped lots (BOB ignored / zero price)

  for (let i = 0; i < prices.length; i++) {
    const c = Math.max(0, cov[i] || 0);
    const skip = (i === 0 && input.ignoreBOB) || prices[i] <= 0;
    if (skip) {
      carried += c;
      continue;
    }
    value += prices[i] * (c + carried);
    qty += c + carried;
    carried = 0;
  }

  if (carried > 0 && qty > 0) {
    // Trailing coverage with no valid price → keep it on the last used price.
    const lastPrice = value / qty;
    value += lastPrice * carried;
    qty += carried;
  }

  if (qty <= 0) return null;
  return value / qty;
}

/** Effective $/t applied to the whole consumption for the selected mode. */
export function effectivePrice(input: BunkerPricingInput, consumption: number): number {
  if (input.fuelMode === "fifo") {
    const weighted = coverageWeightedPrice(input);
    if (weighted !== null) return weighted;
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
  coverage?: number[],
): BunkerPricingInput {
  return {
    bob: { quantity: bunker[fuel].robStart || 0, price: bunker[fuel].price || 0 },
    portLots: (bunker.portBunkering || []).map((p) => ({
      quantity: p[fuel]?.quantity || 0,
      price: p[fuel]?.price || 0,
    })),
    fuelMode: bunker.fuelMode || "average",
    ignoreBOB: bunker.ignoreBOB || false,
    coverage,
  };
}
