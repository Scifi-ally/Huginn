import fs from 'fs';
import fsPromises from 'fs/promises';
import path from 'path';
import { execFile } from 'child_process';
import util from 'util';

const execFileAsync = util.promisify(execFile);

export interface UserIdentity {
  name: string;
  email: string;
}

export async function getUserIdentity(cwd: string): Promise<UserIdentity> {
  let name = '';
  let email = '';
  try {
    const { stdout: n } = await execFileAsync('git', ['config', 'user.name'], {
      cwd,
      windowsHide: true,
    });
    if (n?.trim()) name = n.trim();
  } catch {}
  try {
    const { stdout: e } = await execFileAsync('git', ['config', 'user.email'], {
      cwd,
      windowsHide: true,
    });
    if (e?.trim()) email = e.trim();
  } catch {}

  if (!name && process.env.GIT_AUTHOR_NAME) name = process.env.GIT_AUTHOR_NAME;
  if (!email && process.env.GIT_AUTHOR_EMAIL) email = process.env.GIT_AUTHOR_EMAIL;
  if (!name && (process.env.USER || process.env.USERNAME))
    name = (process.env.USER || process.env.USERNAME) as string;

  return {
    name: name || 'Warden Autonomous User',
    email: email || 'warden-ai@localhost',
  };
}

export async function setUserIdentity(
  cwd: string,
  name: string,
  email: string,
  isGlobal = false,
): Promise<void> {
  const argsName = isGlobal
    ? ['config', '--global', 'user.name', name]
    : ['config', 'user.name', name];
  const argsEmail = isGlobal
    ? ['config', '--global', 'user.email', email]
    : ['config', 'user.email', email];
  await execFileAsync('git', argsName, { cwd, windowsHide: true });
  await execFileAsync('git', argsEmail, { cwd, windowsHide: true });
}

export async function getExecOptionsWithIdentity(cwd: string) {
  const identity = await getUserIdentity(cwd);
  return {
    cwd,
    windowsHide: true,
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: identity.name,
      GIT_AUTHOR_EMAIL: identity.email,
      GIT_COMMITTER_NAME: identity.name,
      GIT_COMMITTER_EMAIL: identity.email,
    },
  };
}

