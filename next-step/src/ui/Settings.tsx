import { useCallback, useEffect, useState } from "react";
import type { Shell } from "../platform/desktop";
import type { AppSettings, ModelStatus } from "../services/ports";

type Status = { kind: "ok" | "warn"; text: string } | null;

export function Settings({ shell }: { shell: Shell }) {
  const [draft, setDraft] = useState<AppSettings | null>(null);
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<Status>(null);
  const [busy, setBusy] = useState(false);
  const [claudeKey, setClaudeKey] = useState("");
  const [removeKey, setRemoveKey] = useState(false);
  const [model, setModel] = useState<ModelStatus | null>(null);

  const load = useCallback(async () => {
    setDraft(await shell.getSettings());
    setPassword("");
    setClaudeKey("");
    setRemoveKey(false);
    setStatus(null);
    setModel(await shell.ports.model.status().catch(() => null));
  }, [shell]);

  // While the model downloads, check its progress every half second.
  useEffect(() => {
    if (model?.state !== "downloading") return;
    const t = setTimeout(async () => setModel(await shell.ports.model.status().catch(() => model)), 500);
    return () => clearTimeout(t);
  }, [model, shell]);

  const download = async () => {
    await shell.ports.model.download().catch((e) => setModel({ state: "error", message: String(e) }));
    setModel(await shell.ports.model.status());
  };

  useEffect(() => {
    void load();
    const off = shell.onOpen("settings-open", () => void load());
    return () => void off.then((f) => f());
  }, [load, shell]);

  if (!draft) return null;
  const set = (patch: Partial<AppSettings>) => setDraft({ ...draft, ...patch });

  const save = async (andTest: boolean) => {
    setBusy(true);
    try {
      await shell.setSettings(draft, password, removeKey ? "" : claudeKey.trim() || undefined);
      setPassword("");
      setClaudeKey("");
      setRemoveKey(false);
      const fresh = await shell.getSettings();
      setDraft(fresh);
      setStatus({ kind: "ok", text: andTest ? await shell.testBridge() : "Saved." });
    } catch (e) {
      setStatus({ kind: "warn", text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="panel" style={{ border: 0 }}>
      <div className="top">
        <span className="label">Settings</span>
      </div>
      <div className="form">
        <p className="lead">
          Next Step reads your mail through Proton Mail Bridge, on this PC only. In Bridge, open your account and copy the IMAP details. It never sends, deletes or marks anything as read.
        </p>
        <div>
          <label className="title" htmlFor="user">Bridge username</label>
          <input id="user" className="field plain" value={draft.bridgeUser} onChange={(e) => set({ bridgeUser: e.target.value.trim() })} placeholder="you@proton.me" autoComplete="off" />
        </div>
        <div>
          <label className="title" htmlFor="pw">Bridge password</label>
          <input id="pw" className="field plain" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder={draft.hasPassword ? "Saved. Type to replace it." : "From Bridge, not your Proton password"} autoComplete="off" />
          <div className="help">Kept in Windows Credential Manager, not in a file.</div>
        </div>
        <div className="row2">
          <div>
            <label className="title" htmlFor="host">IMAP host</label>
            <input id="host" className="field plain" value={draft.host} onChange={(e) => set({ host: e.target.value.trim() })} />
          </div>
          <div>
            <label className="title" htmlFor="port">IMAP port</label>
            <input id="port" className="field plain" inputMode="numeric" value={draft.port || ""} onChange={(e) => set({ port: Number(e.target.value.replace(/\D/g, "")) || 0 })} />
          </div>
        </div>
        <div className="row2">
          <div>
            <label className="title" htmlFor="sent">Sent folder</label>
            <input id="sent" className="field plain" value={draft.sentFolder} onChange={(e) => set({ sentFolder: e.target.value })} />
          </div>
          <div>
            <label className="title" htmlFor="days">Waiting at least (days)</label>
            <input id="days" className="field plain" inputMode="numeric" value={draft.minDays || ""} onChange={(e) => set({ minDays: Number(e.target.value.replace(/\D/g, "")) || 0 })} />
          </div>
        </div>
        <div>
          <label className="title" htmlFor="aliases">Your other addresses</label>
          <textarea id="aliases" className="field plain" rows={2} value={draft.aliases} onChange={(e) => set({ aliases: e.target.value })} placeholder="hello@yourdomain.co.uk" />
          <div className="help">Emails sent to these count as sent to you.</div>
        </div>
        <div>
          <label className="title" htmlFor="skip">Never show</label>
          <textarea id="skip" className="field plain" rows={2} value={draft.skip} onChange={(e) => set({ skip: e.target.value })} placeholder="nhs.net, bank.co.uk, someone@example.com" />
          <div className="help">Addresses or whole domains, one per line or comma separated.</div>
        </div>
        <section className="tear model">
          <label className="title">Built-in model</label>
          <ModelRow model={model} onDownload={() => void download()} />
          <div className="help">Writes your tiny steps on this PC. Nothing you read leaves it. Without it, Next Step uses simple templates.</div>
        </section>
        <div>
          <label className="title" htmlFor="ck">Claude API key (optional)</label>
          <input
            id="ck"
            className="field plain"
            type="password"
            value={claudeKey}
            onChange={(e) => (setClaudeKey(e.target.value), setRemoveKey(false))}
            placeholder={draft.hasClaudeKey && !removeKey ? "Saved. Type to replace it." : "sk-ant-…"}
            autoComplete="off"
          />
          <div className="help">
            Only used when you tap Ask Claude, and only sends that one email. Kept in Windows Credential Manager.{" "}
            {draft.hasClaudeKey && !removeKey && (
              <button className="link" onClick={() => (setRemoveKey(true), setClaudeKey(""))}>Remove key</button>
            )}
            {removeKey && "Removed when you save."}
          </div>
        </div>
        {status && (
          <div className={`notice${status.kind === "warn" ? " warn" : ""}`} role="status">
            {status.text}
          </div>
        )}
      </div>
      <div className="actions">
        <span className="hint">Only connects to Bridge on this PC.</span>
        <span className="spacer" />
        <button className="btn" disabled={busy} onClick={() => void save(false)}>Save</button>
        <button className="btn primary" disabled={busy || !draft.bridgeUser || (!draft.hasPassword && !password)} onClick={() => void save(true)}>
          Save and test
        </button>
      </div>
    </main>
  );
}

const mb = (bytes: number) => `${Math.round(bytes / 1_000_000).toLocaleString("en-GB")} MB`;

function ModelRow({ model, onDownload }: { model: ModelStatus | null; onDownload(): void }) {
  if (!model) return <div className="notice">Checking…</div>;
  switch (model.state) {
    case "ready":
      return (
        <div className="dot-row model-row">
          <span className="dot ok" aria-hidden="true" /> Ready · Qwen2.5 1.5B, runs on this PC
        </div>
      );
    case "downloading":
      return (
        <div className="model-row col">
          <div className="bar" role="progressbar" aria-valuemin={0} aria-valuemax={model.total} aria-valuenow={model.done}>
            <div style={{ width: `${model.total ? (model.done / model.total) * 100 : 0}%` }} />
          </div>
          <span className="help">Downloading… {mb(model.done)} of {mb(model.total)}. You can close this window.</span>
        </div>
      );
    case "error":
      return (
        <div className="model-row col">
          <div className="notice warn">{model.message}</div>
          <button className="btn" onClick={onDownload}>Try again</button>
        </div>
      );
    default:
      return (
        <div className="model-row">
          <button className="btn" onClick={onDownload}>Download ({(model.sizeMb / 1000).toFixed(1)} GB)</button>
          <span className="help">One-off, from Hugging Face.</span>
        </div>
      );
  }
}
