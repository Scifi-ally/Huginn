import { exec } from 'child_process';
import util from 'util';
import path from 'path';
import fs from 'fs';
import { broadcastEvent } from '../ws/server.js';

const execAsync = util.promisify(exec);

import { runClaudeCodeAgent } from '../agent/ClaudeCodeAgent.js';

export async function runAiderTask(taskId: string, description: string, modelId: string, contextDir: string): Promise<{ success: boolean; diff: string; output: string }> {
  console.log(`[Aider] Executing task ${taskId} with model ${modelId} in ${contextDir}`);
  broadcastEvent('task_console', { taskId, content: `[Sub-Agent] Booting up to execute task: ${description}\n` });
  
  const aiderModel = `ollama/${modelId}`;
  const prompt = description.replace(/"/g, '\\"');
  const cmd = `aider --yes --no-stream --model ${aiderModel} --message "${prompt}"`;
  
  try {
    const execCwd = contextDir && fs.existsSync(contextDir) ? contextDir : process.cwd();
    const { stdout, stderr } = await execAsync(cmd, { cwd: execCwd, windowsHide: true });
    
    let diff = '';
    try {
      const diffOutput = await execAsync('git show --patch', { cwd: execCwd, windowsHide: true });
      diff = diffOutput.stdout;
    } catch (e) {
      diff = '[Could not extract diff]';
    }
    
    return { success: true, diff, output: stdout };
  } catch (err: any) {
    const errStr = `${err.message || ''} ${err.stderr || ''} ${err.stdout || ''}`;
    if (errStr.includes('not recognized') || errStr.includes('not found') || errStr.includes('command not found') || err.code === 1 || err.code === 127 || err.code === 'ENOENT') {
      console.log(`[Aider] Aider not installed locally. Launching autonomous Claude Code tool-calling loop...`);
      return await runClaudeCodeAgent(taskId, description, modelId, contextDir);
    }
    console.error(`[Aider] Task ${taskId} failed:`, err.message);
    broadcastEvent('task_console', { taskId, content: `[Sub-Agent] Task failed: ${err.message}\n` });
    return { success: false, diff: '', output: err.stdout || err.message };
  }
}
