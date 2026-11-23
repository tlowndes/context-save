import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { desktopShell, isDesktop, type Shell } from "./platform/desktop";
import { NudgeCard } from "./ui/NudgeCard";
import { Panel } from "./ui/Panel";
import { Settings } from "./ui/Settings";
import "./ui/styles.css";

// One bundle serves every window; `?view=` says which.
const view = new URLSearchParams(window.location.search).get("view") ?? "panel";

async function start() {
  let shell: Shell;
  if (isDesktop()) {
    shell = desktopShell();
  } else if (import.meta.env.DEV) {
    // Browser preview with a pretend inbox (see src/platform/mock.ts).
    shell = (await import("./platform/mock")).mockShell();
  } else {
    document.body.textContent = "Next Step runs as a Windows app.";
    return;
  }
  createRoot(document.getElementById("root")!).render(
    <StrictMode>{view === "settings" ? <Settings shell={shell} /> : view === "nudge" ? <NudgeCard shell={shell} /> : <Panel shell={shell} />}</StrictMode>,
  );
}

void start();
