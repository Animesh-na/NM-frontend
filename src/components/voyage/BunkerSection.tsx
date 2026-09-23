import { useState, useRef, useCallback, useEffect } from "react";
import { useVoyageContext, type FuelAccountingMode } from "@/context/VoyageContext";
import { getBunkerPrices } from "@/services/marineApi";
import { BunkerPriceDialog } from "./BunkerPriceDialog";
import { toast } from "@/hooks/use-toast";
import { InfoTooltip } from "./InfoTooltip";
import { buildFuelPricing, effectivePrice } from "@/utils/bunkerPricing";
import { computeFifoCoverage, orderBunkerLots } from "@/utils/fuelBreakdown";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";

export function BunkerSection() {
  const { 
    bunker, updateBunker, updateBunkerField, addPortBunkering, removePortBunkering,
    updatePortBunkering, results, sequence, vessel 
  } = useVoyageContext();
  
  const [isExpanded, setIsExpanded] = useState(true);
  const bunkeringPorts = sequence.filter(row => row.operation === "bunkering" && row.port);

  // ---- Live bunker price feed -------------------------------------------
  // BOB price port = opening port (first row of the sequence); if that has no
  // port set, fall back to the first loading port, then any port.
  const openingRow = sequence[0]?.port ? sequence[0] : undefined;
  const bobPortRow =
    openingRow ||
    sequence.find(r => r.operation === "loading" && r.port) ||
    sequence.find(r => r.port);
  const bobPortName = bobPortRow?.port || "";
  const [fetching, setFetching] = useState(false);
  type FeedQuote = { port: string; hsfo: number | null; vlsfo: number | null; lsmgo: number | null; updatedAt?: string };
  const [feed, setFeed] = useState<FeedQuote[]>([]);
  const [feedAt, setFeedAt] = useState<string | null>(null);
  const autoFilled = useRef<Set<string>>(new Set());

  // Price lookup modal (opened by double-clicking a $/t field)
  const [priceLookup, setPriceLookup] = useState<
    { fuel: "hsfo" | "vlsfo" | "lsmgo"; scope: string; search: string; target: string } | null
  >(null);

  const fetchPrices = useCallback(async (opts: { force: boolean }) => {
    const targets: { key: string; name: string; apply: (q: { hsfo: number | null; vlsfo: number | null; lsmgo: number | null }) => void }[] = [];

    if (bobPortName) {
      const bobEmpty = !bunker.hsfo.price && !bunker.vlsfo.price && !bunker.lsmgo.price;
      if (opts.force || bobEmpty) {
        targets.push({
          key: `bob:${bobPortName}`,
          name: bobPortName,
          apply: (q) => {
            if (q.hsfo !== null) updateBunker("hsfo", "price", q.hsfo);
            if (q.vlsfo !== null) updateBunker("vlsfo", "price", q.vlsfo);
            if (q.lsmgo !== null) updateBunker("lsmgo", "price", q.lsmgo);
          },
        });
      }
    }

    for (const p of bunker.portBunkering) {
      const empty = !p.hsfo.price && !p.vlsfo.price && !p.lsmgo.price;
      if (!p.portName) continue;
      if (opts.force || empty) {
        targets.push({
          key: `port:${p.id}:${p.portName}`,
          name: p.portName,
          apply: (q) => {
            if (q.hsfo !== null) updatePortBunkering(p.id, "hsfo", "price", q.hsfo);
            if (q.vlsfo !== null) updatePortBunkering(p.id, "vlsfo", "price", q.vlsfo);
            if (q.lsmgo !== null) updatePortBunkering(p.id, "lsmgo", "price", q.lsmgo);
          },
        });
      }
    }

    const pending = targets.filter(t => opts.force || !autoFilled.current.has(t.key));
    if (!pending.length) return;

    setFetching(true);
    try {
      const quotes = await Promise.all(pending.map(t => getBunkerPrices(t.name)));
      let hits = 0;
      const collected: FeedQuote[] = [];
      pending.forEach((t, i) => {
        autoFilled.current.add(t.key);
        const q = quotes[i];
        if (q) {
          t.apply(q);
          hits++;
          collected.push({ port: t.name, hsfo: q.hsfo, vlsfo: q.vlsfo, lsmgo: q.lsmgo, updatedAt: q.updatedAt });
        }
      });
      if (collected.length) {
        setFeed(prev => {
          const map = new Map(prev.map(f => [f.port.toLowerCase(), f]));
          collected.forEach(c => map.set(c.port.toLowerCase(), c));
          return Array.from(map.values());
        });
        setFeedAt(new Date().toLocaleString());
      }
      if (opts.force) {
        toast(hits
          ? { title: "Bunker prices updated", description: `Latest prices loaded for ${hits} port${hits > 1 ? "s" : ""}.` }
          : { title: "No prices found", description: "The price feed returned no data for these ports.", variant: "destructive" });
      }
    } finally {
      setFetching(false);
    }
  }, [bobPortName, bunker.hsfo.price, bunker.vlsfo.price, bunker.lsmgo.price, bunker.portBunkering, updateBunker, updatePortBunkering]);

  // One-time auto-fill per port while the fields are still empty. Saved or
  // manually edited values are never overwritten automatically.
  useEffect(() => {
    fetchPrices({ force: false });
  }, [fetchPrices]);

  // Prune stale state when bunkering calls are removed from the sequence:
  // drop their price rows, their market-feed quotes and their auto-fill marker.
  useEffect(() => {
    const validUnlocs = new Set(bunkeringPorts.map(p => p.portUnloc));
    const stale = bunker.portBunkering.filter(p => !validUnlocs.has(p.portUnloc));
    if (stale.length) {
      stale.forEach(p => {
        removePortBunkering(p.id);
        autoFilled.current.delete(`port:${p.id}:${p.portName}`);
      });
    }
  }, [bunkeringPorts, bunker.portBunkering, removePortBunkering]);

  // Auto-add a price row for every bunkering call in the sequence.
  useEffect(() => {
    bunkeringPorts.forEach(p => {
      if (!bunker.portBunkering.some(pb => pb.portUnloc === p.portUnloc)) {
        addPortBunkering(p.portUnloc, p.port);
      }
    });
  }, [bunkeringPorts, bunker.portBunkering, addPortBunkering]);

  // Keep the market feed limited to ports still relevant to the voyage.
  useEffect(() => {
    const allowed = new Set(
      [bobPortName, ...bunker.portBunkering.map(p => p.portName)]
        .filter(Boolean)
        .map(n => n.toLowerCase()),
    );
    setFeed(prev => {
      const next = prev.filter(f => allowed.has(f.port.toLowerCase()));
      return next.length === prev.length ? prev : next;
    });
  }, [bobPortName, bunker.portBunkering]);

  const totalBunkeredHsfo = bunker.portBunkering.reduce((sum, p) => sum + p.hsfo.quantity, 0);
  const totalBunkeredVlsfo = bunker.portBunkering.reduce((sum, p) => sum + p.vlsfo.quantity, 0);
  const totalBunkeredLsmgo = bunker.portBunkering.reduce((sum, p) => sum + p.lsmgo.quantity, 0);

  // When BOB is ignored, its price AND its tonnes are excluded everywhere.
  const bobIgnored = !!bunker.ignoreBOB;
  const bobTonnes = (fuel: 'hsfo' | 'vlsfo' | 'lsmgo') => (bobIgnored ? 0 : bunker[fuel].robStart || 0);

  const robEndHsfo = bobTonnes("hsfo") + totalBunkeredHsfo - results.hsfoConsumption;
  const robEndVlsfo = bobTonnes("vlsfo") + totalBunkeredVlsfo - results.vlsfoConsumption;
  const robEndLsmgo = bobTonnes("lsmgo") + totalBunkeredLsmgo - results.lsmgoConsumption;

  const consumptionOf = {
    hsfo: results.hsfoConsumption,
    vlsfo: results.vlsfoConsumption,
    lsmgo: results.lsmgoConsumption,
  } as const;

  // Available tonnes (BOB, unless ignored, + all bunkering lots) must cover
  // the voyage consumption, fuel by fuel.
  const shortfalls = ([
    { label: "HSFO", available: bobTonnes("hsfo") + totalBunkeredHsfo, consumed: results.hsfoConsumption },
    { label: "VLSFO", available: bobTonnes("vlsfo") + totalBunkeredVlsfo, consumed: results.vlsfoConsumption },
    { label: "LSMGO", available: bobTonnes("lsmgo") + totalBunkeredLsmgo, consumed: results.lsmgoConsumption },
  ] as const)
    .filter(f => f.consumed > 0.05 && f.available + 1e-6 < f.consumed)
    .map(f => ({ ...f, short: f.consumed - f.available }));


  // Same consumption-weighted FIFO coverage the engine uses — lots first
  // aligned to the order their bunkering calls occur in the voyage.
  const orderedLots = orderBunkerLots(sequence, bunker.portBunkering);
  const pricingBunker = { ...bunker, portBunkering: orderedLots };
  const fifoCoverage = computeFifoCoverage(
    sequence,
    vessel,
    orderedLots,
    bunker.rewardFactor ?? 1,
  );

  // Mirrors the calculation engine: average / FIFO / ignore-BOB pricing
  const getAveragePrice = (fuelType: 'hsfo' | 'vlsfo' | 'lsmgo') =>
    effectivePrice(buildFuelPricing(pricingBunker, fuelType, fifoCoverage[fuelType]), consumptionOf[fuelType]);

  // Per-lot price/coverage breakdown for the tooltip
  const getPriceBreakdown = (fuelType: 'hsfo' | 'vlsfo' | 'lsmgo') => {
    const lots = [
      { label: "BOB", price: bobIgnored ? 0 : bunker[fuelType].price || 0, skipped: bobIgnored, tonnes: bobTonnes(fuelType) },
      ...orderedLots.map((p) => ({
        label: p.portName,
        price: p[fuelType]?.price || 0,
        skipped: false,
        tonnes: p[fuelType]?.quantity || 0,
      })),
    ];
    const cov = fifoCoverage[fuelType] || [];
    const isFifo = bunker.fuelMode === "fifo";
    const hasTonnes = lots.some((l) => !l.skipped && l.tonnes > 0);
    const consumption = consumptionOf[fuelType];

    // FIFO with entered tonnages: draw BOB tonnes first, then each lot in order.
    let remaining = consumption;
    const rows = lots.map((l, i) => {
      let coverage = Math.max(0, cov[i] || 0);
      if (isFifo && hasTonnes) {
        const isLast = i === lots.length - 1;
        const take = l.skipped ? 0 : isLast ? remaining : Math.min(remaining, l.tonnes);
        coverage = Math.max(0, take);
        remaining = Math.max(0, remaining - coverage);
      }
      return { ...l, coverage };
    });
    const used = rows.filter((r) => !r.skipped && r.price > 0);
    const effective = getAveragePrice(fuelType);

    if (isFifo) {
      const num = used.map((r) => `(${r.price.toFixed(0)} × ${r.coverage.toFixed(1)})`).join(" + ");
      const den = used.map((r) => r.coverage.toFixed(1)).join(" + ");
      return {
        formula: used.length
          ? `[${num}] / (${den}) = $${effective.toFixed(2)}/t`
          : `No priced fuel lots → $${effective.toFixed(2)}/t`,
        description:
          (hasTonnes
            ? "FIFO: BOB tonnes burnt first at BOB price, then each bunkering lot in order. "
            : "FIFO: consumption-weighted price. ") +
          rows
            .map((r) => `${r.label}: $${r.price.toFixed(0)}/t over ${r.coverage.toFixed(1)} t${r.skipped ? " (BOB ignored)" : ""}`)
            .join(" · "),
      };
    }


    return {
      formula: used.length
        ? `avg(${used.map((r) => `$${r.price.toFixed(0)}`).join(", ")}) = $${effective.toFixed(2)}/t`
        : `No priced fuel lots → $${effective.toFixed(2)}/t`,
      description:
        "Average mode: quantity-weighted where quantities exist, otherwise the mean of all lot prices. " +
        rows.map((r) => `${r.label}: $${r.price.toFixed(0)}/t${r.skipped ? " (ignored)" : ""}`).join(" · "),
    };
  };

  const fuels = ["hsfo", "vlsfo", "lsmgo"] as const;

  return (
    <div className="calc-card-row">
      <button
        data-readonly-allowed="true"
        onClick={() => setIsExpanded(!isExpanded)}
        className="section-header-vertical"
        title="Bunker"
      >
        <span>Bunker</span>
      </button>

      {isExpanded && (
        <div className="flex-1 min-w-0 p-2 space-y-2">
          {/* Global Controls - single line */}
          <div className="flex flex-wrap gap-x-3 gap-y-1.5 items-center">
            <div className="flex items-center gap-1">
              <span className="text-[10px] text-muted-foreground">CO2 COST (EU ETS)</span>
              <div className="input-with-unit">
              <input type="number" className="form-input-sm field-numeric w-20 text-xs"
                value={bunker.euEtsPrice || ""} onChange={(e) => updateBunkerField("euEtsPrice", parseFloat(e.target.value) || 0)} placeholder="0" />
              <span className="unit">$ / t</span>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <span className="text-[10px] text-muted-foreground">CO2 COST (UK ETS)</span>
              <div className="input-with-unit">
              <input type="number" className="form-input-sm field-numeric w-20 text-xs"
                value={bunker.ukEtsPrice || ""} onChange={(e) => updateBunkerField("ukEtsPrice", parseFloat(e.target.value) || 0)} placeholder="0" />
              <span className="unit">$ / t</span>
              </div>
            </div>
            {bunker.portBunkering.length > 0 && (
            <>
            <RadioGroup value={bunker.fuelMode} onValueChange={(value) => updateBunkerField("fuelMode", value as FuelAccountingMode)} className="flex gap-3 items-center">
              <div className="flex items-center space-x-1">
                <RadioGroupItem value="average" id="average" className="h-3.5 w-3.5" />
                <Label htmlFor="average" className="text-[10px] cursor-pointer">Avg</Label>
              </div>
              <div className="flex items-center space-x-1">
                <RadioGroupItem value="fifo" id="fifo" className="h-3.5 w-3.5" />
                <Label htmlFor="fifo" className="text-[10px] cursor-pointer">FIFO</Label>
              </div>
            </RadioGroup>
            <div className="flex items-center gap-1">
              <Checkbox id="ignoreBOB" checked={bunker.ignoreBOB} onCheckedChange={(checked) => updateBunkerField("ignoreBOB", checked === true)} className="h-3.5 w-3.5" />
              <Label htmlFor="ignoreBOB" className="text-[10px] cursor-pointer">Ignore BOB</Label>
            </div>
            </>
            )}
            <div className="flex items-center gap-1">
              <span
                className="text-[10px] text-muted-foreground"
                title="Reward factor for wind-assisted propulsion — adjusts FuelEU GHG intensity only (GHGadjusted = GHGcalculated × f). No impact on fuel consumption."
              >
                Wind Reward (FuelEU)
              </span>
              <select
                className="form-input-sm w-16 font-mono text-right text-xs"
                value={String(bunker.rewardFactor ?? 1)}
                onChange={(e) => updateBunkerField("rewardFactor", parseFloat(e.target.value) || 1)}
              >
                <option value="1">1.00</option>
                <option value="0.99">0.99</option>
                <option value="0.97">0.97</option>
                <option value="0.95">0.95</option>
              </select>
            </div>
          </div>

          {/* BOB + bunkering port rows — one row per source */}
          <div className="border border-border rounded overflow-hidden">
            <div className={`grid grid-cols-1 sm:grid-cols-[minmax(72px,auto)_repeat(3,minmax(0,1fr))] items-center divide-y sm:divide-y-0 sm:divide-x divide-border ${bobIgnored ? "opacity-50" : ""}`}>
              <div className="px-2 py-0.5 text-[10px] font-semibold whitespace-nowrap">
                BOB{bobIgnored && <span className="ml-1 text-[9px] font-normal text-muted-foreground">(ignored)</span>}
              </div>
              {fuels.map(fuel => (
                <div key={fuel} className="min-w-0 flex items-center gap-1 px-2 py-0.5">
                  <span className="text-[10px] font-medium shrink-0">{fuel.toUpperCase()}</span>
                  <div className="input-with-unit min-w-0 flex-1">
                    <input type="number" disabled={bobIgnored} className="form-input-sm w-full min-w-0 flex-1 font-mono text-right text-xs"
                      value={bunker[fuel].robStart || ""} onChange={(e) => updateBunker(fuel, "robStart", parseFloat(e.target.value) || 0)} placeholder="0" />
                    <span className="unit">t</span>
                  </div> <span>@</span>
                  <div className="input-with-unit min-w-0 flex-1">
                    <input type="number" disabled={bobIgnored} className="form-input-sm w-full min-w-0 flex-1 font-mono text-right text-xs"
                      title="Double-click to look up latest market prices"
                      onDoubleClick={() => setPriceLookup({ fuel, scope: "bob", search: bobPortName, target: bobPortName ? `BOB (${bobPortName})` : "BOB" })}
                      value={bunker[fuel].price || ""} onChange={(e) => updateBunker(fuel, "price", parseFloat(e.target.value) || 0)} placeholder="0" />
                    <span className="unit">$ / t</span>
                  </div>
                </div>
              ))}
            </div>

            {bunker.portBunkering.map((port) => (
              <div key={port.id} className="grid grid-cols-1 sm:grid-cols-[minmax(72px,auto)_repeat(3,minmax(0,1fr))] items-center divide-y sm:divide-y-0 sm:divide-x divide-border border-t border-border">
                <div className="px-2 py-0.5 text-[10px] font-semibold whitespace-nowrap">{port.portName}</div>
                {fuels.map(fuel => (
                  <div key={fuel} className="min-w-0 flex items-center gap-1 px-2 py-0.5">
                    <span className="text-[10px] font-medium shrink-0">{fuel.toUpperCase()}</span>
                    <div className="input-with-unit min-w-0 flex-1">
                      <input type="number" className="form-input-sm w-full min-w-0 flex-1 font-mono text-right text-xs"
                        value={port[fuel].quantity || ""} onChange={(e) => updatePortBunkering(port.id, fuel, "quantity", parseFloat(e.target.value) || 0)} placeholder="0" />
                      <span className="unit">t</span>
                    </div> <span>@</span>
                    <div className="input-with-unit min-w-0 flex-1">
                      <input type="number" className="form-input-sm w-full min-w-0 flex-1 font-mono text-right text-xs"
                        title="Double-click to look up latest market prices"
                        onDoubleClick={() => setPriceLookup({ fuel, scope: port.id, search: port.portName, target: port.portName })}
                        value={port[fuel].price || ""} onChange={(e) => updatePortBunkering(port.id, fuel, "price", parseFloat(e.target.value) || 0)} placeholder="0" />
                      <span className="unit">$ / t</span>
                    </div>
                  </div>
                ))}
              </div>
            ))}

            {shortfalls.length > 0 && (
              <div className="px-2 py-1 text-[9px] text-destructive border-t border-border">
                Insufficient fuel: {shortfalls.map(s => `${s.label} short ${s.short.toFixed(1)} t (available ${s.available.toFixed(1)} t vs consumption ${s.consumed.toFixed(1)} t)`).join(" · ")}
              </div>
            )}
          </div>

          {/* Live market feed — what the last refresh returned */}
          {feed.length > 0 && (
            <div className="border border-border rounded overflow-hidden">
              <div className="subsection-header px-2 py-0.5 text-[10px] font-medium border-b border-border flex items-center justify-between">
                <span>Market Feed</span>
                {feedAt && <span className="text-[9px] font-normal text-muted-foreground">Fetched {feedAt}</span>}
              </div>
              <table className="w-full text-[10px]">
                <thead>
                  <tr className="text-muted-foreground">
                    <th className="text-left px-2 py-0.5 font-medium">Port</th>
                    <th className="text-right px-2 py-0.5 font-medium">HSFO</th>
                    <th className="text-right px-2 py-0.5 font-medium">VLSFO</th>
                    <th className="text-right px-2 py-0.5 font-medium">LSMGO</th>
                    <th className="text-right px-2 py-0.5 font-medium">Published</th>
                  </tr>
                </thead>
                <tbody>
                  {feed.map(f => (
                    <tr key={f.port} className="border-t border-border">
                      <td className="px-2 py-0.5">{f.port}</td>
                      <td className="px-2 py-0.5 text-right font-mono">{f.hsfo !== null ? f.hsfo.toFixed(2) : "—"}</td>
                      <td className="px-2 py-0.5 text-right font-mono">{f.vlsfo !== null ? f.vlsfo.toFixed(2) : "—"}</td>
                      <td className="px-2 py-0.5 text-right font-mono">{f.lsmgo !== null ? f.lsmgo.toFixed(2) : "—"}</td>
                      <td className="px-2 py-0.5 text-right text-muted-foreground">
                        {f.updatedAt ? new Date(f.updatedAt).toLocaleDateString() : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}


          {/* Summary - only when bunkering ports exist */}
          {bunkeringPorts.length > 0 && (
          <details className="border border-border rounded overflow-hidden">
            <summary className="subsection-header px-2 py-1 cursor-pointer text-[10px] font-medium flex items-center justify-between">
              <span>Summary</span>
              <span className="font-mono text-primary">${results.totalBunkerCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            </summary>
            <table className="w-full text-xs">
              <thead>
                <tr className="subsection-header">
                  <th className="text-left px-2 py-1 text-[10px] font-medium">Fuel</th>
                  <th className="text-right px-2 py-1 text-[10px] font-medium">Consumed</th>
                  <th className="text-right px-2 py-1 text-[10px] font-medium">Avg $/t</th>
                  <th className="text-right px-2 py-1 text-[10px] font-medium">Cost</th>
                  <th className="text-right px-2 py-1 text-[10px] font-medium">ROB End</th>
                </tr>
              </thead>
              <tbody>
                {([
                  { label: "HSFO", key: 'hsfo', consumed: results.hsfoConsumption, price: getAveragePrice('hsfo'), robEnd: robEndHsfo },
                  { label: "VLSFO", key: 'vlsfo', consumed: results.vlsfoConsumption, price: getAveragePrice('vlsfo'), robEnd: robEndVlsfo },
                  { label: "LSMGO", key: 'lsmgo', consumed: results.lsmgoConsumption, price: getAveragePrice('lsmgo'), robEnd: robEndLsmgo },
                ] as const).map(f => (
                  <tr key={f.label} className="border-t border-border">
                    <td className="px-2 py-0.5 text-[10px] font-medium">{f.label}</td>
                    <td className="px-2 py-0.5 font-mono text-right text-[10px]">{f.consumed.toFixed(1)} t</td>
                    <td className="px-2 py-0.5 font-mono text-right text-[10px]">
                      <span className="inline-flex items-center justify-end">
                        ${f.price.toFixed(2)}
                        <InfoTooltip {...getPriceBreakdown(f.key)} />
                      </span>
                    </td>
                    <td className="px-2 py-0.5 font-mono text-right text-[10px]">${(f.consumed * f.price).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    <td className="px-2 py-0.5 font-mono text-right text-[10px]">{f.robEnd.toFixed(1)} t</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
          )}
        </div>
      )}
    </div>
  );
}


