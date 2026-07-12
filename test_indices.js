const fs = require('fs');
const content = fs.readFileSync('app/admin/page.tsx', 'utf8');

// extract destructuring block
const match = content.match(/const \[\s*([\s\S]*?)\s*\] = await Promise.all\(\[\s*([\s\S]*?)\s*\]\)/);
if (!match) { console.log('no match'); process.exit(1); }

const vars = match[1].split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('//'));
let queriesText = match[2];

// we can't easily split by comma for queries because of nested commas, but we can do a hacky split
// let's just print the vars with their indices
vars.forEach((v, i) => console.log(`${i}: ${v}`));
