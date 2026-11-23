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
  let settings: AppSettings = { bridgeUser: ME, host: "127.0.0.1", port: 1143, sentFolder: "Sent", aliases: "", skip: "", minDays: 3, hasPassword: true, hasClaudeKey: false, autoSort: true, vault: "C:\\Users\\Tom\\Vault" };
  const files = new Map<string, string>();
  const inbox = [
    mail('"Sam Patel" <sam@example.com>', "Re: Saturday, are you in or out?", 6),
    mail('"Recruiter, Studio North" <jobs@studionorth.co>', "Portfolio review: any times next week?", 4),
    mail("Landlord <lettings@example.co.uk>", "Boiler service: which day suits?", 3),
    mail("Design Weekly <hello@designweekly.com>", "Issue 212", 5, { "List-Unsubscribe": "<mailto:u@designweekly.com>" }),
    mail("Mum <mum@example.com>", "Sunday lunch?", 5),
    mail("Design Weekly <hello@designweekly.com>", "Issue 213", 2, { "List-Unsubscribe": "<mailto:u@designweekly.com>" }),
    mail("Amazon.co.uk <auto-confirm@amazon.co.uk>", "Your order of Pantone swatches", 1),
    mail("Amazon.co.uk <auto-confirm@amazon.co.uk>", "Dispatched: Pantone swatches", 0),
    mail("Monzo <help@monzo.com>", "Your November statement", 2, { "List-Id": "<statements.monzo.com>" }),
    mail("Figma <updates@figma.com>", "Config 2027: save the date", 1, { "List-Unsubscribe": "<mailto:u@figma.com>" }),
  ];
  // Where you've filed things before, so the Sort tab has something to learn from.
  const boxes: Record<string, RawMessage[]> = {
    INBOX: inbox,
    "Folders/Newsletters": [mail("Design Weekly <hello@designweekly.com>", "Issue 210", 20), mail("Design Weekly <hello@designweekly.com>", "Issue 211", 13)],
    "Folders/Receipts": [mail("Amazon.co.uk <auto-confirm@amazon.co.uk>", "Your order of a desk lamp", 40)],
    "Folders/Money": [mail("Monzo <help@monzo.com>", "Your October statement", 32)],
    "Folders/Job hunt": [],
    Archive: [],
  };
  const idOf = (r: RawMessage) => /Message-ID: (.*)/.exec(r.headers)?.[1] ?? "";
  const bodies: Record<string, string> = {
    "<m100@mock>": "Hey! Saturday at Rob's from 7. Are you in or out? Need numbers by Thursday.",
    "<m101@mock>": "Hi Tom, thanks for sending your portfolio. Any times next week for a 30 minute review call?",
    "<m102@mock>": "Hello, the boiler service is due. Which day suits you next week? Mornings only.",
  };
  // Pretend download: ~1.1 GB in about 6 seconds.
  let model: ModelStatus = { state: "missing", sizeMb: 1120 };
  const sent = [mail(`Tom <${ME}>`, "Re: Sunday lunch?", 1, { To: "mum@example.com", "In-Reply-To": "<m104@mock>" })];
  let note: string | null = "# Next steps\n\n- [x] #task Send the landlord two times #mail 📅 2026-11-14 🆔 mai003 ✅ 2026-11-14\n";
  const ports: Ports = {
    vault: {
      read: async () => {
        if (!settings.vault) throw new Error("Choose your Obsidian vault in Settings first.");
        return note;
      },
      write: async (t) => {
        if (!settings.vault) throw new Error("Choose your Obsidian vault in Settings first.");
        note = t;
        console.info("[mock vault] Next steps.md\n" + t);
      },
    },
    // Pretend Flight Deck: prints after a moment and gives the line a rail id, as the real one does.
    flightDeck: {
      open: async (link) => {
        const body = new URL(link.replace("flightdeck://", "https://x/")).searchParams.get("task") ?? "";
        setTimeout(() => {
          if (!note) return;
          const n = [...note.matchAll(/🆔 mai(\d{3})/g)].reduce((m, x) => Math.max(m, Number(x[1])), 3) + 1;
          note = note.replace(`- [ ] ${body}`, `- [ ] ${body} 🆔 mai${String(n).padStart(3, "0")}`);
          console.info("[mock Flight Deck] printed " + body);
        }, 1500);
      },
    },
    mail: {
      fetch: async () => (await new Promise((r) => setTimeout(r, 400)), { inbox: [...inbox], sent }),
      folders: async () => ["INBOX", "Sent", "Drafts", "Archive", "Spam", "Trash", "All Mail", ...Object.keys(boxes).filter((b) => b.startsWith("Folders/")), "Labels/Work"],
      fetchFolder: async (f) => [...(boxes[f] ?? [])],
      move: async (ids, from, to) => {
        const src = boxes[from];
        const dst = (boxes[to] ??= []);
        let n = 0;
        for (const id of ids) {
          const i = src?.findIndex((r) => idOf(r) === id) ?? -1;
          if (i >= 0) (dst.push(...src.splice(i, 1)), n++);
        }
        return n;
      },
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
        if (prompt.includes("Folders:")) return prompt.includes("figma") ? "Newsletters" : "none";
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
    pickFolder: async () => "C:\\Users\\Tom\\Vault",
    setWaiting: async () => undefined,
    hide: async () => undefined,
    show: async () => undefined,
    onOpen: async () => () => undefined,
  };
}