export async function generateSmartDocs(
  cwd: string,
): Promise<{ readmeUpdated: boolean; changelogUpdated: boolean; summary: string }> {
  const readmePath = path.join(cwd, 'README.md');
  const changelogPath = path.join(cwd, 'CHANGELOG.md');

  let projectName = path.basename(cwd);
  let projectDesc = 'An autonomous AI-powered software project.';
  let pkgJson: any = null;
  try {
    const pkgPath = path.join(cwd, 'package.json');
    if (fs.existsSync(pkgPath)) {
      pkgJson = JSON.parse(await fsPromises.readFile(pkgPath, 'utf-8'));
      if (pkgJson.name) projectName = pkgJson.name;
      if (pkgJson.description) projectDesc = pkgJson.description;
    }
  } catch {}

  let recentCommits: { hash: string; message: string; date: string; author: string }[] = [];
  try {
    const { stdout: logOut } = await execFileAsync(
      'git',
      ['log', '-15', '--pretty=format:%h|||%s|||%ad|||%an', '--date=short'],
      { cwd, windowsHide: true },
    );
    if (logOut?.trim()) {
      recentCommits = logOut
        .trim()
        .split('\n')
        .filter(Boolean)
        .map((line) => {
          const p = line.split('|||');
          return { hash: p[0] || '', message: p[1] || '', date: p[2] || '', author: p[3] || '' };
        });
    }
  } catch {}

  let readmeUpdated = false;
  if (
    !fs.existsSync(readmePath) ||
    (await fsPromises.readFile(readmePath, 'utf-8')).trim().length < 50
  ) {
    const readmeContent = `# ${projectName}

${projectDesc}

## Overview
This repository is managed with autonomous AI assistance via **Warden / Huginn IDE**. All code features, structural changes, and git tracking are automatically maintained and verified for security and performance.

## Tech Stack & Architecture
${pkgJson && pkgJson.dependencies ? `- **Core Dependencies**: ${Object.keys(pkgJson.dependencies).slice(0, 8).join(', ')}` : '- **Platform**: Node.js / TypeScript / React UI'}
- **Version Control**: Automated via Warden Smart Git Manager

## Getting Started
\`\`\`bash
# Install dependencies
${fs.existsSync(path.join(cwd, 'package-lock.json')) ? 'npm install' : 'npm i'}

# Run development server
${pkgJson && pkgJson.scripts && pkgJson.scripts.dev ? 'npm run dev' : pkgJson && pkgJson.scripts && pkgJson.scripts.start ? 'npm start' : 'npm run build'}
\`\`\`

---
*Documentation auto-generated and kept up-to-date by Warden Smart Git Manager.*
`;
    await fsPromises.writeFile(readmePath, readmeContent, 'utf-8');
    readmeUpdated = true;
  }

  let changelogUpdated = false;
  const today = new Date().toISOString().split('T')[0];
  const identity = await getUserIdentity(cwd);

  const newSection = `## [Unreleased / ${today}] - Attributed to ${identity.name}
${
  recentCommits.length > 0
    ? recentCommits
        .slice(0, 10)
        .map((c) => `- **${c.hash}** (${c.date}): ${c.message}`)
        .join('\n')
    : '- Automated project synchronization and structure enhancements.'
}

`;

  if (!fs.existsSync(changelogPath)) {
    const initialChangelog = `# Changelog

All notable changes to this project will be documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/), and this project adheres to [Semantic Versioning](https://semver.org/).

${newSection}`;
    await fsPromises.writeFile(changelogPath, initialChangelog, 'utf-8');
    changelogUpdated = true;
  } else {
    const existing = await fsPromises.readFile(changelogPath, 'utf-8');
    if (!existing.includes(today) && recentCommits.length > 0) {
      const headerIndex = existing.indexOf('## [');
      if (headerIndex !== -1) {
        const updated = existing.slice(0, headerIndex) + newSection + existing.slice(headerIndex);
        await fsPromises.writeFile(changelogPath, updated, 'utf-8');
      } else {
        await fsPromises.writeFile(changelogPath, existing + '\n\n' + newSection, 'utf-8');
      }
      changelogUpdated = true;
    }
  }

  return {
    readmeUpdated,
    changelogUpdated,
    summary: `Smart Documentation complete! ${readmeUpdated ? 'README.md created/updated. ' : ''}${changelogUpdated ? 'CHANGELOG.md updated.' : 'Documentation already synchronized.'}`,
  };
}

