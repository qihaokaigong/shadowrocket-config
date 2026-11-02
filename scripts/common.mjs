import { createHash } from "node:crypto";
import { isIP } from "node:net";
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

function ipv4Parts(value) {
  return value.split(".").map((part) => Number.parseInt(part, 10));
}

function ipToBigInt(value) {
  const version = isIP(value);
  if (version === 4) {
    return ipv4Parts(value).reduce((result, part) => (result << 8n) | BigInt(part), 0n);
  }
  if (version !== 6) return null;

  const expandIpv4 = (part) => {
    if (!part.includes(".")) return [part];
    const bytes = ipv4Parts(part);
    return [((bytes[0] << 8) | bytes[1]).toString(16), ((bytes[2] << 8) | bytes[3]).toString(16)];
  };
  const [leftRaw, rightRaw = ""] = value.split("::");
  const left = leftRaw ? leftRaw.split(":").flatMap(expandIpv4) : [];
  const right = rightRaw ? rightRaw.split(":").flatMap(expandIpv4) : [];
  const missing = 8 - left.length - right.length;
  const groups = [...left, ...Array.from({ length: missing }, () => "0"), ...right];
  return groups.reduce((result, group) => (result << 16n) | BigInt(`0x${group || "0"}`), 0n);
}

export function ipMatches(rule, destination) {
  const destinationVersion = isIP(destination);
  const expectedVersion = rule.type === "IP-CIDR" ? 4 : rule.type === "IP-CIDR6" ? 6 : 0;
  if (!expectedVersion || destinationVersion !== expectedVersion) return false;
  const [network, prefixText] = rule.value.split("/");
  const prefix = Number.parseInt(prefixText, 10);
  const bits = expectedVersion === 4 ? 32 : 128;
  if (!isIP(network) || !Number.isInteger(prefix) || prefix < 0 || prefix > bits) return false;
  const shift = BigInt(bits - prefix);
  return (ipToBigInt(destination) >> shift) === (ipToBigInt(network) >> shift);
}

export function ruleMatches(rule, destination) {
  if (rule.type === "IP-CIDR" || rule.type === "IP-CIDR6") {
    return ipMatches(rule, destination);
  }
  return isIP(destination) === 0 && domainMatches(rule, destination);
}
