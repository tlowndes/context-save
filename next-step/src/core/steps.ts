/**
 * Turns an email into one tiny next step. Templates always work; the
 * built-in model and Claude make better ones when they're available.
 */

export type StepSource = "template" | "model" | "claude";

export interface Step {
  text: string;
  /** Rough minutes it takes. */
  minutes: number;
  source: StepSource;
}

export interface EmailForStep {
  fromName: string;
  subject: string;
  /** The readable start of the email; may be empty. */
  body: string;
}

/** "Sam Patel" → "Sam". Organisations and odd names stay whole. */
export function firstName(name: string): string {
  const n = name.trim();
  if (!n || n.includes(",") || n.includes("@")) return n || "them";
  const word = n.split(/\s+/)[0];
  return /^[A-Z][a-z'-]+$/.test(word) ? word : n;
}

const has = (text: string, re: RegExp) => re.test(text);

/** The fallback step: picked by simple patterns in the subject and body. */
export function templateStep(e: EmailForStep): Step {
  const who = firstName(e.fromName);
  const text = `${e.subject}\n${e.body}`.toLowerCase();
  if (has(text, /\b(invoice|payment|pay|owe|balance|bill|deposit)\b/)) return { text: `Check what ${who} needs paying, then pay or reply`, minutes: 5, source: "template" };
  if (has(text, /\b(when|what time|which day|availability|available|free on|suits|slot|times?)\b.*\?|\b(any times|which day suits|when works|when are you free)\b/))
    return { text: `Send ${who} two times that work`, minutes: 3, source: "template" };
  if (has(text, /\b(are you in|in or out|can you|could you|will you|would you|are you able|do you want|yes or no)\b/)) return { text: `Reply yes or no to ${who}`, minutes: 2, source: "template" };
  if (has(text, /\b(attached|review|feedback|thoughts|have a look|take a look)\b/)) return { text: `Tell ${who} when you'll look at it`, minutes: 2, source: "template" };
  return { text: `Reply to ${who} with one line`, minutes: 3, source: "template" };
}

/** Even smaller: the step for when the first one still feels too big. */
export function smallerTemplate(e: EmailForStep, current: Step): Step {
  const who = firstName(e.fromName);
  if (/^open /i.test(current.text)) return { text: `Write the first word of a reply to ${who}`, minutes: 1, source: "template" };
  if (/^(write|start) /i.test(current.text)) return { text: `Open the email from ${who} and read it once`, minutes: 1, source: "template" };
  return { text: `Open the email from ${who} and start a reply`, minutes: 1, source: "template" };
}

export const STEP_SYSTEM = [
  "You help someone with ADHD answer emails they have been putting off.",
  "Given one email, write ONE tiny next step they can do in under 5 minutes.",
  "Rules: start with a verb; at most 10 words; name the sender by first name; no quotes, no emoji, no explanation.",
  "Prefer the smallest reply that unblocks the sender, e.g. 'Reply yes or no to Sam' or 'Send Priya two times that work'.",
  "Use UK spelling.",
].join(" ");

export function stepUserMessage(e: EmailForStep, smaller?: Step): string {
  const lines = [`From: ${e.fromName}`, `Subject: ${e.subject}`, "", e.body || "(no text)"];
  if (smaller) lines.push("", `The step "${smaller.text}" still feels too big. Give a smaller one.`);
  lines.push("", "Next step:");
  return lines.join("\n");
}

/** Qwen-style chat prompt for the built-in model. */
export function chatPrompt(system: string, user: string): string {
  return `<|im_start|>system\n${system}<|im_end|>\n<|im_start|>user\n${user}<|im_end|>\n<|im_start|>assistant\n`;
}

/** Cleans a model reply into a step, or null if it isn't usable. */
export function parseStep(raw: string, source: StepSource): Step | null {
  const line = raw
    .replace(/<\|[^|]*\|>/g, "")
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l.length > 0);
  if (!line) return null;
  const text = line
    .replace(/^(next step|step)\s*[:\-–]\s*/i, "")
    .replace(/^[-*•\d.)\s]+/, "")
    .replace(/^["'“‘]+|["'”’]+$/g, "")
    .replace(/[.!]+$/, "")
    .trim();
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length < 2 || words.length > 14) return null;
  const minutes = /\b(open|read|write the first|reply yes|reply no)\b/i.test(text) ? 2 : 4;
  return { text: text[0].toUpperCase() + text.slice(1), minutes, source };
}
