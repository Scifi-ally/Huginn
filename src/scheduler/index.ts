import { Queue, Worker, Job } from 'bullmq';
import { db } from '../db/index.js';
import { tasks } from '../db/schema.js';
import { eq, and, asc } from 'drizzle-orm';
import { modelManager } from '../models/manager.js';
import { broadcastEvent } from '../ws/server.js';
import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import util from 'util';

const execAsync = util.promisify(exec);
const REDIS_HOST = process.env.REDIS_HOST || '127.0.0.1';
const REDIS_PORT = parseInt(process.env.REDIS_PORT || '6380', 10);

const connection = {
  host: REDIS_HOST,
  port: REDIS_PORT,
  maxRetriesPerRequest: null,
};

export const taskQueue = new Queue('warden-tasks', { connection });

/**
 * Polls the `tasks` table and dispatches them to BullMQ.
 * Sorts by tier to minimize model swaps.
 */
export async function scheduleTasks() {
  // 1. Get ready tasks
  const readyTasks = await db.select().from(tasks).where(eq(tasks.status, 'ready')).orderBy(asc(tasks.estimatedTier));
  
  if (readyTasks.length === 0) return;

  const currentModel = modelManager.getLoadedModel();

  for (const task of readyTasks) {
    let targetTier = task.estimatedTier;

    // Attempt to batch by current model if possible
    const modelForTier = modelManager.getModelForTier(targetTier);
    if (currentModel && currentModel !== modelForTier) {
      // It's a different model. If we have other tasks for the current model in the queue, we should prioritize them.
      // For MVP, we just rely on the orderBy(asc(tasks.estimatedTier)) to group same-tier tasks together.
    }

    // Dispatch to BullMQ
    await db.update(tasks).set({ status: 'queued' }).where(eq(tasks.id, task.id));
    await taskQueue.add('execute-task', { taskId: task.id, targetTier });
    console.log(`[Scheduler] Queued task ${task.id} for Tier ${targetTier}`);
    broadcastEvent('task_queued', { id: task.id, tier: targetTier });
  }
}

// Start polling loop
let interval: NodeJS.Timeout;
export function startScheduler() {
  console.log('[Scheduler] ON');
  interval = setInterval(scheduleTasks, 5000);
}

export function stopScheduler() {
  if (interval) clearInterval(interval);
}
