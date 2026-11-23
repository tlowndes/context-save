# Next Step: turning the emails I put off into one tiny thing to do

**Snapshot:** solo designer and product owner, built with Claude · Windows tray app (Tauri, React, Rust), Proton Mail, Obsidian, a 58 mm thermal printer · November 2026

## The problem

Some emails sit in my inbox for days. They aren't hard. They're heavy. "Are you in or out for Saturday?" needs a ten-second reply, but it turns into a small dread I walk past every time I open mail. Inbox tools sort and snooze. None of them help with the bit that's actually stuck: starting.

## The idea

Turn each of those emails into one tiny step. Not "deal with Sam's email", but "Reply yes or no to Sam" (~2 min). Small enough that starting stops being the hard part.

## How it works

**1. Ask, don't assume.** The app guesses which emails I'm putting off: real people, no reply from me, three days or more. It only shows them as a question: "Avoiding any of these?" One tap says yes. Anything that labelled my feelings for me felt nagging in the mock-ups, so the guess stays a guess.

**2. One step, smaller on request.** Each "yes" becomes a single step. A small model running on my PC writes it, so no email leaves the machine. Make it smaller shrinks it further. Ask Claude is a button per email, only when I choose. I decided the privacy line and the wording rules. Claude wrote the code, and I approved every screen before it was built.

**3. Put it on paper.** Steps become Obsidian tasks, and my desk app, Flight Deck, prints them as tickets for a rail by the desk. Print now does it on the spot. Replying to the email ticks the task by itself.

## Why I built it

I have ADHD, and this is where it shows up in my inbox. It isn't that I can't do the reply. It's that the first step is fuzzy, so it never feels like the right moment, and every day it waits makes it heavier. Shrinking it to one clear step, and getting it out of the inbox and onto paper, is what gets me moving. I built it for me, but plenty of people without ADHD have an email like that too.

## What didn't work

My first version gave each task its own id. In Flight Deck, an id means "already printed", so the morning print run would have quietly skipped every email step. I caught it while designing Print now. Now Next Step writes plain tasks, Flight Deck adds the id when it prints, and Next Step finds the line by its text. The lesson: read the system you're handing off to before you design the hand-off.

## The result

- A tray app that spots the emails I'm putting off, writes a tiny step, sorts newsletters into my Proton folders (with Undo, and only once a sender has earned it), and nudges me once a day at 10:30.
- One-click printing to the ticket rail through Flight Deck.
- 78 automated tests, and Windows builds on every change. Tested on my own PC with real Proton mail.
- **[OUTCOME AFTER TWO WEEKS OF REAL USE: e.g. how many put-off emails I cleared, or how long they wait now compared with before]**

## What I'd do next

Keep using it and see whether the nudge helps or just becomes noise. Then test gentler wording: "waiting 6 days" may land as guilt rather than a push.

## Image notes

1. **Hero:** the "Avoiding any of these?" panel. Caption: *It asks. It never decides for you.*
2. **Step screen:** before and after Make it smaller. Caption: *Small enough to start.*
3. **Printed ticket MAI 004 on the rail.** Caption: *From inbox to paper in one click.*
4. **The task line's lifecycle** (added, printed, cleared) from the Print now mock-ups. Caption: *Two apps, one line of text.*
5. **The 10:30 nudge card.** Caption: *One person, one step, once a day.*
