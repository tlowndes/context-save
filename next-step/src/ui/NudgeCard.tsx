import { useEffect, useState } from "react";
import type { Nudge } from "../core/nudge";
import type { Shell } from "../platform/desktop";
import { currentNudge, nudgeLater } from "../services/nudge";

/** Left alone this long, the card tucks itself away (it's still done for today). */
const HIDE_AFTER_MS = 2 * 60_000;

/** The daily nudge: a small card by the clock, in its own window. */
export function NudgeCard({ shell }: { shell: Shell }) {
  const [nudge, setNudge] = useState<Nudge | null>(null);

  useEffect(() => {
    let timer = 0;
    const load = () => {
      void currentNudge(shell.ports).then(setNudge);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => void shell.hide("nudge"), HIDE_AFTER_MS);
    };
    load();
    const off = shell.onOpen("nudge-open", load);
    return () => {
      window.clearTimeout(timer);
      void off.then((f) => f());
    };
  }, [shell]);

  if (!nudge) return <main className="nudge" />;

  return (
    <main className="nudge" role="alertdialog" aria-labelledby="nudge-title" aria-describedby="nudge-body">
      <div className="nudge-head">
        <span className="nudge-mark" aria-hidden="true">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
        </span>
        <span className="nudge-label">{nudge.label}</span>
        {nudge.more > 0 && <span className="nudge-more">+{nudge.more} more</span>}
      </div>
      <div id="nudge-title" className="nudge-title">{nudge.title}</div>
      <div id="nudge-body" className="nudge-body">{nudge.body}</div>
      <div className="nudge-actions">
        <button className="btn primary" onClick={() => void shell.openEmail(nudge.messageId)}>Show me</button>
        <button className="btn" onClick={() => void nudgeLater(shell.ports).then(() => shell.hide("nudge"))}>Later today</button>
      </div>
    </main>
  );
}
