# clawde

Telegram wrapper around the **Claude Code CLI in headless mode**. Runs on top of
any git repo and syncs changes back through git. Send a text or voice message to
the bot; clawde locks the repo, pulls, spawns `claude -p` from inside it, replies,
then commits and pushes whatever changed.

Single-operator by design (Telegram user-id allow-list). One Docker container,
long-polling (no public webhook).

## How it works

```
Telegram ─▶ clawde ─▶ git lock → pull → claude -p → reply → commit → push ─▶ remote
```

- Node 24 / TypeScript service (grammy + Hono), Claude Code CLI installed in-image
- Runs as non-root user `bot`; Claude headless via `--dangerously-skip-permissions`
- Voice in: Deepgram nova-3. Voice out: Gemini TTS.
- Inline keyboards via a ` ```tg ` JSON block the model emits at the end of replies
- Per-Telegram-user → Claude session id in SQLite, with a TTL

## Folder structure

The layout sorts files by the **activity that produced them**, not by file type
(permanent product / temporary act of building / recurring operations).

```
clawde/
├── docs/
│   ├── product/        PERMANENT — what clawde is right now
│   │   ├── PRD.md              problem, users, requirements
│   │   ├── ROADMAP.md         where it's going and why
│   │   ├── architecture/      snapshot of the running system (overwrite as it changes)
│   │   ├── features/          one file per capability
│   │   └── guide/             how to run it
│   └── process/        TEMPORARY-ACT — how it got built
│       ├── decisions/         ADRs — permanent record of a one-time decision (append-only)
│       ├── specs/             design docs (from brainstorming)
│       └── plans/             step-by-step implementation plans
├── ops/                RECURRING — operational routines
├── inbox/              capture zone
└── src/
    ├── clawde/         the bot — code, tests, prompts, deploy/, Dockerfile
    └── tools/
        └── transcriber/   standalone Deepgram transcriber (Python)
```

The bot is one component under `src/clawde/`. Tests live next to the code
(`src/clawde/test/`). Deploy is autonomous per component: `src/clawde/deploy/`.

## The bot (`src/clawde/`)

Key modules in `src/clawde/src/`:

- `index.ts` — boot: clone target repo if absent, wire deps, start bot + notify server
- `bot.ts` — grammy handlers (text/voice, `/reset`, file uploads)
- `claude.ts` — spawn `claude -p`, manage `--resume` session ids
- `git.ts` — lock / pull / commit / push around each message
- `session.ts` — SQLite session store with TTL
- `protocol.ts` — parse the trailing ` ```tg ` keyboard block
- `voice.ts` — Deepgram transcription (inbound) · `tts.ts` — Gemini TTS (outbound)
- `notify.ts` — localhost `/notify` endpoint for proactive messages
- `send-file.ts` / `upload.ts` — path-validated file send/receive
- `config.ts` — zod-validated env config

Shell helpers baked into the image at `/app` (invoked by Claude's Bash tool inside
the container): `notify-tg.sh`, `send-file-tg.sh`, `send-voice-tg.sh`.

### Commands (run from `src/clawde/`)

```bash
pnpm install
pnpm run dev          # local run (node --env-file=.env.local)
pnpm run build        # tsup → dist/
pnpm test             # vitest
pnpm run typecheck    # tsc --noEmit
docker compose up -d --build
```

## Deployment (k8s)

Deployed to the personal **`midgard`** cluster (RKE2, via Rancher at
`rancher.royz.cc`) — namespace `app-clawde`, Helm release `clawde`. The cluster's
`local-path` StorageClass backs the three RWO PVCs (repo / db / bot-home), which
matches the chart default in `deploy/chart/values.yaml`.

Access uses a **local, gitignored kubeconfig** (it holds a bearer token — never
commit it; `kubeconfig*.yaml` is in `.gitignore`):

