/**
 * What we know about common Windows apps: a friendly name, which windows to
 * leave out of a save, and how to read the open document from a title bar.
 */

const NAMES: Record<string, string> = {
  "winword.exe": "Word",
  "excel.exe": "Excel",
  "powerpnt.exe": "PowerPoint",
  "outlook.exe": "Outlook",
  "onenote.exe": "OneNote",
  "code.exe": "VS Code",
  "figma.exe": "Figma",
  "obsidian.exe": "Obsidian",
  "firefox.exe": "Firefox",
  "chrome.exe": "Chrome",
  "msedge.exe": "Edge",
  "explorer.exe": "Explorer",
  "photoshop.exe": "Photoshop",
  "illustrator.exe": "Illustrator",
  "afterfx.exe": "After Effects",
  "acrobat.exe": "Acrobat",
  "notepad.exe": "Notepad",
  "spotify.exe": "Spotify",
  "slack.exe": "Slack",
  "discord.exe": "Discord",
  "windowsterminal.exe": "Terminal",
  "keepshot.exe": "Keepshot",
};

/** Programs whose windows are part of Windows itself, never a user's context. */
const SYSTEM_EXES = new Set([
  "applicationframehost.exe",
  "shellexperiencehost.exe",
  "startmenuexperiencehost.exe",
  "searchhost.exe",
  "searchapp.exe",
  "textinputhost.exe",
  "systemsettings.exe",
  "lockapp.exe",
  "widgets.exe",
  "context-save.exe",
]);

export const exeName = (exe: string): string => (exe.split(/[\\/]/).pop() ?? exe).toLowerCase();

export function appName(exe: string): string {
  const name = exeName(exe);
  if (NAMES[name]) return NAMES[name];
  const stem = name.replace(/\.exe$/, "");
  return stem ? stem.charAt(0).toUpperCase() + stem.slice(1) : "App";
}

/** True for windows that belong in a save. */
export function isUserWindow(w: { title: string; exe: string; rect: { w: number; h: number } }): boolean {
  if (!w.title.trim() || !w.exe) return false;
  if (SYSTEM_EXES.has(exeName(w.exe))) return false;
  if (w.title === "Program Manager") return false;
  return w.rect.w >= 80 && w.rect.h >= 60;
}

/**
 * The document name a title bar shows, for apps that put it there.
 * Returns a bare file name ("Brief.docx") or an absolute path when the app shows one.
 */
export function documentFromTitle(exe: string, title: string): string | null {
  const name = exeName(exe);
  const t = title.trim();
  const before = (suffix: RegExp) => {
    const m = t.match(suffix);
    return m ? t.slice(0, m.index).trim() : null;
  };
  switch (name) {
    case "winword.exe":
    case "excel.exe":
    case "powerpnt.exe": {
      // "Brief.docx - Word", "Budget.xlsx  -  Compatibility Mode - Excel", "Deck.pptx - Saved - PowerPoint"
      const doc = before(/\s+-\s+(Word|Excel|PowerPoint)$/);
      if (!doc) return null;
      const file = doc.split(/\s+-\s+/)[0].trim();
      return /\.\w{2,5}$/.test(file) ? file : null;
    }
    case "notepad.exe": {
      const doc = before(/\s+-\s+Notepad$/)?.replace(/^\*/, "");
      return doc && doc !== "Untitled" ? doc : null;
    }
    case "acrobat.exe": {
      const doc = before(/\s+-\s+Adobe Acrobat.*$/);
      return doc && /\.pdf$/i.test(doc) ? doc : null;
    }
    case "explorer.exe":
      // Explorer shows a full path only with "Display the full path in the title bar" on.
      return isAbsolutePath(t) ? t : null;
    default:
      return null;
  }
}

export const isAbsolutePath = (p: string): boolean => /^[a-zA-Z]:[\\/]/.test(p) || p.startsWith("\\\\");

/**
 * Apps that reopen their own last session when started with no arguments,
 * so relaunching the program is enough to bring their work back.
 */
const SELF_RESTORING = new Set(["code.exe", "figma.exe", "obsidian.exe", "firefox.exe", "chrome.exe", "msedge.exe", "slack.exe", "discord.exe", "spotify.exe"]);
export const restoresItself = (exe: string): boolean => SELF_RESTORING.has(exeName(exe));

/** Apps that only ever have one main window: a second launch just focuses the first. */
const SINGLE_WINDOW = new Set(["figma.exe", "obsidian.exe", "spotify.exe", "slack.exe", "discord.exe", "outlook.exe"]);
export const isSingleWindow = (exe: string): boolean => SINGLE_WINDOW.has(exeName(exe));
