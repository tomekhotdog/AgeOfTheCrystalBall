// server/index.js
// Express app -- serves the static UI and the /api/sessions endpoint.
// Polls the discovery backend on a timer and maintains an in-memory store.
// Optionally publishes to a relay server for multi-person mode.

import express from "express";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { createDiscovery } from "./discovery/index.js";
import { SessionClassifier } from "./classifier.js";
import { SessionStore } from "./sessionStore.js";
import { RelayPublisher } from "./relay/publisher.js";
import { RelaySubscriber } from "./relay/subscriber.js";
import { SharingSettings } from "./relay/sharingSettings.js";
import { resolveIdentity } from "./relay/identity.js";

// -- __dirname equivalent for ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// -- CLI flag parsing
function parseFlags(argv) {
  const flags = {
    port: 3000,
    pollInterval: 2000,   // ms
    simulate: false,
    relayUrl: null,
    userName: null,
    userColor: null,
    token: null,
  };

  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];

    if (arg === "--port" && argv[i + 1]) {
      flags.port = Number(argv[++i]);
    } else if (arg === "--poll-interval" && argv[i + 1]) {
      flags.pollInterval = Number(argv[++i]);
    } else if (arg === "--simulate") {
      flags.simulate = true;
    } else if (arg === "--relay-url" && argv[i + 1]) {
      flags.relayUrl = argv[++i];
    } else if (arg === "--user-name" && argv[i + 1]) {
      flags.userName = argv[++i];
    } else if (arg === "--user-color" && argv[i + 1]) {
      flags.userColor = argv[++i];
    } else if (arg === "--token" && argv[i + 1]) {
      flags.token = argv[++i];
    }
  }

  return flags;
}

// -- Main
async function main() {
  const flags = parseFlags(process.argv);

  // --simulate flag sets the env var so discovery/index.js picks it up
  if (flags.simulate) {
    process.env.SIMULATE = "true";
  }

  const mode = process.env.SIMULATE === "true" ? "simulate" : "live";
  const isMulti = !!flags.relayUrl;

  // -- Resolve user identity (for multi-person mode)
  let identity = null;
  if (isMulti) {
    identity = await resolveIdentity({
      userName: flags.userName,
      userColor: flags.userColor,
    });
  }

  // -- Instantiate core objects
  const discovery = await createDiscovery();
  const classifier = new SessionClassifier();
  const store = new SessionStore(classifier);

  // -- Relay publisher/subscriber (multi-person mode)
  let publisher = null;
  let subscriber = null;
  const sharingSettings = new SharingSettings();

  if (isMulti) {
    publisher = new RelayPublisher({
      relayUrl: flags.relayUrl,
      userName: identity.name,
      userColor: identity.color,
      token: flags.token,
    });
    subscriber = new RelaySubscriber({
      relayUrl: flags.relayUrl,
      token: flags.token,
    });
    await sharingSettings.load();
  }

  // -- Polling loop
  async function poll() {
    try {
      const rawSessions = await discovery.discoverSessions();
      await store.update(rawSessions);

      // Publish to relay if sharing is enabled
      if (publisher) {
        const settings = sharingSettings.get();
        if (settings.enabled) {
          await publisher.publish(store.getLatest(), settings.excludedGroups);
        }
      }
    } catch (err) {
      console.error("[poll] discovery error:", err);
    }
  }

  // Run first poll immediately so /api/sessions has data on first request
  await poll();
  setInterval(poll, flags.pollInterval);

  // -- Express setup
  const app = express();
  app.use(express.json());

  // Latest perf snapshot from the client (ring buffer of last 60 snapshots = ~5 min)
  const perfSnapshots = [];
  const MAX_PERF_SNAPSHOTS = 60;

  // API -- local sessions (always available, unchanged)
  app.get("/api/sessions", (_req, res) => {
    res.json(store.getLatest());
  });

  // Pin local user to GR baby blue so they always stand out.
  const GR_BLUE = "#89CFF0";

  // API -- mode detection (tells the frontend if multi-person is available)
  app.get("/api/mode", (_req, res) => {
    const user = identity ? { ...identity, color: GR_BLUE } : null;
    res.json({
      mode: isMulti ? "multi" : "local",
      user,
      relay: flags.relayUrl || null,
    });
  });

  app.get("/api/combined", async (_req, res) => {
    if (!subscriber) {
      return res.status(404).json({ error: "No relay configured" });
    }
    const data = await subscriber.fetchCombined();
    if (!data) {
      return res.status(502).json({ error: "Relay unavailable" });
    }

    // Always inject fresh local sessions so the local user's units appear
    // even if publishing is delayed or sharing is toggled off.
    if (identity) {
      const localData = store.getLatest();

      // Strip stale copies of our sessions from the relay data
      data.sessions = (data.sessions || []).filter(
        (s) => s.owner !== identity.name
      );

      // Add fresh local sessions with proper namespacing + GR blue
      for (const s of localData.sessions || []) {
        data.sessions.push({
          ...s,
          id: `${identity.name}/${s.id}`,
          owner: identity.name,
          ownerColor: GR_BLUE,
        });
      }

      // Rebuild groups from the full session list
      const groupMap = new Map();
      for (const s of data.sessions) {
        if (!s.group) continue;
        let g = groupMap.get(s.group);
        if (!g) {
          g = { id: s.group, cwd: s.cwd, session_ids: [], owners: new Set() };
          groupMap.set(s.group, g);
        }
        g.session_ids.push(s.id);
        if (s.owner) g.owners.add(s.owner);
      }
      data.groups = [...groupMap.values()].map((g) => ({
        id: g.id,
        cwd: g.cwd,
        session_count: g.session_ids.length,
        session_ids: g.session_ids,
        owners: [...g.owners],
      }));

      // Ensure local user in users array with correct colour
      if (!data.users) data.users = [];
      const userIdx = data.users.findIndex((u) => u.name === identity.name);
      const localUserEntry = {
        name: identity.name,
        color: GR_BLUE,
        sessionCount: (localData.sessions || []).length,
      };
      if (userIdx >= 0) {
        data.users[userIdx] = localUserEntry;
      } else {
        data.users.push(localUserEntry);
      }
    }

    res.json(data);
  });

  // API -- sharing settings
  app.get("/api/sharing", (_req, res) => {
    res.json(sharingSettings.get());
  });

  app.put("/api/sharing", async (req, res) => {
    try {
      await sharingSettings.save(req.body);
      res.json(sharingSettings.get());
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
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

  // -- Start listening
  app.listen(flags.port, () => {
    console.log(`\n  Crystal Ball server running`);
    console.log(`  Mode : ${mode}`);
    console.log(`  Poll : every ${flags.pollInterval} ms`);
    if (isMulti) {
      console.log(`  Relay: ${flags.relayUrl}`);
      console.log(`  User : ${identity.name} (${identity.color})`);
    }
    console.log(`  URL  : http://localhost:${flags.port}\n`);
  });
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
