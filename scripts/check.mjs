import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { parseRule, readJson, ROOT, ruleMatches, sha256 } from "./common.mjs";

const metadata = await readJson("dist/shadowrocket/metadata.json");
const cases = await readJson("config/routing-cases.json");
const project = await readJson("config/project.json");
const configPath = path.join(ROOT, "dist/shadowrocket/main.conf");
const config = await readFile(configPath, "utf8");

if (sha256(config) !== metadata.main_sha256) throw new Error("main.conf hash does not match metadata");
if (!config.includes(`FINAL,${metadata.policies.proxy}`)) throw new Error("main.conf must end with FINAL,PROXY");
if ((config.match(/^FINAL,/gm) ?? []).length !== 1) throw new Error("main.conf must contain exactly one FINAL rule");
if (!config.includes("enable = false")) throw new Error("MITM must be disabled");

const requiredGeneralSettings = [
  "bypass-system = true",
  "dns-direct-system = true",
  "dns-direct-fallback-proxy = false",
  "private-ip-answer = true",
  "use-local-host-item-for-proxy = false",
  "udp-policy-not-supported-behaviour = REJECT",
];
for (const setting of requiredGeneralSettings) {
  if (!config.includes(setting)) throw new Error(`main.conf is missing required setting: ${setting}`);
}

const ruleSection = config.split("[Rule]\n")[1]?.split("\n[")[0];
if (!ruleSection) throw new Error("main.conf is missing the Rule section");
const mainRules = ruleSection
  .split("\n")
  .map((line) => line.trim())
  .filter((line) => line && !line.startsWith("#"));
if (mainRules.at(-1) !== `FINAL,${metadata.policies.proxy}`) {
  throw new Error("FINAL,PROXY must be the last rule in the Rule section");
}

const forbidden = [/(?:ss|ssr|vmess|vless|trojan):\/\//i, /password\s*=/i, /private[-_ ]?key\s*=/i];
for (const pattern of forbidden) {
  if (pattern.test(config)) throw new Error(`Published config contains forbidden material: ${pattern}`);
}

const legacyVersion = "84148bc51e4d700f";
for (const file of ["private.list", "services.list", "gfw.list", "direct.list", "cncidr.list"]) {
  const previous = await readFile(path.join(ROOT, "archive", legacyVersion, file));
  const published = await readFile(path.join(ROOT, "dist/shadowrocket/releases", legacyVersion, file));
  if (!previous.equals(published)) throw new Error(`Legacy rule changed: ${file}`);
}
const orderedRules = [];
let finalPolicy;
for (const mainRule of mainRules) {
  const fields = mainRule.split(",").map((field) => field.trim());
  if (fields[0] === "RULE-SET") {
    const url = new URL(fields[1]);
    const expectedPrefix = "/shadowrocket/rules/";
    if (!url.pathname.startsWith(expectedPrefix)) {
      throw new Error(`Rule set does not use the stable rule path: ${fields[1]}`);
    }
    if (url.origin !== new URL(project.public_base_url).origin) {
      throw new Error(`Rule set uses an unexpected origin: ${fields[1]}`);
    }
    const file = path.basename(url.pathname);
    const filePath = path.join(ROOT, "dist/shadowrocket/rules", file);
    await stat(filePath);
    const contents = await readFile(filePath, "utf8");
    for (const pattern of forbidden) {
      if (pattern.test(contents)) throw new Error(`${file} contains forbidden material: ${pattern}`);
    }
    const lines = contents
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#"));
    for (const line of lines) orderedRules.push({ ...parseRule(line), policy: fields[2] });
  } else if (fields[0] === "IP-CIDR" || fields[0] === "IP-CIDR6") {
    const noResolve = fields[3] ? `,${fields[3]}` : "";
    orderedRules.push({ ...parseRule(`${fields[0]},${fields[1]}${noResolve}`), policy: fields[2] });
  } else if (fields[0] === "FINAL") {
    finalPolicy = fields[1];
  } else if (fields[0] !== "GEOIP") {
    throw new Error(`Unsupported main rule in test simulator: ${mainRule}`);
  }
}
if (finalPolicy !== metadata.policies.proxy) throw new Error("Test simulator did not load FINAL,PROXY");

function route(destination) {
  for (const rule of orderedRules) {
    if (ruleMatches(rule, destination)) return rule.policy;
  }
  return finalPolicy;
}

const failures = [];
for (const testCase of cases.cases) {
  const actual = route(testCase.destination);
  if (actual !== testCase.expected) {
    failures.push(`${testCase.destination}: expected ${testCase.expected}, received ${actual}`);
  }
}
if (failures.length) throw new Error(`Routing regressions:\n${failures.join("\n")}`);

console.log(
  `Validated release ${metadata.version}: ${orderedRules.length} remote rules and ${cases.cases.length} routing cases.`,
);
