import { exec } from 'child_process';
import util from 'util';
import fs from 'fs';
import { broadcastEvent } from '../ws/server.js';
import { runClaudeCodeAgent } from '../agent/ClaudeCodeAgent.js';

const execAsync = util.promisify(exec);

export async function runOpenHandsTask(taskId: string, description: string, modelId: string, contextDir: string): Promise<{ success: boolean; diff: string; output: string }> {
  console.log(`[OpenHands] Executing task ${taskId} with model ${modelId} in ${contextDir}`);
  broadcastEvent('task_console', { taskId, content: `[Sub-Agent] Booting OpenHands agent for task: ${description}\n` });
  
  const prompt = description.replace(/"/g, '\\"');
  
  // Note: Assuming OpenHands is installed and accessible via CLI or we use docker.
  // Standard headless invocation via Python:
  // python -m openhands.core.main -t "prompt" --llm-config ollama 
  // We'll mock the command for now based on current docs.
  const cmd = `python -m openhands.core.main --task "${prompt}" --llm_config "ollama/${modelId}"`;
  
  try {
    const execCwd = contextDir && fs.existsSync(contextDir) ? contextDir : process.cwd();
    broadcastEvent('task_console', { taskId, content: `[Sub-Agent] Running OpenHands command...\n` });
    const { stdout, stderr } = await execAsync(cmd, { cwd: execCwd, windowsHide: true });
    
    let diff = '';
    try {
      const diffOutput = await execAsync('git show --patch', { cwd: execCwd, windowsHide: true });
      diff = diffOutput.stdout;
    } catch (e) {
      diff = '[Could not extract diff]';
    }
    
    broadcastEvent('task_console', { taskId, content: `[Sub-Agent Answer]:\nTask completed successfully.\n${stdout}\n` });
    return { success: true, diff, output: stdout };
  } catch (err: any) {
    const errStr = `${err.message || ''} ${err.stderr || ''} ${err.stdout || ''}`;
    if (errStr.includes('not recognized') || errStr.includes('not found') || errStr.includes('No module named') || err.code === 1 || err.code === 127 || err.code === 'ENOENT') {
      console.log(`[OpenHands] OpenHands not installed locally. Launching autonomous Claude Code tool-calling loop...`);
      return await runClaudeCodeAgent(taskId, description, modelId, contextDir);
    }
    console.error(`[OpenHands] Task ${taskId} failed:`, err.message);
    broadcastEvent('task_console', { taskId, content: `[Sub-Agent] Task failed: ${err.message}\n` });
    return { success: false, diff: '', output: err.stdout || err.message };
  }
}
