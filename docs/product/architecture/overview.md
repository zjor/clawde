---
created: 2026-06-26
status: active
tags: [architecture]
---

# Architecture snapshot

> A snapshot of what runs today. Overwrite as the system changes.

## Topology

One Docker container. Node 24 / TypeScript service (grammy + Hono) plus the
Claude Code CLI installed globally. Runs as non-root user `bot` (uid 1001).

```
Telegram  ──long-poll──▶  clawde (grammy)
                              │
                              ├─ git lock (proper-lockfile) on /data/repo/.git
                              ├─ git pull --rebase
                              ├─ claude -p --resume <sid>
                              │     --append-system-prompt prompts/telegram-mode.md
                              │     --dangerously-skip-permissions   (cwd=/data/repo)
                              ├─ parse stdout → body + optional ```tg keyboard block
                              ├─ reply (Telegram)
                              └─ git commit + push
```

## Volumes

| Mount        | Purpose                                  |
|--------------|------------------------------------------|
| `/data/repo` | Cloned target repo (`TARGET_REPO_URL`)   |
| `/data/db`   | SQLite — per-user → Claude session id    |
| `/home/bot`  | Bot home: `.claude/`, `.claude.json`, `.ssh/` |

## Key modules (`src/clawde/src/`)

- `index.ts` — boot: clone repo if absent, wire deps, start bot + notify server.
- `bot.ts` — grammy handlers: text/voice, `/reset`, file uploads to inbox.
- `claude.ts` — spawn `claude -p`, manage `--resume` session ids.
- `git.ts` — lock / pull / commit / push around each message.
- `session.ts` — SQLite session store with TTL.
- `protocol.ts` — parse the trailing ` ```tg ` JSON keyboard block.
- `voice.ts` — Deepgram nova-3 transcription (inbound voice).
- `tts.ts` — Gemini TTS (outbound voice).
- `notify.ts` — localhost Hono `/notify` endpoint for proactive messages.
- `send-file.ts` / `upload.ts` — path-validated file send/receive.
- `config.ts` — zod-validated env config.

## Shell helpers (baked into the image at `/app`)

`notify-tg.sh`, `send-file-tg.sh`, `send-voice-tg.sh` — invoked by Claude's
Bash tool from inside the container to push messages/files/voice to Telegram.

## Deploy

`src/clawde/deploy/` — Helm chart (`chart/`) and scripts (build+push image,
create k8s secrets, helm upgrade). Local dev via `src/clawde/docker-compose.yml`.
