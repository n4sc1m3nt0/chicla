// Test helper (C14.7, D113): which python the tests can run. Asks the OS directly, no shell: `sh -c 'command -v python3'` prints a POSIX path on the Windows runner that Node cannot spawn.
// Tries `python3`, then `python` (what Windows installs); the first one that can `import zipfile` (all the tests use it for) wins; '' when there is none and the tests skip.
import { spawnSync } from 'node:child_process';

export const findPython = (run = spawnSync) => {
  for (const cmd of ['python3', 'python']) {
    const r = run(cmd, ['-c', 'import zipfile'], { encoding: 'utf8' });
    if (r && r.status === 0) return cmd;
  }
  return '';
};
