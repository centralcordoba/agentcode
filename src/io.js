import readline from 'node:readline/promises';

let rl = null;

export function getReadline() {
  if (!rl) {
    rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.on('close', () => { rl = null; });
  }
  return rl;
}

export function closeReadline() {
  if (rl) {
    const r = rl;
    rl = null;
    r.close();
  }
}
