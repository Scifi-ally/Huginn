import { Worker, Job } from 'bullmq';
import { db } from '../db/index.js';
import { tasks, taskHistory } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { modelManager } from '../models/manager.js';
import { broadcastEvent } from '../ws/server.js';
import { verifyTask } from './verify.js';
import { runOrchestrator } from '../agent/Orchestrator.js';
import { runClaudeCodeAgent } from '../agent/ClaudeCodeAgent.js';

const REDIS_HOST = process.env.REDIS_HOST || '127.0.0.1';
const REDIS_PORT = parseInt(process.env.REDIS_PORT || '6380', 10);
const REDIS_PASSWORD = process.env.REDIS_PASSWORD;

if (process.env.NODE_ENV === 'production' && !REDIS_PASSWORD) {
  throw new Error('REDIS_PASSWORD must be provided in production environments.');
}

const connection = {
  host: REDIS_HOST,
  port: REDIS_PORT,
  password: REDIS_PASSWORD,
  maxRetriesPerRequest: null,
};

export function startWorker() {
  const worker = new Worker(
    'warden-tasks',
    async (job: Job) => {
      const { taskId, targetTier } = job.data;

      // Fetch task details
      const taskRecords = await db.select().from(tasks).where(eq(tasks.id, taskId));
      if (taskRecords.length === 0) return;
      const task = taskRecords[0];

      // Update status to running immediately so UI doesn't hang in 'idle' for minutes
      await db
        .update(tasks)
        .set({ status: 'running', updatedAt: new Date() })
        .where(eq(tasks.id, taskId));
      broadcastEvent('task_running', { id: taskId, tier: targetTier });

      // Ensure specialized model is loaded for the task type
      const modelId =
        modelManager.getModelForTask(task.description) || modelManager.getModelForTier(targetTier);

      broadcastEvent('task_console', {
        taskId,
        content: `> Preemptively loading model ${modelId}...\n`,
      });

      try {
        await modelManager.ensureLoaded(modelId);
      } catch (err: any) {
        const errMsg = `Failed to load model ${modelId}: ${err.message}`;
        console.error(`[Worker] ${errMsg}`);
        broadcastEvent('task_console', { taskId, content: `\n⚠️ ${errMsg}\n` });
        broadcastEvent('model_error', { message: errMsg });
        // Mark as failed instead of silently hanging
        await db
          .update(tasks)
          .set({ status: 'failed', updatedAt: new Date() })
          .where(eq(tasks.id, taskId));
        broadcastEvent('task_failed', { id: taskId, attempt: task.attemptCount + 1, final: true });
        return;
      }

      // Use task specific context directory, fallback to ENV, then cwd
      const contextDir = task.contextDir || process.env.TARGET_REPO_DIR || process.cwd();

      let result;
      try {
        if (targetTier === 4) {
          result = await runOrchestrator(
            taskId,
            task.description.replace('[Main Agent Orchestrator] ', ''),
            contextDir,
            modelId,
          );
        } else {
          // All specialist sub-agents operate autonomously with full ReAct tool-calling capabilities!
          result = await runClaudeCodeAgent(taskId, task.description, modelId, contextDir);
        }
      } catch (err: any) {
        console.error(`[Worker] Task ${taskId} threw unhandled exception:`, err);
        broadcastEvent('task_console', { taskId, content: `\n⚠️ Agent crashed: ${err.message}\n` });
        result = { success: false, diff: '', output: `Agent crashed: ${err.message}` };
      }

      // Check if task was explicitly stopped by user in database during execution
      const currentStatusCheck = await db.select().from(tasks).where(eq(tasks.id, taskId));
      if (currentStatusCheck.length > 0 && currentStatusCheck[0].status === 'stopped') {
        console.log(`[Worker] Task ${taskId} stopped by user. Halting worker pipeline cleanly.`);
        return;
      }

      // Save history
      await db.insert(taskHistory).values({
        taskId,
        attemptNumber: task.attemptCount + 1,
        tierUsed: targetTier,
        result: result.success ? 'passed' : 'failed',
        diffSummary: result.diff,
        failureReason: result.success ? null : result.output,
        fullOutput: result.output,
      });

      // Run Verification & Escalation
      broadcastEvent('task_console', {
        taskId,
        content: `[System] Running verification & escalation check...\n`,
      });
      await verifyTask(taskId, targetTier, result.success, result.output, contextDir);
    },
    { connection },
  );

  worker.on('failed', (job, err) => {
    console.error(`[Worker] Job ${job?.id} failed:`, err);
  });

  console.log('[Worker] ON');
}
