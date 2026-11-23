import { useCallback, useEffect, useState } from "react";
import { who, type Candidate } from "../core/spot";
import { waitingLabel } from "../core/time";
import type { Shell } from "../platform/desktop";
import type { Mark } from "../core/marks";
import { check, loadMarks, markAvoiding, snooze, unmark, type InboxView } from "../services/inbox";
import { nudgeTick } from "../services/nudge";
import { finishStep, restoreMark, type StepView } from "../services/steps";
import { railCode } from "../core/tasks";
import { SortScreen } from "./SortScreen";
import { StepScreen } from "./StepScreen";

type Status = { kind: "loading" } | { kind: "ready"; view: InboxView } | { kind: "setup" } | { kind: "error"; message: string };
type Undo = { text: string; ids: string[]; restore?: Mark; run?: () => Promise<void> } | null;
type Tab = "waiting" | "sort";

/** Cards shown at once. More than this is a wall, not a nudge. */
const MAX = 5;

const Gear = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
    <circle cx="12" cy="12" r="3" />
    <path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1" />
  </svg>
);

export function Panel({ shell }: { shell: Shell }) {
  const [status, setStatus] = useState<Status>({ kind: "loading" });
  const [undo, setUndo] = useState<Undo>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [hasClaudeKey, setHasClaudeKey] = useState(false);
  const [tab, setTab] = useState<Tab>("waiting");
  const [sortCount, setSortCount] = useState<number | null>(null);
  const [sortKey, setSortKey] = useState(0);
  const onUndoable = useCallback((text: string, run: () => Promise<void>) => setUndo({ text, ids: [], run }), []);

  const refresh = useCallback(async () => {
    setStatus((s) => (s.kind === "ready" ? s : { kind: "loading" }));
    try {
      const settings = await shell.getSettings();
      setHasClaudeKey(settings.hasClaudeKey);
      if (!settings.bridgeUser || !settings.hasPassword) return setStatus({ kind: "setup" });
      const view = await check(shell.ports, settings);
      setStatus({ kind: "ready", view });
      void shell.setWaiting(view.candidates.length);
    } catch (e) {
      setStatus({ kind: "error", message: e instanceof Error ? e.message : String(e) });
    }
  }, [shell]);

  useEffect(() => {
    void refresh();
    const off = shell.onOpen("panel-open", (messageId) => {
      setUndo(null);
      setOpen(null);
      void refresh();
      setSortKey((k) => k + 1);
      // From the nudge's Show me: straight to its step if you've said it's heavy.
      if (messageId) {
        setTab("waiting");
        void loadMarks(shell.ports).then((m) => m[messageId]?.kind === "avoiding" && setOpen(messageId));
      }
    });
    return () => void off.then((f) => f());
  }, [refresh, shell]);

  // The daily nudge: the panel window lives (hidden) all day, so it keeps the clock.
  useEffect(() => {
    let busy = false;
    const tick = async () => {
      if (busy) return;
      busy = true;
      try {
        const settings = await shell.getSettings();
        if (await nudgeTick(shell.ports, settings)) await shell.showNudge();
      } catch {
        // Tried again next minute.
      } finally {
        busy = false;
      }
    };
    const first = window.setTimeout(() => void tick(), 15_000);
    const every = window.setInterval(() => void tick(), 60_000);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(every);
    };
  }, [shell]);

  const act = async (fn: () => Promise<void>, next: Undo) => {
    await fn();
    setUndo(next);
    await refresh();
  };

  const yes = async (c: Candidate) => {
    await markAvoiding(shell.ports, c);
    setUndo(null);
    // Straight to its tiny step: that's the point of saying yes.
    setOpen(c.messageId);
  };
  const notNow = (c: Candidate) => act(() => snooze(shell.ports, [c.messageId]), { text: `${who(c.from)} will come back tomorrow.`, ids: [c.messageId] });
  const snoozeAll = (cs: Candidate[]) => act(() => snooze(shell.ports, cs.map((c) => c.messageId)), { text: "All snoozed until tomorrow.", ids: cs.map((c) => c.messageId) });
  const doUndo = async () => {
    if (!undo) return;
    if (undo.run) {
      await undo.run();
      setUndo(null);
      setSortKey((k) => k + 1);
      return refresh();
    }
    await act(() => (undo.restore ? restoreMark(shell.ports, undo.ids[0], undo.restore) : unmark(shell.ports, undo.ids)), null);
  };
  const done = async (v: StepView) => {
    const before = await finishStep(shell.ports, v.messageId);
    setOpen(null);
    setUndo({ text: "Nice one. Off your list.", ids: [v.messageId], restore: before });
    await refresh();
  };

  const view = status.kind === "ready" ? status.view : null;
  const cards = view?.candidates.slice(0, MAX) ?? [];

  const footer = (
      <footer className="tray-foot">
        {undo ? (
          <>
            <span role="status">{undo.text}</span>
            <button className="link" onClick={() => void doUndo()}>Undo</button>
          </>
        ) : (
          <>
            <span className="dot-row">
              <span className={`dot${status.kind === "ready" ? " ok" : ""}`} aria-hidden="true" />
              {status.kind === "ready" ? "Bridge connected · stays on this PC" : status.kind === "loading" ? "Checking…" : "Not connected"}
            </span>
            {!open && tab === "waiting" && cards.length > 0 && <button className="link" onClick={() => void snoozeAll(view!.candidates)}>Snooze all 1 day</button>}
          </>
        )}
      </footer>
  );

  if (open) {
    return (
      <main className="panel tray">
        <StepScreen shell={shell} messageId={open} hasClaudeKey={hasClaudeKey} onBack={() => void (setOpen(null), refresh())} onDone={(v) => void done(v)} onUndoable={onUndoable} />
        {footer}
      </main>
    );
  }

  return (
    <main className="panel tray">
      <header className="tray-head">
        <div className="top">
          <span className="label">Next Step</span>
          <button className="icon-btn" aria-label="Settings" onClick={() => void shell.show("settings")}>
            <Gear />
          </button>
        </div>
        <div className="tabs" role="tablist">
          <button role="tab" aria-selected={tab === "waiting"} onClick={() => (setTab("waiting"), setUndo(null))}>
            Waiting{view ? <span className="n">{view.candidates.length}</span> : null}
          </button>
          <button role="tab" aria-selected={tab === "sort"} onClick={() => (setTab("sort"), setUndo(null))}>
            Sort{sortCount !== null ? <span className="n">{sortCount}</span> : null}
          </button>
        </div>
        {tab === "waiting" ? (
          <>
            <h1>{view && view.candidates.length === 0 ? "Nothing heavy waiting" : "Avoiding any of these?"}</h1>
            <p className="lead">
              {view && view.candidates.length === 0
                ? "Everyone who's waited 3+ days has had a reply, or you've already said."
                : "Real people, no reply for 3+ days. Tap the ones that feel heavy."}
            </p>
          </>
        ) : (
          <>
            <h1>Tidy the rest</h1>
            <p className="lead">Folders picked from where you've filed things before. People waiting on a reply stay put.</p>
          </>
        )}
      </header>

      {tab === "sort" && status.kind === "ready" ? (
        <SortScreen shell={shell} onUndoable={onUndoable} refreshKey={sortKey} onCount={setSortCount} />
      ) : (
      <div className="list" aria-live="polite">
        {status.kind === "loading" && <div className="notice">Checking your mail…</div>}
        {status.kind === "setup" && (
          <div className="notice warn">
            Add your Bridge login to start.{" "}
            <button className="link" onClick={() => void shell.show("settings")}>Open settings</button>
          </div>
        )}
        {status.kind === "error" && (
          <div className="notice warn">
            {status.message} <button className="link" onClick={() => void refresh()}>Try again</button>
          </div>
        )}
        {cards.map((c, i) => (
          <article key={c.messageId} className={`card${i === 0 ? " first" : ""}`}>
            <div className="row">
              <span className="who">{who(c.from)}</span>
              <span className={`meta${i === 0 ? " hot" : ""}`}>{waitingLabel(c.days)}</span>
            </div>
            <div className="subject">{c.subject}</div>
            <div className="row gap">
              <button className={`btn grow${i === 0 ? " primary" : ""}`} onClick={() => void yes(c)}>Yes, I'm avoiding it</button>
              <button className="btn" onClick={() => void notNow(c)}>Not now</button>
            </div>
          </article>
        ))}
        {view && view.candidates.length > MAX && <div className="meta more">+{view.candidates.length - MAX} more after these</div>}
        {view && view.avoiding.length > 0 && (
          <section className="avoiding tear">
            <span className="meta">You said these feel heavy · tap one for a tiny step</span>
            <ul>
              {view.avoiding.map((a) => (
                <li key={a.messageId}>
                  <button className="heavy" onClick={() => (setUndo(null), setOpen(a.messageId))}>
                    <span>
                      <span className="who">{a.from}</span> <span className="muted">{a.subject}</span>
                    </span>
                    <span className="next">{a.step ? a.step.text : "Get a tiny step"}{a.railId ? ` · ${railCode(a.railId)}` : ""} →</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
      )}

      {footer}
    </main>
  );
}
