import type { Shell } from "../platform/desktop";

/** Minimise and close for the frameless panels. Close hides to the tray. */
export function WindowControls({ shell, which }: { shell: Shell; which: "save" | "restore" }) {
  return (
    <span className="wc">
      <button className="wc-btn" aria-label="Minimise" title="Minimise" onClick={() => void shell.minimise(which)}>
        <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M2 6h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
      </button>
      <button className="wc-btn close" aria-label="Close" title="Close (Esc)" onClick={() => void shell.hide(which)}>
        <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
      </button>
    </span>
  );
}
