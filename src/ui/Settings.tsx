import { useCallback, useEffect, useState } from "react";
import type { AppSettings, HotkeyFailure, Shell } from "../platform/desktop";
import { savesDir } from "../services/ports";

export function Settings({ shell }: { shell: Shell }) {
  const [draft, setDraft] = useState<AppSettings | null>(null);
  const [status, setStatus] = useState<{ kind: "ok" | "warn"; text: string } | null>(null);

  const load = useCallback(async () => {
    setDraft(await shell.getSettings());
    setStatus(null);
  }, [shell]);

  useEffect(() => {
    void load();
    const off = shell.onOpen("settings-open", () => void load());
    return () => void off.then((f) => f());
  }, [load, shell]);

  if (!draft) return null;
  const set = (patch: Partial<AppSettings>) => setDraft({ ...draft, ...patch });

  const pick = async () => {
    const folder = await shell.pickFolder();
    if (folder) set({ vault: folder });
  };

  const save = async () => {
    try {
      const failures: HotkeyFailure[] = await shell.setSettings(draft);
      setStatus(
        failures.length
          ? { kind: "warn", text: failures.map((f) => `${f.accelerator}: ${f.reason}`).join(" ") }
          : { kind: "ok", text: "Saved. Your shortcuts are ready." },
      );
    } catch (e) {
      setStatus({ kind: "warn", text: e instanceof Error ? e.message : String(e) });
    }
  };

  return (
    <main className="panel" style={{ border: 0 }}>
      <div className="top">
        <span className="label">Settings</span>
      </div>
      <div className="form">
        <div>
          <label className="title" htmlFor="vault">Obsidian vault</label>
          <div className="path">
            <input id="vault" className="field plain" value={draft.vault} readOnly placeholder="Not chosen yet" />
            <button className="btn" onClick={() => void pick()}>Choose…</button>
          </div>
          <div className="help">{draft.vault ? <>Saves go in <code>{savesDir(draft.vault)}</code></> : "The folder that holds your .obsidian folder."}</div>
        </div>
        <div>
          <label className="title" htmlFor="pc">This PC's name</label>
          <input id="pc" className="field plain" value={draft.pc} onChange={(e) => set({ pc: e.target.value })} />
          <div className="help">Shown on each save, so you can tell your PCs apart.</div>
        </div>
        <div className="row2">
          <div>
            <label className="title" htmlFor="save-key">Save shortcut</label>
            <input id="save-key" className="field plain" value={draft.saveShortcut} onChange={(e) => set({ saveShortcut: e.target.value })} />
          </div>
          <div>
            <label className="title" htmlFor="restore-key">Restore shortcut</label>
            <input id="restore-key" className="field plain" value={draft.restoreShortcut} onChange={(e) => set({ restoreShortcut: e.target.value })} />
          </div>
        </div>
        {status && <div className={`notice${status.kind === "warn" ? " warn" : ""}`} role="status">{status.text}</div>}
      </div>
      <div className="actions">
        <span className="hint">Closing this window keeps Context Save in the tray.</span>
        <span className="spacer" />
        <button className="btn primary" onClick={() => void save()} disabled={!draft.vault}>Save settings</button>
      </div>
    </main>
  );
}
