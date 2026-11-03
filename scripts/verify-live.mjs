import { sha256 } from "./common.mjs";
import { readJson } from "./common.mjs";

const project = await readJson("config/project.json");
const base = project.public_base_url;

async function get(relativePath, expectedStatus = 200) {
  const response = await fetch(`${base}/${relativePath}`, {
    signal: AbortSignal.timeout(15_000),
    cache: "no-store",
  });
  if (response.status !== expectedStatus) {
    throw new Error(`${relativePath}: HTTP ${response.status}, expected ${expectedStatus}`);
  }
  return response;
}

const metadata = await (await get("metadata.json")).json();
const config = await (await get("main.conf")).text();
if (sha256(config) !== metadata.main_sha256) throw new Error("Live main.conf hash mismatch");
if (!config.includes(`# Release: ${metadata.version}`)) throw new Error("Live version mismatch");

const ruleUrls = [...config.matchAll(/^RULE-SET,(https:\/\/[^,]+),/gm)].map((match) => match[1]);
if (ruleUrls.length !== 5) throw new Error(`Expected five remote rule sets, found ${ruleUrls.length}`);
for (const ruleUrl of ruleUrls) {
  const url = new URL(ruleUrl);
  if (url.origin !== new URL(base).origin || !url.pathname.startsWith("/shadowrocket/rules/")) {
    throw new Error(`Unexpected rule URL: ${ruleUrl}`);
  }
  const response = await fetch(url, { signal: AbortSignal.timeout(15_000), cache: "no-store" });
  if (!response.ok || !(await response.text()).trim()) throw new Error(`Unavailable rule: ${ruleUrl}`);
}

for (const file of ["private.list", "services.list", "gfw.list", "direct.list", "cncidr.list"]) {
  const response = await get(`releases/84148bc51e4d700f/${file}`);
  if (!(await response.text()).trim()) throw new Error(`Empty legacy rule: ${file}`);
}
await get(`missing-${Date.now()}`, 404);
const switchy = await (await fetch(new URL("/switchy/rules.txt", base), {
  signal: AbortSignal.timeout(15_000), cache: "no-store",
})).text();
if (!switchy.startsWith("[SwitchyOmega Conditions]\n@with result\n") || !switchy.trimEnd().endsWith("* +Proxy")) {
  throw new Error("Live SwitchyOmega rule list is missing or invalid");
}
console.log(`Live release ${metadata.version}: Shadowrocket rules, SwitchyOmega list, legacy rules, and 404 passed.`);
