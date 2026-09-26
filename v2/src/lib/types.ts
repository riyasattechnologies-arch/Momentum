// Momentum ontology: every object the app, the AI and the database share.

export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6; // 0 = Sunday
export type Tier = "primary" | "secondary" | "tertiary";
export type Energy = "high" | "medium" | "low";
export type CoachStyle = "gentle" | "coach" | "drill";
export type PeakEnergy = "morning" | "afternoon" | "evening";

export interface Profile {
  name: string;
  university: string;
  program: string;
  semesterNumber: number;
  semesterStart: string; // YYYY-MM-DD
  semesterEnd: string;
  wake: string; // HH:MM
  sleep: string;
  peakEnergy: PeakEnergy;
  maxFocus: number; // minutes
  weeklyHours: number; // hours available for goal work
  activeDays: Weekday[];
  coachStyle: CoachStyle;
  reminderLead: number; // minutes
  remindersOn: boolean;
  examWeeks: string[]; // week-start dates (Mondays) that are exam weeks
}

export interface Course {
  id: string;
  code: string;
  name: string;
  credits: number;
  difficulty: number; // 1-5
  targetGrade: string;
}

export type EventKind = "class" | "work" | "gym" | "commute" | "other";
export interface FixedEvent {
  id: string;
  title: string;
  kind: EventKind;
  courseId?: string;
  weekdays: Weekday[];
  start: string;
  end: string;
  location?: string;
}

export type GoalCategory = "academic" | "career" | "health" | "skill" | "personal";
export interface Goal {
  id: string;
  title: string;
  why: string;
  category: GoalCategory;
  targetDate: string;
  successMetric: string;
  priority: 1 | 2 | 3;
  color: string;
}

export type Status = "todo" | "done" | "skipped";
export interface Milestone {
  id: string;
  goalId: string;
  title: string;
  due: string;
  definitionOfDone: string;
  status: "open" | "done";
  order: number;
}

export interface Task {
  id: string;
  goalId: string;
  milestoneId?: string;
  courseId?: string;
  title: string;
  tier: Tier;
  estimate: number; // minutes
  energy: Energy;
  earliest: string;
  due: string;
  status: Status;
  source: "ai" | "user";
  doneAt?: string;
  rolledCount?: number;
}

export interface PlanVersion {
  id: string;
  version: number;
  summary: string;
  agreedAt: string;
  taskCount: number;
  milestoneCount: number;
  weeklyMinutes: number;
}

export type Patch = Partial<Task> & { definitionOfDone?: string; order?: number };
export type DiffOp = "add" | "change" | "remove";
export interface DiffItem {
  op: DiffOp;
  objectType: "task" | "milestone";
  id?: string;
  label: string;
  before?: Patch;
  after?: Patch;
  reason: string;
}

export interface Proposal {
  id: string;
  kind: "initial" | "chat_edit" | "replan";
  rationale: string;
  diff: DiffItem[];
  status: "pending" | "approved" | "rejected";
  createdAt: string;
  source: "gemini" | "offline";
  // For initial proposals the whole plan travels with the proposal
  plan?: { milestones: Milestone[]; tasks: Task[] };
}

export type BlockKind = "task" | "class" | "event" | "break" | "meal";
export interface TimeBlock {
  id: string;
  date: string;
  start: string;
  end: string;
  kind: BlockKind;
  taskId?: string;
  eventId?: string;
  title: string;
  part?: string; // "1/2"
  locked?: boolean;
  state?: "pending" | "started" | "done" | "skipped" | "missed";
  snoozedUntil?: string;
}

export interface CheckIn {
  date: string;
  type: "morning" | "evening";
  mood?: number;
  energy?: number;
  notes?: string;
  aiMessage?: string;
}

export interface ActionLogEntry {
  id: string;
  at: string; // ISO
  actor: "ai" | "user" | "system";
  action: string;
  objectType: string;
  objectId?: string;
  reason?: string;
}

export interface ChatMessage {
  id: string;
  thread: "intake" | "planning" | "daily";
  role: "user" | "assistant";
  content: string;
  proposalId?: string;
  at: string;
}
