# Context Save

One shortcut saves what you're doing: your open windows, where they sit, and a one-line "where I was" note. Another shortcut puts it all back. Built for getting interrupted, and for ADHD brains where getting back into a task costs more than the interruption did.

A Windows 10/11 tray app. Saves are plain markdown notes in your Obsidian vault, so they sync to your other PCs and Flight Deck can read them. No accounts, no network.

Built with Tauri 2, Rust, React and TypeScript, on the same base as [Keepshot](https://github.com/tlowndes/keepshot).

## Quick start

Prerequisites (one-off):

```powershell
winget install OpenJS.NodeJS.LTS   # Node 22.13+
winget install Rustlang.Rustup     # Rust (builds the desktop shell)
winget install Microsoft.VisualStudio.2022.BuildTools --override "--quiet --wait --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended"   # C++ linker Rust needs
```

Restart the terminal, then from the project folder:

```powershell
npm start
```

The first run opens Settings: choose your vault (the folder holding `.obsidian`). To build an installer: `npm run bundle`.

## Using it

| | Default |
|---|---|
| Save context | `Ctrl+Alt+S`, type where you were, Enter |
| Save and clear the screen | `Shift+Enter` in the save box (minimises everything that was saved) |
| Restore | `Ctrl+Alt+R`, or click the tray icon, pick a save, Enter |

Shortcuts can be changed in Settings. Every action has an undo: a save can be undone from the save box, and **Undo restore** moves windows back where they were and minimises anything it started. Restore never closes anything.

## How it works

**Saving.** Windows lists every top-level window with its program, title, position, maximised/minimised state and screen. Office shows only a file's name in its title bar, so Context Save looks the name up in Windows' recent files (`%APPDATA%\Microsoft\Windows\Recent\*.lnk`) to find the full path. The save is written as one note.

**Restoring.** Windows that are still open are moved back. Missing apps are started (with their file, when known) and placed once their window appears. Apps that reopen their own session (VS Code, Figma, Obsidian, browsers) are started once. On a different screen layout, each window keeps its share of the screen.

**Limits.** Restore brings back the app and the file, not your scroll position or cursor inside it; the note covers that. Store (UWP) apps and apps running as administrator can't be moved. Explorer folders come back only when "Display the full path in the title bar" is on. Firefox tabs come in Phase 2.

## Where saves live

```
<vault>/99 - Meta/Context Save/Saves/
  2026-11-20 1447.md
```

Each note reads like a note (the "Where I was" line, then the apps), with the machine data in a `context-save` code block at the end. Edit the "Where I was" text in Obsidian and the restore panel shows your edit. Writes go to a temp file that is swapped in and read back, so Obsidian Sync never picks up half a note. The app can only read and write inside `99 - Meta/Context Save` (enforced in Rust).

## Architecture

```
src/
  core/        Pure TypeScript, no I/O, unit-tested
    capture.ts   Open windows → a save
    note.ts      Save ⇄ markdown note
    matching.ts  Saved windows ⇄ windows open now
    fit.ts       Saved positions → this PC's screens
    lnk.ts       Windows shortcut (.lnk) target reader
    apps.ts      App names, system windows to skip, document names from titles
  services/    Save and restore, through ports (Desktop, Vault, Clock)
  platform/    Tauri implementation of the ports, plus a mock PC for browser previews
  ui/          Save box, restore panel, settings
src-tauri/     Rust shell: window listing and placement (Win32), launching apps,
               vault file access, tray, global shortcuts
tests/         Core unit tests and save/restore tests against a fake desktop
```

## Development

```powershell
npm test          # unit and service tests
npm run typecheck
npm run dev:web   # UI in a browser with a pretend PC: localhost:1421/?view=save | restore | settings
```

## Roadmap

1. **Save and restore apps** (this release)
2. Firefox tabs and tab groups, via a small extension
3. Named setups (Work, Play), per-PC defaults, restoring on another PC
4. Hyperfocus nudges at 90, 105 and 120 minutes, logged to the Focus log; hold-to-talk notes
5. "Where I was" card in Flight Deck
