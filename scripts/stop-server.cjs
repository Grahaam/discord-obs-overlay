'use strict';
const { execSync } = require('child_process');

const isWin = process.platform === 'win32';
try {
  if (isWin) {
    execSync('taskkill /F /T /IM node.exe', { stdio: 'inherit' });
  } else {
    execSync("pkill -f 'node dist/server.mjs'", { stdio: 'inherit' });
  }
} catch (err) {
  if (err.status === 1) { console.log('[stop] No matching process found.'); process.exit(0); }
  process.exit(err.status ?? 1);
}
