import { useCallback, useEffect, useState } from "react";
import { summarise } from "../core/note";
import { agoLabel, appsLine, whenLabel } from "../core/time";
import type { SaveEntry } from "../core/types";
import type { AppSettings, Shell } from "../platform/desktop";
import { reportLine, restoreSave, undoRestore, type RestoreReport } from "../services/restore";
import { listSaves } from "../services/saves";
import { Alert, Tick } from "./icons";

type Phase =
  | { kind: "pick" }
  | { kind: "restoring"; done: number; total: number; label: string }
  | { kind: "done"; report: RestoreReport; entry: SaveEntry }
  | { kind: "error"; message: string };

export function RestorePanel({ shell }: { shell: Shell }) {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [saves, setSaves] = useState<SaveEntry[] | null>(null);
  const [picked, setPicked] = useState(0);
  const [tidy, setTidy] = useState(false);
  const [phase, setPhase] = useState<Phase>({ kind: "pick" });

  const open = useCallback(async () => {
    setPhase({ kind: "pick" });
    setPicked(0);
    const cfg = await shell.getSettings();
    setSettings(cfg);
    setSaves(cfg.vault ? await listSaves(shell.ports, cfg).catch(() => []) : []);
  }, [shell]);

  useEffect(() => {
    void open();
    const off = shell.onOpen("restore-open", () => void open());
    return () => void off.then((f) => f());
  }, [open, shell]);

  const close = useCallback(() => void shell.hide("restore"), [shell]);

  const restore = async () => {
    const entry = saves?.[picked];
    if (!entry || phase.kind === "restoring") return;
    setPhase({ kind: "restoring", done: 0, total: entry.save.windows.length, label: "Starting" });
    try {
      const report = await restoreSave(shell.ports, entry.save, {
        tidy,
        onProgress: (done, total, label) => setPhase({ kind: "restoring", done, total, label }),
      });
      setPhase({ kind: "done", report, entry });
    } catch (e) {
      setPhase({ kind: "error", message: e instanceof Error ? e.message : String(e) });
    }
  };

  const undo = async () => {
    if (phase.kind !== "done") return;
    await undoRestore(shell.ports, phase.report.undo);
    close();
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") close();
    if (phase.kind !== "pick" || !saves?.length) return;
    if (e.key === "ArrowDown") setPicked((p) => Math.min(p + 1, saves.length - 1));
    if (e.key === "ArrowUp") setPicked((p) => Math.max(p - 1, 0));
    if (e.key === "Enter") void restore();
  };

  const now = new Date();

  return (
    <main className="panel drag" onKeyDown={onKey} tabIndex={-1}>
      <div className="top">
        <span className="label">{phase.kind === "done" ? "Back on stand" : "Restore"}</span>
        <span className="meta">{settings?.pc}</span>
      </div>

      {phase.kind === "restoring" ? (
        <>
          <h1>Putting things back…</h1>
          <div className="bar" role="progressbar" aria-valuemin={0} aria-valuemax={phase.total} aria-valuenow={phase.done}>
            <div style={{ width: `${phase.total ? (phase.done / phase.total) * 100 : 0}%` }} />
          </div>
          <p className="lead">{phase.label}</p>
        </>
      ) : phase.kind === "done" ? (
        <>
          <h1>{phase.entry.save.note || "Welcome back"}</h1>
          <p className="lead">{reportLine(phase.report)}</p>
          <ul className="results">
            {phase.report.opened > 0 && (
              <li>
                <Tick />
                {phase.report.opened} {phase.report.opened === 1 ? "app" : "apps"} started for you
              </li>
            )}
            {phase.report.adjusted > 0 && (
              <li>
                <Tick />
                {phase.report.adjusted} fitted to this screen
              </li>
            )}
            {phase.report.problems.map((p, i) => (
              <li key={i}>
                <Alert />
                {p.reason}
              </li>
            ))}
          </ul>
          <div className="actions">
            <span className="hint">Undo puts windows back and closes nothing</span>
            <span className="spacer" />
            <button className="btn" onClick={() => void undo()}>Undo restore</button>
            <button className="btn primary" onClick={close} autoFocus>Done</button>
          </div>
        </>
      ) : settings && !settings.vault ? (
        <>
          <h1>Pick your vault first</h1>
          <p className="lead">Saves live in your Obsidian vault.</p>
          <div className="actions">
            <span className="spacer" />
            <button className="btn primary" onClick={() => void shell.show("settings")}>Open settings</button>
          </div>
        </>
      ) : saves && saves.length === 0 ? (
        <>
          <h1>No saves yet</h1>
          <p className="lead">Press {settings?.saveShortcut ?? "Ctrl+Alt+S"} any time to save where you are.</p>
          <div className="actions">
            <span className="spacer" />
            <button className="btn primary" onClick={close}>OK</button>
          </div>
        </>
      ) : (
        <>
          <div className="list" role="list" aria-label="Saves, newest first">
            {(saves ?? []).map((entry, i) => {
              const at = new Date(entry.save.created);
              const { apps } = summarise(entry.save.windows);
              return (
                <button
                  key={entry.path}
                  className="save"
                  role="listitem"
                  aria-pressed={i === picked}
                  onClick={() => setPicked(i)}
                  onDoubleClick={() => void restore()}
                >
                  <span className="row meta">
                    <span>
                      {whenLabel(at, now)} · {entry.save.pc}
                      {entry.save.setup ? ` · ${entry.save.setup}` : ""}
                    </span>
                    {i === picked && <span className="ago">{agoLabel(at, now)}</span>}
                  </span>
                  <span className={`note${entry.save.note ? "" : " empty"}`}>{entry.save.note || "No note"}</span>
                  <span className="apps">{appsLine(apps)}</span>
                </button>
              );
            })}
          </div>
          {phase.kind === "error" && <div className="notice warn" role="alert">{phase.message}</div>}
          <div className="actions">
            <label className="check">
              <input type="checkbox" checked={tidy} onChange={(e) => setTidy(e.target.checked)} />
              Tidy current windows first
            </label>
            <span className="spacer" />
            <button className="btn quiet" onClick={close}>Cancel</button>
            <button className="btn primary" onClick={() => void restore()} disabled={!saves?.length}>Restore</button>
          </div>
        </>
      )}
    </main>
  );
}
