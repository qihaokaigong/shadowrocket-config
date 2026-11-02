import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export async function readJson(relativePath) {
  return JSON.parse(await readFile(path.join(ROOT, relativePath), "utf8"));
}

export function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function normalizeRuleText(value) {
  return `${value
    .replaceAll("\r\n", "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#") && !line.startsWith("//"))
    .join("\n")}\n`;
}

const DOMAIN_TYPES = new Set(["DOMAIN", "DOMAIN-SUFFIX", "DOMAIN-KEYWORD"]);
const IP_TYPES = new Set(["IP-CIDR", "IP-CIDR6"]);

export function parseRule(line) {
  const fields = line.split(",").map((field) => field.trim());
  const type = fields[0];
  if (!DOMAIN_TYPES.has(type) && !IP_TYPES.has(type)) {
    throw new Error(`Unsupported upstream rule type: ${type} in ${line}`);
  }
  if (fields.length < 2 || !fields[1]) {
    throw new Error(`Malformed rule: ${line}`);
  }
  if (fields.length > 3 || (fields.length === 3 && fields[2] !== "no-resolve")) {
    throw new Error(`Unexpected upstream rule fields: ${line}`);
  }
  return { type, value: fields[1].toLowerCase(), noResolve: fields[2] === "no-resolve" };
}

export function validateRuleText(id, text, source) {
  const lines = normalizeRuleText(text).trimEnd().split("\n");
  if (lines.length < source.min_lines || lines.length > source.max_lines) {
    throw new Error(
      `${id} line count ${lines.length} is outside ${source.min_lines}-${source.max_lines}`,
    );
  }
  const seen = new Set();
  for (const line of lines) {
    parseRule(line);
    if (seen.has(line)) throw new Error(`${id} contains duplicate rule: ${line}`);
    seen.add(line);
  }
  return lines;
}

export function addNoResolve(lines) {
  return lines.map((line) => {
    const rule = parseRule(line);
    if ((rule.type === "IP-CIDR" || rule.type === "IP-CIDR6") && !rule.noResolve) {
      return `${line},no-resolve`;
    }
    return line;
  });
}

export function domainMatches(rule, destination) {
  const host = destination.toLowerCase().replace(/\.$/, "");
  if (rule.type === "DOMAIN") return host === rule.value;
  if (rule.type === "DOMAIN-SUFFIX") {
    return host === rule.value || host.endsWith(`.${rule.value}`);
  }
  if (rule.type === "DOMAIN-KEYWORD") return host.includes(rule.value);
  return false;
}
