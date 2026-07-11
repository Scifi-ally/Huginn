import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import util from 'util';
import { execFile } from 'child_process';
import {
  performSmartCommit,
  generateSmartDocs,
  getUserIdentity,
  setUserIdentity,
} from './smartGitManager.js';

const execFileAsync = util.promisify(execFile);

describe('Smart Git & Documentation Manager (`smartGitManager`)', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'huginn-smart-git-test-'));
    await execFileAsync('git', ['init'], { cwd: tmpDir, windowsHide: true });
    await execFileAsync('git', ['config', 'user.name', 'Test Author'], {
      cwd: tmpDir,
      windowsHide: true,
    });
    await execFileAsync('git', ['config', 'user.email', 'test@huginn.local'], {
      cwd: tmpDir,
      windowsHide: true,
    });
  });

  afterEach(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
  });

  it('checks and retrieves git user identity (`getUserIdentity`)', async () => {
    const identity = await getUserIdentity(tmpDir);
    expect(identity.name).toBe('Test Author');
    expect(identity.email).toBe('test@huginn.local');
  });

  it('updates git user identity locally (`setUserIdentity`)', async () => {
    await setUserIdentity(tmpDir, 'Sahaj Automation', 'sahaj@huginn.ai', false);
    const identity = await getUserIdentity(tmpDir);
    expect(identity.name).toBe('Sahaj Automation');
    expect(identity.email).toBe('sahaj@huginn.ai');
  });

  it('performs a smart commit on staged/unstaged changes (`performSmartCommit`)', async () => {
    const testFile = path.join(tmpDir, 'feature.ts');
    fs.writeFileSync(testFile, 'export const hello = () => "world";\n', 'utf8');

    const res = await performSmartCommit(tmpDir);
    expect(res.success).toBe(true);
    expect(res.message).toContain('feat:');
    expect(res.filesCommitted).toBeGreaterThan(0);
  });

  it('automatically updates README.md and CHANGELOG.md (`generateSmartDocs`)', async () => {
    const testFile = path.join(tmpDir, 'index.js');
    fs.writeFileSync(testFile, 'console.log("main app");\n', 'utf8');
    await execFileAsync('git', ['add', 'index.js'], { cwd: tmpDir, windowsHide: true });
    await execFileAsync('git', ['commit', '-m', 'Initial commit'], {
      cwd: tmpDir,
      windowsHide: true,
    });

    // Modify file
    fs.writeFileSync(testFile, 'console.log("main app v2");\n', 'utf8');

    const result = await generateSmartDocs(tmpDir);
    expect(result.readmeUpdated).toBe(true);
    expect(result.changelogUpdated).toBe(true);

    const readmeContent = fs.readFileSync(path.join(tmpDir, 'README.md'), 'utf8');
    expect(readmeContent).toContain('An autonomous AI-powered software project.');
    expect(readmeContent).toContain('Warden / Huginn IDE');

    const changelogContent = fs.readFileSync(path.join(tmpDir, 'CHANGELOG.md'), 'utf8');
    expect(changelogContent).toContain('# Changelog');
    expect(changelogContent).toContain('Attributed to');
  });
});
