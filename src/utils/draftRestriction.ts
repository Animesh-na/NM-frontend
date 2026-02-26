/**
 * Draft Restriction Calculator
 * Determines if a port is accessible based on vessel draft, cargo, and port constraints.
 */

export interface DraftCheckInput {
  // Ship
  currentDraftM: number;
  dwtMt: number;
  tpcMtPerCm: number;
  shipCubicCapacityM3: number;

  // Port
  portName: string;
  portMaxDraftM: number;
  ukcPercent: number; // default 0 if not provided

  // Cargo
  stowageFactorM3PerMt: number;
  requestedCargoMt: number;
}

export interface DraftCheckResult {
  portName: string;
  status: "ACCESSIBLE" | "NOT ACCESSIBLE";
  error?: string;
  reasons?: string[];

  // Calculation details
  effectiveDraft?: number;
  availableDraft?: number;
  availableDraftCm?: number;
  maxWeightDraft?: number;
  maxWeightVolume?: number;
  maxWeightDwt?: number;
  maxLoadableCargo?: number;
  draftIncrease?: number;
  newDraft?: number;
  limitingFactor?: "draft" | "volume" | "dwt";
}

/**
 * Estimate cubic capacity (m³) from DWT when not available.
 * Based on typical grain capacity ratios for bulk carriers.
 */
export function estimateCubicFromDwt(dwt: number): number {
  if (dwt >= 200000) return dwt * 1.2;   // VLOC ~1.2 m³/mt
  if (dwt >= 100000) return dwt * 1.25;  // Capesize ~1.25
  if (dwt >= 60000) return dwt * 1.3;    // Panamax ~1.3
  if (dwt >= 40000) return dwt * 1.35;   // Supramax ~1.35
  if (dwt >= 25000) return dwt * 1.4;    // Handysize ~1.4
  return dwt * 1.45;                      // Small vessel ~1.45
}

export function calculateDraftRestriction(input: DraftCheckInput): DraftCheckResult {
  const {
    currentDraftM,
    dwtMt,
    tpcMtPerCm,
    shipCubicCapacityM3,
    portName,
    portMaxDraftM,
    ukcPercent,
    stowageFactorM3PerMt,
    requestedCargoMt,
  } = input;

  console.log(`[DraftCheck] Input:`, input);

  // Step 1: Effective Port Draft
  const effectiveDraft = portMaxDraftM - (portMaxDraftM * (ukcPercent / 100));
  console.log(`[DraftCheck] effectiveDraft = ${portMaxDraftM} - (${portMaxDraftM} × ${ukcPercent}/100) = ${effectiveDraft}`);

  // Step 2: Available Draft Increase
  const availableDraft = effectiveDraft - currentDraftM;
  console.log(`[DraftCheck] availableDraft = ${effectiveDraft} - ${currentDraftM} = ${availableDraft}`);

  if (availableDraft <= 0) {
    return {
      portName,
      status: "NOT ACCESSIBLE",
      error: "Current draft exceeds port limit",
      effectiveDraft,
      availableDraft,
    };
  }

  // Step 3: Draft Limited Weight
  const availableDraftCm = availableDraft * 100;
  const maxWeightDraft = availableDraftCm * tpcMtPerCm;
  console.log(`[DraftCheck] availableDraftCm = ${availableDraft} × 100 = ${availableDraftCm}`);
  console.log(`[DraftCheck] maxWeightDraft = ${availableDraftCm} × ${tpcMtPerCm} = ${maxWeightDraft}`);

  // Step 4: Volume Limited Weight
  const cubicCapacity = shipCubicCapacityM3 > 0 ? shipCubicCapacityM3 : estimateCubicFromDwt(dwtMt);
  const maxWeightVolume = stowageFactorM3PerMt > 0
    ? cubicCapacity / stowageFactorM3PerMt
    : Infinity;
  console.log(`[DraftCheck] cubicCapacity = ${cubicCapacity} (${shipCubicCapacityM3 > 0 ? 'actual' : 'estimated from DWT'})`);
  console.log(`[DraftCheck] maxWeightVolume = ${cubicCapacity} / ${stowageFactorM3PerMt} = ${maxWeightVolume}`);

  // Step 5: DWT Limited Weight
  const maxWeightDwt = dwtMt;
  console.log(`[DraftCheck] maxWeightDwt = ${maxWeightDwt}`);

  // Step 6: Maximum Loadable Cargo
  const maxLoadableCargo = Math.min(maxWeightDraft, maxWeightVolume, maxWeightDwt);
  const limitingFactor: "draft" | "volume" | "dwt" =
    maxLoadableCargo === maxWeightDraft ? "draft" :
    maxLoadableCargo === maxWeightVolume ? "volume" : "dwt";
  console.log(`[DraftCheck] maxLoadableCargo = MIN(${maxWeightDraft}, ${maxWeightVolume}, ${maxWeightDwt}) = ${maxLoadableCargo} (limited by ${limitingFactor})`);

  // Step 7: Draft After Requested Cargo
  const draftIncrease = tpcMtPerCm > 0 ? requestedCargoMt / (tpcMtPerCm * 100) : 0;
  const newDraft = currentDraftM + draftIncrease;
  console.log(`[DraftCheck] draftIncrease = ${requestedCargoMt} / (${tpcMtPerCm} × 100) = ${draftIncrease}`);
  console.log(`[DraftCheck] newDraft = ${currentDraftM} + ${draftIncrease} = ${newDraft}`);

  // Step 8: Final Validation
  const reasons: string[] = [];
  if (requestedCargoMt > maxWeightDraft) reasons.push("Exceeds draft restriction");
  if (requestedCargoMt > maxWeightVolume) reasons.push("Exceeds volume capacity");
  if (requestedCargoMt > maxWeightDwt) reasons.push("Exceeds DWT limit");
  if (newDraft > effectiveDraft) reasons.push("New draft exceeds effective port draft");

  const isAccessible = requestedCargoMt <= maxLoadableCargo && newDraft <= effectiveDraft;
  console.log(`[DraftCheck] status = ${isAccessible ? 'ACCESSIBLE' : 'NOT ACCESSIBLE'}, reasons: ${reasons.join(', ') || 'none'}`);

  return {
    portName,
    status: isAccessible ? "ACCESSIBLE" : "NOT ACCESSIBLE",
    reasons: reasons.length > 0 ? reasons : undefined,
    effectiveDraft,
    availableDraft,
    availableDraftCm,
    maxWeightDraft,
    maxWeightVolume,
    maxWeightDwt,
    maxLoadableCargo,
    draftIncrease,
    newDraft,
    limitingFactor,
  };
}
