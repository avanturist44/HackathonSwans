import { promises as fs } from "node:fs";
import { TOKEN_FILE } from "./config";
import { readJson } from "./store";
import type { Digest } from "./types";

/** Page-facing loaders. Pages read the cached digest; the pipeline (POST /api/digest) writes it. */

export const DIGEST_FILE = "digest.json";

export async function isConnected(): Promise<boolean> {
  try {
    await fs.access(TOKEN_FILE);
    return true;
  } catch {
    return false;
  }
}

export async function loadDigest(): Promise<Digest | null> {
  return readJson<Digest | null>(DIGEST_FILE, null);
}
