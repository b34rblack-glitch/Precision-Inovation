// Writes the importable workspace to docs/range-cards/.
//   npx vite-node --config vitest.config.ts scripts/write-workspace-300wm.ts
import { writeFileSync } from 'node:fs';
import { buildWorkspace } from './workspace-300wm';

const out = 'docs/range-cards/sig-cross-magnum-300wm-workspace.json';
writeFileSync(out, JSON.stringify(buildWorkspace(), null, 2) + '\n');
console.log('wrote', out);
