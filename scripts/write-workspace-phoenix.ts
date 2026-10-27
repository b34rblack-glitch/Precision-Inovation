// Writes the importable workspace to docs/range-cards/.
//   npx vite-node --config vitest.config.ts scripts/write-workspace-phoenix.ts
import { writeFileSync } from 'node:fs';
import { buildWorkspace } from './workspace-phoenix';

const out = 'docs/range-cards/phoenix-workspace.json';
writeFileSync(out, JSON.stringify(buildWorkspace(), null, 2) + '\n');
console.log('wrote', out);
