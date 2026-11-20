import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { desktopShell, isDesktop, type Shell } from "./platform/desktop";
import { RestorePanel } from "./ui/RestorePanel";
import { SaveBox } from "./ui/SaveBox";
import { Settings } from "./ui/Settings";
import "./ui/styles.css";

// One bundle serves three windows; `?view=` says which.
const params = new URLSearchParams(window.location.search);
const view = params.get("view") ?? "restore";

async function start() {
  let shell: Shell;
  if (isDesktop()) {
    shell = desktopShell();
  } else if (import.meta.env.DEV) {
    // Browser preview with a pretend PC (see src/platform/mock.ts).
    shell = (await import("./platform/mock")).mockShell();
  } else {
    document.body.textContent = "Context Save runs as a Windows app.";
    return;
  }
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      {view === "save" ? <SaveBox shell={shell} /> : view === "settings" ? <Settings shell={shell} /> : <RestorePanel shell={shell} />}
    </StrictMode>,
  );
}

void start();
