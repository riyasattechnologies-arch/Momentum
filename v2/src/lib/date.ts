// Local-date helpers. Dates are "YYYY-MM-DD" strings, times are "HH:MM".
import type { Weekday } from "./types";

export const DAY_MS = 86_400_000;

export function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
export function parse(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}
export function today(): string {
  return iso(new Date());
}
export function addDays(s: string, n: number): string {
  const d = parse(s);
  d.setDate(d.getDate() + n);
  return iso(d);
}
export function diffDays(a: string, b: string): number {
  return Math.round((parse(b).getTime() - parse(a).getTime()) / DAY_MS);
}
export function weekday(s: string): Weekday {
  return parse(s).getDay() as Weekday;
}
export function mondayOf(s: string): string {
  const wd = weekday(s);
  return addDays(s, wd === 0 ? -6 : 1 - wd);
}
export function toMin(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}
export function fromMin(m: number): string {
  const c = Math.max(0, Math.min(24 * 60 - 1, Math.round(m)));
  return `${String(Math.floor(c / 60)).padStart(2, "0")}:${String(c % 60).padStart(2, "0")}`;
}
export function nowMin(): number {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
}
export function fmtDate(s: string, opts: Intl.DateTimeFormatOptions = { weekday: "short", day: "numeric", month: "short" }): string {
  return parse(s).toLocaleDateString("en-US", opts);
}
export function fmtTime(t: string): string {
  const m = toMin(t);
  const h = Math.floor(m / 60);
  const mm = m % 60;
  const ap = h >= 12 ? "pm" : "am";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return mm ? `${h12}:${String(mm).padStart(2, "0")}${ap}` : `${h12}${ap}`;
}
export const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
export function range(start: string, days: number): string[] {
  return Array.from({ length: days }, (_, i) => addDays(start, i));
}
export function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-3);
}
