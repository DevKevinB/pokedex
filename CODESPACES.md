# Working on Pokédex OS from the iPad

This sets up a real development machine that lives inside a browser tab, so you
can change the game, test it, and publish it from the iPad with no laptop
involved. It is a one-time setup of roughly fifteen minutes. After that, getting
back in is two taps.

A note on what you're actually doing, because none of the names are obvious:

- **GitHub Codespaces** is a Linux computer that GitHub runs for you and shows
  you in a browser tab. It has your repository already on it and is already
  logged in to GitHub, so it can publish changes without you typing a password.
  Free personal accounts get a monthly allowance that comfortably covers a
  project like this one — but see "What this costs" at the bottom.
- **Claude Code** is me, running in the terminal on that machine instead of in a
  chat window. Because that machine has real internet access, I can commit and
  publish changes myself — the thing I can't do from the chat app.
- **A commit** is a saved checkpoint with a note attached. **Pushing** sends your
  commits to GitHub, which is what makes the live game update.

---

## Before you start

You need two things on the iPad:

1. **Safari** (or Chrome — either works).
2. **A keyboard.** This is not optional. A Codespace on a touchscreen with no
   keyboard is genuinely miserable. Any Bluetooth keyboard or a Magic Keyboard
   case is fine.

---

## Step 1 — Turn on the Codespace

1. In Safari, go to **`github.com/DevKevinB/pokedex`**.
2. Tap the green **`< > Code`** button.
3. Tap the **Codespaces** tab, then **Create codespace on main**.

A new tab opens showing something that looks like a code editor. The first time,
it spends a few minutes building — it's installing Claude Code, the test runner,
and the headless browser the tests drive. You'll see log lines scrolling. Let it
finish. **This slow part only happens once.**

> If it finishes suspiciously fast and Claude Code isn't there in step 3, the
> setup file didn't run. Open the terminal (step 2) and paste:
> `npm install -g @anthropic-ai/claude-code && npm install && npx playwright install --with-deps chromium`

## Step 2 — Find the terminal

The terminal is the black panel where you type commands. If you don't see it,
use the menu (**☰** top-left) → **Terminal** → **New Terminal**.

You'll see a prompt ending in `$`. Everything below gets typed there, followed by
Enter.

## Step 3 — Start Claude and log in

Type:

```bash
claude
```

The first run asks you to sign in. It prints a link and a code — open the link,
sign in with the same Claude account you use in the app, paste the code back in.
You do this **once per Codespace**, not once per session.

When it's ready you get a prompt where you can just talk to me in plain English.
Try:

```
Read CLAUDE.md and ROADMAP.md, then tell me what you'd do first.
```

`CLAUDE.md` is a briefing file in the repo — it explains who Gabe and Art are,
how the code is laid out, the rule that the game never talks, and the release
checklist. Any Claude that reads it starts with the context this chat has.

## Step 4 — Play the game while you work

In the terminal (a second one — **☰** → Terminal → New Terminal, so Claude keeps
running in the first):

```bash
npm run serve
```

A popup offers to open port 8321 in a browser. Tap it, and the game runs in a
tab on the iPad. Reload the tab after any change to see it.

Press **Ctrl-C** in that terminal to stop the server.

## Step 5 — Test before you publish

```bash
npm test
```

This drives a real browser through about 105 checks — booting, catching, gym
battles, versus mode, saves — and prints `ALL CHECKS PASSED` or tells you exactly
what broke. **The server from step 4 must be running for this to work.**

Never publish on a red test run. That suite is the only thing standing between a
Saturday morning change and a broken game on the boys' iPad.

## Step 6 — Publish

Just ask me:

```
Commit this and push it.
```

I'll write the commit message and publish it. If you'd rather do it yourself,
the three commands are:

```bash
git add -A
git commit -m "describe what changed"
git push
```

GitHub Pages redeploys on its own, usually within a minute or two. Then **fully
close the game on the boys' iPad and reopen it** — it's installed as an app and
caches itself, so it needs a real relaunch to pick up a new version.

---

## Getting back in later

`github.com/codespaces` → tap your `pokedex` codespace. Everything is exactly as
you left it, including the Claude login. Then `claude` to start me up.

## What this costs

GitHub gives personal accounts a monthly Codespaces allowance for free, and this
project is small enough to sit inside it — but **the meter runs on wall-clock
time while the Codespace is awake, not while you're typing.** Two habits keep it
free:

- It **auto-sleeps after 30 minutes idle** by default. Don't fight that.
- If you'll be away for days, delete the Codespace at `github.com/codespaces`.
  Nothing is lost as long as you pushed — recreating it takes those few minutes
  from step 1 again.

Check your current usage at **Settings → Billing** on GitHub. Confirm the free
allowance yourself before you lean on it; the numbers change.

## When something goes wrong

**The Codespace won't start or looks broken.** Delete it and create a new one.
It is disposable by design. Anything you pushed is safe on GitHub.

**`npm test` hangs forever.** The server from step 4 isn't running, or it's on
the wrong port. It must be 8321.

**The game on the boys' iPad still looks old.** It's an installed app with its
own cache. Swipe it fully closed and reopen. If it's still stale, check that the
version number was bumped — `CLAUDE.md` lists the three places it lives.

**You broke something and want to undo it.** Ask me to undo it. If I'm not
running: `git checkout -- .` throws away every uncommitted change in the folder.
That is a real deletion with no undo, so only use it when you're sure.

---

## The honest tradeoff

This is more setup than tapping a button in the GitHub app, and it is genuinely
developer territory. What you get for it is the thing you actually asked for: a
Claude that can test its own work and publish it, without you moving files by
hand between a chat window and a repository.

If it starts feeling like a chore rather than a tool, say so — editing files
directly on `github.dev` in Safari is a perfectly respectable fallback for small
changes, and it needs no setup at all.
