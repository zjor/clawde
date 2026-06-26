# clawde

Telegram wrapper around the Claude Code CLI in headless mode. Works on top of any git repo and syncs changes back through git.

Send a text or voice message to your bot; clawde locks the repo, pulls, spawns `claude -p` from inside it, replies, then commits and pushes whatever changed. One Docker container, long-polling (no public webhook), allow-listed users only.

## How it works

```
Telegram ─▶ clawde ─▶ git lock → pull → claude -p → reply → commit → push ─▶ GitHub
```

- Node 24 / TypeScript single service, multi-stage Docker image
- Runs Claude Code headless (`--dangerously-skip-permissions`) as non-root user `bot`
- Voice in via Deepgram nova-3; voice replies via Gemini TTS
- Inline keyboards via a ` ```tg ` JSON block the model emits at the end of replies
- Per-Telegram-user → Claude session id in SQLite, with a TTL

## Repository layout

```
clawde/
├── docs/
│   ├── product/        PERMANENT — what clawde is now
│   │   ├── PRD.md
│   │   ├── ROADMAP.md
│   │   ├── architecture/   snapshot of the running system
│   │   ├── features/       one file per capability
│   │   └── guide/          how to run it
│   └── process/        TEMPORARY-ACT — how it got built
│       ├── decisions/      ADRs (append-only)
│       ├── specs/          brainstorming → design docs
│       └── plans/          step-by-step implementation plans
├── ops/                RECURRING — operational routines
├── inbox/              capture zone
└── src/
    ├── clawde/         the bot (code, tests, prompts, deploy/, Dockerfile)
    └── tools/
        └── transcriber/  standalone Deepgram transcriber (Python)
```

## Quick start

See **[docs/product/guide/running.md](docs/product/guide/running.md)** for the full setup (deploy key, secrets, Docker, Helm).

## Configuration

Runtime config is environment-driven — see `src/clawde/.env.example`. Key var: `TARGET_REPO_URL` — the git repo clawde operates on (cloned to `/data/repo` inside the container).

## License

TBD.
