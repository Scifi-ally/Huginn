import express from 'express';
import http from 'http';
import { initWebSocketServer, broadcastEvent } from './ws/server.js';
import { startScheduler, scheduleTasks } from './scheduler/index.js';
import { startWorker } from './worker/index.js';
import { verifyOfflineGuard } from './guard/network.js';
import { db } from './db/index.js';
import { tasks, taskHistory } from './db/schema.js';
import { desc, eq } from 'drizzle-orm';
import { modelManager } from './models/manager.js';
import dotenv from 'dotenv';
import os from 'os';
import fs from 'fs';
import path from 'path';
import { exec, execSync, execFile } from 'child_process';
import util from 'util';
import { diffEventEmitter, questionEventEmitter } from './agent/diffEvents.js';
import {
  getUserIdentity,
  setUserIdentity,
  generateSmartDocs,
  performSmartCommit,
  performSmartPush,
} from './git/smartGitManager.js';

import cors from 'cors';

const execAsync = util.promisify(exec);
const execFileAsync = util.promisify(execFile);

dotenv.config();

const app = express();
app.use(cors({ origin: ['http://localhost:5173', 'http://127.0.0.1:5173'] }));
app.use(express.json());

export function checkAuthToken(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction,
) {
  const tokenRequired = process.env.WARDEN_API_TOKEN || '';
  if (!tokenRequired) return next();
  const reqToken = req.headers['x-warden-token'] || req.query.token;
  if (reqToken !== tokenRequired) {
    res.status(401).json({ error: 'Unauthorized: Invalid WARDEN_API_TOKEN' });
    return;
  }
  next();
}
app.use('/api', checkAuthToken);

const server = http.createServer(app);
initWebSocketServer(server);

const PORT = process.env.PORT || 3000;

