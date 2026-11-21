import { useCallback, useEffect, useState } from "react";
import type { StepSource } from "../core/steps";
import type { Shell } from "../platform/desktop";
import { makeStep, type StepMode, type StepView } from "../services/steps";

const SOURCE: Record<StepSource, string> = { template: "Simple template", model: "Built-in model", claude: "Claude" };

interface Props {
  shell: Shell;
  messageId: string;
  hasClaudeKey: boolean;
  onBack(): void;
  onDone(view: StepView): void;
}

/** One email you're avoiding, turned into one tiny step. */
export function StepScreen({ shell, messageId, hasClaudeKey, onBack, onDone }: Props) {
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
              <span className="chip">{SOURCE[view.step.source]}</span>
            </div>
          )}
        </article>
        {view?.note && !busy && <div className="notice">{view.note}</div>}
        {error && <div className="notice warn">{error}</div>}

        <div className="step-actions">
          <button className="btn primary" disabled={!view || busy !== null} onClick={() => view && onDone(view)}>Done</button>
          <button className="btn" disabled={!view || busy !== null} onClick={() => void run("smaller")}>Make it smaller</button>
        </div>
        <div className="ask tear">
          <button className="btn quiet" disabled={!view || busy !== null} onClick={() => (hasClaudeKey ? void run("claude") : void shell.show("settings"))}>
            {hasClaudeKey ? "Ask Claude instead" : "Set up Ask Claude"}
          </button>
          <span className="help">{hasClaudeKey ? "Sends just this email to Claude." : "Optional. Needs your own API key."}</span>
        </div>
      </div>
    </>
  );
}
