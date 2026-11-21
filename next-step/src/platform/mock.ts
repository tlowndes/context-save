/**
 * Dev-only stand-in for the desktop, for `npm run dev:web` and screenshots.
 * A pretend inbox with three people waiting, a newsletter and one you've answered.
 */
import type { RawMessage } from "../core/headers";
import type { AppSettings, ModelStatus, Ports } from "../services/ports";
import type { Shell } from "./desktop";

const ME = "tom@proton.me";
let uid = 100;
const mail = (from: string, subject: string, daysAgo: number, extra: Record<string, string> = {}): RawMessage => {
  const date = new Date(Date.now() - daysAgo * 86_400_000);
  const id = `<m${uid}@mock>`;
  const h = { From: from, To: ME, Subject: subject, Date: date.toUTCString(), "Message-ID": id, ...extra };
  return { uid: uid++, headers: Object.entries(h).map(([k, v]) => `${k}: ${v}`).join("\r\n"), internalDate: date.toISOString() };
};

export function mockShell(): Shell {
  let settings: AppSettings = { bridgeUser: ME, host: "127.0.0.1", port: 1143, sentFolder: "Sent", aliases: "", skip: "", minDays: 3, hasPassword: true, hasClaudeKey: false };
  const files = new Map<string, string>();
  const inbox = [
    mail('"Sam Patel" <sam@example.com>', "Re: Saturday, are you in or out?", 6),
    mail('"Recruiter, Studio North" <jobs@studionorth.co>', "Portfolio review: any times next week?", 4),
    mail("Landlord <lettings@example.co.uk>", "Boiler service: which day suits?", 3),
    mail("Design Weekly <hello@designweekly.com>", "Issue 212", 5, { "List-Unsubscribe": "<mailto:u@designweekly.com>" }),
    mail("Mum <mum@example.com>", "Sunday lunch?", 5),
  ];
  const bodies: Record<string, string> = {
    "<m100@mock>": "Hey! Saturday at Rob's from 7. Are you in or out? Need numbers by Thursday.",
    "<m101@mock>": "Hi Tom, thanks for sending your portfolio. Any times next week for a 30 minute review call?",
    "<m102@mock>": "Hello, the boiler service is due. Which day suits you next week? Mornings only.",
  };
  // Pretend download: ~1.1 GB in about 6 seconds.
  let model: ModelStatus = { state: "missing", sizeMb: 1120 };
  const sent = [mail(`Tom <${ME}>`, "Re: Sunday lunch?", 1, { To: "mum@example.com", "In-Reply-To": "<m104@mock>" })];
  const ports: Ports = {
    mail: {
      fetch: async () => (await new Promise((r) => setTimeout(r, 400)), { inbox, sent }),
      message: async (id) => (bodies[id] ? `Content-Type: text/plain; charset=utf-8\r\n\r\n${bodies[id]}\r\n` : null),
    },
    model: {
      status: async () => model,
      download: async () => {
        if (model.state === "downloading") return;
        const total = 1_120_000_000;
        let done = 0;
        model = { state: "downloading", done, total };
        const t = setInterval(() => {
          done = Math.min(total, done + total / 30);
          model = done >= total ? { state: "ready" } : { state: "downloading", done, total };
          if (done >= total) clearInterval(t);
        }, 200);
      },
      generate: async (prompt) => {
        await new Promise((r) => setTimeout(r, 700));
        if (prompt.includes("still feels too big")) return "Open the email and type one word";
        if (prompt.includes("Saturday")) return "Tell Sam you're in for Saturday";
        if (prompt.includes("review call")) return "Send the recruiter two times next week";
        return "Pick a morning and tell the landlord";
      },
    },
    claude: {
      ask: async () => {
        await new Promise((r) => setTimeout(r, 900));
        if (!settings.hasClaudeKey) throw new Error("Add a Claude API key in Settings first.");
        return "Text Sam: I'm in for Saturday, see you at 7";
      },
    },
    store: { read: async (n) => files.get(n) ?? null, write: async (n, t) => void files.set(n, t) },
    clock: { now: () => new Date() },
  };
  return {
    ports,
    getSettings: async () => settings,
    setSettings: async (next, password, claudeKey) =>
      void (settings = {
        ...next,
        hasPassword: next.hasPassword || password.length > 0,
        hasClaudeKey: claudeKey === undefined ? settings.hasClaudeKey : claudeKey.length > 0,
      }),
    testBridge: async () => "Connected to Bridge. 5 emails in the last 31 days.",
    setWaiting: async () => undefined,
    hide: async () => undefined,
    show: async () => undefined,
    onOpen: async () => () => undefined,
  };
}
