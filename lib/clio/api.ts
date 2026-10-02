import { CLIO_API } from "../config";
import { getAccessToken } from "./oauth";

/**
 * Read-only Clio API client. It only ever sends GET requests, and the Clio app
 * itself is granted read-only permissions, so case data can never be changed.
 */

export class ClioError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

type Row = Record<string, unknown>;

async function clioGet(urlOrPath: string, params?: Record<string, string | number>): Promise<{ data: unknown; meta?: { paging?: { next?: string } } }> {
  let url = urlOrPath.startsWith("http") ? urlOrPath : `${CLIO_API}/${urlOrPath}`;
  if (params) {
    const qs = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)]));
    url += (url.includes("?") ? "&" : "?") + qs.toString();
  }
  for (let attempt = 0; attempt < 6; attempt++) {
    const token = await getAccessToken();
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } });
    if (res.status === 429) {
      const wait = Number(res.headers.get("Retry-After") || 10);
      await new Promise((r) => setTimeout(r, wait * 1000));
      continue;
    }
    if (!res.ok) throw new ClioError(res.status, `${res.status} ${(await res.text()).slice(0, 300)}`);
    return (await res.json()) as { data: unknown; meta?: { paging?: { next?: string } } };
  }
  throw new ClioError(429, "Clio rate limit: gave up after retries");
}

/** All pages of a list endpoint. */
export async function getAll(path: string, params: Record<string, string | number>, fields: string): Promise<Row[]> {
  const rows: Row[] = [];
  let next: string | undefined = path;
  let query: Record<string, string | number> | undefined = { ...params, fields, limit: 200 };
  while (next) {
    const page = await clioGet(next, query);
    if (Array.isArray(page.data)) rows.push(...(page.data as Row[]));
    else if (page.data && typeof page.data === "object") rows.push(page.data as Row); // single-record endpoints
    next = page.meta?.paging?.next;
    query = undefined; // the "next" URL already carries the query
  }
  return rows;
}

/**
 * Fetch with a rich field list, falling back to a minimal one if Clio rejects a
 * field name. A missing permission (403) yields an empty list and a warning.
 */
export async function fetchResource(
  name: string,
  path: string,
  params: Record<string, string | number>,
  fields: string,
  fallback: string,
  warnings: string[],
): Promise<Row[]> {
  try {
    return await getAll(path, params, fields);
  } catch (err) {
    if (err instanceof ClioError && (err.status === 400 || err.status === 422)) {
      warnings.push(`${name}: rich field list rejected, used minimal fields`);
      return getAll(path, params, fallback);
    }
    if (err instanceof ClioError && err.status === 403) {
      warnings.push(`${name}: no read permission on the Clio app`);
      return [];
    }
    throw err;
  }
}

/** Download a document's bytes. Clio redirects to signed storage; follow it WITHOUT our token. */
export async function downloadDocument(id: number): Promise<{ bytes: Buffer; contentType: string }> {
  const token = await getAccessToken();
  const res = await fetch(`${CLIO_API}/documents/${id}/download.json`, {
    headers: { Authorization: `Bearer ${token}` },
    redirect: "manual",
  });
  let final: Response = res;
  if (res.status >= 300 && res.status < 400) {
    const location = res.headers.get("location");
    if (!location) throw new ClioError(res.status, "Document redirect without a location");
    final = await fetch(new URL(location, CLIO_API).toString());
  }
  if (!final.ok) throw new ClioError(final.status, `Document ${id} download failed: ${final.status}`);
  return {
    bytes: Buffer.from(await final.arrayBuffer()),
    contentType: final.headers.get("content-type") || "application/octet-stream",
  };
}