// API Routes
app.post('/api/goals', async (req, res) => {
  const { goal, contextDir, referencedFiles, taskId, images, mode, verificationCommand } = req.body;
  if (!goal) {
    res.status(400).json({ error: 'Goal is required' });
    return;
  }

  try {
    let finalGoal = goal;
    if (mode) {
      finalGoal = `[MODE: ${mode}] ${finalGoal}`;
    }
    if (images && images.length > 0) {
      images.forEach((img: string) => {
        finalGoal += `\n<image_data>${img}</image_data>`;
      });
    }

    console.log(`[Planner] Decomposing goal: ${goal}`);

    let activeTask: any = null;
    if (taskId) {
      const existing = await db.select().from(tasks).where(eq(tasks.id, taskId));
      if (existing.length > 0) {
        activeTask = existing[0];
        const prevDesc = activeTask.description || '';
        const cleanPrev = prevDesc.replace(/^\[Main Agent Orchestrator\]\s*/i, '').trim();
        const newDesc = cleanPrev
          ? `[Main Agent Orchestrator] ${cleanPrev}\n\nFollow-up Request:\n${finalGoal}`
          : `[Main Agent Orchestrator] ${finalGoal}`;
        await db
          .update(tasks)
          .set({
            status: 'ready',
            description: newDesc,
          })
          .where(eq(tasks.id, taskId));
        activeTask = { ...activeTask, status: 'ready', description: newDesc };
        broadcastEvent('task_status_changed', { id: taskId });
      }
    }

    if (!activeTask) {
      const inserted = await db
        .insert(tasks)
        .values({
          description: `[Main Agent Orchestrator] ${finalGoal}`,
          estimatedTier: 4,
          verificationCommand: verificationCommand || '',
          contextDir: contextDir || null,
        })
        .returning();
      activeTask = inserted[0];
      broadcastEvent('task_created', activeTask);
    }

    const allRefs = Array.isArray(referencedFiles) ? [...referencedFiles] : [];

    if (allRefs.length > 0) {
      broadcastEvent('task_console', {
        taskId: activeTask.id,
        content: `\n[System] Attached referenced files to agent context: ${allRefs.map((f: string) => `@${f}`).join(', ')}\n`,
      });
    }

    const insertedTasks = [activeTask];

    // Notify scheduler to wake up
    scheduleTasks().catch(console.error);

    res.json({ success: true, tasks: insertedTasks });
  } catch (err: any) {
    console.error('[Planner] Error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/tasks', async (req, res) => {
  try {
    const allTasks = await db.select().from(tasks).orderBy(desc(tasks.createdAt));
    res.json(allTasks);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/tasks/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await db.delete(taskHistory).where(eq(taskHistory.taskId, id));
    await db.delete(tasks).where(eq(tasks.id, id));
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/tasks/:id/stop', async (req, res) => {
  try {
    const { id } = req.params;
    await db
      .update(tasks)
      .set({ status: 'stopped', updatedAt: new Date() })
      .where(eq(tasks.id, id));
    questionEventEmitter.emit(`stop_${id}`);
    questionEventEmitter.emit(`resolve_${id}`, 'Reject');
    diffEventEmitter.emit(`resolve_${id}`, 'reject');
    broadcastEvent('task_console', {
      taskId: id,
      content: '\n[System] Task execution stopped by user.\n',
    });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/tasks/:id/resume', async (req, res) => {
  try {
    const { id } = req.params;
    const existing = await db.select().from(tasks).where(eq(tasks.id, id));
    if (existing.length === 0) {
      res.status(404).json({ error: 'Task not found' });
      return;
    }
    const task = existing[0];
    if (task.status !== 'stopped' && task.status !== 'failed') {
      res.status(400).json({ error: 'Task must be stopped or failed to resume' });
      return;
    }

    // Set back to ready and kick the scheduler
    await db
      .update(tasks)
      .set({ status: 'ready', attemptCount: 0, updatedAt: new Date() })
      .where(eq(tasks.id, id));
    broadcastEvent('task_status_changed', { id });
    broadcastEvent('task_console', {
      taskId: id,
      content: '\n[System] Task execution resumed by user.\n',
    });

    scheduleTasks().catch(console.error);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/questions/resolve', (req: express.Request, res: express.Response) => {
  const { taskId, answer } = req.body;
  if (!taskId || answer === undefined) {
    res.status(400).json({ error: 'taskId and answer are required' });
    return;
  }
  questionEventEmitter.emit(`resolve_${taskId}`, answer);
  res.json({ success: true });
});

app.post('/api/diff/resolve', (req: express.Request, res: express.Response) => {
  const { taskId, action } = req.body;
  if (!taskId || !action) {
    res.status(400).json({ error: 'taskId and action are required' });
    return;
  }
  diffEventEmitter.emit(`resolve_${taskId}`, action);
  res.json({ success: true });
});

app.post('/api/ollama/start', (req: express.Request, res: express.Response) => {
  try {
    if (process.platform === 'win32') {
      exec('start ollama');
    } else if (process.platform === 'darwin') {
      exec('open -a Ollama');
    } else {
      exec('ollama serve &');
    }
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

let lastCpuTimes = getCpuTimes();
let currentCpuUsage = 2;

function getCpuTimes() {
  const cpus = os.cpus();
  let user = 0,
    nice = 0,
    sys = 0,
    idle = 0,
    irq = 0;
  for (const cpu of cpus) {
    user += cpu.times.user;
    nice += cpu.times.nice;
    sys += cpu.times.sys;
    idle += cpu.times.idle;
    irq += cpu.times.irq;
  }
  return { total: user + nice + sys + idle + irq, active: user + nice + sys + irq };
}

setInterval(() => {
  const nowCpu = getCpuTimes();
  const totalDiff = nowCpu.total - lastCpuTimes.total;
  const activeDiff = nowCpu.active - lastCpuTimes.active;
  if (totalDiff > 0) {
    currentCpuUsage = Math.min(100, Math.max(0, Math.round((activeDiff / totalDiff) * 100)));
  }
  lastCpuTimes = nowCpu;
}, 3000);

let cachedGpuInfo = 'Detecting GPU...';
setTimeout(() => {
  try {
    try {
      const nvid = execSync('nvidia-smi --query-gpu=name,memory.total --format=csv,noheader', {
        encoding: 'utf-8',
        timeout: 3000,
        windowsHide: true,
      }).trim();
      if (nvid) {
        const parts = nvid.split(',');
        const name = parts[0]
          .replace(/NVIDIA\s+/i, '')
          .replace(/GeForce\s+/i, '')
          .trim();
        const mem = parts[1] ? ` (${Math.round(parseInt(parts[1]) / 1024)}GB VRAM)` : '';
        cachedGpuInfo = `${name}${mem}`;
        return;
      }
    } catch {}
    if (process.platform === 'win32') {
      const wmi = execSync(
        'powershell -NoProfile -Command "(Get-CimInstance Win32_VideoController)[0].Name"',
        { encoding: 'utf-8', timeout: 3000, windowsHide: true },
      ).trim();
      if (wmi)
        cachedGpuInfo = wmi
          .replace(/NVIDIA\s+/i, '')
          .replace(/GeForce\s+/i, '')
          .replace(/AMD\s+/i, '')
          .replace(/Intel\(R\)\s+/i, '')
          .trim();
    } else if (process.platform === 'darwin') {
      cachedGpuInfo = 'Apple Silicon Unified GPU';
    } else {
      cachedGpuInfo = 'Dedicated GPU';
    }
  } catch {
    cachedGpuInfo = 'Dedicated GPU';
  }
}, 100);

app.get('/api/system', (req, res) => {
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = totalMem - freeMem;

  res.json({
    modelLoaded: modelManager.getLoadedModel() || 'none',
    schedulerOn: true,
    cpuUsage: currentCpuUsage,
    memoryUsedBytes: usedMem,
    memoryTotalBytes: totalMem,
    gpuInfo: cachedGpuInfo,
  });
});

export function getWorkspaceRoot(): string {
  let root = process.env.TARGET_REPO_DIR || process.cwd();
  if (
    process.platform === 'win32' &&
    typeof root === 'string' &&
    root.startsWith('/') &&
    /^\/[a-zA-Z]:/.test(root)
  ) {
    root = root.slice(1);
  }
  return path.resolve(root);
}

export function resolveWorkspacePath(dirParam?: any, subPath?: string): string {
  const root = getWorkspaceRoot();
  let targetDir = root;
  if (dirParam && dirParam !== 'root' && typeof dirParam === 'string') {
    let rawDir = dirParam;
    if (process.platform === 'win32' && rawDir.startsWith('/') && /^\/[a-zA-Z]:/.test(rawDir)) {
      rawDir = rawDir.slice(1);
    }
    targetDir = path.resolve(root, rawDir);
  }
  const target = subPath ? path.resolve(targetDir, subPath) : targetDir;
  const rel = path.relative(root, target);
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error('Security Error: Path traversal outside workspace directory is forbidden.');
  }
  return target;
}

const gitStatusCache: Record<string, { data: any; timestamp: number }> = {};

app.get('/api/git/status', async (req, res) => {
  const { dir } = req.query;
  try {
    const targetDir = resolveWorkspacePath(dir);
    const now = Date.now();
    if (gitStatusCache[targetDir] && now - gitStatusCache[targetDir].timestamp < 30000) {
      res.json(gitStatusCache[targetDir].data);
      return;
    }
    let isRepo = false;
    try {
      await execFileAsync('git', ['rev-parse', '--is-inside-work-tree'], {
        cwd: targetDir,
        windowsHide: true,
      });
      isRepo = true;
    } catch {
      isRepo = fs.existsSync(path.join(targetDir, '.git'));
    }
    let remote = null;
    let branch = 'main';
    let modifiedCount = 0;
    let lastCommit = null;
    let modifiedFiles: { status: string; path: string; isDirectory: boolean }[] = [];
    let recentCommits: { hash: string; message: string; time: string; author: string }[] = [];

    if (isRepo) {
      try {
        const { stdout } = await execFileAsync('git', ['remote', 'get-url', 'origin'], {
          cwd: targetDir,
          windowsHide: true,
        });
        if (stdout?.trim()) remote = stdout.trim();
      } catch {
        const configPath = path.join(targetDir, '.git', 'config');
        if (fs.existsSync(configPath)) {
          const config = await fs.promises.readFile(configPath, 'utf-8');
          const match = config.match(/\[remote "origin"\][\s\S]*?url = ([^\s]+)/);
          if (match) remote = match[1].trim();
        }
      }
      try {
        const { stdout: branchOut } = await execFileAsync('git', ['branch', '--show-current'], {
          cwd: targetDir,
          windowsHide: true,
        });
        if (branchOut?.trim()) branch = branchOut.trim();
        else {
          const { stdout: statusOut } = await execFileAsync(
            'git',
            ['status', '-b', '--porcelain'],
            {
              cwd: targetDir,
              windowsHide: true,
            },
          );
          const bMatch = statusOut?.trim().match(/^##\s+([^\/\s\.]+)/);
          if (bMatch) branch = bMatch[1];
        }
      } catch {}
      modifiedFiles = [];
      try {
        const { stdout: statusLines } = await execFileAsync('git', ['status', '--short'], {
          cwd: targetDir,
          windowsHide: true,
        });
        if (statusLines?.trim()) {
          const lines = statusLines.trim().split('\n').filter(Boolean);
          const filteredLines = lines.filter((l) => {
            let file = l.substring(3).trim();
            if (file.includes('->')) file = file.split('->').pop()?.trim() || file;
            return !file.includes('warden_swarm_memory.json') && !file.endsWith('.log');
          });
          modifiedCount = filteredLines.length;
          modifiedFiles = filteredLines.slice(0, 30).map((l) => {
            const rawStatus = l.substring(0, 2).trim();
            let rawPath = l.substring(3).trim();
            if (rawPath.includes('->')) rawPath = rawPath.split('->').pop()?.trim() || rawPath;
            let isDir = rawPath.endsWith('/');
            try {
              const fullP = path.join(targetDir, rawPath.replace(/\/$/, ''));
              if (fs.existsSync(fullP)) isDir = fs.statSync(fullP).isDirectory();
            } catch {}
            return {
              status: rawStatus,
              path: rawPath.replace(/\/$/, ''),
              isDirectory: isDir,
            };
          });
        }
      } catch {}
      recentCommits = [];
      try {
        const { stdout: logOut } = await execFileAsync(
          'git',
          ['log', '-1', '--pretty=%h - %s (%cr)'],
          {
            cwd: targetDir,
            windowsHide: true,
          },
        );
        if (logOut?.trim()) lastCommit = logOut.trim();
      } catch {}
      try {
        const { stdout: logsOut } = await execFileAsync(
          'git',
          ['log', '-5', '--pretty=format:%h|||%s|||%cr|||%an'],
          {
            cwd: targetDir,
            windowsHide: true,
          },
        );
        if (logsOut?.trim()) {
          recentCommits = logsOut
            .trim()
            .split('\n')
            .filter(Boolean)
            .map((line) => {
              const parts = line.replace(/^"|"$/g, '').split('|||');
              return {
                hash: parts[0] || '',
                message: parts[1] || '',
                time: parts[2] || '',
                author: parts[3] || '',
              };
            });
        }
      } catch {}
    }
    const result = {
      isRepo,
      remote,
      branch,
      modifiedCount,
      modifiedFiles,
      lastCommit,
      recentCommits,
    };
    gitStatusCache[targetDir] = { data: result, timestamp: now };
    res.json(result);
  } catch (err: any) {
    res.json({
      isRepo: false,
      remote: null,
      branch: null,
      modifiedCount: 0,
      modifiedFiles: [],
      lastCommit: null,
      recentCommits: [],
    });
  }
});

app.get('/api/git/config', async (req, res) => {
  const { dir } = req.query;
  try {
    const targetDir = resolveWorkspacePath(dir);
    const identity = await getUserIdentity(targetDir);
    res.json(identity);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/git/config', async (req, res) => {
  const { dir, name, email, isGlobal } = req.body;
  try {
    const targetDir = resolveWorkspacePath(dir);
    if (!name || !email) {
      res.status(400).json({ error: 'Name and email are required.' });
      return;
    }
    await setUserIdentity(targetDir, name, email, Boolean(isGlobal));
    const updated = await getUserIdentity(targetDir);
    res.json({ success: true, identity: updated });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/git/smart-commit', async (req, res) => {
  const { dir, message } = req.body;
  try {
    const targetDir = resolveWorkspacePath(dir);
    delete gitStatusCache[targetDir];
    const result = await performSmartCommit(targetDir, message);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message, success: false });
  }
});

app.post('/api/git/smart-docs', async (req, res) => {
  const { dir } = req.body;
  try {
    const targetDir = resolveWorkspacePath(dir);
    delete gitStatusCache[targetDir];
    const result = await generateSmartDocs(targetDir);
    res.json({ success: true, ...result });
  } catch (err: any) {
    res.status(500).json({ error: err.message, success: false });
  }
});

app.post('/api/git/smart-push', async (req, res) => {
  const { dir, branch } = req.body;
  try {
    const targetDir = resolveWorkspacePath(dir);
    delete gitStatusCache[targetDir];
    const result = await performSmartPush(targetDir, branch);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message, success: false });
  }
});

app.post('/api/git/connect', async (req, res) => {
  const { dir, remoteUrl, repoName, isPrivate } = req.body;
  try {
    const targetDir = resolveWorkspacePath(dir);
    delete gitStatusCache[targetDir];

    let isRepo = false;
    try {
      await execFileAsync('git', ['rev-parse', '--is-inside-work-tree'], {
        cwd: targetDir,
        windowsHide: true,
      });
      isRepo = true;
    } catch {
      isRepo = fs.existsSync(path.join(targetDir, '.git'));
    }
    if (!isRepo) {
      await execFileAsync('git', ['init'], { cwd: targetDir, windowsHide: true });
    }

    if (remoteUrl) {
      try {
        await execFileAsync('git', ['remote', 'remove', 'origin'], {
          cwd: targetDir,
          windowsHide: true,
        });
      } catch {}
      await execFileAsync('git', ['remote', 'add', 'origin', remoteUrl], {
        cwd: targetDir,
        windowsHide: true,
      });
      res.json({ success: true, message: `Connected to remote origin (${remoteUrl}).` });
      return;
    } else if (repoName) {
      const visibilityFlag = isPrivate ? '--private' : '--public';
      try {
        const { stdout } = await execFileAsync(
          'gh',
          ['repo', 'create', repoName, visibilityFlag, '--source', targetDir, '--remote', 'origin'],
          { cwd: targetDir, windowsHide: true },
        );
        res.json({
          success: true,
          message: `Created GitHub repository '${repoName}' and linked origin!`,
          output: stdout,
        });
        return;
      } catch (err: any) {
        res.status(400).json({ success: false, error: `GitHub CLI error: ${err.message}` });
        return;
      }
    }
    res.status(400).json({ success: false, error: 'Must provide either remoteUrl or repoName.' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/open-explorer', (req, res) => {
  const { dir } = req.body;
  try {
    const targetDir = resolveWorkspacePath(dir);
    const cmd =
      process.platform === 'win32'
        ? 'explorer.exe'
        : process.platform === 'darwin'
          ? 'open'
          : 'xdg-open';
    execFile(cmd, [targetDir], { windowsHide: true }, (error) => {
      if (error) {
        console.error('Failed to open explorer:', error);
        res.status(500).json({ error: 'Failed to open explorer' });
        return;
      }
      res.json({ success: true });
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

const filesCache: Record<string, { data: any; timestamp: number }> = {};
const ignoredDirs = new Set([
  'node_modules',
  '__pycache__',
  '.git',
  '.venv',
  'venv',
  'env',
  '.next',
  'dist',
  'build',
  '.idea',
  '.vscode',
  '.DS_Store',
  'coverage',
  'tmp',
  'temp',
  'vendor',
  'warden-log',
  '.gemini',
  'brain',
  '.system_generated',
]);
function clearFilesCache() {
  for (const k in filesCache) delete filesCache[k];
}

let activeWatcher: fs.FSWatcher | null = null;
let activeWatchDir: string | null = null;
let watchDebounce: NodeJS.Timeout | null = null;

function setupFileWatcher(targetDir: string) {
  if (activeWatchDir === targetDir) return; // Already watching this dir

  if (activeWatcher) {
    activeWatcher.close();
    activeWatcher = null;
  }

  activeWatchDir = targetDir;
  try {
    activeWatcher = fs.watch(targetDir, { recursive: true }, (eventType, filename) => {
      if (filename && typeof filename === 'string') {
        const rootPart = filename.split(/[/\\]/)[0];
        if (ignoredDirs.has(rootPart)) return;
      }

      if (watchDebounce) clearTimeout(watchDebounce);
      watchDebounce = setTimeout(() => {
        clearFilesCache();
        broadcastEvent('workspace_changed', { type: eventType, filename });
      }, 300);
    });
  } catch (err) {
    console.error('Failed to setup file watcher for', targetDir, err);
  }
}

app.get('/api/files', (req, res) => {
  const { dir, recursive } = req.query;
  const targetDir = resolveWorkspacePath(dir);
  const cacheKey = `${targetDir}:${recursive}`;

  // Ensure we are watching the current workspace directory for changes
  setupFileWatcher(targetDir);

  if (filesCache[cacheKey] && Date.now() - filesCache[cacheKey].timestamp < 2500) {
    res.json(filesCache[cacheKey].data);
    return;
  }

  try {
    if (recursive === 'true') {
      const results: any[] = [];
      const getAllFiles = (currentDir: string, baseDir: string, depth: number = 0) => {
        if (depth > 6 || results.length > 3000) return;
        try {
          const list = fs.readdirSync(currentDir, { withFileTypes: true });
          for (const item of list) {
            if (
              ignoredDirs.has(item.name) ||
              item.name.startsWith('.') ||
              item.name.endsWith('.pyc') ||
              item.name.endsWith('.pyo')
            )
              continue;
            const fullPath = path.join(currentDir, item.name);
            const relPath = path.relative(baseDir, fullPath).replace(/\\/g, '/');
            if (item.isDirectory()) {
              results.push({ name: relPath, isDirectory: true });
              getAllFiles(fullPath, baseDir, depth + 1);
            } else {
              results.push({ name: relPath, isDirectory: false });
            }
          }
        } catch (err) {}
      };
      getAllFiles(targetDir, targetDir);
      filesCache[cacheKey] = { data: results, timestamp: Date.now() };
      res.json(results);
      return;
    }
    let items: fs.Dirent[] = [];
    try {
      items = fs.readdirSync(targetDir, { withFileTypes: true });
      items = items.filter((item) => !ignoredDirs.has(item.name) && !item.name.startsWith('.'));
    } catch (e) {
      res.json([]);
      return;
    }
    const result = items.map((item) => ({
      name: item.name,
      isDirectory: item.isDirectory(),
    }));
    result.sort((a, b) => {
      if (a.isDirectory === b.isDirectory) return a.name.localeCompare(b.name);
      return a.isDirectory ? -1 : 1;
    });
    filesCache[cacheKey] = { data: result, timestamp: Date.now() };
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/files', (req, res) => {
  const { dir, name } = req.body;
  if (!dir || !name) {
    res.status(400).json({ error: 'dir and name required' });
    return;
  }
  try {
    const targetPath = resolveWorkspacePath(dir, name);
    fs.mkdirSync(targetPath, { recursive: true });
    clearFilesCache();
    res.json({ success: true, path: targetPath });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/run', (req, res) => {
  const { dir, scriptName } = req.body;
  if (!scriptName || typeof scriptName !== 'string' || !/^[a-zA-Z0-9_\-\.\:]+$/.test(scriptName)) {
    res
      .status(400)
      .json({ error: 'Valid scriptName required (alphanumeric, dash, colon, underscore)' });
    return;
  }
  try {
    const cwd = dir && fs.existsSync(dir) ? dir : process.cwd();
    const pkgPath = path.join(cwd, 'package.json');
    if (!fs.existsSync(pkgPath)) {
      res.status(400).json({ error: 'No package.json found in directory' });
      return;
    }
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
    if (!pkg.scripts || !pkg.scripts[scriptName]) {
      res.status(400).json({ error: `Script '${scriptName}' not found in package.json` });
      return;
    }

    const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
    execFile(npmCmd, ['run', scriptName], { cwd, windowsHide: true }, (err, stdout, stderr) => {
      console.log('[Run Project]', stdout, stderr);
    });
    res.json({ success: true, message: `npm run ${scriptName} launched!` });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/tasks/:id/history', async (req, res) => {
  try {
    const { id } = req.params;
    const history = await db
      .select()
      .from(taskHistory)
      .where(eq(taskHistory.taskId, id))
      .orderBy(desc(taskHistory.createdAt));
    res.json(history);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/files/create', (req, res) => {
  const { dir, name } = req.body;
  if (!dir || !name) {
    res.status(400).json({ error: 'dir and name required' });
    return;
  }
  try {
    const targetPath = resolveWorkspacePath(dir, name);
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.writeFileSync(targetPath, '');
    clearFilesCache();
    res.json({ success: true, path: targetPath });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/files', (req, res) => {
  const { targetPath, dir } = req.body;
  if (!targetPath) {
    res.status(400).json({ error: 'targetPath required' });
    return;
  }
  try {
    const resolved = path.resolve(targetPath);
    const activeDir = dir ? resolveWorkspacePath(dir) : resolveWorkspacePath('root');
    const normResolved = resolved.replace(/\\/g, '/').toLowerCase();
    const normActive = activeDir.replace(/\\/g, '/').toLowerCase();
    const normCwd = process.cwd().replace(/\\/g, '/').toLowerCase();

    if (!normResolved.startsWith(normActive) && !normResolved.startsWith(normCwd)) {
      res
        .status(403)
        .json({ error: 'Security Error: Refusing to delete files outside active workspace.' });
      return;
    }
    if (
      resolved === path.parse(resolved).root ||
      normResolved === normActive ||
      normResolved === normCwd
    ) {
      res
        .status(400)
        .json({ error: 'Security Error: Refusing to delete root or parent system directories.' });
      return;
    }
    fs.rmSync(resolved, { recursive: true, force: true });
    clearFilesCache();
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/files/rename', (req, res) => {
  const { oldPath, newName, dir } = req.body;
  if (!oldPath || !newName) {
    res.status(400).json({ error: 'oldPath and newName required' });
    return;
  }
  try {
    const activeDir = dir ? resolveWorkspacePath(dir) : resolveWorkspacePath('root');
    const resolvedOld = path.resolve(oldPath);
    const resolvedNew = path.join(path.dirname(resolvedOld), newName);

    const normOld = resolvedOld.replace(/\\/g, '/').toLowerCase();
    const normActive = activeDir.replace(/\\/g, '/').toLowerCase();
    const normCwd = process.cwd().replace(/\\/g, '/').toLowerCase();

    if (!normOld.startsWith(normActive) && !normOld.startsWith(normCwd)) {
      res
        .status(403)
        .json({ error: 'Security Error: Refusing to rename files outside active workspace.' });
      return;
    }

    fs.renameSync(resolvedOld, resolvedNew);
    clearFilesCache();
    res.json({ success: true, newPath: resolvedNew });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/files/content', (req, res) => {
  let targetPath = req.query.path as string;
  if (!targetPath) {
    res.status(400).json({ error: 'path required' });
    return;
  }
  try {
    if (
      process.platform === 'win32' &&
      typeof targetPath === 'string' &&
      targetPath.startsWith('/') &&
      /^\/[a-zA-Z]:/.test(targetPath)
    ) {
      targetPath = targetPath.slice(1);
    }
    const resolvedPath = resolveWorkspacePath(req.query.dir || 'root', targetPath);
    if (!fs.existsSync(resolvedPath)) {
      res.status(404).json({ error: 'File not found' });
      return;
    }
    res.sendFile(resolvedPath);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/search', async (req, res) => {
  const dir = req.query.dir as string;
  const q = req.query.q as string;
  if (!q || typeof q !== 'string') {
    res.status(400).json({ error: 'Query parameter "q" is required' });
    return;
  }

  try {
    const targetDir = resolveWorkspacePath(dir);
    const matches: any[] = [];

    async function searchRecursively(currentDir: string) {
      if (matches.length >= 100) return;
      const entries = await fs.promises.readdir(currentDir, { withFileTypes: true });
      for (const e of entries) {
        if (matches.length >= 100) return;
        if (
          e.name === 'node_modules' ||
          e.name === '.git' ||
          e.name === '.pm2' ||
          e.name === 'dist' ||
          e.name === 'build' ||
          e.name.startsWith('.')
        )
          continue;
        const fullPath = path.join(currentDir, e.name);
        if (e.isDirectory()) {
          await searchRecursively(fullPath);
        } else if (e.isFile()) {
          try {
            const stat = await fs.promises.stat(fullPath);
            if (stat.size > 2 * 1024 * 1024) continue; // Skip files larger than 2MB
            const text = await fs.promises.readFile(fullPath, 'utf-8');
            const lines = text.split('\n');
            for (let idx = 0; idx < lines.length; idx++) {
              if (matches.length >= 100) break;
              const line = lines[idx];
              if (line.toLowerCase().includes(q.toLowerCase())) {
                const relPath = path.relative(targetDir, fullPath).replace(/\\/g, '/');
                matches.push({ file: relPath, line: idx + 1, content: line.trim() });
              }
            }
          } catch {}
        }
      }
    }

    await searchRecursively(targetDir);
    res.json(matches.slice(0, 100));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/files/content', express.text({ limit: '50mb' }), (req, res) => {
  let targetPath = req.query.path as string;
  if (!targetPath) {
    res.status(400).json({ error: 'path required' });
    return;
  }
  try {
    if (
      process.platform === 'win32' &&
      typeof targetPath === 'string' &&
      targetPath.startsWith('/') &&
      /^\/[a-zA-Z]:/.test(targetPath)
    ) {
      targetPath = targetPath.slice(1);
    }
    const resolvedPath = resolveWorkspacePath(req.query.dir || 'root', targetPath);
    fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });
    fs.writeFileSync(resolvedPath, req.body || '');
    clearFilesCache();
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Serve static frontend UI in standalone / production mode
const uiDistPath = path.join(process.cwd(), 'ui/dist');
if (fs.existsSync(uiDistPath)) {
  app.use(
    express.static(uiDistPath, {
      setHeaders: (res, path) => {
        if (path.endsWith('.html')) {
          res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
          res.setHeader('Pragma', 'no-cache');
          res.setHeader('Expires', '0');
        }
      },
    }),
  );
  app.use((req, res, next) => {
    // Only intercept GET requests that look like page navigation
    if (
      req.method !== 'GET' ||
      req.path.startsWith('/api') ||
      req.path.startsWith('/ws') ||
      false
    ) {
      return next();
    }
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.sendFile(path.join(uiDistPath, 'index.html'));
  });
}

async function boot() {
  console.log('[Warden] Booting up...');

  // 1. Network Guard Check
  const isOffline = await verifyOfflineGuard();
  if (!isOffline) {
    if (process.env.WARDEN_STRICT_OFFLINE === 'true') {
      console.error(
        '[Warden] 🚨 STRICT OFFLINE MODE: Halting server because external network access was detected. 🚨',
      );
      process.exit(1);
    }
    console.warn(
      '[Warden] WARNING: Network guard failed. Offline guarantee is NOT enforced. The agent CAN access the internet.',
    );
  }

  // 2. Start servers
  server.listen(PORT, () => {
    console.log(`[Warden] API and WS Server listening on port ${PORT}`);

    // 3. Start subsystems
    startScheduler();
    startWorker();

    console.log('[Warden] All systems online.');

    // Preload the golden standard 6GB VRAM model (qwen2.5-coder:7b or deepseek-r1:8b or fallback)
    modelManager
      .ensureLoaded('qwen2.5-coder:7b')
      .catch(() => modelManager.ensureLoaded('deepseek-r1:8b'))
      .catch(() => modelManager.ensureLoaded('qwen2.5-coder:1.5b'))
      .catch((err) => {
        console.warn('[Warden] Could not preload default model:', err.message);
      });
  });
}

boot();
