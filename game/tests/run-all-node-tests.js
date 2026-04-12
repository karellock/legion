const { spawnSync } = require('child_process');

const testFiles = [
  'game/tests/tournament.core.node.test.js',
  'game/tests/simulation.node.test.js',
];

let hasFailure = false;

for (const filePath of testFiles) {
  console.log(`\n=== Running ${filePath} ===`);
  const result = spawnSync(process.execPath, [filePath], {
    stdio: 'inherit',
    shell: false,
  });

  if (result.status !== 0) {
    hasFailure = true;
    break;
  }
}

if (hasFailure) {
  process.exit(1);
}