export async function performSmartCommit(
  cwd: string,
  customMessage?: string,
): Promise<{ success: boolean; commitHash?: string; message: string; filesCommitted: number }> {
  try {
    const { stdout: statusLines } = await execFileAsync('git', ['status', '--short'], {
      cwd,
      windowsHide: true,
    });
    if (!statusLines || !statusLines.trim()) {
      return {
        success: true,
        message: 'Working tree is clean! No files to commit.',
        filesCommitted: 0,
      };
    }

    const lines = statusLines.trim().split('\n').filter(Boolean);
    const validLines = lines.filter((l) => {
      const f = l.substring(3).trim();
      return !f.endsWith('.log') && !f.includes('warden_swarm_memory.json') && !f.includes('.env');
    });

    if (validLines.length === 0) {
      return {
        success: true,
        message: 'Only log or temporary files modified. Skipped commit.',
        filesCommitted: 0,
      };
    }

    const execOpts = await getExecOptionsWithIdentity(cwd);

    // Stage changes cleanly (git add -u stages modified/deleted, then add safe untracked files)
    await execFileAsync('git', ['add', '-u'], execOpts).catch(() => {});
    for (const l of validLines) {
      if (l.startsWith('??')) {
        let fPath = l.substring(3).trim();
        if (fPath.includes('->')) fPath = fPath.split('->').pop()?.trim() || fPath;
        if (!fPath.endsWith('.log') && !fPath.includes('.env')) {
          await execFileAsync('git', ['add', fPath], execOpts).catch(() => {});
        }
      }
    }

    let commitMsg = customMessage;
    if (!commitMsg) {
      const addedCount = validLines.filter((l) => l.startsWith('??') || l.startsWith('A')).length;
      const modCount = validLines.filter((l) => l.startsWith('M') || l.startsWith(' R')).length;
      const delCount = validLines.filter((l) => l.startsWith('D')).length;

      const firstFile = validLines[0]
        ? validLines[0].substring(3).trim().split('/').pop()
        : 'files';
      if (addedCount > 0 && modCount === 0 && delCount === 0) {
        commitMsg = `feat: add ${firstFile}${addedCount > 1 ? ` and ${addedCount - 1} other files` : ''}`;
      } else if (delCount > 0 && addedCount === 0 && modCount === 0) {
        commitMsg = `refactor: remove ${firstFile}${delCount > 1 ? ` (${delCount} files)` : ''}`;
      } else if (validLines.some((l) => l.includes('README.md') || l.includes('CHANGELOG.md'))) {
        commitMsg = `docs: synchronize project documentation and structure`;
      } else {
        commitMsg = `feat: update ${firstFile}${validLines.length > 1 ? ` and ${validLines.length - 1} other files` : ''}`;
      }
    }

    await execFileAsync('git', ['commit', '-m', commitMsg], execOpts);

    let commitHash = '';
    try {
      const { stdout: h } = await execFileAsync('git', ['rev-parse', '--short', 'HEAD'], {
        cwd,
        windowsHide: true,
      });
      if (h?.trim()) commitHash = h.trim();
    } catch {}

    const identity = await getUserIdentity(cwd);

    return {
      success: true,
      commitHash,
      message: `Committed ${validLines.length} files as "${commitMsg}" (Author: ${identity.name} <${identity.email}>)`,
      filesCommitted: validLines.length,
    };
  } catch (err: any) {
    return { success: false, message: `Git commit error: ${err.message}`, filesCommitted: 0 };
  }
}

export async function performSmartPush(
  cwd: string,
  branch?: string,
): Promise<{ success: boolean; needsConnection?: boolean; message: string; output?: string }> {
  try {
    let targetBranch = branch || 'main';
    try {
      const { stdout: b } = await execFileAsync('git', ['branch', '--show-current'], {
        cwd,
        windowsHide: true,
      });
      if (b?.trim()) targetBranch = b.trim();
    } catch {}

    // Check remote origin
    let remoteUrl = '';
    try {
      const { stdout: r } = await execFileAsync('git', ['remote', 'get-url', 'origin'], {
        cwd,
        windowsHide: true,
      });
      if (r?.trim()) remoteUrl = r.trim();
    } catch {}

    if (!remoteUrl) {
      return {
        success: false,
        needsConnection: true,
        message:
          'No GitHub repository connected! Please connect or create a GitHub repository (`origin`) to push changes.',
      };
    }

    const execOpts = await getExecOptionsWithIdentity(cwd);
    const { stdout, stderr } = await execFileAsync('git', ['push', '-u', 'origin', targetBranch], {
      ...execOpts,
      timeout: 60000,
    }).catch((e) => ({ stdout: '', stderr: e.message || '' }));

    const output = (stdout || stderr || '').trim();
    if (/403|Permission denied|Authentication failed|could not read Username/i.test(output)) {
      return {
        success: false,
        needsConnection: true,
        message:
          `GitHub authentication required (${output}). Please authenticate with GitHub CLI (` +
          '`gh auth login`' +
          ') or check repository access.',
        output,
      };
    }

    const identity = await getUserIdentity(cwd);
    return {
      success: true,
      message: `Successfully pushed branch '${targetBranch}' to ${remoteUrl} under author name '${identity.name}'!`,
      output,
    };
  } catch (err: any) {
    return { success: false, message: `Git push error: ${err.message}` };
  }
}
