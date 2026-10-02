#!/usr/bin/env node
// Fails if the built bundle (dist/) carries API keys or other secrets (M5, D-005).
//
//   npm run build && npm run check:bundle
//
// Always rejected: the API-Key header and the old MARINE_API_KEY constant.
// FORBIDDEN_SECRETS (comma-separated, e.g. from CI secrets) adds exact values to
// look for without committing them. Matches are reported by file only, never by
// value.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const dist = process.argv[2] || "dist";
const patterns = [
  { name: "API-Key header", re: /["'`]API-Key["'`]/ },
  { name: "MARINE_API_KEY constant", re: /MARINE_API_KEY/ },
  { name: "JWT-looking literal", re: /eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/ },
];
const literals = (process.env.FORBIDDEN_SECRETS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

function* files(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* files(p);
    else if (/\.(js|mjs|css|html|map|json|txt)$/.test(name)) yield p;
  }
}

let failures = 0;
let scanned = 0;
for (const file of files(dist)) {
  scanned++;
  const text = readFileSync(file, "utf8");
  for (const { name, re } of patterns) {
    if (re.test(text)) {
      console.error(`FAIL ${file}: contains ${name}`);
      failures++;
    }
  }
  literals.forEach((secret, i) => {
    if (text.includes(secret)) {
      console.error(`FAIL ${file}: contains FORBIDDEN_SECRETS[${i}]`);
      failures++;
    }
  });
}
if (scanned === 0) {
  console.error(`FAIL no files under ${dist}/ — run npm run build first`);
  process.exit(1);
}
console.log(`${scanned} files scanned, ${literals.length} extra literal(s) checked, ${failures} finding(s)`);
process.exit(failures ? 1 : 0);
