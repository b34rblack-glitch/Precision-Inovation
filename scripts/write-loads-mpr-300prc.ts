// Writes the MPR .300 PRC handload profiles to docs/range-cards/.
//   npx vite-node --config vitest.config.ts scripts/write-loads-mpr-300prc.ts
import { writeFileSync } from 'node:fs';
import { buildLoads } from './loads-mpr-300prc';

const out = 'docs/range-cards/mpr-300prc-handloads.json';
writeFileSync(out, JSON.stringify(buildLoads(), null, 2) + '\n');
console.log('wrote', out);
