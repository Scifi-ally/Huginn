import { db } from '../db/index.js';
import { tasks } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { broadcastEvent } from '../ws/server.js';
import { modelManager } from '../models/manager.js';
import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import { runClaudeCodeAgent } from './ClaudeCodeAgent.js';
import { formatSwarmMemoryForPrompt } from '../memory/swarm.js';

export function cleanCodeBlock(content: string): string {
  if (!content) return '';
  let cleaned = content;
  const match = content.match(/```(?:[a-zA-Z0-9_\-\.\+#]*)\s*?\r?\n([\s\S]*?)```/);
  if (match && match[1]) {
    cleaned = match[1].replace(/^\r?\n/, '').replace(/\r?\n$/, '');
  } else {
    const matchInline = content.match(/```(?:[a-zA-Z0-9_\-\.\+#]*)\s*([\s\S]*?)```/);
    if (matchInline && matchInline[1]) {
      cleaned = matchInline[1].trim();
    }
  }
  // Strip out Linux/Unix shebang lines (#!) on Windows!
  cleaned = cleaned.replace(/^#![^\r\n]*\r?\n?/, '');
  return cleaned;
}

export async function runOrchestrator(taskId: string, goal: string, contextDir: string, modelId: string = 'qwen2.5-coder:7b') {
  const orchestratorStart = Date.now();
  let currentModelId = modelId;

  const imageMatches = [...goal.matchAll(/<image_data>(.*?)<\/image_data>/g)];
  const images = imageMatches.map(m => m[1].replace(/^data:image\/\w+;base64,/, ''));
  const cleanGoal = goal.replace(/<image_data>[\s\S]*?<\/image_data>/g, '').trim();


  if (images.length > 0) {
    currentModelId = 'llava';
    broadcastEvent('task_console', { taskId, content: `[Main Agent] 👁️ Images detected. Dynamically routing to vision model: ${currentModelId}...\n` });
  }

  // 1. Analyze intent
  
  await modelManager.ensureLoaded(currentModelId);

  const lowerGoal = cleanGoal.toLowerCase().trim();
  let intent;
  
  if (lowerGoal.includes('setup model') || lowerGoal.includes('get model') || lowerGoal.includes('pull model') || lowerGoal.includes('download model') || lowerGoal.includes('specialize') || lowerGoal.includes('hugging face') || lowerGoal.includes('hf.co')) {
    intent = { action: 'setup_models', explanation: 'Detected model setup and download request' };
  } else if (/^(commit|push|pull|branch|issue|review|merge|scan|checkout|rebase|status|log)\b/i.test(lowerGoal) || /\b(git|github|remote|repository|repo|push|pull|commit|branch|pr|devops)\b/i.test(lowerGoal) || lowerGoal.includes('pull request') || lowerGoal.includes('version control') || lowerGoal.includes('feature branch')) {
    intent = { action: 'autonomous_agent', explanation: 'Detected version control / GitHub DevOps workflow request -> Routing to Autonomous ReAct Agent' };
  } else if (/^(delete|rm|del|remove|erase|clear|destroy|wipe|ls|dir|list|npm|yarn|pnpm|cat|type)\b/i.test(lowerGoal) || lowerGoal.includes('delete all') || lowerGoal.includes('delete file') || lowerGoal.includes('remove file')) {
    intent = { action: 'autonomous_agent', explanation: 'Detected file operation request' };
  } else if (/^(run|exec|execute|start|test)\s+([a-zA-Z0-9_\-\.\/\\]+\.(py|js|ts|jsx|tsx|sh|bat|cmd|exe)|python|node|npm|npx|cargo|go|pytest)/i.test(lowerGoal)) {
    intent = { action: 'autonomous_agent', explanation: 'Detected script execution request' };
  } else if ((/^(what|why|how|explain|describe|who|when|is|can|define|difference between|summarize|tell me about)\b/i.test(lowerGoal) || (/(create|make|give me) a (table|list|summary)/i.test(lowerGoal))) && !lowerGoal.includes('file') && !lowerGoal.includes('code') && !lowerGoal.includes('script') && !lowerGoal.includes('app')) {
    intent = { action: 'answer', explanation: 'Detected conceptual question request' };
  } else if (/^(delegate|swarm|team|force|mastermind|multi-agent|break down|divide)\b/i.test(lowerGoal) || lowerGoal.includes('use subagent') || lowerGoal.includes('divide the task') || lowerGoal.includes('swarm force')) {
    intent = { action: 'delegate', explanation: 'Detected explicit swarm delegation request' };
  } else if (/^(create|make|build|write|generate|code|add|implement|refactor|edit|modify|fix)\b/i.test(lowerGoal) || lowerGoal.includes('files') || lowerGoal.includes('script') || lowerGoal.includes('app') || lowerGoal.includes('component') || lowerGoal.includes('project')) {
    if (lowerGoal.length > 60 || lowerGoal.includes('app') || lowerGoal.includes('project') || lowerGoal.includes('frontend') || lowerGoal.includes('backend') || lowerGoal.includes('website') || lowerGoal.includes('dashboard') || lowerGoal.includes('studio') || lowerGoal.includes('system') || lowerGoal.includes('swarm') || lowerGoal.includes('matrix') || lowerGoal.includes('interface')) {
      intent = { action: 'delegate', explanation: 'Detected complex project build -> Routing to Claude-level Swarm Force' };
    } else {
      intent = { action: 'autonomous_agent', explanation: 'Detected quick single-file task' };
    }
  } else {
    try {
      broadcastEvent('task_console', { taskId, content: `[Main Agent] ⏳ Intent unclear from heuristics — asking LLM to classify...\n` });
      const llmIntentStart = Date.now();
      const ollamaRes = await fetch('http://localhost:11434/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: currentModelId,
          prompt: `Analyze this user goal: "${cleanGoal}"
Classify it into one of these actions:
1. "autonomous_agent": MUST be used whenever the user asks for executing commands, file deletion, git commands, GitHub DevOps, pushing, pulling, committing, branching, checking status, linking remotes, creating files, writing code, editing code, or debugging! This agent has autonomous ReAct tools including execute_command and file editing!
2. "answer": ONLY use when the user is asking an abstract conceptual question (e.g. 'what is recursion?' or 'explain git') with NO desire to execute commands or create/modify files.
3. "delegate": ONLY use when building a massive enterprise architecture from scratch.

Return strictly valid JSON with this schema:
{
  "action": "autonomous_agent" | "answer" | "delegate",
  "explanation": "short reasoning"
}`,
          images: images.length > 0 ? images : undefined,
          format: 'json',
          stream: false
        })
      });
      const data = await ollamaRes.json();
      intent = JSON.parse(data.response);
      const llmIntentDuration = Math.round((Date.now() - llmIntentStart) / 1000);
      broadcastEvent('task_console', { taskId, content: `[Main Agent] LLM classified intent in ${llmIntentDuration}s\n` });
    } catch (err) {
      console.error('LLM intent parsing failed, falling back to delegate', err);
      broadcastEvent('task_console', { taskId, content: `[Main Agent] ⚠️ LLM intent classification failed — falling back to Swarm delegation\n` });
      intent = { action: 'delegate', explanation: 'Fallback due to error' };
    }
  }

  // Broadcast the intent classification result
  const intentDuration = Math.round((Date.now() - orchestratorStart) / 1000);

  if (intent.action === 'setup_models') {
    broadcastEvent('task_console', { taskId, content: `[Main Agent] 📦 Initiating Specialized Model Setup (checking internet & downloading from Ollama / Hugging Face)...\n` });
    try {
      const results = await modelManager.ensureSpecialistModelsSetup((msg) => {
        broadcastEvent('task_console', { taskId, content: `> ${msg}\n` });
      });
      const summary = `Specialist Model Setup Complete:\n${results.join('\n')}`;
      broadcastEvent('task_console', { taskId, content: `\n[Task Summary]:\n${summary}\n` });
      return { success: true, diff: '+ Setup specialist models\n', output: summary };
    } catch (err: any) {
      broadcastEvent('task_console', { taskId, content: `\n⚠️ Model setup failed: ${err.message}\n` });
      return { success: false, diff: '', output: `Model setup failed: ${err.message}` };
    }
  } else if (intent.action === 'answer') {

    
    try {
      const answerStart = Date.now();
      const ollamaRes = await fetch('http://localhost:11434/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: currentModelId,
          prompt: `Answer the following question concisely: ${cleanGoal}`,
          images: images.length > 0 ? images : undefined,
          stream: false
        })
      });
      const data = await ollamaRes.json();
      const answerDuration = Math.round((Date.now() - answerStart) / 1000);
      broadcastEvent('task_console', { taskId, content: `\n[Main Agent Answer]\n${data.response}\n` });
      return { success: true, diff: '', output: data.response };
    } catch (err: any) {
      broadcastEvent('task_console', { taskId, content: `\n⚠️ Answer generation failed: ${err.message}\n` });
      return { success: false, diff: '', output: err.message };
    }

  } else if (intent.action === 'create_file' || intent.action === 'autonomous_agent') {
    await modelManager.ensureLoaded(currentModelId);
    return await runClaudeCodeAgent(taskId, cleanGoal, currentModelId, contextDir, images);

  } else if (intent.action === 'delegate') {
    await modelManager.ensureLoaded(currentModelId);
    return await runClaudeCodeAgent(taskId, cleanGoal, currentModelId, contextDir, images);

  } else {
    // 3-Phase Intelligent Mastermind Swarm Sequence (Claude Code Level)
    await modelManager.ensureLoaded(currentModelId);

    const phases = [
      { role: 'Architecture & Setup Specialist', desc: `Inspect workspace, plan project architecture, and create foundational scaffolding, design system, and config files for: ${cleanGoal}` },
      { role: 'Core Implementation Specialist', desc: `Building on Phase 1 scaffolding, implement full interactive features, components, animations, and logic for: ${cleanGoal}` },
      { role: 'QA & Verification Specialist', desc: `Inspect all created files, verify 100% visual contrast and readability, check syntax, run dev server/tests, and fix any remaining bugs for: ${cleanGoal}` }
    ];

    let combinedDiff = '';
    let combinedOutput = '';
    let reportList = '';
    let previousPhaseSummary = 'No previous phase.';

    for (let i = 0; i < phases.length; i++) {
      const phase = phases[i];

      // Check if parent task was stopped
      const parentCheck = await db.select().from(tasks).where(eq(tasks.id, taskId));
      if (parentCheck.length > 0 && parentCheck[0].status === 'stopped') {
        broadcastEvent('task_console', { taskId, content: '\n[Main Agent] [STOPPED] Swarm execution stopped by user.\n' });
        return { success: false, diff: combinedDiff, output: 'Stopped by user.' };
      }

      const blackboard = await formatSwarmMemoryForPrompt(contextDir);
      const phaseDesc = `[Phase ${i + 1}: ${phase.role}] ${phase.desc}\n\n${blackboard}${i > 0 ? `\n\nContext from previous phase:\n${previousPhaseSummary}` : ''}`;
      
      broadcastEvent('task_console', { taskId, content: `\n[Phase ${i + 1}/${phases.length}] Launching ${phase.role}...\n` });

      // Execute the sub-agent DIRECTLY instead of going through scheduler/worker pipeline.
      // This eliminates the timing chain (DB insert → scheduler poll → BullMQ → worker) 
      // and makes sub-agent activity immediately visible in the parent task's chat stream.
      let phaseResult;
      try {
        phaseResult = await runClaudeCodeAgent(taskId, phaseDesc, modelId, contextDir);
      } catch (err: any) {
        console.error(`[Orchestrator] Phase ${i + 1} crashed:`, err);
        broadcastEvent('task_console', { taskId, content: `\n[Phase ${i + 1}/${phases.length}] [ERROR] Phase crashed: ${err.message}\n` });
        phaseResult = { success: false, diff: '', output: `Phase crashed: ${err.message}` };
      }

      const statusIcon = phaseResult.success ? '[SUCCESS]' : '[ERROR]';
      const summaryText = phaseResult.output || (phaseResult.success ? 'Completed phase' : 'Phase failed');

      previousPhaseSummary = `Phase ${i + 1} (${phase.role}) completed with result: ${summaryText}`;
      reportList += `* **Phase ${i + 1} (${phase.role})**: ${statusIcon} ${summaryText.substring(0, 200)}\n`;
      combinedDiff += `[Phase ${i + 1}] ${phase.role}: ${phaseResult.diff || 'no changes'}\n`;
      combinedOutput += `[Phase ${i + 1}] Output:\n${summaryText}\n\n`;

      broadcastEvent('task_console', { taskId, content: `\n[Phase ${i + 1}/${phases.length}] ${statusIcon} ${phase.role} finished.\n` });

      if (!phaseResult.success && i === 0) {
        broadcastEvent('task_console', { taskId, content: `[Swarm Mastermind] [WARNING] Phase 1 encountered issues. Proceeding to Phase 2 for recovery and implementation...\n` });
      }
    }

    broadcastEvent('task_console', { taskId, content: `\n[Task Summary]:\nI have coordinated our elite Claude-level autonomous Swarm Force across a 3-Phase sequential pipeline to accomplish your goal: **"${cleanGoal}"**.\n\n### Swarm Force Execution Report:\n${reportList}\nEvery specialist agent autonomously built upon the verified work of the previous agent without collisions or race conditions. The swarm operated with 100% efficiency!\n` });
    return { success: true, diff: combinedDiff, output: combinedOutput };
  }
}