```bash
export KUBECONFIG=src/clawde/deploy/kubeconfig.midgard.yaml   # run from src/clawde/
kubectl get pods -n app-clawde
kubectl logs -n app-clawde deploy/clawde -f
```

Deploy flow (all scripts in `deploy/scripts/`, run from `src/clawde/`, with
`KUBECONFIG` exported):

```bash
docker login                                # push as zjor
./deploy/scripts/docker-build-and-push.sh   # → zjor/clawde:<git-short-sha> (linux/amd64)
./deploy/scripts/create-secrets.sh          # clawde-env (.env.production) + clawde-ssh (ssh-deploy-key)
./deploy/scripts/deploy-with-helm.sh        # helm upgrade --install at current short SHA
```

Build/push and deploy read the **current git short SHA**, so run them from the
same commit.

### Claude auth in the pod

Auth flows through env, **not** an interactive login. Pick one and put it in
`.env.production` (→ `clawde-env` Secret → passed to the Claude CLI via
`process.env`). The Secret — not the bot-home PVC — is what makes auth durable,
so it survives even a PVC wipe.

- **Subscription (default here):** generate a long-lived OAuth token, then set it
  as `CLAUDE_CODE_OAUTH_TOKEN` in `.env.production`:
  ```bash
  kubectl exec -it -n app-clawde -c clawde deploy/clawde -- claude setup-token
  ```
  Note: `setup-token` only **prints** the token (valid ~1 year) — it does NOT
  store it. Copy it into `.env.production`, then re-run `create-secrets.sh` (which
  re-syncs the Secret and rolls the pod). To rotate, repeat the same two steps.
  Leave `ANTHROPIC_API_KEY` unset when using this.
- **API billing:** set `ANTHROPIC_API_KEY=sk-ant-...` in `.env.production` instead;
  it takes precedence over the OAuth token.

Verify auth after a roll:
```bash
kubectl exec -n app-clawde -c clawde deploy/clawde -- \
  sh -c 'echo "say pong" | claude -p --output-format json --dangerously-skip-permissions'
# expect "is_error":false ; "Not logged in · Please run /login" means no valid creds
```

## Configuration

Env-driven — see `src/clawde/.env.example`. The bot is **repo-agnostic**: the
target repo is set by `TARGET_REPO_URL` and cloned to `/data/repo` in the
container. Required: `TARGET_REPO_URL`, `TELEGRAM_BOT_TOKEN`,
`TG_ALLOWED_USER_IDS`, `DEEPGRAM_API_KEY`. Optional: `ANTHROPIC_API_KEY`,
`GEMINI_*` (TTS), `GIT_USER_*`, `SESSION_TTL_MINUTES`.

## Conventions

- Filenames: `kebab-case`. Dates: `YYYY-MM-DD`. Use the real system date
  (`date +%Y-%m-%d`), not an assumed one.
- Markdown docs get frontmatter: `created`, `status`, `tags`.
- ADRs in `docs/process/decisions/` are **append-only** — never edit a past decision.
- `docs/product/architecture/` is a snapshot — overwrite it to match reality.
- Specs → `docs/process/specs/`. Plans → `docs/process/plans/`.
  (If using superpowers skills, do **not** use their default `docs/superpowers/...` path.)

## Security / Don'ts

- **Never commit secrets.** `.env*` and `ssh-deploy-key*` are gitignored — keep it
  that way. Only `.env.example` is committed.
- Each install uses its **own** SSH deploy key with write access to the target repo.
  Don't reuse a key across repos.
- The bot runs Claude headless with `--dangerously-skip-permissions` inside a
  sandboxed container as non-root — that flag is intentional and confined to the image.
- Don't widen `TG_ALLOWED_USER_IDS` casually; it's the only auth gate.

## History

Extracted from `second-brain-template/.system/services/telegram-bot`. Generic
`brain` coupling was renamed to `repo`/`clawde` to make the bot repo-agnostic.
