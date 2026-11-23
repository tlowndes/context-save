import { useCallback, useEffect, useRef, useState } from "react";
import type { StepSource } from "../core/steps";
import type { Shell } from "../platform/desktop";
import { railCode } from "../core/tasks";
import { makeStep, type StepMode, type StepView } from "../services/steps";
import { addTask, printNow, railIdOf, removeAddedTask } from "../services/tasks";

const SOURCE: Record<StepSource, string> = { template: "Simple template", model: "Built-in model", claude: "Claude" };

/** How long to watch the vault for Flight Deck's rail id after Print now. */
const PRINT_WAIT_MS = 30_000;

type Print = { state: "idle" } | { state: "sending" } | { state: "printed"; id: string; at: Date } | { state: "quiet" };

const hm = (d: Date) => `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;

const PrinterIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M7 9V3h10v6" />
    <rect x="3" y="9" width="18" height="8" rx="2" />
    <path d="M7 14h10v7H7z" />
  </svg>
);

interface Props {
  shell: Shell;
  messageId: string;
  hasClaudeKey: boolean;
  onBack(): void;
  onDone(view: StepView): void;
  onUndoable(text: string, undo: () => Promise<void>): void;
}

/** One email you're avoiding, turned into one tiny step. */
export function StepScreen({ shell, messageId, hasClaudeKey, onBack, onDone, onUndoable }: Props) {
  const [view, setView] = useState<StepView | null>(null);
  const [busy, setBusy] = useState<StepMode | null>("first");
  const [error, setError] = useState<string | null>(null);
  const [print, setPrint] = useState<Print>({ state: "idle" });
  const watching = useRef<number | null>(null);

  const stopWatching = () => {
    if (watching.current !== null) window.clearInterval(watching.current);
    watching.current = null;
  };
  useEffect(() => stopWatching, []);

  const run = useCallback(
    async (mode: StepMode) => {
      setBusy(mode);
      setError(null);
      try {
        setView(await makeStep(shell.ports, messageId, mode));
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setBusy(null);
      }
    },
    [shell, messageId],
  );

  useEffect(() => void run("first"), [run]);

  // Already printed (morning run, or Print now earlier)? Show it as on the rail.
  const task = view?.task ?? null;
  useEffect(() => {
    if (!task) return;
    let live = true;
    void railIdOf(shell.ports, task).then((id) => {
      if (live && id) setPrint((p) => (p.state === "idle" ? { state: "printed", id, at: new Date() } : p));
    });
    return () => {
      live = false;
    };
  }, [shell, task]);

  /** Hands the task to Flight Deck, then watches the note until Flight Deck gives the line its rail id. */
  const toPrinter = async () => {
    if (!task) return;
    setError(null);
    stopWatching();
    setPrint({ state: "sending" });
    try {
      await printNow(shell.ports, task);
    } catch (e) {
      setPrint({ state: "idle" });
      setError(`Couldn't open Flight Deck: ${e instanceof Error ? e.message : String(e)}`);
      return;
    }
    const started = Date.now();
    const was = print.state === "printed" ? print.id : null;
    watching.current = window.setInterval(() => {
      void railIdOf(shell.ports, task).then((id) => {
        if (id && (id !== was || Date.now() - started > 4000)) {
          stopWatching();
          setPrint({ state: "printed", id, at: new Date() });
        } else if (Date.now() - started > PRINT_WAIT_MS) {
          stopWatching();
          setPrint(was ? { state: "printed", id: was, at: new Date() } : { state: "quiet" });
        }
      });
    }, 1000);
  };

  const toTasks = async () => {
    setError(null);
    try {
      const body = await addTask(shell.ports, messageId);
      setView((v) => (v ? { ...v, task: body } : v));
      onUndoable("Added to Next steps.", async () => {
        stopWatching();
        await removeAddedTask(shell.ports, messageId);
        setPrint({ state: "idle" });
        setView((v) => (v ? { ...v, task: null } : v));
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const excerpt = view?.email.body ? view.email.body.split("\n").filter(Boolean).slice(0, 3).join(" ").slice(0, 180) : "";

  return (
    <>
      <header className="tray-head">
        <div className="top">
          <button className="link back" onClick={onBack}>← Back</button>
          <span className="label">Your next step</span>
        </div>
        <h1>{view ? view.email.fromName : "…"}</h1>
        <p className="lead">{view?.email.subject ?? ""}</p>
      </header>

      <div className="list" aria-live="polite">
        {excerpt && <blockquote className="excerpt">{excerpt}{view && view.email.body.length > excerpt.length ? "…" : ""}</blockquote>}
        <article className="card first step-card" aria-busy={busy !== null}>
          {print.state === "printed" ? (
            <div className="rail-head">
              <span className="label">On the rail</span>
              <span className="rail-code">{railCode(print.id)}</span>
            </div>
          ) : (
            <span className="label">Do this</span>
          )}
          <p className={`step${busy ? " thinking" : ""}`}>{busy ? (busy === "claude" ? "Asking Claude…" : "Thinking of a small step…") : view?.step.text}</p>
          {view && !busy && (
            <div className="chips">
              <span className="chip hot">~{view.step.minutes} min</span>
              {print.state === "printed" ? (
                <span className="chip task">PRT {hm(print.at)}</span>
              ) : view.task ? (
                <span className="chip task">#MAIL · due today</span>
              ) : (
                <span className="chip">{SOURCE[view.step.source]}</span>
              )}
            </div>
          )}
        </article>
        {view?.note && !busy && <div className="notice">{view.note}</div>}
        {view?.task && !busy && (
          <div className={`notice with-icon${print.state === "quiet" ? " warn" : ""}`} role="status">
            {print.state === "printed" ? (
              <>
                <svg className="ok" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12l4 4L19 6" /></svg>
                <span>Printed. Hang it on the rail. Reply to {view.email.fromName.split(" ")[0]} and it ticks itself, or spike it and scan the QR.</span>
              </>
            ) : print.state === "sending" ? (
              <span>Sending to Flight Deck…</span>
            ) : print.state === "quiet" ? (
              <span>Flight Deck didn't say it printed. Is the printer on? It stays in your tasks and prints with tomorrow's morning run.</span>
            ) : (
              <>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
                <span>In your tasks. It prints with tomorrow's morning run, or now if it can't wait.</span>
              </>
            )}
          </div>
        )}
        {error && <div className="notice warn">{error}</div>}

        <div className="step-actions">
          {view?.task ? (
            print.state === "printed" ? (
              <>
                <button className="btn primary" onClick={() => onDone(view)}>Done</button>
                <button className="btn" onClick={() => void toPrinter()}>Print again</button>
              </>
            ) : (
              <>
                <button className="btn primary with-icon" disabled={busy !== null || print.state === "sending"} onClick={() => void toPrinter()}>
                  <PrinterIcon />
                  {print.state === "quiet" ? "Try again" : "Print now"}
                </button>
                <button className="btn" disabled={busy !== null} onClick={() => onDone(view)}>Done</button>
              </>
            )
          ) : (
            <>
              <button className="btn primary" disabled={!view || busy !== null} onClick={() => void toTasks()}>Add to my tasks</button>
              <button className="btn" disabled={!view || busy !== null} onClick={() => void run("smaller")}>Make it smaller</button>
            </>
          )}
        </div>
        {view?.task && print.state !== "printed" && <span className="help center">Prints on the pocket printer, through Flight Deck on this PC</span>}
        {view && !view.task && (
          <button className="link done-now" disabled={busy !== null} onClick={() => onDone(view)}>Did it already? Mark it done</button>
        )}
        {!view?.task && (
        <div className="ask tear">
          <button className="btn quiet" disabled={!view || busy !== null} onClick={() => (hasClaudeKey ? void run("claude") : void shell.show("settings"))}>
            {hasClaudeKey ? "Ask Claude instead" : "Set up Ask Claude"}
          </button>
          <span className="help">{hasClaudeKey ? "Sends just this email to Claude." : "Optional. Needs your own API key."}</span>
        </div>
        )}
      </div>
    </>
  );
}
