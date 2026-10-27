import { spawnSync } from 'node:child_process';

const args = process.argv.slice(2);
const pnpmArgs = ['--filter', '@pos/api', 'seed:platform-admin'];
if (args.length > 0) {
  pnpmArgs.push('--', ...args);
}

const result = spawnSync('pnpm', pnpmArgs, {
  stdio: 'inherit',
  shell: true,
});

process.exit(result.status ?? 0);
