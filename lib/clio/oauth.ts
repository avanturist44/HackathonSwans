import { promises as fs } from "node:fs";
import { randomBytes } from "node:crypto";
import { CLIO_BASE, CLIO_CLIENT_ID, CLIO_CLIENT_SECRET, CLIO_REDIRECT_URI, TOKEN_FILE } from "../config";

/** Same file format as backend/clio_pull.py, so one login works for both. */
interface StoredToken {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  /** Unix seconds. */
  expires_at?: number;
  token_type?: string;
}

export function assertClientConfig(): void {
  if (!CLIO_CLIENT_ID || !CLIO_CLIENT_SECRET) {
    throw new Error("Missing CLIO_CLIENT_ID / CLIO_CLIENT_SECRET in .env (from developers.clio.com/apps).");
  }
  if (/^\d+$/.test(CLIO_CLIENT_ID.trim())) {
    throw new Error("CLIO_CLIENT_ID looks like the numeric App ID. Use the app's Key from developers.clio.com/apps.");
  }
}

export function newState(): string {
  return randomBytes(16).toString("base64url");
}

export function authorizeUrl(state: string): string {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: CLIO_CLIENT_ID,
    redirect_uri: CLIO_REDIRECT_URI,
    state,
  });
  return `${CLIO_BASE}/oauth/authorize?${params}`;
}

async function postToken(form: Record<string, string>): Promise<StoredToken> {
  const res = await fetch(`${CLIO_BASE}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams(form),
  });
  if (!res.ok) throw new Error(`Clio token request failed: ${res.status} ${await res.text()}`);
  return (await res.json()) as StoredToken;
}

async function saveToken(tok: StoredToken): Promise<StoredToken> {
  const stored = { ...tok, expires_at: Date.now() / 1000 + Number(tok.expires_in ?? 0) - 60 };
  await fs.writeFile(TOKEN_FILE, JSON.stringify(stored, null, 2), { mode: 0o600 });
  return stored;
}

export async function exchangeCode(code: string): Promise<void> {
  assertClientConfig();
  const tok = await postToken({
    client_id: CLIO_CLIENT_ID,
    client_secret: CLIO_CLIENT_SECRET,
    grant_type: "authorization_code",
    code,
    redirect_uri: CLIO_REDIRECT_URI,
  });
  await saveToken(tok);
}

/** A valid access token, refreshing it when it has expired. */
export async function getAccessToken(): Promise<string> {
  let tok: StoredToken;
  try {
    tok = JSON.parse(await fs.readFile(TOKEN_FILE, "utf8")) as StoredToken;
  } catch {
    throw new Error("Not connected to Clio yet. Open the app's home page and connect.");
  }
  if (tok.expires_at && Date.now() / 1000 >= tok.expires_at && tok.refresh_token) {
    assertClientConfig();
    const fresh = await postToken({
      client_id: CLIO_CLIENT_ID,
      client_secret: CLIO_CLIENT_SECRET,
      grant_type: "refresh_token",
      refresh_token: tok.refresh_token,
    });
    tok = await saveToken({ ...fresh, refresh_token: fresh.refresh_token ?? tok.refresh_token });
  }
  return tok.access_token;
}
