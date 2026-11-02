import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { domainMatches, parseRule, readJson, ROOT, sha256 } from "./common.mjs";

const metadata = await readJson("dist/shadowrocket/metadata.json");
const cases = await readJson("config/routing-cases.json");
const configPath = path.join(ROOT, "dist/shadowrocket/main.conf");
const config = await readFile(configPath, "utf8");

if (sha256(config) !== metadata.main_sha256) throw new Error("main.conf hash does not match metadata");
if (!config.includes(`FINAL,${metadata.policies.proxy}`)) throw new Error("main.conf must end with FINAL,PROXY");
if ((config.match(/^FINAL,/gm) ?? []).length !== 1) throw new Error("main.conf must contain exactly one FINAL rule");
if (!config.includes("enable = false")) throw new Error("MITM must be disabled");

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

const releaseDirectory = path.join(ROOT, "dist/shadowrocket/releases", metadata.version);
const policies = [
  ["private.list", "DIRECT"],
  ["services.list", "PROXY"],
  ["gfw.list", "PROXY"],
  ["direct.list", "DIRECT"],
  ["cncidr.list", "DIRECT"],
];
const orderedRules = [];
for (const [file, policy] of policies) {
  const filePath = path.join(releaseDirectory, file);
  await stat(filePath);
  const contents = await readFile(filePath, "utf8");
  for (const pattern of forbidden) {
    if (pattern.test(contents)) throw new Error(`${file} contains forbidden material: ${pattern}`);
  }
  const lines = contents
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"));
  for (const line of lines) orderedRules.push({ ...parseRule(line), policy });
}

function route(destination) {
  for (const rule of orderedRules) {
    if (domainMatches(rule, destination)) return rule.policy;
  }
  return metadata.policies.proxy;
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
