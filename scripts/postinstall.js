import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
export const ROOT = path.join(__dirname, '..');

const PATCH_SCRIPTS = [
  { file: 'patch-wwebjs-201832.js', label: 'whatsapp-web.js backport' },
  { file: 'patch-wwebjs-newsletter-preview.js', label: 'whatsapp-web.js newsletter preview backport' },
  { file: 'patch-wwebjs-status.js', label: 'whatsapp-web.js status send repair' },
  { file: 'patch-wwebjs-ready-sync.js', label: 'whatsapp-web.js ready-sync repair' },
  { file: 'patch-wwebjs-participant-arity.js', label: 'whatsapp-web.js participant batch truth' },
  { file: 'patch-wwebjs-block.js', label: 'whatsapp-web.js block/unblock LID repair' },
  { file: 'patch-wwebjs-group-description.js', label: 'whatsapp-web.js group description job signature' },
  { file: 'patch-wwebjs-media-id.js', label: 'whatsapp-web.js media send repair' },
  { file: 'patch-wwebjs-send-error.js', label: 'whatsapp-web.js send error capture' },
  { file: 'patch-baileys-appstate.js', label: 'Baileys app-state resync bound' },
  { file: 'patch-baileys-newsletter-create.js', label: 'Baileys newsletter-create parse fix' },
  { file: 'patch-baileys-pairing.js', label: 'Baileys pairing refresh' },
];

export function sanitizeEnv(env = process.env) {
  const clean = { ...env };
  for (const key of Object.keys(clean)) {
    if (/^npm_config_allow[_-]scripts$/i.test(key)) {
      delete clean[key];
    }
  }
  return clean;
}

export function planSteps(root = ROOT, env = process.env) {
  const cleanEnv = sanitizeEnv(env);
  const steps = [];
  if (fs.existsSync(path.join(root, 'dashboard'))) {
    steps.push({
      name: 'dashboard dependencies (npm ci)',
      command: 'npm ci',
      options: { stdio: 'inherit', shell: true, cwd: path.join(root, 'dashboard'), env: cleanEnv },
    });
  }
  for (const item of PATCH_SCRIPTS) {
    const scriptFullPath = path.join(root, 'scripts', item.file);
    if (fs.existsSync(scriptFullPath)) {
      steps.push({
        name: `${item.label} (scripts/${item.file} --best-effort)`,
        command: process.execPath,
        args: [scriptFullPath, '--best-effort'],
        options: { stdio: 'inherit', cwd: root, env: cleanEnv },
      });
    }
  }
  return steps;
}

export function failureReason(res) {
  if (res.error) return `failed to start — ${res.error.message}`;
  if (typeof res.status === 'number' && res.status !== 0) return `exit code ${res.status}`;
  if (res.signal) return `killed by ${res.signal}`;
  return null;
}

export function run(root = ROOT, spawn = spawnSync, env = process.env) {
  const steps = planSteps(root, env);
  if (!steps.length) {
    return 0;
  }
  for (const step of steps) {
    const res = spawn(step.command, step.args, step.options);
    const reason = failureReason(res ?? {});
    if (reason) {
      console.error(
        `postinstall: ${step.name} failed (${reason}). The install is INCOMPLETE — fix the error above and re-run npm install.`,
      );
      return 1;
    }
  }
  return 0;
}
