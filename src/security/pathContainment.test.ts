import { describe, it, expect } from 'vitest';
import { resolveWorkspacePath, getWorkspaceRoot } from '../index.js';
import { checkPathContainment } from '../agent/ClaudeCodeAgent.js';
import path from 'path';

describe('Path Containment Security Verification', () => {
  const root = getWorkspaceRoot();

  it('allows valid subpaths inside the workspace directory', () => {
    const validTarget = resolveWorkspacePath('root', 'src/index.ts');
    expect(validTarget).toBe(path.resolve(root, 'src/index.ts'));
    expect(() => checkPathContainment(root, validTarget)).not.toThrow();
  });

  it('throws a Security Error on relative path traversal (..) escapes out of workspace', () => {
    expect(() => resolveWorkspacePath('root', '../../../../Windows/System32/cmd.exe')).toThrow(
      /Security Error/i,
    );
    const escapePath = path.resolve(root, '../../../../etc/passwd');
    expect(() => checkPathContainment(root, escapePath)).toThrow(/Security Error/i);
  });

  it('throws a Security Error when passing absolute path outside the active workspace', () => {
    const outsidePath = process.platform === 'win32' ? 'C:/Windows/System32' : '/etc/passwd';
    expect(() => resolveWorkspacePath('root', outsidePath)).toThrow(/Security Error/i);
    expect(() => checkPathContainment(root, path.resolve(outsidePath))).toThrow(/Security Error/i);
  });

  it('prevents directory prefix traversal tricks (e.g., C:/proj vs C:/proj-evil)', () => {
    const fakePrefixEscape = root + '-evil/file.txt';
    expect(() => checkPathContainment(root, fakePrefixEscape)).toThrow(/Security Error/i);
  });
});
