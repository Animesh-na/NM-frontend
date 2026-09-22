import { beforeAll, describe, expect, it } from "vitest";
import { buildMarineUrl, marineHeaders } from "@/services/apiConfig";
import { getStoredAuthToken } from "@/utils/authToken";
import { computeConsumption } from "@/services/vesselFuelApi";

const ECO = {
  me_load: 0.70,
  ae_sea_load: 0.035,
  ae_port_load: 0.06,
  scrubber_penalty: 0.012,
};

const FULL = {
  me_load: 0.85,
  ae_sea_load: 0.04,
  ae_port_load: 0.06,
  scrubber_penalty: 0.015,
};

async function buildApi() {
  const token = getStoredAuthToken();

  let page = 1;
  const vessels: any[] = [];

  while (true) {
    const TOKEN ="REDACTED-EXPIRED-TEST-JWTxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx";
    const response = await fetch(buildMarineUrl("/vessels/all?page=" + page, {}),
      {
        headers: marineHeaders({
          Authorization: `Bearer ${TOKEN}`,
        }),
      }
    );

    console.log(`Fetching page ${page}...`);
    console.log(`URL: ${buildMarineUrl("/vessels/all?page=" + page, {})}`);
    console.log(`Status: ${response.status} ${response.statusText}`);

    expect(response.ok).toBe(true);

    const json = await response.json();

    // Adjust according to your API response
    const rows =
      json.data ??
      json.results ??
      json.vessels ??
      json.items ??
      [];

    if (rows.length === 0) {
      break;
    }

    vessels.push(...rows);

    console.log(`Fetched page ${page} (${rows.length})`);

    page++;
  }

  console.log(`Total vessels: ${vessels.length}`);

  return vessels;
}

let vessels: any[] = [];

beforeAll(async () => {
  vessels = await buildApi();
}, 600000);

describe("Fuel Consumption Validation", () => {
  it("should calculate valid fuel consumption for every vessel", () => {
    for (const vessel of vessels) {
      if (
        !vessel.main_engine1_mcr ||
        !vessel.main_engine1_sfoc
      ) {
        continue;
      }

      const eco = computeConsumption(
        vessel.main_engine1_mcr,
        vessel.main_engine1_sfoc,
        vessel.scrubber_indicator,
        ECO
      );

      const full = computeConsumption(
        vessel.main_engine1_mcr,
        vessel.main_engine1_sfoc,
        vessel.scrubber_indicator,
        FULL
      );

      // ECO should consume less than FULL
      expect(eco.outside_eca.tpd).toBeLessThan(full.outside_eca.tpd);
      expect(eco.inside_eca.tpd).toBeLessThan(full.inside_eca.tpd);

      // Values should be positive
      expect(eco.outside_eca.tpd).toBeGreaterThan(0);
      expect(eco.inside_eca.tpd).toBeGreaterThan(0);
      expect(eco.in_port.tpd).toBeGreaterThan(0);

      //values should be less than max consumption
      expect(eco.outside_eca.tpd).toBeLessThan(500);
      expect(eco.inside_eca.tpd).toBeLessThan(500);

      expect(full.outside_eca.tpd).toBeLessThan(500);
      expect(full.inside_eca.tpd).toBeLessThan(500);
      expect(full.in_port.tpd).toBeLessThan(500);

      expect(full.outside_eca.tpd).toBeGreaterThan(0);
      expect(full.inside_eca.tpd).toBeGreaterThan(0);
      expect(full.in_port.tpd).toBeGreaterThan(0);

      // Fuel type validation
      expect(eco.inside_eca.fuel_type).toBe("LSMGO");
      expect(full.inside_eca.fuel_type).toBe("LSMGO");

      // ae calculation
      expect(full.outside_eca.ae_tpd).toBeGreaterThan(0);
      expect(full.inside_eca.ae_tpd).toBeGreaterThan(0);
      expect(full.in_port.ae_tpd).toBeGreaterThan(0);

      expect(eco.outside_eca.ae_tpd).toBeLessThan(100);
      expect(eco.inside_eca.ae_tpd).toBeLessThan(100);
      expect(eco.in_port.ae_tpd).toBeLessThan(100);


      if (vessel.scrubber_indicator) {
        expect(eco.outside_eca.fuel_type).toBe("HSFO");
        expect(full.outside_eca.fuel_type).toBe("HSFO");
      } else {
        expect(eco.outside_eca.fuel_type).toBe("VLSFO");
        expect(full.outside_eca.fuel_type).toBe("VLSFO");
      }
    }
  });
});