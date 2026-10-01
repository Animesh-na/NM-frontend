import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// Year/date rules read the local zone; pin UTC so outputs do not depend on the machine.
process.env.TZ = "UTC";

// Golden runner: emits frontend calculation results for the parity harness.
// Kept out of `npm test` because it writes fixture files (see `npm run golden:update`).
export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/golden/**/*.golden.{ts,tsx}"],
    testTimeout: 600_000,
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
