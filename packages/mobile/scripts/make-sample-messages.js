#!/usr/bin/env node
// Writes fixtures/sample-messages.textrovert: a made-up "Save for iPhone" file (format in mac/README.md) for trying
// the Stats import. Names are fictional. Run: node scripts/make-sample-messages.js
const fs = require('fs');
const path = require('path');

const start = Date.UTC(2026, 8, 1, 16) / 1000;
const day = 86400;
const lines = {
  'Mia Chen': ['are we still on for the bookstore?', 'haha yes', 'my birthday is november 16 btw 🎉', 'jasmine tea >>> everything', 'lol same'],
  'Jules Rivera': ['volleyball at the park saturday?', 'bring water 😂', 'that was so fun', 'next week again?'],
  'Sarah Park': ['brunch friday at juniper?', 'can you confirm by 5?', 'booked!', '❤️'],
};
let seed = 7;
const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const chats = Object.entries(lines).map(([name, theirs], i) => {
  const messages = [];
  for (let d = 0; d < 40 - i * 8; d++) {
    const base = start + d * day + Math.floor(rand() * 14) * 3600;
    const n = 1 + Math.floor(rand() * 4);
    for (let k = 0; k < n; k++) {
      const mine = rand() < 0.45;
      messages.push({ t: base + k * 90, ...(mine ? {} : { from: name }), text: mine ? ['ok!', 'haha', 'see you then', 'lol yes 😂', 'omw'][Math.floor(rand() * 5)] : theirs[Math.floor(rand() * theirs.length)] });
    }
  }
  messages.push({ t: start + 41 * day, from: name, kind: 'photo' });
  messages[3].reactions = [['Me', '\u{1F602}']];
  return { id: 'chat-' + (i + 1), title: '', group: false, people: [name], messages };
});
chats.push({
  id: 'chat-4',
  title: 'Saturday Volleyball',
  group: true,
  people: ['Mia Chen', 'Jules Rivera', 'Kit Malone'],
  messages: Array.from({ length: 30 }, (_, k) => ({ t: start + k * day + 18 * 3600, ...(k % 3 === 0 ? {} : { from: ['Mia Chen', 'Jules Rivera', 'Kit Malone'][k % 3] }), text: k % 3 === 0 ? 'in!' : 'who is in this week?' })),
});
const file = { format: 'textrovert-messages', version: 1, exportedAt: start + 42 * day, chats };
const out = path.resolve(__dirname, '../fixtures/sample-messages.textrovert');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(file));
console.log('wrote', out);
