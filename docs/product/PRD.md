---
created: 2026-06-26
status: active
tags: [prd]
---

# clawde — PRD

## Problem

Claude Code is a terminal tool tied to a workstation. There's no way to drive
a repo from a phone, away from the laptop. clawde puts a headless Claude Code
behind a Telegram bot so any git repo can be operated from anywhere, with every
change committed and pushed automatically.

## Users

A single operator (or a small allow-listed set). Auth is by Telegram user id —
`TG_ALLOWED_USER_IDS`. Everyone else is ignored.

## What it does

- Accepts text and voice messages over Telegram (long-polling, no webhook).
- For each message: locks the repo, pulls, runs `claude -p` from inside the
  repo with the Telegram-mode system prompt, replies with the model's final
  message, then commits and pushes any working-tree changes.
- Maintains a per-user Claude session id (SQLite) with a configurable TTL so
  conversations persist across messages.
- Voice in: Deepgram nova-3 transcription. Voice out: Gemini TTS.
- Rich replies: inline keyboards via a ` ```tg ` JSON block protocol.
- Proactive notifications from long-running tasks via a localhost `/notify`
  endpoint, surfaced through `notify-tg.sh`.
- Sends files/photos from the repo back to Telegram (`send-file-tg.sh`),
  path-validated to stay inside the repo.

## Requirements

- Repo-agnostic: target repo set by `TARGET_REPO_URL`, cloned to `/data/repo`.
- Single container, runs as non-root (`bot`); Claude Code headless via
  `--dangerously-skip-permissions`.
- Concurrency-safe: per-message file lock on the repo's `.git/`.
- Deployable via Docker Compose (single host) or Helm (Kubernetes).

## Non-goals

- Multi-tenant SaaS. clawde is single-operator by design.
- A public web UI. Telegram is the only interface.

## Configuration

See `src/clawde/.env.example`. Required: `TARGET_REPO_URL`,
`TELEGRAM_BOT_TOKEN`, `TG_ALLOWED_USER_IDS`, `DEEPGRAM_API_KEY`. Optional:
`ANTHROPIC_API_KEY`, `GEMINI_*` (TTS), git identity, session TTL.
