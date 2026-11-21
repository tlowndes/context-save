import { useCallback, useEffect, useState } from "react";
import { label, TRUST_AFTER, type Moved, type SortGroup, type Suggestion } from "../core/sort";
import type { Shell } from "../platform/desktop";
import { checkSort, guessFolders, leaveSender, moveGroup, undoMove, unleaveSender, type SortView } from "../services/sort";

type Status = { kind: "loading" } | { kind: "ready"; view: SortView } | { kind: "error"; message: string };

/** Groups shown at once. */
const MAX = 6;

interface Props {
  shell: Shell;
  /** Tells the panel what can be undone from its footer. */
  onUndoable(text: string, undo: () => Promise<void>): void;
  /** Bumped by the panel to ask for a fresh check (e.g. after an Undo). */
  refreshKey: number;
  onCount(n: number): void;
}

function why(s: Suggestion, streak: number): string {
  switch (s.reason) {
    case "trusted":
      return "Moves by itself";
    case "sender":
      return s.seen > 0 ? `You've filed ${s.seen} of theirs there` : `Your pick last time · ${streak} of ${TRUST_AFTER} to trust`;
    case "domain":
      return `Others from their company are there`;
    case "model":
      return "Built-in model's guess";
  }
}

export function SortScreen({ shell, onUndoable, refreshKey, onCount }: Props) {
  const [status, setStatus] = useState<Status>({ kind: "loading" });
  const [pick, setPick] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setStatus((s) => (s.kind === "ready" ? s : { kind: "loading" }));
    try {
      const settings = await shell.getSettings();
      let view = await checkSort(shell.ports, settings);
      setStatus({ kind: "ready", view });
      onCount(view.groups.length);
      if (view.autoMoved > 0) {
        const latest = view.moved.find((m) => m.auto)?.at;
        const moved = view.moved.filter((m) => m.auto && m.at === latest);
        onUndoable(`Moved ${view.autoMoved} from trusted senders.`, async () => {
          for (const m of moved) await undoMove(shell.ports, m);
        });
      }
      // Then ask the built-in model about senders with no history, if it's there.
      view = await guessFolders(shell.ports, view);
      setStatus({ kind: "ready", view });
    } catch (e) {
      setStatus({ kind: "error", message: e instanceof Error ? e.message : String(e) });
    }
  }, [shell, onUndoable, onCount]);

  useEffect(() => void refresh(), [refresh, refreshKey]);

  const move = async (g: SortGroup, folder: string) => {
    setBusy(g.sender);
    try {
      const m = await moveGroup(shell.ports, g, folder);
      onUndoable(`Moved ${g.messageIds.length} to ${label(folder)}.`, () => undoMove(shell.ports, m));
      await refresh();
    } catch (e) {
      setStatus({ kind: "error", message: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(null);
    }
  };

  const leave = async (g: SortGroup) => {
    await leaveSender(shell.ports, g.sender);
    onUndoable(`${g.name} stays in your inbox.`, () => unleaveSender(shell.ports, g.sender));
    await refresh();
  };

  const undo = async (m: Moved) => {
    await undoMove(shell.ports, m);
    await refresh();
  };

  const view = status.kind === "ready" ? status.view : null;
  const groups = view?.groups.slice(0, MAX) ?? [];

  return (
    <div className="list" aria-live="polite">
      {status.kind === "loading" && <div className="notice">Looking through your folders…</div>}
      {status.kind === "error" && (
        <div className="notice warn">
          {status.message} <button className="link" onClick={() => void refresh()}>Try again</button>
        </div>
      )}
      {view && view.folders.length === 0 && <div className="notice">No folders yet. Make some in Proton Mail and they'll show up here.</div>}
      {view && view.folders.length > 0 && groups.length === 0 && <div className="notice">Nothing to sort. People waiting on a reply always stay put.</div>}

      {view &&
        groups.map((g, i) => {
          const chosen = pick[g.sender] ?? g.suggestion?.folder ?? "";
          return (
            <article key={g.sender} className={`card sort${i === 0 ? " first" : ""}`} aria-busy={busy === g.sender}>
              <div className="row">
                <span className="who">{g.name}</span>
                <span className="meta">{g.messageIds.length === 1 ? "1 EMAIL" : `${g.messageIds.length} EMAILS`}</span>
              </div>
              <div className="subject">
                {g.subjects[0]}
                {g.messageIds.length > 1 && g.subjects.length > 1 ? <span className="muted"> · {g.subjects[1]}</span> : null}
              </div>
              {g.suggestion && !pick[g.sender] && (
                <div className="why">
                  <span className="to">→ {label(g.suggestion.folder)}</span> <span className="muted">{why(g.suggestion, g.streak)}</span>
                </div>
              )}
              <div className="row gap">
                <select className="field plain pick" aria-label={`Folder for ${g.name}`} value={chosen} onChange={(e) => setPick({ ...pick, [g.sender]: e.target.value })}>
                  {!chosen && <option value="">Choose a folder…</option>}
                  {view.folders.map((f) => (
                    <option key={f} value={f}>{label(f)}</option>
                  ))}
                </select>
                <button className={`btn${i === 0 ? " primary" : ""}`} disabled={!chosen || busy !== null} onClick={() => void move(g, chosen)}>
                  Move
                </button>
                <button className="btn" disabled={busy !== null} onClick={() => void leave(g)}>Leave</button>
              </div>
            </article>
          );
        })}
      {view && view.groups.length > MAX && <div className="meta more">+{view.groups.length - MAX} more senders after these</div>}

      {view && view.moved.length > 0 && (
        <section className="avoiding tear">
          <span className="meta">Moved today</span>
          <ul className="moved">
            {view.moved.map((m) => (
              <li key={`${m.sender}-${m.at}`}>
                <span>
                  <span className="who">{m.name}</span> <span className="muted">→ {label(m.to)}{m.auto ? " · by itself" : ""}</span>
                </span>
                <button className="link" onClick={() => void undo(m)}>Undo</button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
