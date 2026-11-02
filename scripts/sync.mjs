import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { gzipSync } from "node:zlib";
import { normalizeRuleText, readJson, ROOT, sha256, validateRuleText } from "./common.mjs";

const manifest = await readJson("upstream/sources.json");
const stagedDirectory = path.join(ROOT, "upstream", `.sync-${process.pid}`);
await mkdir(stagedDirectory, { recursive: true });

const lock = { schema_version: 1, sources: [] };

try {
  const licenseResponse = await fetch(manifest.license_url, {
    headers: { "User-Agent": "qihao-shadowrocket-config-sync/0.1" },
    redirect: "follow",
    signal: AbortSignal.timeout(30_000),
  });
  if (!licenseResponse.ok) throw new Error(`License returned HTTP ${licenseResponse.status}`);
  const licenseText = (await licenseResponse.text()).replaceAll("\r\n", "\n");
  if (
    licenseText.length < 30_000 ||
    !licenseText.includes("GNU GENERAL PUBLIC LICENSE") ||
    !licenseText.includes("Version 3, 29 June 2007")
  ) {
    throw new Error("Upstream GPL-3.0 license did not match the expected document");
  }
  await writeFile(path.join(stagedDirectory, "LICENSE"), licenseText, "utf8");

  for (const source of manifest.sources) {
    const response = await fetch(source.url, {
      headers: { "User-Agent": "qihao-shadowrocket-config-sync/0.1" },
      redirect: "follow",
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new Error(`${source.id} returned HTTP ${response.status}`);
    const normalized = normalizeRuleText(await response.text());
    const lines = validateRuleText(source.id, normalized, source);
    const digest = sha256(normalized);
    await writeFile(
      path.join(stagedDirectory, `${source.id}.list.gz`),
      gzipSync(Buffer.from(normalized), { level: 9 }),
    );
    lock.sources.push({
      id: source.id,
      url: source.url,
      license: source.license,
      sha256: digest,
      lines: lines.length,
      snapshot_encoding: "gzip",
    });
  }

  await writeFile(path.join(stagedDirectory, "lock.json"), `${JSON.stringify(lock, null, 2)}\n`, "utf8");
  const snapshotDirectory = path.join(ROOT, "upstream", "snapshots");
  await mkdir(snapshotDirectory, { recursive: true });
  for (const source of manifest.sources) {
    await rename(
      path.join(stagedDirectory, `${source.id}.list.gz`),
      path.join(snapshotDirectory, `${source.id}.list.gz`),
    );
  }
  await rename(path.join(stagedDirectory, "lock.json"), path.join(ROOT, "upstream", "lock.json"));
  await rename(path.join(stagedDirectory, "LICENSE"), path.join(ROOT, "LICENSE"));
  console.log(`Synced ${lock.sources.length} rule sources.`);
} finally {
  await rm(stagedDirectory, { recursive: true, force: true });
}
