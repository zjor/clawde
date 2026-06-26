# Running clawde

The component-local README has the authoritative, step-by-step setup
(prerequisites, deploy key, Docker build, `docker compose`, Helm deploy,
troubleshooting):

➡️ **[src/clawde/README.md](../../../src/clawde/README.md)**

## TL;DR (local Docker)

```bash
cd src/clawde
cp .env.example .env          # fill TARGET_REPO_URL, TELEGRAM_BOT_TOKEN, …
ssh-keygen -t ed25519 -f ssh-deploy-key -N ""   # add .pub as a write deploy key on the target repo
docker compose up -d --build
docker compose logs -f
```

Then message your bot on Telegram. Expect: *"clawde ready. Send text or voice. /reset clears the session."*
