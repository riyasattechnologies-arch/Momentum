// Server-side AI gateway. The Gemini key never reaches the browser.
// GET  -> { enabled } so the UI knows whether to use Gemini or the offline engine.
// POST -> { agent, payload } -> validated JSON, or { error } (the client then falls back offline).
import { GoogleGenAI } from "@google/genai";
import { NextResponse } from "next/server";
import { z } from "zod";
import { COACH, INTAKE, PLANNER, REVISE } from "@/lib/ai/prompts";

export const runtime = "nodejs";
const MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const time = z.string().regex(/^\d{2}:\d{2}$/);
const tier = z.enum(["primary", "secondary", "tertiary"]);
const energy = z.enum(["high", "medium", "low"]);

const schemas = {
  intake: z.object({
    name: z.string(), program: z.string(), university: z.string().default(""), semesterNumber: z.number().int().min(1).max(12).default(1),
    semesterStart: date, semesterEnd: date, wake: time, sleep: time, peakEnergy: z.enum(["morning", "afternoon", "evening"]),
    weeklyHours: z.number().min(1).max(80), activeDays: z.array(z.number().int().min(0).max(6)).min(1), coachStyle: z.enum(["gentle", "coach", "drill"]),
    courses: z.array(z.object({ code: z.string(), name: z.string(), credits: z.number(), difficulty: z.number().min(1).max(5) })),
    events: z.array(z.object({ title: z.string(), kind: z.enum(["class", "work", "gym", "commute", "other"]), courseCode: z.string().nullable().optional(), weekdays: z.array(z.number().int().min(0).max(6)), start: time, end: time })),
    goals: z.array(z.object({ title: z.string(), why: z.string().default(""), category: z.enum(["academic", "career", "health", "skill", "personal"]), targetDate: date, successMetric: z.string(), priority: z.number().int().min(1).max(3) })).min(1),
  }),
  plan: z.object({
    summary: z.string(),
    goals: z.array(z.object({
      goalId: z.string(),
      milestones: z.array(z.object({
        title: z.string(), due: date, definitionOfDone: z.string(),
        tasks: z.array(z.object({ title: z.string(), tier, estimate: z.number().min(5).max(240), energy, earliest: date, due: date, courseCode: z.string().nullable().optional() })),
      })).min(1),
    })).min(1),
  }),
  revise: z.object({
    reply: z.string(), intent: z.enum(["answer", "change"]), rationale: z.string().default(""),
    diff: z.array(z.object({
      op: z.enum(["add", "change", "remove"]), objectType: z.literal("task").default("task"), id: z.string().nullable().optional(), label: z.string(),
      after: z.object({ title: z.string().optional(), tier: tier.optional(), estimate: z.number().optional(), energy: energy.optional(), earliest: date.optional(), due: date.optional(), goalId: z.string().optional() }).nullable().optional(),
      reason: z.string(),
    })).default([]),
  }),
  coach: z.object({ headline: z.string(), body: z.string() }),
};

const SYSTEM: Record<keyof typeof schemas, string> = { intake: INTAKE, plan: PLANNER, revise: REVISE, coach: COACH };

// Tiny in-memory rate limit (per server instance)
const hits = new Map<string, number[]>();
function limited(ip: string) {
  const now = Date.now();
  const arr = (hits.get(ip) ?? []).filter((t) => now - t < 60_000);
  arr.push(now);
  hits.set(ip, arr);
  return arr.length > 20;
}

export async function GET() {
  return NextResponse.json({ enabled: Boolean(process.env.GEMINI_API_KEY), model: MODEL });
}

export async function POST(req: Request) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return NextResponse.json({ error: "AI not configured" }, { status: 501 });
  const ip = req.headers.get("x-forwarded-for") ?? "local";
  if (limited(ip)) return NextResponse.json({ error: "Too many AI requests, try again in a minute" }, { status: 429 });

  let body: { agent?: string; payload?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Bad JSON" }, { status: 400 });
  }
  const agent = body.agent as keyof typeof schemas;
  if (!agent || !(agent in schemas)) return NextResponse.json({ error: "Unknown agent" }, { status: 400 });

  const ai = new GoogleGenAI({ apiKey: key });
  const contents = `Context (JSON):\n${JSON.stringify(body.payload).slice(0, 60_000)}`;
  let lastErr = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await Promise.race([
        ai.models.generateContent({
          model: MODEL,
          contents: attempt === 0 ? contents : `${contents}\n\nYour previous answer was invalid (${lastErr.slice(0, 300)}). Return valid JSON only.`,
          config: { systemInstruction: SYSTEM[agent], responseMimeType: "application/json", temperature: agent === "coach" ? 0.9 : 0.4 },
        }),
        new Promise<never>((_, rej) => setTimeout(() => rej(new Error("timeout after 45s")), 45_000)),
      ]);
      const text = res.text ?? "";
      const parsed = schemas[agent].safeParse(JSON.parse(text));
      if (parsed.success) return NextResponse.json({ data: parsed.data, model: MODEL });
      lastErr = parsed.error.message;
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e);
    }
  }
  return NextResponse.json({ error: lastErr || "AI failed" }, { status: 502 });
}
