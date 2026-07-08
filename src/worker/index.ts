import { Worker, Job } from 'bullmq';
import { db } from '../db/index.js';
import { tasks, taskHistory } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { modelManager } from '../models/manager.js';
import { broadcastEvent } from '../ws/server.js';
import { runAiderTask } from './aider.js';
import { runOpenHandsTask } from './openhands.js';
import { verifyTask } from './verify.js';
import { runOrchestrator } from '../agent/Orchestrator.js';
import { runClaudeCodeAgent } from '../agent/ClaudeCodeAgent.js';

const REDIS_HOST = process.env.REDIS_HOST || '127.0.0.1';
const REDIS_PORT = parseInt(process.env.REDIS_PORT || '6380', 10);

const connection = { host: REDIS_HOST, port: REDIS_PORT, maxRetriesPerRequest: null };

export function startWorker() {
  const worker = new Worker('warden-tasks', async (job: Job) => {
    const { taskId, targetTier } = job.data;
    
    // Fetch task details
    const taskRecords = await db.select().from(tasks).where(eq(tasks.id, taskId));
    if (taskRecords.length === 0) return;
    const task = taskRecords[0];

    // Ensure specialized model is loaded for the task type
    const modelId = modelManager.getModelForTask(task.description) || modelManager.getModelForTier(targetTier);

    try {
      await modelManager.ensureLoaded(modelId);
    } catch (err: any) {
      const errMsg = `Failed to load model ${modelId}: ${err.message}`;
      console.error(`[Worker] ${errMsg}`);
      broadcastEvent('task_console', { taskId, content: `\n⚠️ ${errMsg}\n` });
      broadcastEvent('model_error', { message: errMsg });
      // Mark as failed instead of silently hanging
      await db.update(tasks).set({ status: 'failed' }).where(eq(tasks.id, taskId));
      broadcastEvent('task_failed', { id: taskId, attempt: task.attemptCount + 1, final: true });
      return;
    }

    // Update status
    await db.update(tasks).set({ status: 'running' }).where(eq(tasks.id, taskId));
    broadcastEvent('task_running', { id: taskId, tier: targetTier });

    // Use task specific context directory, fallback to ENV, then cwd
    const contextDir = task.contextDir || process.env.TARGET_REPO_DIR || process.cwd();

    let result;
    try {
      if (targetTier === 4) {
        result = await runOrchestrator(taskId, task.description.replace('[Main Agent Orchestrator] ', ''), contextDir, modelId);
      } else {
        // All specialist sub-agents operate autonomously with full ReAct tool-calling capabilities!
        result = await runClaudeCodeAgent(taskId, task.description, modelId, contextDir);
      }
    } catch (err: any) {
      console.error(`[Worker] Task ${taskId} threw unhandled exception:`, err);
      broadcastEvent('task_console', { taskId, content: `\n⚠️ Agent crashed: ${err.message}\n` });
      result = { success: false, diff: '', output: `Agent crashed: ${err.message}` };
    }

    // Save history
    await db.insert(taskHistory).values({
      taskId,
      attemptNumber: task.attemptCount + 1,
      tierUsed: targetTier,
      result: result.success ? 'passed' : 'failed',
      diffSummary: result.diff,
      failureReason: result.success ? null : result.output,
    });

    // Run Verification & Escalation
    broadcastEvent('task_console', { taskId, content: `[System] Running verification & escalation check...\n` });
    await verifyTask(taskId, targetTier, result.success, result.output, contextDir);
  }, { connection });

  worker.on('failed', (job, err) => {
    console.error(`[Worker] Job ${job?.id} failed:`, err);
  });

  console.log('[Worker] ON');
}
