import { spawn } from 'child_process';

const args = process.argv.slice(2);
const npmCmd = /^win/.test(process.platform) ? 'npm.cmd' : 'npm';

const child = spawn(npmCmd, args, { stdio: 'inherit', shell: true });

child.on('exit', (code) => process.exit(code));
child.on('error', (err) => {
  console.error(err);
  process.exit(1);
});
