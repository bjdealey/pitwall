import { hashPasscode } from '../src/api/auth.ts';

if (process.stdin.isTTY) console.error('Type the passcode, press Enter, then Ctrl-D.');
const chunks: Buffer[] = [];
for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
const passcode = Buffer.concat(chunks).toString('utf8').replace(/\r?\n$/, '');
if (!passcode) {
  console.error('No passcode on stdin. Example: printf %s "$PASSCODE" | npm run -s hash-passcode');
  process.exit(1);
}
// Single quotes keep the $ separators literal for both node --env-file and systemd.
console.log(`PITWALL_PASSCODE_HASH='${await hashPasscode(passcode)}'`);
