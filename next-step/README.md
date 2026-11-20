# Next Step

Spots the emails you've been avoiding and, from Phase 2, turns each one into a single tiny step, like "Reply yes or no to Sam". Built for ADHD brains, where an unanswered email gets heavier every day it sits there.

A Windows 10/11 tray app for **Proton Mail** via **Proton Mail Bridge**. It only reads: it never sends, deletes, moves or marks anything as read. Mail stays on your PC.

Built with Tauri 2, Rust, React and TypeScript, on the same shell and look as [Context Save](../README.md). It lives in this repo for now and can move to its own later.

## Quick start

Prerequisites (one-off): Node 22.13+, Rust and the C++ build tools, as in Context Save's README. Proton Mail Bridge must be installed, signed in and running.

```powershell
cd next-step
npm start
```

The first run opens Settings. In Bridge, open your account and copy the IMAP details:

| Setting | Where it comes from |
|---|---|
| Bridge username | Bridge's IMAP username (your Proton address) |
| Bridge password | Bridge's own password, **not** your Proton password. Saved in Windows Credential Manager. |
| IMAP host / port | Usually `127.0.0.1` and `1143` (STARTTLS, Bridge's default) |
| Sent folder | Usually `Sent` |

Press **Save and test**. Then click the tray icon.

To build an installer: `npm run bundle`. GitHub Actions also builds one on every pull request that touches `next-step/` (artefact `next-step-installer`).

## What counts as "avoiding"

An email shows up when all of these are true:

- It's from a real person: no `List-Unsubscribe`, `List-Id` or `Precedence: bulk` header, not an auto-reply, and not from a `noreply`/`notifications`/`mailer-daemon`-style address.
- It was sent **to** you (your Bridge address or one of "Your other addresses"), not just copied in.
- It's been waiting at least 3 days (changeable) and no more than 30.
- You haven't sent anything into that conversation since it arrived (checked against your Sent folder by `Message-ID`, `In-Reply-To` and `References`).
- It isn't on your "Never show" list (addresses or whole domains).

Several unanswered emails in one conversation show as one card. The longest waiting comes first, five at a time.

**Yes, I'm avoiding it** moves the email to "You said these feel heavy". **Not now** hides it until 9am tomorrow. Both have an Undo. These choices are kept in `marks.json` in the app's own folder on this PC, never in the vault, because they mention who emailed you.

## Privacy

- The Rust side connects only to a loopback address (`127.0.0.1`, `localhost`, `::1`) and refuses anything else. Because of that, it accepts Bridge's self-signed certificate.
- Folders are opened with `EXAMINE` (read-only) and only headers are fetched, with `BODY.PEEK`, so nothing is marked as read. No email bodies are read or stored in Phase 1.
- The web view has no network access at all (see the CSP in `tauri.conf.json`).

## Architecture

```
src/
  core/        Pure TypeScript, no I/O, unit-tested
    headers.ts   Raw header block → message (RFC 2047 words, address lists, threading ids)
    spot.ts      Which emails you're probably avoiding
    marks.ts     Avoiding / snoozed, kept per Message-ID
  services/    Uses the ports below
    inbox.ts     Check mail, mark, snooze, undo
  platform/    desktop.ts (Tauri) and mock.ts (browser preview)
  ui/          Panel.tsx (tray flyout) and Settings.tsx
src-tauri/src/
  mail.rs      Bridge over IMAP: STARTTLS, EXAMINE, header-only fetch
  secrets.rs   Bridge password in Windows Credential Manager
  settings.rs  Settings file in the app's config folder
  tray.rs      Tray icon, menu and "N waiting" tooltip
  windows.rs   Panel by the tray, settings window
```

`npm run dev:web` opens the UI in a browser with a pretend inbox (`?view=panel` or `?view=settings`).

## Tests

```powershell
npm test                                       # TypeScript: header parsing, spotting rules, marks
cargo test --manifest-path src-tauri/Cargo.toml   # Rust: loopback-only check
```

## Roadmap

1. **Read and spot** (this): Bridge, the rules above, the tray panel.
2. **Tiny steps**: template steps, then a local model through Ollama, then Make it smaller and Ask Claude (one email, only when you tap it).
3. **Vault**: accepted steps become Tasks-plugin lines with a 🆔 in `00 - Inbox/Next steps.md`; replies in Sent clear them.
4. **Paper**: Flight Deck's Ticket Rail morning run, plus `flightdeck://print/<id>` for Print now.
5. **Nudges and write-up**: a daily toast, snooze options, the portfolio case study.
