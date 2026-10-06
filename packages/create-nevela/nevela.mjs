#!/usr/bin/env node
// The `nevela` command.
//
// The same program as create-nevela. It has a file of its own so the program can tell
// which of the two was typed: `nevela` with nothing after it says what it can do, where
// `pnpm create nevela` with nothing after it starts a new app.

await import('./index.mjs');
