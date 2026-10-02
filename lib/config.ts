import path from "node:path";

/** Repo root (Next.js runs from here). */
export const ROOT = process.cwd();
/** Local cache for digests, share state and logs. Git-ignored; never committed. */
export const DATA_DIR = path.join(ROOT, ".data");
/** Shared with backend/clio_pull.py so one login works for both. */
export const TOKEN_FILE = process.env.CLIO_TOKEN_FILE || path.join(ROOT, ".clio_token.json");

export const CLIO_BASE = process.env.CLIO_BASE || "https://app.clio.com";
export const CLIO_API = `${CLIO_BASE}/api/v4`;
export const CLIO_CLIENT_ID = process.env.CLIO_CLIENT_ID || "";
export const CLIO_CLIENT_SECRET = process.env.CLIO_CLIENT_SECRET || "";
export const CLIO_REDIRECT_URI = process.env.CLIO_REDIRECT_URI || "http://127.0.0.1:8765/callback";

/** Which matter to digest. Matched against Clio's matter search. */
export const MATTER_QUERY = process.env.MATTER_QUERY || "Sapini";

/** Statute of limitations for personal injury, in years (NY: 3; set SOL_YEARS for other states). */
export const SOL_YEARS = Number(process.env.SOL_YEARS || 3);
export const SOL_RULE_LABEL =
  process.env.SOL_RULE_LABEL || `${SOL_YEARS}-year personal-injury deadline, counted from the date of loss`;

export const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || "";
/** Required only for keys not scoped to a workspace (Console > Settings > Workspaces). */
export const ANTHROPIC_WORKSPACE_ID = process.env.ANTHROPIC_WORKSPACE_ID || "";
/** Writes the pitch and the case checks. */
export const MODEL_DIGEST = process.env.MODEL_DIGEST || "claude-sonnet-5-5";
/** Reads documents and triages every entry (high volume, cheap). */
export const MODEL_TRIAGE = process.env.MODEL_TRIAGE || "claude-haiku-4-5-20251001";

/** USD per million tokens [input, output]; override if pricing differs. */
export const PRICES: Record<string, [number, number]> = {
  [MODEL_DIGEST]: [Number(process.env.PRICE_DIGEST_IN || 3), Number(process.env.PRICE_DIGEST_OUT || 15)],
  [MODEL_TRIAGE]: [Number(process.env.PRICE_TRIAGE_IN || 1), Number(process.env.PRICE_TRIAGE_OUT || 5)],
};

/** Max document pages sent to the model per file (scans can be hundreds of pages). */
export const MAX_DOC_BYTES = Number(process.env.MAX_DOC_BYTES || 25 * 1024 * 1024);
