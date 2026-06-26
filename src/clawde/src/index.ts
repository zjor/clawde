import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { existsSync } from "node:fs";
import { serve } from "@hono/node-server";
import { loadConfig } from "./config";
import { SessionStore } from "./session";
import { GitRepo } from "./git";
import { createBot } from "./bot";
import { createNotifyApp } from "./notify";
import { createSendFileApp } from "./send-file";
import { createTtsApp, synthesizeSpeech, pcmToOggOpus } from "./tts";
import { InputFile } from "grammy";

const exec = promisify(execFile);

const REPO_CWD = "/data/repo";
const DB_PATH = "/data/db/bot.db";
const PROMPT_PATH = "/app/prompts/telegram-mode.md";

function log(level: string, event: string, extra: Record<string, unknown> = {}) {
  console.log(JSON.stringify({ ts: new Date().toISOString(), level, event, ...extra }));
}

async function ensureRepoCloned(repoUrl: string): Promise<void> {
  if (existsSync(`${REPO_CWD}/.git`)) return;
  log("info", "cloning_repo", { repoUrl });
  await exec("git", ["clone", repoUrl, REPO_CWD]);
}

async function main(): Promise<void> {
  const config = loadConfig();
  log("info", "config_loaded", { allowed: config.allowedUserIds.size });

  await ensureRepoCloned(config.targetRepoUrl);

  const sessions = new SessionStore(DB_PATH, config.sessionTtlMinutes);
  const git = new GitRepo(REPO_CWD, config.gitUserName, config.gitUserEmail);

  const bot = createBot({
    config,
    sessions,
    git,
    repoCwd: REPO_CWD,
    promptPath: PROMPT_PATH,
  });

  const notifyApp = createNotifyApp({
    sendMessage: async (chatId, text, opts) => {
      await bot.api.sendMessage(chatId, text, opts);
    },
  });

  const sendFileApp = createSendFileApp({
    repoRoot: REPO_CWD,
    sendDocument: async (chatId, buf, name, opts) => {
      await bot.api.sendDocument(chatId, new InputFile(buf, name), opts);
    },
    sendPhoto: async (chatId, buf, name, opts) => {
      await bot.api.sendPhoto(chatId, new InputFile(buf, name), opts);
    },
  });
  notifyApp.route("/", sendFileApp);

  const ttsApp = createTtsApp({
    maxChars: config.ttsMaxChars,
    synthesize: config.geminiApiKey
      ? (text, { voice, style }) =>
          synthesizeSpeech(text, {
            voice: voice ?? config.geminiTtsVoice,
            style,
            apiKey: config.geminiApiKey!,
            model: config.geminiTtsModel,
          }).then(pcmToOggOpus)
      : null,
    sendVoice: async (chatId, buf) => {
      await bot.api.sendVoice(chatId, new InputFile(buf, "voice.ogg"));
    },
  });
  notifyApp.route("/", ttsApp);

  const server = serve({
    fetch: notifyApp.fetch,
    hostname: "127.0.0.1",
    port: config.notifyPort,
  });
  log("info", "notify_listening", { port: config.notifyPort });

  // Start grammy long-polling. bot.start() returns when the bot is stopped.
  void bot.start({
    onStart: (me) => log("info", "bot_started", { username: me.username }),
  });

  const shutdown = async (sig: string) => {
    log("info", "shutdown", { sig });
    await bot.stop();
    server.close();
    sessions.close();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((e) => {
  log("error", "fatal", { msg: e instanceof Error ? e.message : String(e) });
  process.exit(1);
});
