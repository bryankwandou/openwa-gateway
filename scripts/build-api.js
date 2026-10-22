import esbuild from 'esbuild';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.join(__dirname, '..');

await esbuild.build({
  entryPoints: [path.join(root, 'api', 'gateway-entry.ts')],
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile: path.join(root, 'api', 'gateway.js'),
});

console.log('API Gateway bundled successfully into api/gateway.js');
