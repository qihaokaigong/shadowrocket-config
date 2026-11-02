import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import { addNoResolve, normalizeRuleText, readJson, ROOT, sha256 } from "./common.mjs";

const project = await readJson("config/project.json");
const services = await readJson("config/services.json");
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
const releaseDirectory = path.join(output, "shadowrocket", "releases", version);
await rm(output, { recursive: true, force: true });
await mkdir(releaseDirectory, { recursive: true });

await writeFile(path.join(releaseDirectory, "private.list"), snapshots.private, "utf8");
await writeFile(path.join(releaseDirectory, "services.list"), serviceText, "utf8");
await writeFile(path.join(releaseDirectory, "gfw.list"), snapshots.gfw, "utf8");
await writeFile(path.join(releaseDirectory, "direct.list"), snapshots.direct, "utf8");
await writeFile(
  path.join(releaseDirectory, "cncidr.list"),
  `${addNoResolve(snapshots.cncidr.trimEnd().split("\n")).join("\n")}\n`,
  "utf8",
);

const releaseUrl = `${project.public_base_url}/releases/${version}`;
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
  `/shadowrocket/main.conf\n  Content-Type: text/plain; charset=utf-8\n  Cache-Control: public, max-age=0, must-revalidate\n  X-Content-Type-Options: nosniff\n  X-Robots-Tag: noindex, nofollow\n\n/shadowrocket/metadata.json\n  Content-Type: application/json; charset=utf-8\n  Cache-Control: public, max-age=0, must-revalidate\n  X-Content-Type-Options: nosniff\n  X-Robots-Tag: noindex, nofollow\n\n/shadowrocket/releases/*\n  Content-Type: text/plain; charset=utf-8\n  Cache-Control: public, max-age=31536000, immutable\n  X-Content-Type-Options: nosniff\n  X-Robots-Tag: noindex, nofollow\n`,
  "utf8",
);
await writeFile(
  path.join(output, "404.html"),
  "<!doctype html><meta charset=\"utf-8\"><title>Not found</title><p>Not found.</p>\n",
  "utf8",
);
console.log(`Built Shadowrocket release ${version}.`);
