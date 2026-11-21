# Next Step

Spots the emails you've been avoiding and turns each one into a single tiny step, like "Reply yes or no to Sam". Built for ADHD brains, where an unanswered email gets heavier every day it sits there.

A Windows 10/11 tray app for **Proton Mail** via **Proton Mail Bridge**. It only reads: it never sends, deletes, moves or marks anything as read. Mail stays on your PC, unless you tap **Ask Claude** on one email.

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

**Yes, I'm avoiding it** opens that email's tiny step (below) and keeps it under "You said these feel heavy". **Not now** hides it until 9am tomorrow. Both have an Undo. These choices are kept in `marks.json` in the app's own folder on this PC, never in the vault, because they mention who emailed you.

## Tiny steps

Each email you're avoiding gets one step you can do in a few minutes, written by the first of these that works:

1. **Ask Claude** (only when you tap it, and only with your own API key, saved in Credential Manager). Sends that one email's readable text to Anthropic's API (`claude-opus-5-5`).
2. **The built-in model**: Qwen2.5 1.5B Instruct, 4-bit GGUF (~1.1 GB), run on the CPU by [candle](https://github.com/huggingface/candle). Settings → **Download** fetches it once from Hugging Face into the app's data folder and checks it against the SHA-256 Hugging Face publishes; the checked hash is saved beside it in `model.json`. After that it runs offline.
3. **Templates**, which always work: "Reply yes or no to Sam", "Send Sam two times that work", and so on.

**Make it smaller** steps down ("Open the email from Sam and start a reply" → "Write the first word of a reply to Sam" → …) and never repeats the step you just had. **Done** takes it off your list; if it's still unanswered it comes back tomorrow. The step is kept with the mark, so reopening it doesn't rerun the model.

## Privacy

- The Rust side connects only to a loopback address (`127.0.0.1`, `localhost`, `::1`) and refuses anything else. Because of that, it accepts Bridge's self-signed certificate.
- Folders are opened with `EXAMINE` (read-only) and everything is fetched with `BODY.PEEK`, so nothing is marked as read. The list only reads headers; one email's body (the first 256 KB) is read only when you open its step, and it isn't stored.
- The web view has no network access at all (see the CSP in `tauri.conf.json`). The only other connections the Rust side makes are the one-off model download from Hugging Face and Ask Claude.

## Architecture

```
src/
  core/        Pure TypeScript, no I/O, unit-tested
    headers.ts   Raw header block → message (RFC 2047 words, address lists, threading ids)
    spot.ts      Which emails you're probably avoiding
    marks.ts     Avoiding / snoozed, kept per Message-ID
    mime.ts      Raw email → readable text (multipart, base64, quoted-printable, HTML, quotes cut)
    steps.ts     Templates, "make it smaller", the prompt, cleaning a model's reply
  services/    Uses the ports below
    inbox.ts     Check mail, mark, snooze, undo
    steps.ts     Picks Claude / built-in model / template, remembers the step
  platform/    desktop.ts (Tauri) and mock.ts (browser preview)
  ui/          Panel.tsx (tray flyout), StepScreen.tsx and Settings.tsx
src-tauri/src/
  mail.rs      Bridge over IMAP: STARTTLS, EXAMINE, BODY.PEEK fetches
  model.rs     Built-in model: download + checksum, candle Qwen2, greedy decoding
  claude.rs    Ask Claude over the Messages API
  secrets.rs   Bridge password and Claude key in Windows Credential Manager
  settings.rs  Settings file in the app's config folder
  tray.rs      Tray icon, menu and "N waiting" tooltip
  windows.rs   Panel by the tray, settings window
```

`npm run dev:web` opens the UI in a browser with a pretend inbox (`?view=panel` or `?view=settings`).

## Tests

```powershell
npm test                                       # TypeScript: headers, spotting, marks, MIME, steps
cargo test --manifest-path src-tauri/Cargo.toml   # Rust: loopback-only, safe Message-IDs, Claude replies
```

## Roadmap

1. **Read and spot**: Bridge, the rules above, the tray panel.
2. **Tiny steps** (this): templates, the built-in model, Make it smaller, Ask Claude.
3. **Sorting**: suggest a folder for the rest and move it with one tap; auto-move per sender once trusted, always with Undo.
4. **Vault**: accepted steps become Tasks-plugin lines with a 🆔 in `00 - Inbox/Next steps.md`; replies in Sent clear them.
5. **Paper**: Flight Deck's Ticket Rail morning run, plus `flightdeck://print/<id>` for Print now.
6. **Nudges and write-up**: a daily toast, snooze options, the portfolio case study.
