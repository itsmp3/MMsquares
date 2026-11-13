import type { AdminBox, Game, HistoryYear, Pool, PayoutRow, PublicBox } from "../shared/types";

export interface PoolSummary {
  id: number;
  year: number;
  name: string;
  is_current: number;
  drawn_at: string | null;
}

export interface PublicState {
  pool: Pool | null;
  pools: PoolSummary[];
  boxes: PublicBox[];
  games: Game[];
}

export interface AdminState {
  pool: Pool | null;
  pools: PoolSummary[];
  boxes: AdminBox[];
  games: Game[];
  payouts: PayoutRow[];
  collectors: string[];
  payMethods: string[];
  lastSync: { at: string; found: number; updated: number; errors: string[]; dates: string[] } | null;
  knownNames: string[];
  me?: { email: string; label: string | null };
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export async function api<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const res = await fetch(path, {
    method: init?.method ?? (init?.body ? "POST" : "GET"),
    headers: init?.body ? { "content-type": "application/json" } : undefined,
    body: init?.body ? JSON.stringify(init.body) : undefined,
    credentials: "same-origin",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, (data as { error?: string }).error ?? `Request failed (${res.status})`);
  return data as T;
}

export const getPublicState = (poolId?: number | null) =>
  api<PublicState>(`/api/state${poolId ? `?pool=${poolId}` : ""}`);
export const getAdminState = (poolId?: number | null) =>
  api<AdminState>(`/api/admin/state${poolId ? `?pool=${poolId}` : ""}`);
export const getHistory = () => api<{ years: HistoryYear[] }>("/api/history");
export const getMe = () => api<{ admin: boolean; email: string | null; label: string | null }>("/api/me");

export const money = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
/** D1 stores UTC as "YYYY-MM-DD HH:MM:SS". */
export function fmtDate(s: string | null | undefined) {
  if (!s) return "";
  const d = new Date(s.includes("T") ? s : s.replace(" ", "T") + "Z");
  return isNaN(d.getTime()) ? s : d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export const boxLabel =(n: number) => `Box ${String(n).padStart(2, "0")}`;
