import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';

const node = process.execPath;
const processes = [
  { name: 'engine', args: ['--env-file-if-exists=.env', 'src/engine/main.ts'], env: { PITWALL_BROKER: 'sim' } },
  { name: 'api', args: ['--env-file-if-exists=.env', 'src/api/main.ts'], env: {} },
  { name: 'web', args: ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1'], env: {} },
];

let stopping = false;
const children = processes.map(({ name, args, env }) => {
  const child = spawn(node, args, { env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
  for (const stream of [child.stdout, child.stderr]) createInterface({ input: stream }).on('line', (line) => console.log(`[${name}] ${line}`));
  child.on('exit', (code, signal) => {
    console.log(`[${name}] exited (${signal ?? code})`);
    stop(code ?? 0);
  });
  return child;
});

function stop(code: number) {
  if (stopping) return;
  stopping = true;
  process.exitCode = code;
  for (const child of children) child.kill('SIGTERM');
}

process.on('SIGINT', () => stop(0));
process.on('SIGTERM', () => stop(0));
