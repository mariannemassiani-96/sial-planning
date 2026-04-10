/**
 * Client Odoo JSON-RPC — zéro dépendance
 * Odoo 18 · https://erp.groupe-vista.fr · DB: VISTA-PRODUCTION
 */

const ODOO_URL = process.env.ODOO_URL || "https://erp.groupe-vista.fr";
const ODOO_DB = process.env.ODOO_DB || "VISTA-PRODUCTION";
const ODOO_LOGIN = process.env.ODOO_LOGIN || "";
const ODOO_PASSWORD = process.env.ODOO_PASSWORD || "";

let cachedUid: number | null = null;

async function jsonRpc(url: string, method: string, params: Record<string, unknown>): Promise<any> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", method, params, id: Date.now() }),
  });
  if (!res.ok) throw new Error(`Odoo HTTP ${res.status}: ${res.statusText}`);
  const data = await res.json();
  if (data.error) {
    const msg = data.error.data?.message || data.error.message || JSON.stringify(data.error);
    throw new Error(`Odoo RPC: ${msg}`);
  }
  return data.result;
}

// ── Authentification ─────────────────────────────────────────────────────────

export async function authenticate(): Promise<number> {
  if (cachedUid) return cachedUid;
  if (!ODOO_LOGIN || !ODOO_PASSWORD) throw new Error("ODOO_LOGIN / ODOO_PASSWORD non configurés");

  const uid = await jsonRpc(`${ODOO_URL}/jsonrpc`, "call", {
    service: "common",
    method: "authenticate",
    args: [ODOO_DB, ODOO_LOGIN, ODOO_PASSWORD, {}],
  });

  if (!uid || typeof uid !== "number") throw new Error("Authentification Odoo échouée");
  cachedUid = uid;
  return uid;
}

// ── Appel modèle Odoo ────────────────────────────────────────────────────────

export async function call(
  model: string,
  method: string,
  args: unknown[] = [],
  kwargs: Record<string, unknown> = {},
): Promise<any> {
  const uid = await authenticate();
  return jsonRpc(`${ODOO_URL}/jsonrpc`, "call", {
    service: "object",
    method: "execute_kw",
    args: [ODOO_DB, uid, ODOO_PASSWORD, model, method, args, kwargs],
  });
}

// ── Helpers courants ─────────────────────────────────────────────────────────

export async function searchRead(
  model: string,
  domain: unknown[][],
  fields: string[],
  limit?: number,
  offset?: number,
  order?: string,
): Promise<any[]> {
  return call(model, "search_read", [domain], {
    fields,
    ...(limit !== undefined && { limit }),
    ...(offset !== undefined && { offset }),
    ...(order && { order }),
  });
}

export async function write(model: string, ids: number[], vals: Record<string, unknown>): Promise<boolean> {
  return call(model, "write", [ids, vals]);
}

export async function read(model: string, ids: number[], fields: string[]): Promise<any[]> {
  return call(model, "read", [ids, fields]);
}

// ── Test de connexion ────────────────────────────────────────────────────────

export async function testConnection(): Promise<{ ok: boolean; uid?: number; error?: string }> {
  try {
    const uid = await authenticate();
    return { ok: true, uid };
  } catch (e: any) {
    return { ok: false, error: e.message };
  }
}

export { ODOO_URL, ODOO_DB };
