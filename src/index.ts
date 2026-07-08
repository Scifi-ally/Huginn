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
import { exec, execSync } from 'child_process';

dotenv.config();

const app = express();
app.use(express.json());

const server = http.createServer(app);
initWebSocketServer(server);

const PORT = process.env.PORT || 3000;

// API Routes
app.post('/goals', async (req, res) => {
  const { goal, contextDir, referencedFiles, taskId, images } = req.body;
  if (!goal) {
    res.status(400).json({ error: 'Goal is required' });
    return;
  }

  try {
    let finalGoal = goal;
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
        const newDesc = cleanPrev ? `[Main Agent Orchestrator] ${cleanPrev}\n\nFollow-up Request:\n${finalGoal}` : `[Main Agent Orchestrator] ${finalGoal}`;
        await db.update(tasks).set({ 
          status: 'ready',
          description: newDesc
        }).where(eq(tasks.id, taskId));
        activeTask = { ...activeTask, status: 'ready', description: newDesc };
      }
    }

    if (!activeTask) {
      const inserted = await db.insert(tasks).values({
        description: `[Main Agent Orchestrator] ${finalGoal}`,
        estimatedTier: 4,
        verificationCommand: 'echo "Orchestrator finished"',
        contextDir: contextDir || null,
      }).returning();
      activeTask = inserted[0];
      broadcastEvent('task_created', activeTask);
    }
    
    const matches = goal.match(/@([a-zA-Z0-9_\-\/\.\\]+\.[a-zA-Z0-9]+)/g);
    const allRefs = Array.isArray(referencedFiles) ? [...referencedFiles] : [];
    if (matches) {
      matches.forEach((m: string) => {
        const clean = m.slice(1);
        if (!allRefs.includes(clean)) allRefs.push(clean);
      });
    }

    if (allRefs.length > 0) {
      broadcastEvent('task_console', {
        taskId: activeTask.id,
        content: `\n[System] Attached referenced files to agent context: ${allRefs.map((f: string) => `@${f}`).join(', ')}\n`
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

app.get('/tasks', async (req, res) => {
  try {
    const allTasks = await db.select().from(tasks).orderBy(desc(tasks.createdAt));
    res.json(allTasks);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/tasks/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await db.delete(taskHistory).where(eq(taskHistory.taskId, id));
    await db.delete(tasks).where(eq(tasks.id, id));
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/tasks/:id/stop', async (req, res) => {
  try {
    const { id } = req.params;
    await db.update(tasks).set({ status: 'stopped' }).where(eq(tasks.id, id));
    broadcastEvent('task_console', { taskId: id, content: '\n[System] Task execution stopped by user.\n' });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

let lastCpuTimes = getCpuTimes();
let currentCpuUsage = 2;

function getCpuTimes() {
  const cpus = os.cpus();
  let user = 0, nice = 0, sys = 0, idle = 0, irq = 0;
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
      const nvid = execSync('nvidia-smi --query-gpu=name,memory.total --format=csv,noheader', { encoding: 'utf-8', timeout: 3000, windowsHide: true }).trim();
      if (nvid) {
        const parts = nvid.split(',');
        const name = parts[0].replace(/NVIDIA\s+/i, '').replace(/GeForce\s+/i, '').trim();
        const mem = parts[1] ? ` (${Math.round(parseInt(parts[1]) / 1024)}GB VRAM)` : '';
        cachedGpuInfo = `${name}${mem}`;
        return;
      }
    } catch {}
    if (process.platform === 'win32') {
      const wmi = execSync('powershell -NoProfile -Command "(Get-CimInstance Win32_VideoController)[0].Name"', { encoding: 'utf-8', timeout: 3000, windowsHide: true }).trim();
      if (wmi) cachedGpuInfo = wmi.replace(/NVIDIA\s+/i, '').replace(/GeForce\s+/i, '').replace(/AMD\s+/i, '').replace(/Intel\(R\)\s+/i, '').trim();
    } else if (process.platform === 'darwin') {
      cachedGpuInfo = 'Apple Silicon Unified GPU';
    } else {
      cachedGpuInfo = 'Dedicated GPU';
    }
  } catch {
    cachedGpuInfo = 'Dedicated GPU';
  }
}, 100);

app.get('/system', (req, res) => {
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

function resolveWorkspacePath(dirParam: any, subPath?: string): string {
  let rawDir = (!dirParam || dirParam === 'root') ? (process.env.TARGET_REPO_DIR || process.cwd()) : (typeof dirParam === 'string' ? dirParam : process.cwd());
  if (process.platform === 'win32' && typeof rawDir === 'string' && rawDir.startsWith('/') && /^\/[a-zA-Z]:/.test(rawDir)) {
    rawDir = rawDir.slice(1);
  }
  const resolvedBase = path.resolve(rawDir);
  if (!subPath) return resolvedBase;
  const resolvedTarget = path.resolve(resolvedBase, subPath);
  const rel = path.relative(resolvedBase, resolvedTarget);
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error('Security Error: Path traversal outside workspace directory is forbidden.');
  }
  return resolvedTarget;
}

const gitStatusCache: Record<string, { data: any, timestamp: number }> = {};

app.get('/git/status', (req, res) => {
  const { dir } = req.query;
  try {
    const targetDir = resolveWorkspacePath(dir);
    const now = Date.now();
    if (gitStatusCache[targetDir] && (now - gitStatusCache[targetDir].timestamp < 30000)) {
      res.json(gitStatusCache[targetDir].data);
      return;
    }
    let isRepo = false;
    try {
      execSync('git rev-parse --is-inside-work-tree', { cwd: targetDir, stdio: 'ignore', windowsHide: true });
      isRepo = true;
    } catch {
      isRepo = fs.existsSync(path.join(targetDir, '.git'));
    }
    let remote = null;
    let branch = 'main';
    let modifiedCount = 0;
    let lastCommit = null;

    if (isRepo) {
      try {
        const remoteOut = execSync('git remote get-url origin', { cwd: targetDir, stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true }).toString().trim();
        if (remoteOut) remote = remoteOut;
      } catch {
        const configPath = path.join(targetDir, '.git', 'config');
        if (fs.existsSync(configPath)) {
          const config = fs.readFileSync(configPath, 'utf-8');
          const match = config.match(/\[remote "origin"\][\s\S]*?url = ([^\s]+)/);
          if (match) remote = match[1].trim();
        }
      }
      try {
        const branchOut = execSync('git branch --show-current', { cwd: targetDir, stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true }).toString().trim();
        if (branchOut) branch = branchOut;
        else {
          const statusOut = execSync('git status -b --porcelain', { cwd: targetDir, stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true }).toString().trim();
          const bMatch = statusOut.match(/^##\s+([^\/\s\.]+)/);
          if (bMatch) branch = bMatch[1];
        }
      } catch {}
      try {
        const statusLines = execSync('git status --short', { cwd: targetDir, stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true }).toString().trim();
        modifiedCount = statusLines ? statusLines.split('\n').filter(Boolean).length : 0;
      } catch {}
      try {
        const logOut = execSync('git log -1 --pretty="%h - %s (%cr)"', { cwd: targetDir, stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true }).toString().trim();
        if (logOut) lastCommit = logOut;
      } catch {}
    }
    const result = { isRepo, remote, branch, modifiedCount, lastCommit };
    gitStatusCache[targetDir] = { data: result, timestamp: now };
    res.json(result);
  } catch (err: any) {
    res.json({ isRepo: false, remote: null, branch: null, modifiedCount: 0, lastCommit: null });
  }
});

app.post('/open-explorer', (req, res) => {
  const { dir } = req.body;
  try {
    const targetDir = resolveWorkspacePath(dir);
    exec(`start "" "${targetDir}"`, { windowsHide: true }, (error) => {
      if (error) {
        console.error("Failed to open explorer:", error);
        res.status(500).json({ error: "Failed to open explorer" });
        return;
      }
      res.json({ success: true });
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

const filesCache: Record<string, { data: any, timestamp: number }> = {};
const ignoredDirs = new Set(['node_modules', '__pycache__', '.git', '.venv', 'venv', 'env', '.next', 'dist', 'build', '.idea', '.vscode', '.DS_Store', 'coverage', 'tmp', 'temp', 'vendor', 'warden-log', '.gemini', 'brain', '.system_generated']);
function clearFilesCache() {
  for (const k in filesCache) delete filesCache[k];
}

app.get('/files', (req, res) => {
  const { dir, recursive } = req.query;
  const targetDir = resolveWorkspacePath(dir);

  try {
    if (recursive === 'true') {
      const getAllFiles = (currentDir: string, baseDir: string, depth: number = 0): any[] => {
        if (depth > 8) return [];
        let results: any[] = [];
        try {
          const list = fs.readdirSync(currentDir, { withFileTypes: true });
          for (const item of list) {
            if (ignoredDirs.has(item.name) || item.name.startsWith('.') || item.name.endsWith('.pyc') || item.name.endsWith('.pyo')) continue;
            const fullPath = path.join(currentDir, item.name);
            const relPath = path.relative(baseDir, fullPath).replace(/\\/g, '/');
            if (item.isDirectory()) {
              results = results.concat(getAllFiles(fullPath, baseDir, depth + 1));
            } else {
              results.push({ name: relPath, isDirectory: false });
            }
          }
        } catch (err) {}
        return results;
      };
      const resFiles = getAllFiles(targetDir, targetDir);
      res.json(resFiles);
      return;
    }
    let items: fs.Dirent[] = [];
    try {
      items = fs.readdirSync(targetDir, { withFileTypes: true });
      items = items.filter(item => !ignoredDirs.has(item.name) && !item.name.startsWith('.'));
    } catch (e) {
      res.json([]);
      return;
    }
    const result = items.map(item => ({
      name: item.name,
      isDirectory: item.isDirectory(),
    }));
    result.sort((a, b) => {
      if (a.isDirectory === b.isDirectory) return a.name.localeCompare(b.name);
      return a.isDirectory ? -1 : 1;
    });
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/files', (req, res) => {
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

app.post('/run', (req, res) => {
  const { dir, command } = req.body;
  try {
    const cwd = dir && fs.existsSync(dir) ? dir : process.cwd();
    exec(command || 'npm run dev', { cwd, windowsHide: true }, (err, stdout, stderr) => {
      console.log('[Run Project]', stdout, stderr);
    });
    res.json({ success: true, message: 'Project dev server launched!' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/tasks/:id/history', async (req, res) => {
  try {
    const { id } = req.params;
    const history = await db.select().from(taskHistory).where(eq(taskHistory.taskId, id)).orderBy(desc(taskHistory.createdAt));
    res.json(history);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/files/create', (req, res) => {
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

app.delete('/files', (req, res) => {
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
      res.status(403).json({ error: 'Security Error: Refusing to delete files outside active workspace.' });
      return;
    }
    if (resolved === path.parse(resolved).root || normResolved === normActive || normResolved === normCwd) {
      res.status(400).json({ error: 'Security Error: Refusing to delete root or parent system directories.' });
      return;
    }
    fs.rmSync(resolved, { recursive: true, force: true });
    clearFilesCache();
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/files/content', (req, res) => {
  const targetPath = req.query.path as string;
  if (!targetPath) {
    res.status(400).json({ error: 'path required' });
    return;
  }
  try {
    const resolvedPath = path.resolve(targetPath);
    const workspaceRoot = resolveWorkspacePath('root');
    const userHome = os.homedir();
    if (!resolvedPath.startsWith(workspaceRoot) && !resolvedPath.startsWith(process.cwd()) && !resolvedPath.startsWith(userHome)) {
      res.status(403).json({ error: 'Security Error: Path traversal outside workspace forbidden.' });
      return;
    }
    if (!fs.existsSync(resolvedPath)) {
      res.status(404).json({ error: 'File not found' });
      return;
    }
    res.sendFile(resolvedPath);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/files/content', express.text({ limit: '50mb' }), (req, res) => {
  const targetPath = req.query.path as string;
  if (!targetPath) {
    res.status(400).json({ error: 'path required' });
    return;
  }
  try {
    const resolvedPath = path.resolve(targetPath);
    const workspaceRoot = resolveWorkspacePath('root');
    const userHome = os.homedir();
    if (!resolvedPath.startsWith(workspaceRoot) && !resolvedPath.startsWith(process.cwd()) && !resolvedPath.startsWith(userHome)) {
      res.status(403).json({ error: 'Security Error: Path traversal outside workspace forbidden.' });
      return;
    }
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
  app.use(express.static(uiDistPath, {
    setHeaders: (res, path) => {
      if (path.endsWith('.html')) {
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
      }
    }
  }));
  app.use((req, res, next) => {
    // Only intercept GET requests that look like page navigation
    if (req.method !== 'GET' || req.path.startsWith('/api') || req.path.startsWith('/ws') || req.path.startsWith('/goals') || req.path.startsWith('/tasks') || req.path.startsWith('/system') || req.path.startsWith('/files') || req.path.startsWith('/run')) {
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
    console.warn('[Warden] WARNING: Network guard failed. Offline guarantee is NOT enforced. The agent CAN access the internet.');
  }
  
  // 2. Start servers
  server.listen(PORT, () => {
    console.log(`[Warden] API and WS Server listening on port ${PORT}`);
    
    // 3. Start subsystems
    startScheduler();
    startWorker();
    
    console.log('[Warden] All systems online.');
    
    // Preload the golden standard 6GB VRAM model (qwen2.5-coder:7b or deepseek-r1:8b or fallback)
    modelManager.ensureLoaded('qwen2.5-coder:7b')
      .catch(() => modelManager.ensureLoaded('deepseek-r1:8b'))
      .catch(() => modelManager.ensureLoaded('qwen2.5-coder:1.5b'))
      .catch(err => {
        console.warn('[Warden] Could not preload default model:', err.message);
      });
  });
}

boot();
