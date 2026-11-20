import { useCallback, useEffect, useRef, useState } from "react";
import { appName } from "../core/apps";
import { userWindows } from "../core/capture";
import { whenLabel } from "../core/time";
import type { AppSettings, Shell } from "../platform/desktop";
import { deleteSave, saveContext, takeSnapshot, type Saved, type Snapshot } from "../services/saves";

type Phase = { kind: "edit" } | { kind: "saving" } | { kind: "saved"; saved: Saved } | { kind: "error"; message: string };

const pad = (n: number) => String(n).padStart(2, "0");

export function SaveBox({ shell }: { shell: Shell }) {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [note, setNote] = useState("");
  const [phase, setPhase] = useState<Phase>({ kind: "edit" });
  const input = useRef<HTMLInputElement>(null);
  const hideTimer = useRef<number | undefined>(undefined);

  const open = useCallback(async () => {
    window.clearTimeout(hideTimer.current);
    setPhase({ kind: "edit" });
    setNote("");
    // Snapshot first: this is the moment the person pressed the shortcut.
    const [s, cfg] = await Promise.all([takeSnapshot(shell.ports).catch(() => null), shell.getSettings()]);
    setSnap(s);
    setSettings(cfg);
    requestAnimationFrame(() => input.current?.focus());
  }, [shell]);

  useEffect(() => {
    void open();
    const off = shell.onOpen("save-open", () => void open());
    return () => void off.then((f) => f());
  }, [open, shell]);

  const close = useCallback(() => void shell.hide("save"), [shell]);

  const save = async (clear: boolean) => {
    if (!snap || !settings?.vault || phase.kind === "saving") return;
    setPhase({ kind: "saving" });
    try {
      const saved = await saveContext(shell.ports, settings, snap, note);
      if (clear) await shell.ports.desktop.minimiseWindows(userWindows(snap.live).map((w) => w.hwnd));
      setPhase({ kind: "saved", saved });
      hideTimer.current = window.setTimeout(close, 4000);
    } catch (e) {
      setPhase({ kind: "error", message: e instanceof Error ? e.message : String(e) });
    }
  };

  const undo = async () => {
    if (phase.kind !== "saved") return;
    window.clearTimeout(hideTimer.current);
    await deleteSave(shell.ports, phase.saved.path).catch(() => undefined);
    setPhase({ kind: "edit" });
    requestAnimationFrame(() => input.current?.focus());
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") close();
    if (e.key === "Enter" && phase.kind === "edit") void save(e.shiftKey);
  };

  const windows = snap ? userWindows(snap.live) : [];
  const apps = [...new Set(windows.map((w) => appName(w.exe)))];
  const at = snap?.at ?? new Date();

  return (
    <main className="panel drag" onKeyDown={onKey}>
      <div className="top">
        <span className="label">Save context</span>
        <span className="meta">
          {pad(at.getHours())}:{pad(at.getMinutes())} · {settings?.pc ?? ""}
        </span>
      </div>

      {settings && !settings.vault ? (
        <>
          <h1>Pick your vault first</h1>
          <p className="lead">Saves are notes in your Obsidian vault, so Context Save needs to know where it is.</p>
          <div className="actions">
            <span className="spacer" />
            <button className="btn primary" onClick={() => void shell.show("settings")}>Open settings</button>
          </div>
        </>
      ) : phase.kind === "saved" ? (
        <>
          <h1>Saved. Go do the thing.</h1>
          <p className="lead">
            {phase.saved.save.note ? `“${phase.saved.save.note}”` : "No note this time"} · {apps.length} {apps.length === 1 ? "app" : "apps"} · {whenLabel(at, new Date())}
          </p>
          <div className="actions">
            <span className="hint">Closes by itself</span>
            <span className="spacer" />
            <button className="btn" onClick={() => void undo()}>Undo</button>
            <button className="btn primary" onClick={close}>Done</button>
          </div>
        </>
      ) : (
        <>
          <label htmlFor="note" style={{ fontSize: 22, fontWeight: 600 }}>
            Where were you?
          </label>
          <input
            id="note"
            ref={input}
            className="field"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="One line for future you, e.g. halfway through card 3"
            autoComplete="off"
            spellCheck
          />
          <div className="tear chips" aria-label="What will be saved">
            {apps.length ? apps.map((a) => <span className="chip" key={a}>{a}</span>) : <span className="chip">Nothing open</span>}
          </div>
          {phase.kind === "error" && <div className="notice warn" role="alert">{phase.message}</div>}
          <div className="actions">
            <span className="hint">Enter saves · Shift+Enter saves and clears · Esc</span>
            <span className="spacer" />
            <button className="btn" onClick={() => void save(true)} disabled={phase.kind === "saving"}>Save and clear</button>
            <button className="btn primary" onClick={() => void save(false)} disabled={phase.kind === "saving"}>
              {phase.kind === "saving" ? "Saving…" : "Save"}
            </button>
          </div>
        </>
      )}
    </main>
  );
}
