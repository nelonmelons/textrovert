#!/usr/bin/env node
// Copies the Wrapped engine (packages/wrapped/src) into vendor/wrapped, which metro.config.js and tsconfig.json read,
// so packages/mobile builds on its own (Revyl archives only this folder). In the monorepo it refreshes the copy; in a
// standalone copy it keeps the one already there. Server-only openai.ts is left out.
const fs = require('fs');
const path = require('path');

const source = path.resolve(__dirname, '../../wrapped/src');
const target = path.resolve(__dirname, '../vendor/wrapped');

if (fs.existsSync(source)) {
  fs.rmSync(target, { recursive: true, force: true });
  fs.mkdirSync(target, { recursive: true });
  for (const name of fs.readdirSync(source)) {
    if (name.endsWith('.ts') && name !== 'openai.ts') fs.copyFileSync(path.join(source, name), path.join(target, name));
  }
} else if (!fs.existsSync(path.join(target, 'index.ts'))) {
  console.error('vendor/wrapped is missing and packages/wrapped is not next to this app. Run "npm run vendor:wrapped" in the monorepo first.');
  process.exit(1);
}
