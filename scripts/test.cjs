/**
 * ReTimer test runner: compile tests + reachable src with the repo's own
 * TypeScript, then run the emitted tests with Node's built-in runner.
 *
 * No shell required (works from PowerShell, cmd, and CI alike):
 *   node scripts/test.cjs [--filter <substring>] [--no-build]
 *
 * --filter runs only test files whose name contains the substring.
 * --no-build skips compilation and runs the existing .test-build output.
 */

const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const buildDir = path.join(root, '.test-build');
const testsDir = path.join(buildDir, 'tests');
const registerHook = path.join(testsDir, 'helpers', 'register.js');

function fail(message) {
  console.error(`[test] ${message}`);
  process.exit(1);
}

const args = process.argv.slice(2);
let filter = null;
let build = true;
for (let i = 0; i < args.length; i += 1) {
  if (args[i] === '--filter') {
    filter = args[i + 1] ?? null;
    i += 1;
  } else if (args[i] === '--no-build') {
    build = false;
  } else {
    fail(`unknown argument: ${args[i]} (expected --filter <text> or --no-build)`);
  }
}

if (build) {
  const tscBin = path.join(root, 'node_modules', 'typescript', 'bin', 'tsc');
  if (!fs.existsSync(tscBin)) fail('typescript compiler not found under node_modules');
  console.log('[test] compiling tests (tsconfig.test.json) ...');
  const compiled = spawnSync(process.execPath, [tscBin, '-p', 'tsconfig.test.json'], {
    cwd: root,
    stdio: 'inherit',
  });
  if (compiled.status !== 0) fail('test compilation failed');
}

if (!fs.existsSync(registerHook)) fail('missing .test-build output (compilation produced nothing?)');

let files = fs
  .readdirSync(testsDir)
  .filter((name) => name.endsWith('.test.js'))
  .map((name) => path.join(testsDir, name))
  .sort();
if (filter) files = files.filter((file) => file.includes(filter));
if (files.length === 0) fail('no test files matched');

console.log(`[test] running ${files.length} file(s) with node --test ...`);
const ran = spawnSync(
  process.execPath,
  ['--test', `--require=${registerHook}`, ...files],
  { cwd: root, stdio: 'inherit' },
);
process.exit(ran.status ?? 1);
