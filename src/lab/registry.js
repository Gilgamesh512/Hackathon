// Lab Target Registry & Manifest Parser
// Loads approved targets from targets/catalog and enforces strict scope boundaries.

import fs from "node:fs";
import path from "node:path";

/**
 * Lightweight YAML parser for simple target catalog manifests
 */
export function parseSimpleYaml(yamlContent) {
  const result = {};
  const lines = yamlContent.split("\n");
  let currentKey = null;
  let currentArray = null;

  for (let rawLine of lines) {
    const line = rawLine.replace(/\r$/, "");
    if (!line.trim() || line.trim().startsWith("#")) continue;

    const indent = line.search(/\S/);
    const trimmed = line.trim();

    if (indent === 0 && trimmed.includes(":")) {
      const colonIdx = trimmed.indexOf(":");
      const key = trimmed.slice(0, colonIdx).trim();
      const val = trimmed.slice(colonIdx + 1).trim();

      currentKey = key;
      currentArray = null;

      if (val === "" || val === ">-") {
        result[key] = {};
      } else {
        result[key] = val.replace(/^["']|["']$/g, "");
      }
    } else if (indent === 2 && currentKey && typeof result[currentKey] === "object") {
      if (trimmed.startsWith("- ")) {
        if (!Array.isArray(result[currentKey])) {
          result[currentKey] = [];
        }
        result[currentKey].push(trimmed.slice(2).trim().replace(/^["']|["']$/g, ""));
      } else if (trimmed.includes(":")) {
        const colonIdx = trimmed.indexOf(":");
        const subKey = trimmed.slice(0, colonIdx).trim();
        const subVal = trimmed.slice(colonIdx + 1).trim();
        result[currentKey][subKey] = subVal.replace(/^["']|["']$/g, "");
      }
    } else if (indent >= 4 && currentKey) {
      if (trimmed.startsWith("- ")) {
        // Nested array under subkey
        const subKeys = Object.keys(result[currentKey]);
        const lastSubKey = subKeys[subKeys.length - 1];
        if (lastSubKey) {
          if (!Array.isArray(result[currentKey][lastSubKey])) {
            result[currentKey][lastSubKey] = [];
          }
          result[currentKey][lastSubKey].push(trimmed.slice(2).trim().replace(/^["']|["']$/g, ""));
        }
      }
    }
  }

  return result;
}

export class TargetRegistry {
  constructor(catalogDir = path.resolve(process.cwd(), "targets/catalog")) {
    this.catalogDir = catalogDir;
    this.targets = new Map();
  }

  /**
   * Scans and loads all manifests from the approved catalog directory
   */
  loadCatalog() {
    this.targets.clear();
    if (!fs.existsSync(this.catalogDir)) {
      return this.targets;
    }

    const files = fs.readdirSync(this.catalogDir).filter((f) => f.endsWith(".yaml") || f.endsWith(".yml"));

    for (const file of files) {
      const filePath = path.join(this.catalogDir, file);
      const content = fs.readFileSync(filePath, "utf-8");
      const manifest = parseSimpleYaml(content);

      if (manifest.id) {
        manifest.status = "registered";
        manifest.manifestFile = file;
        this.targets.set(manifest.id, manifest);
      }
    }

    return this.targets;
  }

  getAllTargets() {
    if (this.targets.size === 0) {
      this.loadCatalog();
    }
    return Array.from(this.targets.values());
  }

  getTarget(id) {
    if (this.targets.size === 0) {
      this.loadCatalog();
    }
    return this.targets.get(id) || null;
  }

  /**
   * Enforces Scope Restriction (Anti-SSRF): Only registered catalog targets can be scanned or manipulated
   */
  isTargetInAuthorizedScope(targetId) {
    if (this.targets.size === 0) {
      this.loadCatalog();
    }
    return this.targets.has(targetId);
  }
}
