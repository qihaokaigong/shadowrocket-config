import { copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import { addNoResolve, normalizeRuleText, readJson, ROOT, sha256 } from "./common.mjs";

const project = await readJson("config/project.json");
const services = await readJson("config/services.json");
const switchyDirect = await readJson("config/switchy-direct.json");
const lock = await readJson("upstream/lock.json");
const baseConfig = (await readFile(path.join(ROOT, "config/base.conf"), "utf8")).trimEnd();

const snapshots = {};
for (const source of lock.sources) {
  const text = normalizeRuleText(
    gunzipSync(
      await readFile(path.join(ROOT, "upstream/snapshots", `${source.id}.list.gz`)),
    ).toString("utf8"),
  );
  if (sha256(text) !== source.sha256) throw new Error(`${source.id} snapshot hash mismatch`);
  snapshots[source.id] = text;
}

const serviceLines = [];
for (const [name, rules] of Object.entries(services.services)) {
  serviceLines.push(`# ${name}`, ...rules, "");
}
const serviceText = `${serviceLines.join("\n").trimEnd()}\n`;
const releaseSeed = JSON.stringify({
  baseConfig,
  project,
  services,
  sources: lock.sources.map(({ id, sha256: digest }) => ({ id, sha256: digest })),
});
const version = sha256(releaseSeed).slice(0, 16);
const output = path.join(ROOT, "dist");
const releaseDirectory = path.join(output, "shadowrocket", "rules");
await rm(output, { recursive: true, force: true });
await mkdir(releaseDirectory, { recursive: true });

// Keep the first published immutable URLs alive for phones that have not yet
// refreshed main.conf. Future configs use revalidating stable rule URLs.
const legacyVersion = "84148bc51e4d700f";
const legacyDirectory = path.join(output, "shadowrocket", "releases", legacyVersion);
await mkdir(legacyDirectory, { recursive: true });
for (const file of ["private.list", "services.list", "gfw.list", "direct.list", "cncidr.list"]) {
  await copyFile(path.join(ROOT, "archive", legacyVersion, file), path.join(legacyDirectory, file));
}

await writeFile(path.join(releaseDirectory, "private.list"), snapshots.private, "utf8");
await writeFile(path.join(releaseDirectory, "services.list"), serviceText, "utf8");
await writeFile(path.join(releaseDirectory, "gfw.list"), snapshots.gfw, "utf8");
await writeFile(path.join(releaseDirectory, "direct.list"), snapshots.direct, "utf8");
await writeFile(
  path.join(releaseDirectory, "cncidr.list"),
  `${addNoResolve(snapshots.cncidr.trimEnd().split("\n")).join("\n")}\n`,
  "utf8",
);

const releaseUrl = `${project.public_base_url}/rules`;
const config = `${baseConfig}

[Rule]
# Release: ${version}
# Local networks stay direct.
RULE-SET,${releaseUrl}/private.list,${project.direct_policy}
IP-CIDR,10.0.0.0/8,${project.direct_policy},no-resolve
IP-CIDR,172.16.0.0/12,${project.direct_policy},no-resolve
IP-CIDR,192.168.0.0/16,${project.direct_policy},no-resolve
IP-CIDR,127.0.0.0/8,${project.direct_policy},no-resolve
IP-CIDR6,fc00::/7,${project.direct_policy},no-resolve
IP-CIDR6,fe80::/10,${project.direct_policy},no-resolve

# Explicit overseas services take precedence over direct lists.
RULE-SET,${releaseUrl}/services.list,${project.proxy_policy}
RULE-SET,${releaseUrl}/gfw.list,${project.proxy_policy}

# Mainland China domains and addresses stay direct.
RULE-SET,${releaseUrl}/direct.list,${project.direct_policy}
RULE-SET,${releaseUrl}/cncidr.list,${project.direct_policy}
GEOIP,CN,${project.direct_policy}

# Anything not identified as local or mainland China uses the proxy.
FINAL,${project.proxy_policy}

[MITM]
enable = false
`;

const configDirectory = path.join(output, "shadowrocket");
await writeFile(path.join(configDirectory, "main.conf"), config, "utf8");

// ZeroOmega expects SwitchyOmega conditions, not Shadowrocket RULE-SET syntax.
// Keep this browser list intentionally small; Chrome does not support our
// Shadowrocket GEOIP/CN-IP fallback in a host-based switch profile.
const switchyLines = [
  "[SwitchyOmega Conditions]",
  "@with result",
  "; The proxy profile in ZeroOmega must be named Proxy.",
  "; First match wins. Explicit overseas services precede *.cn.",
  "localhost +direct",
  "*.localhost +direct",
  "*.local +direct",
  "*.lan +direct",
  "*.home.arpa +direct",
];
const emitted = new Set();
function addHost(host, policy, suffix = true) {
  const normalized = host.toLowerCase();
  if (!/^[a-z0-9.-]+$/.test(normalized) || normalized.startsWith(".") || normalized.endsWith(".")) {
    throw new Error(`Invalid Switchy domain: ${host}`);
  }
  for (const pattern of suffix ? [normalized, `*.${normalized}`] : [normalized]) {
    if (!emitted.has(pattern)) {
      switchyLines.push(`${pattern} +${policy}`);
      emitted.add(pattern);
    }
  }
}
for (const rules of Object.values(services.services)) {
  for (const line of rules) {
    const [type, host] = line.split(",");
    if (type === "DOMAIN" || type === "DOMAIN-SUFFIX") addHost(host, "Proxy", type === "DOMAIN-SUFFIX");
  }
}
addHost("cn", "direct");
for (const host of switchyDirect.domains) addHost(host, "direct");
switchyLines.push("* +Proxy");
await mkdir(path.join(output, "switchy"), { recursive: true });
await writeFile(path.join(output, "switchy", "rules.txt"), `${switchyLines.join("\n")}\n`, "utf8");
const metadata = {
  schema_version: 1,
  version,
  main_sha256: sha256(config),
  policies: { proxy: project.proxy_policy, direct: project.direct_policy },
  sources: lock.sources,
};
await writeFile(path.join(configDirectory, "metadata.json"), `${JSON.stringify(metadata, null, 2)}\n`, "utf8");
await writeFile(
  path.join(output, "_headers"),
  `/shadowrocket/main.conf\n  Content-Type: text/plain; charset=utf-8\n  Cache-Control: public, max-age=0, must-revalidate\n  X-Content-Type-Options: nosniff\n  X-Robots-Tag: noindex, nofollow\n\n/shadowrocket/metadata.json\n  Content-Type: application/json; charset=utf-8\n  Cache-Control: public, max-age=0, must-revalidate\n  X-Content-Type-Options: nosniff\n  X-Robots-Tag: noindex, nofollow\n\n/shadowrocket/rules/*\n  Content-Type: text/plain; charset=utf-8\n  Cache-Control: public, max-age=0, must-revalidate\n  X-Content-Type-Options: nosniff\n  X-Robots-Tag: noindex, nofollow\n\n/shadowrocket/releases/*\n  Content-Type: text/plain; charset=utf-8\n  Cache-Control: public, max-age=31536000, immutable\n  X-Content-Type-Options: nosniff\n  X-Robots-Tag: noindex, nofollow\n\n/switchy/rules.txt\n  Content-Type: text/plain; charset=utf-8\n  Cache-Control: public, max-age=0, must-revalidate\n  X-Content-Type-Options: nosniff\n  X-Robots-Tag: noindex, nofollow\n`,
  "utf8",
);
await writeFile(
  path.join(output, "404.html"),
  "<!doctype html><meta charset=\"utf-8\"><title>Not found</title><p>Not found.</p>\n",
  "utf8",
);
console.log(`Built Shadowrocket release ${version}.`);
