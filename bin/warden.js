#!/usr/bin/env node
import { execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// We are in the "bin" folder, so project root is one level up
const projectRoot = path.join(__dirname, '..');

const args = process.argv.slice(2);
const command = args[0];

if (!command) {
  console.log('Warden Global CLI');
  console.log('Usage: warden <start|stop|restart|status>');
  process.exit(1);
}

try {
  // Execute the warden.bat script found in the project root
  execSync(`warden.bat ${command}`, { cwd: projectRoot, stdio: 'inherit', windowsHide: true });
} catch (e) {
  process.exit(1);
}
