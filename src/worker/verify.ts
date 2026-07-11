import { exec } from 'child_process';
import util from 'util';
import fs from 'fs';
import { db } from '../db/index.js';
import { tasks } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { broadcastEvent } from '../ws/server.js';
import { storeMemory, writeTaskDoc } from '../memory/index.js';

const execAsync = util.promisify(exec);

export async function verifyTask(
  taskId: string,
  targetTier: number,
  aiderSuccess: boolean,
  aiderOutput: string,
  contextDir: string,
): Promise<void> {
  const taskRecords = await db.select().from(tasks).where(eq(tasks.id, taskId));
  if (taskRecords.length === 0) return;
  const task = taskRecords[0];

  // Do not proceed with verification or overwrite status if task was stopped by the user
  if (task.status === 'stopped') {
    console.log(`[Verifier] Task ${taskId} is stopped. Skipping verification.`);
    return;
  }

  let passed = false;
  let verificationOutput = '';

  if (aiderSuccess) {
    if (task.verificationCommand) {
      console.log(
        `[Verifier] Running verification for task ${taskId}: ${task.verificationCommand}`,
      );
      broadcastEvent('task_console', {
        taskId,
        content: `[Verifier] Running: \`${task.verificationCommand}\`\n`,
      });
      try {
        const execCwd = contextDir && fs.existsSync(contextDir) ? contextDir : process.cwd();
        const { stdout, stderr } = await execAsync(task.verificationCommand, {
          cwd: execCwd,
          windowsHide: true,
        });
        verificationOutput = stdout || stderr;
        passed = true;
        broadcastEvent('task_console', {
          taskId,
          content: `[Verifier] Verification passed\n> ${(verificationOutput || '').trim().substring(0, 200)}\n`,
        });
      } catch (err: unknown) {
        const error = err as Record<string, any>;
        verificationOutput = error.stdout || error.message;
        passed = false;
        broadcastEvent('task_console', {
          taskId,
          content: `[Verifier] Verification failed: ${(verificationOutput || '').trim().substring(0, 200)}\n`,
        });
      }
    } else {
      passed = true;
    }
  } else {
    passed = false;
    verificationOutput = aiderOutput;
  }

  // Handle Result
  if (passed) {
    console.log(`[Verifier] Task ${taskId} passed verification.`);
    await db
      .update(tasks)
      .set({
        status: 'done',
        updatedAt: new Date(),
        attemptCount: task.attemptCount + 1,
      })
      .where(eq(tasks.id, taskId));

    // Write docs and memory
    await storeMemory(taskId, task.description, aiderOutput);
    await writeTaskDoc(taskId, contextDir, task.description, aiderOutput, 'Passed');

    broadcastEvent('task_console', {
      taskId,
      content: `[System] Task completed successfully (attempt #${task.attemptCount + 1}).\n`,
    });
    broadcastEvent('task_done', { id: taskId });
  } else {
    console.log(`[Verifier] Task ${taskId} failed verification.`);
    const newAttemptCount = task.attemptCount + 1;
    const baseDescription = task.description.split('\n\n[Previous Failure Context]')[0].trim();
    const cleanOutput = (verificationOutput || '').trim();
    const truncatedFailure =
      cleanOutput.length > 600 ? cleanOutput.substring(0, 600) + '\n...(truncated)' : cleanOutput;
    const updatedDescription = `${baseDescription}\n\n[Previous Failure Context]\nAttempt #${newAttemptCount} failed:\n${truncatedFailure}`;

    if (newAttemptCount >= 2) {
      if (task.estimatedTier >= 4 || (task.attemptCount + 1 >= 2 && task.estimatedTier >= 3)) {
        console.log(
          `[Verifier] Task ${taskId} fundamentally failed at max tier or orchestrator level.`,
        );
        await db
          .update(tasks)
          .set({
            status: 'failed',
            description: updatedDescription,
          })
          .where(eq(tasks.id, taskId));
        broadcastEvent('task_console', {
          taskId,
          content: `[System] \u274c Task permanently failed after ${newAttemptCount} attempts at max tier (Tier ${task.estimatedTier}). Cannot escalate further.\n`,
        });
        broadcastEvent('task_failed', { id: taskId, attempt: newAttemptCount, final: true });
        return;
      }
      // Escalate
      let newTier = task.estimatedTier + 1;
      if (newTier > 3 && task.estimatedTier < 4) newTier = 3; // Max subagent tier is 3

      console.log(`[Verifier] Task ${taskId} escalated to Tier ${newTier}.`);

      await db
        .update(tasks)
        .set({
          status: 'ready',
          attemptCount: 0,
          estimatedTier: newTier,
          escalated: true,
          description: updatedDescription,
        })
        .where(eq(tasks.id, taskId));

      broadcastEvent('task_console', {
        taskId,
        content: `[System] \u2b06\ufe0f Escalating task from Tier ${task.estimatedTier} \u2192 Tier ${newTier} (larger model) after ${newAttemptCount} failed attempts.\n`,
      });
      broadcastEvent('task_escalated', { id: taskId, newTier });
    } else {
      // Requeue at same tier
      console.log(
        `[Verifier] Task ${taskId} failed. Requeueing at same tier for attempt ${newAttemptCount + 1}.`,
      );

      await db
        .update(tasks)
        .set({
          status: 'ready',
          attemptCount: newAttemptCount,
          description: updatedDescription,
        })
        .where(eq(tasks.id, taskId));

      broadcastEvent('task_console', {
        taskId,
        content: `[System] \ud83d\udd04 Retrying task at Tier ${task.estimatedTier} (attempt #${newAttemptCount + 1}/${2}).\n`,
      });
      broadcastEvent('task_failed', { id: taskId, attempt: newAttemptCount });
    }
  }
}
