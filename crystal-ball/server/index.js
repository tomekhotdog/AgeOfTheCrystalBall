// server/index.js
// Express app — serves the static UI and the /api/sessions endpoint.
// Polls the discovery backend on a timer and maintains an in-memory store.

import express from "express";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { createDiscovery } from "./discovery/index.js";
import { SessionClassifier } from "./classifier.js";
import { SessionStore } from "./sessionStore.js";

// ── __dirname equivalent for ESM ────────────────────────────────────────────
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ── CLI flag parsing ────────────────────────────────────────────────────────
function parseFlags(argv) {
  const flags = {
    port: 3000,
    pollInterval: 2000,   // ms
    simulate: false,
  };

  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];

    if (arg === "--port" && argv[i + 1]) {
      flags.port = Number(argv[++i]);
    } else if (arg === "--poll-interval" && argv[i + 1]) {
      flags.pollInterval = Number(argv[++i]);
    } else if (arg === "--simulate") {
      flags.simulate = true;
    }
  }

  return flags;
}

// ── Main ────────────────────────────────────────────────────────────────────
async function main() {
  const flags = parseFlags(process.argv);

  // --simulate flag sets the env var so discovery/index.js picks it up
  if (flags.simulate) {
    process.env.SIMULATE = "true";
  }

  const mode = process.env.SIMULATE === "true" ? "simulate" : "live";

  // ── Instantiate core objects ──────────────────────────────────────────
  const discovery = await createDiscovery();
  const classifier = new SessionClassifier();
  const store = new SessionStore(classifier);

  // ── Polling loop ──────────────────────────────────────────────────────
  async function poll() {
    try {
      const rawSessions = await discovery.discoverSessions();
      await store.update(rawSessions);
    } catch (err) {
      console.error("[poll] discovery error:", err);
    }
  }

  // Run first poll immediately so /api/sessions has data on first request
  await poll();
  setInterval(poll, flags.pollInterval);

  // ── Express setup ─────────────────────────────────────────────────────
  const app = express();
  app.use(express.json());

  // Latest perf snapshot from the client (ring buffer of last 60 snapshots = ~5 min)
  const perfSnapshots = [];
  const MAX_PERF_SNAPSHOTS = 60;

  // API
  app.get("/api/sessions", (_req, res) => {
    res.json(store.getLatest());
  });

  app.post("/api/perf", (req, res) => {
    if (req.body && typeof req.body === "object") {
      perfSnapshots.push(req.body);
      if (perfSnapshots.length > MAX_PERF_SNAPSHOTS) perfSnapshots.shift();
    }
    res.sendStatus(204);
  });

  app.get("/api/perf", (_req, res) => {
    res.json({
      latest: perfSnapshots.length > 0 ? perfSnapshots[perfSnapshots.length - 1] : null,
      history: perfSnapshots,
    });
  });

  // Static files from ../public
  const publicDir = path.join(__dirname, "..", "public");
  app.use(express.static(publicDir));

  // ── Start listening ───────────────────────────────────────────────────
  app.listen(flags.port, () => {
    console.log(`\n  Crystal Ball server running`);
    console.log(`  Mode : ${mode}`);
    console.log(`  Poll : every ${flags.pollInterval} ms`);
    console.log(`  URL  : http://localhost:${flags.port}\n`);
  });
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
