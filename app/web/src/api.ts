export const BASE = new URL("./", document.baseURI).pathname;
export const url = (p: string) => BASE + "api/" + p;

export class AuthError extends Error {}

export async function api<T = any>(p: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const opts: RequestInit = { credentials: "same-origin", ...init };
  if (init?.json !== undefined) {
    opts.body = JSON.stringify(init.json);
    opts.headers = { "content-type": "application/json", ...(init.headers || {}) };
  }
  const r = await fetch(url(p), opts);
  if (r.status === 401) throw new AuthError("login");
  const body = r.headers.get("content-type")?.includes("json") ? await r.json() : await r.text();
  if (!r.ok) throw new Error((body as any)?.error || String(r.status));
  return body as T;
}

export type Module = { id: string; name: string; icon: string; color: string; semester: number; docs: number };
export type Chat = { id: string; title: string; module: string; created: number; updated: number };
export type Att = { name: string; file: string; mime: string; size: number; pages?: number };
export type Msg = { id: number; chat_id: string; role: "user" | "assistant"; content: string; attachments: Att[]; meta: { videos?: string[] }; created: number };
export type Video = { id: string; chat_id: string; message_id: number; title: string; style: string; status: string; progress: number; error: string | null; duration: number | null; created: number };
export type Doc = { id: string; module: string; title: string; filename: string; kind: string; pages: number; status: string; scanned: string; error: string | null; created: number };
export type Note = { id: number; note: string; created: number };
