import { useCallback, useEffect, useState } from "react";
import type { StepSource } from "../core/steps";
import type { Shell } from "../platform/desktop";
import { ticketCode } from "../core/tasks";
import { makeStep, type StepMode, type StepView } from "../services/steps";
import { addTask, removeAddedTask } from "../services/tasks";

const SOURCE: Record<StepSource, string> = { template: "Simple template", model: "Built-in model", claude: "Claude" };

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

  const toTasks = async () => {
    setError(null);
    try {
      const id = await addTask(shell.ports, messageId);
      setView((v) => (v ? { ...v, taskId: id } : v));
      onUndoable(`Added to Next steps as ${ticketCode(id)}.`, async () => {
        await removeAddedTask(shell.ports, messageId);
        setView((v) => (v ? { ...v, taskId: null } : v));
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
          <span className="label">Do this</span>
          <p className={`step${busy ? " thinking" : ""}`}>{busy ? (busy === "claude" ? "Asking Claude…" : "Thinking of a small step…") : view?.step.text}</p>
          {view && !busy && (
            <div className="chips">
              <span className="chip hot">~{view.step.minutes} min</span>
              {view.taskId ? <span className="chip task">{ticketCode(view.taskId)} · in your tasks, due today</span> : <span className="chip">{SOURCE[view.step.source]}</span>}
            </div>
          )}
        </article>
        {view?.note && !busy && <div className="notice">{view.note}</div>}
        {error && <div className="notice warn">{error}</div>}

        <div className="step-actions">
          {view?.taskId ? (
            <button className="btn primary" disabled={busy !== null} onClick={() => onDone(view)}>Done</button>
          ) : (
            <button className="btn primary" disabled={!view || busy !== null} onClick={() => void toTasks()}>Add to my tasks</button>
          )}
          {view?.taskId ? (
            <button className="btn" onClick={onBack}>Later</button>
          ) : (
            <button className="btn" disabled={!view || busy !== null} onClick={() => void run("smaller")}>Make it smaller</button>
          )}
        </div>
        {view && !view.taskId && (
          <button className="link done-now" disabled={busy !== null} onClick={() => onDone(view)}>Did it already? Mark it done</button>
        )}
        {!view?.taskId && (
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
