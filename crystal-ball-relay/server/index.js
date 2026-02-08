// server/index.js
// Crystal Ball Relay Server -- receives snapshots from multiple daemons,
// merges them, and serves a combined view.

import express from 'express';
import { RelayStore } from './store.js';
import { mergeSnapshots } from './merger.js';
import { tokenAuth } from './auth.js';

// ── CLI flag parsing ────────────────────────────────────────────────────────
function parseFlags(argv) {
  const flags = {
    port: 3001,
    token: null,
    expiry: 30000,
  };

  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--port' && argv[i + 1]) {
      flags.port = Number(argv[++i]);
    } else if (arg === '--token' && argv[i + 1]) {
      flags.token = argv[++i];
    } else if (arg === '--expiry' && argv[i + 1]) {
      flags.expiry = Number(argv[++i]);
    }
  }

  return flags;
}

// ── Main ────────────────────────────────────────────────────────────────────
function main() {
  const flags = parseFlags(process.argv);
  const store = new RelayStore(flags.expiry);
  const auth = tokenAuth(flags.token);

  const app = express();
  app.use(express.json());

  // POST /api/publish -- receive a user's snapshot
  app.post('/api/publish', auth, (req, res) => {
    const { user, color, snapshot } = req.body || {};
    if (!user || !snapshot) {
      return res.status(400).json({ error: 'Missing user or snapshot' });
    }
    store.publish(user, color || '#89CFF0', snapshot);
    res.sendStatus(204);
  });

  // GET /api/combined -- merged view of all users
  app.get('/api/combined', (req, res) => {
    const entries = store.getAll();
    const combined = mergeSnapshots(entries);
    res.json(combined);
  });

  // GET /api/users -- online user roster
  app.get('/api/users', (req, res) => {
    res.json({ users: store.getUserList() });
  });

  app.listen(flags.port, () => {
    console.log(`\n  Crystal Ball Relay running`);
    console.log(`  Port  : ${flags.port}`);
    console.log(`  Auth  : ${flags.token ? 'token required' : 'open (no token)'}`);
    console.log(`  Expiry: ${flags.expiry}ms\n`);
  });
}

main();
