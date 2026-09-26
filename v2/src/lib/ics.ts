// Minimal .ics reader for class timetables: turns weekly VEVENTs into intake lines like "CS1428 Mon Wed 14:00-15:20".
const BYDAY: Record<string, string> = { SU: "Sun", MO: "Mon", TU: "Tue", WE: "Wed", TH: "Thu", FR: "Fri", SA: "Sat" };
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function icsToLines(text: string): string[] {
  const unfolded = text.replace(/\r?\n[ \t]/g, "");
  const events = unfolded.split("BEGIN:VEVENT").slice(1).map((e) => e.split("END:VEVENT")[0]);
  const lines = new Set<string>();
  for (const ev of events) {
    const get = (k: string) => ev.match(new RegExp(`^${k}[^:\\n]*:(.*)$`, "m"))?.[1]?.trim();
    const summary = (get("SUMMARY") ?? "Class").replace(/\\,/g, ",");
    const ds = get("DTSTART");
    const de = get("DTEND");
    if (!ds || !de || ds.length < 13) continue;
    const t = (v: string) => `${v.slice(9, 11)}:${v.slice(11, 13)}`;
    const rrule = get("RRULE") ?? "";
    const by = rrule.match(/BYDAY=([A-Z,]+)/)?.[1];
    const days = by ? by.split(",").map((d) => BYDAY[d.slice(-2)]).filter(Boolean) : [DOW[new Date(+ds.slice(0, 4), +ds.slice(4, 6) - 1, +ds.slice(6, 8)).getDay()]];
    if (!rrule && !/WEEKLY/.test(rrule) && events.length > 40) continue; // skip one-off noise in big calendars
    lines.add(`${summary} ${days.join(" ")} ${t(ds)}-${t(de)}`);
  }
  return [...lines];
}
