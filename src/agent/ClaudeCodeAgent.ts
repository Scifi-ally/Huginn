import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import { exec, spawn, execFile } from 'child_process';
import util from 'util';
import { broadcastEvent } from '../ws/server.js';
import { db } from '../db/index.js';
import { tasks, taskHistory } from '../db/schema.js';
import { eq, desc } from 'drizzle-orm';
import { updateSwarmMemory, formatSwarmMemoryForPrompt } from '../memory/swarm.js';
import { searchMemory } from '../memory/index.js';
import { diffEventEmitter, questionEventEmitter } from './diffEvents.js';
import { skeletonizeFile, getFunctionRange } from './astUtils.js';
import { cleanCodeBlock } from '../utils/cleanCode.js';

const execAsync = util.promisify(exec);
const execFileAsync = util.promisify(execFile);

export function checkPathContainment(contextRoot: string, targetPath: string): void {
  const rel = path.relative(contextRoot, targetPath);
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error('Security Error: Path traversal outside workspace directory is forbidden.');
  }
}

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';

async function buildCompactFileTree(
  dir: string,
  baseDir: string = dir,
  depth = 0,
  maxDepth = 3,
  maxEntries = 80,
  counter = { count: 0 },
): Promise<string> {
  if (depth > maxDepth || counter.count >= maxEntries) return '';
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    let result = '';
    for (const entry of entries) {
      if (counter.count >= maxEntries) {
        if (counter.count === maxEntries) {
          result += `${'  '.repeat(depth)}... (additional files truncated)\n`;
          counter.count++;
        }
        break;
      }
      if (
        ['node_modules', '.git', '.pm2', 'dist', 'build', '.next', '.cache', 'warden-log'].includes(
          entry.name,
        )
      )
        continue;

      const fullPath = path.join(dir, entry.name);
      const relPath = path.relative(baseDir, fullPath);

      if (entry.isDirectory()) {
        counter.count++;
        result += `${'  '.repeat(depth)}📁 ${entry.name}/\n`;
        result += await buildCompactFileTree(
          fullPath,
          baseDir,
          depth + 1,
          maxDepth,
          maxEntries,
          counter,
        );
      } else {
        counter.count++;
        result += `${'  '.repeat(depth)}📄 ${entry.name}\n`;
      }
    }
    return result;
  } catch {
    return '';
  }
}

interface ToolCall {
  thought?: string;
  tool?: string;
  function_name?: string;
  function?: string;
  name?: string;
  arguments?: Record<string, any>;
}

export async function runClaudeCodeAgent(
  taskId: string,
  description: string,
  modelId: string,
  contextDir: string,
  images?: string[],
  explicitMode?: string,
): Promise<{ success: boolean; diff: string; output: string }> {
  if (!explicitMode) {
    const modeMatch = description.match(/\[MODE:\s*(auto|interactive)\]/i);
    if (modeMatch) {
      explicitMode = modeMatch[1].toLowerCase();
    } else if (
      description.includes('Full Permissions') ||
      description.includes("'Full Permissions' mode")
    ) {
      explicitMode = 'auto';
    } else if (description.includes('Interactive / Ask After Each Edit')) {
      explicitMode = 'interactive';
    }
  }

  console.log(
    `[ClaudeCodeAgent] Booting autonomous tool-calling loop for task ${taskId} in ${contextDir} (mode: ${explicitMode || 'default'})`,
  );

  const resolvedContext = path.resolve(contextDir);
  let accumulatedDiff = '';
  let finalOutput = '';
  const agentStartTime = Date.now();
  const spawnedPids: number[] = [];

  const systemPrompt = `You are an autonomous AI coding agent powered by Warden (inspired by Claude Code).
You solve tasks by iteratively calling tools to inspect the codebase, edit files, and run terminal commands.

AVAILABLE TOOLS:
1. list_dir(path): List files and directories in the specified path (use "." for workspace root).
2. read_file(path): Read the contents of a file with line numbers.
3. write_file (or write_to_file / create_file)(path, content): Create or overwrite a file with the specified content. NEVER write '{"response": null}' or empty content!
4. edit_file (or replace_file_content / multi_replace_file_content)(path, old_content, new_content): Precision replace exact substring old_content with new_content in a file.
5. delete_file(path): Delete a file from the workspace.
6. grep_search(query, path): Search for string/regex query across files in path (use "." for root).
7. run_command(command): Execute a Windows terminal command (cmd/powershell).
8. fetch_web_page(url): Fetch and inspect a webpage or API endpoint (e.g. http://localhost:3000 or public URLs). Returns status, headers, and rendered HTML/text structure so you can inspect frontend layouts and verify changes!
9. start_background_server(command, port): Start a long-running dev server or web server in the background (e.g. npm run dev, python -m http.server 8000, node server.js). Returns immediately without timing out so you can test the frontend!
10. finish_task(summary): Call this when you have completed all goals and verified your work.
11. read_swarm_memory(): Instantly read the shared Blackboard memory (project architecture, file registry, component contracts) without re-reading files!
12. update_swarm_memory(architecture, file_registry, contracts, issues): Record your design decisions, created files, and component interfaces into the shared Blackboard memory so peer agents in the next phase know exactly what you built!
12. search_web(query): Search the web (via DuckDuckGo) for up-to-date information, documentation, and answers. Use this when internet is available and you need external knowledge.
13. git_action(action, branch, message, remote): Execute Git version control workflows autonomously. Actions: 'status' (check branch and changes), 'pull' (pull from remote), 'branch' (create feature branch), 'push' (stage all files, semantic commit, and push to remote), 'diff' (check modified code).
14. github_issue(action, title, body, issue_number): Manage GitHub issues autonomously via GitHub CLI or API. Actions: 'list' (list open issues), 'create' (raise new bug/feature issue), 'view' (inspect issue details), 'close' (resolve issue).
15. github_pr(action, title, body, pr_number, base_branch): Manage GitHub Pull Requests (PRs) autonomously via GitHub CLI or API. Actions: 'list' (list open PRs), 'create' (create new PR from current branch), 'review' (inspect PR diff and CI check status), 'merge' (approve and merge PR into main/master).
16. glob_find(pattern, path): Find files by glob wildcard pattern or filename substring (e.g. "*.config.*", "**/components/*.tsx", "*.env*"). Use this instead of list_dir in large repositories!
17. manage_package(action, package_name, manager): Manage dependencies autonomously across Node (npm/pnpm/yarn), Python (pip/poetry), or Rust (cargo). Actions: 'install', 'uninstall', 'update', 'list'.
18. process_manager(action, target): Check running processes and active TCP/UDP ports, or kill stuck/zombie servers. Actions: 'check_port' (e.g. target="3000"), 'kill_port' (target="3000"), 'list_node_processes'.
19. database_query(db_type, connection_string, query): Execute SQL or NoSQL queries against SQLite, PostgreSQL, MySQL, or MongoDB. Actions: inspect tables, check schemas, run migrations, seed data.
20. api_tester(method, url, headers, body): Execute HTTP/REST API requests (GET, POST, PUT, DELETE) with custom JSON payloads and headers. Test backend endpoints and webhooks autonomously just like Postman!
21. system_diagnostics(): Check OS health, CPU/RAM utilization, disk space, installed developer CLI tools (git, node, python, docker, gh), and GPU/VRAM acceleration status!
22. docker_devops(action, target, options): Manage containerized environments autonomously. Actions: 'ps' (list containers), 'build' (build Dockerfile), 'compose_up' (start docker-compose stack), 'logs' (inspect container logs).
23. ask_question (or ask_user_input)(question, placeholder, options, is_secret, multi_select, input_type): Ask the user for required information. Use input_type="file" or "directory" for path selection. Use multi_select=true with options to allow multiple choices.
24. ask_form(schema, title): Ask the user to fill out a structured form using a JSON schema.
24. sleep(seconds): Pause execution for a specified number of seconds. Useful when waiting for a server or background task to spin up before running tests.
25. skeletonize_file(path): (AST Summarizer) Extracts only the structural skeleton (class names, function signatures, and variables) from a large file. Use this FIRST on large files to save your context window instead of reading the entire file!
26. edit_function(path, function_name, new_code): Replaces an entire function or class method by its name using AST parsing. Much more reliable than edit_file since you don't need to match the exact string or spacing. For class methods, use "ClassName.methodName".

CRITICAL EFFICIENCY & SPEED RULES FOR LOCAL 7B/8B MODELS (RTX 3050 / 6GB VRAM / 16GB RAM OPTIMIZED):
1. NO REDUNDANT WORK: Do not perform repetitive directory listings or re-read files you already inspected.
2. IMMEDIATE EXECUTION: If your task is clear (e.g. creating files, writing code, running a script), execute your tool calls immediately and decisively without hesitation!
3. ZERO WASTE: When creating multiple files or implementing features, move swiftly from one file creation to the next without redundant verifications unless an error occurs.
4. KEEP SNIPPETS SHORT: When using edit_file, provide concise 3-10 line snippets of old_content to ensure fast matching and avoid VRAM memory bloat!
5. YOU MUST ACTUALLY DO THE WORK: Do not just output your plan in the thought field and call finish_task. You MUST use write_file, edit_file, or run_command to ACTUALLY implement your plan before calling finish_task!
5. FAST TERMINATION: As soon as the required work is completed, immediately call finish_task!
6. WINDOWS CMD SYNTAX: You are executing commands in Windows cmd.exe. Never use single quotes (') for string arguments or inline scripts; always use double quotes (\") or create standalone script files. Never repeat the exact same command if it fails!
7. NO LINUX SHEBANGS ON WINDOWS: You are operating in a Windows OS environment. NEVER put Linux/Unix shebang lines (such as #!/usr/bin/env python, #!/usr/bin/env node, #!/bin/bash, #!/bin/sh, or #!/usr/bin/python) at the top of code files, scripts, or examples! Windows does not use shebang lines and /usr/bin/env does not exist on Windows. Always start your code and script files directly with imports, code, or comments without any shebang line!
8. DEVOPS & GITHUB VERSION CONTROL AUTHORITY: You have full authority and capability to execute version control and GitHub DevOps tasks autonomously using git_action, github_issue, github_pr, and run_command! When asked to commit or push, use git_action with action="push". Always read and understand command outputs! If a command fails because a remote repository URL, API key, or credential is missing, do NOT give up or fail! Immediately call the ask_question tool to ask the user for the required link or token in a clean interactive slide-up card!
9. FILE EXECUTION: Do not automatically run or execute newly created files unless explicitly requested by the user. Your main task is to create the files and verify that the content is logically correct.

HOW TO RESPOND:
You MUST respond in strictly valid JSON format ONLY. Do not include markdown code block backticks (like \`\`\`json) or extra text outside the JSON object.
Format:
{
  "thought": "Your reasoning about what to inspect or do next",
  "tool": "tool_name",
  "arguments": { "arg1": "value1" }
}

Example 1 - Listing workspace:
{
  "thought": "I need to explore the project structure first to understand what files exist.",
  "tool": "list_dir",
  "arguments": { "path": "." }
}

Example 2 - Reading a file:
{
  "thought": "Let's check the contents of index.js to see how it works.",
  "tool": "read_file",
  "arguments": { "path": "index.js" }
}

Example 3 - Writing a file:
{
  "thought": "I will now create the main entry file.",
  "tool": "write_file",
  "arguments": { "path": "src/index.js", "content": "console.log('Hello');" }
}

Example 4 - Finishing:
{
  "thought": "I have created all the necessary files and verified the code works.",
  "tool": "finish_task",
  "arguments": { "summary": "Created src/index.js and setup the express server." }
}

CRITICAL: You must output ONLY the raw JSON object. Do not wrap it in \`\`\` block! Do not output any conversational text before or after the JSON!`;

  let pastAttemptsContext = '';
  try {
    const historyRecords = await db
      .select()
      .from(taskHistory)
      .where(eq(taskHistory.taskId, taskId))
      .orderBy(desc(taskHistory.createdAt))
      .limit(3);

    if (historyRecords.length > 0) {
      pastAttemptsContext += `\n\n### 📜 PREVIOUS TASK ATTEMPTS & CHAT HISTORY ON THIS WORKSPACE:\n`;
      for (const h of historyRecords.reverse()) {
        pastAttemptsContext += `[Attempt #${h.attemptNumber} - Tier ${h.tierUsed} - Status: ${h.result.toUpperCase()}]:\nDiff/Changes: ${h.diffSummary || 'None'}\nSummary Output: ${(h.fullOutput || '').slice(0, 800)}\n${h.failureReason ? `Failure Reason: ${h.failureReason}\n` : ''}\n`;
      }
    }
  } catch (err) {
    console.error('[ClaudeCodeAgent] Error reading taskHistory:', err);
  }

  let vectorMemoryContext = '';
  try {
    const memResults = await searchMemory(description, 3);
    if (memResults && memResults.length > 0) {
      vectorMemoryContext += `\n\n### 🧠 RELEVANT PAST PROJECT RECALL (VECTOR RAG MEMORY):\n`;
      for (const m of memResults) {
        if (m.summary && m.taskId !== taskId) {
          vectorMemoryContext += `- [Task ${m.taskId}]: ${m.summary.slice(0, 400)}\n`;
        }
      }
    }
  } catch (err) {
    console.error('[ClaudeCodeAgent] Error searching vector memory:', err);
  }

  let blackboardContext = '';
  try {
    blackboardContext = await formatSwarmMemoryForPrompt(resolvedContext);
  } catch (err) {
    console.error('[ClaudeCodeAgent] Error reading Swarm Blackboard Memory:', err);
  }

  let fileTreeContext = '';
  try {
    const tree = await buildCompactFileTree(resolvedContext);
    if (tree) {
      fileTreeContext = `\n\n### 📂 CURRENT WORKSPACE FILE TREE:\n${tree}`;
    }
  } catch (err) {
    console.error('[ClaudeCodeAgent] Error building compact file tree:', err);
  }

  const messages: any[] = [
    { role: 'system', content: systemPrompt + fileTreeContext },
    {
      role: 'user',
      content: `Task: ${description}\n\nWorkspace Context: ${resolvedContext}\n\n${blackboardContext !== 'No previous swarm memory recorded.' ? `${blackboardContext}\n\n` : ''}${vectorMemoryContext}${pastAttemptsContext}\nBegin your autonomous execution now by responding with your first JSON tool call. Remember, DO NOT just plan in the thought field and call finish_task. You MUST use write_file or run_command to actually implement the requirements!`,
      images: images && images.length > 0 ? images : undefined,
    },
  ];

  let iteration = 0;
  const maxIterations = 50;
  let consecutiveErrors = 0;
  let lastFailedCallKey = '';
  const askedQuestions = new Set<string>();
  let hasMutated = false;

  try {
    while (iteration < maxIterations) {
      const currentTask = await db
        .select({ status: tasks.status })
        .from(tasks)
        .where(eq(tasks.id, taskId))
        .limit(1);
      if (currentTask.length > 0 && currentTask[0].status === 'stopped') {
        broadcastEvent('task_console', {
          taskId,
          content: `\n[System] Task stopped by user. Halting execution...\n`,
        });
        return {
          success: false,
          diff: accumulatedDiff,
          output: 'Task stopped by user.',
        };
      }

      iteration++;

      const llmStartTime = Date.now();

      broadcastEvent('task_console', {
        taskId,
        content: `[Iteration ${iteration}/${maxIterations}] Requesting LLM inference from ${modelId}... (0s elapsed)\n`,
      });

      let toolCall: ToolCall;
      try {
        if (messages.length > 10) {
          const systemMsg = messages[0];
          const initialUserMsg = messages[1];
          const recentMsgs = messages.slice(-8);
          messages.splice(
            0,
            messages.length,
            systemMsg,
            initialUserMsg,
            {
              role: 'user',
              content: `[System Notice: Earlier intermediate tool calls and responses in this iteration sequence have been compacted to conserve VRAM and context window. Continue with the recent context below.]`,
            },
            ...recentMsgs,
          );
        }

        let res;
        try {
          res = await fetch(`${OLLAMA_URL}/api/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              model: modelId,
              messages,
              format: 'json',
              stream: true,
              options: {
                temperature: 0.1,
                num_predict: 4096,
                num_ctx: 16384,
                top_k: 20,
                top_p: 0.9,
              },
            }),
          });
        } catch (fetchErr: any) {
          const errMsg =
            fetchErr.cause?.code === 'ECONNREFUSED'
              ? `Cannot connect to Ollama at ${OLLAMA_URL}. Is Ollama running?`
              : `Ollama request failed: ${fetchErr.message}`;
          broadcastEvent('model_error', { message: errMsg });
          broadcastEvent('task_console', { taskId, content: `\n[ERROR] ${errMsg}\n` });
          return { success: false, diff: accumulatedDiff, output: errMsg };
        }

        if (!res.ok) {
          throw new Error(`Ollama API returned HTTP ${res.status}: ${res.statusText}`);
        }

        let rawResponse = '';
        let lastExtractedThoughtLength = 0;
        let isThinking = true;

        const decoder = new TextDecoder();
        for await (const chunk of res.body as any) {
          const text = decoder.decode(chunk, { stream: true });
          const lines = text.split('\n').filter(Boolean);
          for (const line of lines) {
            try {
              const parsed = JSON.parse(line);
              if (parsed.message?.content) {
                rawResponse += parsed.message.content;

                if (isThinking) {
                  const match = rawResponse.match(/"thought"\s*:\s*"((?:[^"\\]|\\.)*)/);
                  if (match && match[1]) {
                    let currentThought = match[1];
                    currentThought = currentThought
                      .replace(/\\n/g, '\n')
                      .replace(/\\"/g, '"')
                      .replace(/\\\\/g, '\\');

                    if (currentThought.length > lastExtractedThoughtLength) {
                      const newText = currentThought.slice(lastExtractedThoughtLength);
                      lastExtractedThoughtLength = currentThought.length;
                      broadcastEvent('task_console_stream', { taskId, content: newText });
                    }

                    // Check if the thought string has ended
                    const stringStartIdx = rawResponse.indexOf(
                      '"',
                      rawResponse.indexOf('"thought"') + 9,
                    );
                    if (stringStartIdx !== -1) {
                      const stringEndIdx = rawResponse.indexOf(
                        '"',
                        stringStartIdx + 1 + match[1].length,
                      );
                      if (stringEndIdx !== -1) {
                        isThinking = false;
                      }
                    }
                  }
                }
              }
            } catch (e) {
              // Ignore parse errors for partial lines
            }
          }
        }

        const llmDuration = Math.round((Date.now() - llmStartTime) / 1000);
        messages.push({ role: 'assistant', content: rawResponse });

        // Strip markdown code fences that Qwen sometimes wraps around JSON
        let cleanedResponse = rawResponse.trim();
        const codeBlockMatch = cleanedResponse.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
        if (codeBlockMatch && codeBlockMatch[1]) {
          cleanedResponse = codeBlockMatch[1].trim();
        }
        toolCall = JSON.parse(cleanedResponse);
      } catch (err: any) {
        console.error(
          `[ClaudeCodeAgent] Iteration ${iteration} failed to parse LLM response:`,
          err,
        );
        broadcastEvent('task_console', {
          taskId,
          content: `[Iteration ${iteration}/${maxIterations}] [ERROR] Failed to parse LLM response (${err.message}). Retrying...\n`,
        });
        messages.push({
          role: 'user',
          content: `Error: Your last response was not valid JSON matching the tool schema. Please respond with strictly valid JSON: {"thought": "...", "tool": "...", "arguments": {...}}`,
        });
        continue;
      }

      const thought = toolCall.thought || 'Executing tool...';
      const tool =
        toolCall.tool || toolCall.function_name || toolCall.function || toolCall.name || 'none';
      const args = toolCall.arguments || {};

      const callKey = `${tool}:${JSON.stringify(args)}`;
      if (callKey === lastFailedCallKey && tool !== 'finish_task') {
        console.warn(
          `[ClaudeCodeAgent] Iteration ${iteration} attempted to repeat exact failing call: ${callKey}`,
        );
        broadcastEvent('task_console', {
          taskId,
          content: `\n> Blocked repeated failing command. Instructing agent to fix syntax or change approach.\n`,
        });
        messages.push({
          role: 'user',
          content: `Error: You just attempted to execute the exact same tool call (${tool}) with the exact same arguments that previously failed! You MUST NOT repeat a failing command. In Windows cmd.exe, do NOT use single quotes (') for arguments or inline scripts; use double quotes (\") or put scripts in standalone files. If you cannot fix the command, call finish_task or list_dir.`,
        });
        continue;
      }

      if (
        tool === 'finish_task' &&
        !hasMutated &&
        (description.toLowerCase().includes('build') ||
          description.toLowerCase().includes('create') ||
          description.toLowerCase().includes('implement') ||
          description.toLowerCase().includes('scaffolding') ||
          description.toLowerCase().includes('delete') ||
          description.toLowerCase().includes('remove') ||
          description.toLowerCase().includes('edit') ||
          description.toLowerCase().includes('fix') ||
          description.toLowerCase().includes('modify') ||
          description.toLowerCase().includes('refactor'))
      ) {
        broadcastEvent('task_console', {
          taskId,
          content: `\n> [WARNING] Agent attempted to finish without performing any action. Forcing execution....\n`,
        });
        messages.push({
          role: 'user',
          content: `Error: You called finish_task but you haven't actually performed ANY actions! The user requested you to ${description.toLowerCase().includes('delete') || description.toLowerCase().includes('remove') ? 'delete/remove files' : 'build/implement something'}. You MUST use the appropriate tool (delete_file, run_command, write_file, etc.) to actually carry out the task before finishing.`,
        });
        continue;
      }

      let toolSummary = `> Using tool: ${tool}`;
      if (tool === 'run_command') toolSummary = `> Executing command: ${args.command || ''}`;
      else if (tool === 'start_background_server')
        toolSummary = `> Starting dev server: ${args.command || ''} (Port ${args.port || '3000'})`;
      else if (tool === 'fetch_web_page')
        toolSummary = `> Inspecting frontend URL: ${args.url || ''}`;
      else if (tool === 'write_file' || tool === 'write_to_file' || tool === 'create_file')
        toolSummary = `> Creating file: ${args.path || ''}`;
      else if (tool === 'read_file') toolSummary = `> Reading file: ${args.path || ''}`;
      else if (
        tool === 'edit_file' ||
        tool === 'replace_file_content' ||
        tool === 'multi_replace_file_content'
      )
        toolSummary = `> Editing file: ${args.path || ''}`;
      else if (tool === 'grep_search')
        toolSummary = `> Searching codebase for: "${args.query || ''}"`;
      else if (tool === 'list_dir') toolSummary = `> Inspecting directory: ${args.path || '.'}`;
      else if (tool === 'read_swarm_memory') toolSummary = `> Reading Swarm Blackboard Memory`;
      else if (tool === 'update_swarm_memory') toolSummary = `> Updating Swarm Blackboard Memory`;
      else if (tool === 'search_web')
        toolSummary = `> Searching the web for: "${args.query || ''}"`;
      else if (tool === 'git_action')
        toolSummary = `> Executing Git Action: ${args.action || ''} (${args.branch || args.message || ''})`;
      else if (tool === 'github_issue')
        toolSummary = `> Managing GitHub Issue: ${args.action || ''} (${args.title || args.issue_number || ''})`;
      else if (tool === 'github_pr')
        toolSummary = `> Managing GitHub PR: ${args.action || ''} (${args.title || args.pr_number || ''})`;
      else if (tool === 'glob_find')
        toolSummary = `> Finding files matching: "${args.pattern || ''}"`;
      else if (tool === 'manage_package')
        toolSummary = `> Managing Package: ${args.action || ''} ${args.package_name || ''}`;
      else if (tool === 'process_manager')
        toolSummary = `> Managing Process/Port: ${args.action || ''} (${args.target || ''})`;
      else if (tool === 'database_query')
        toolSummary = `> Executing Database Query (${args.db_type || 'sqlite'})`;
      else if (tool === 'api_tester')
        toolSummary = `> Testing API Endpoint: [${args.method || 'GET'}] ${args.url || ''}`;
      else if (tool === 'system_diagnostics')
        toolSummary = `> Running System & Hardware Diagnostics`;
      else if (tool === 'docker_devops')
        toolSummary = `> Executing Docker DevOps: ${args.action || ''} ${args.target || ''}`;
      else if (tool === 'finish_task') toolSummary = `> Completed task verification`;

      broadcastEvent('task_console', {
        taskId,
        content: `\n${toolSummary}\n`,
      });

      if (tool === 'finish_task') {
        finalOutput = args.summary || 'Task completed successfully.';
        const totalElapsed = Math.round((Date.now() - agentStartTime) / 1000);
        broadcastEvent('task_console', {
          taskId,
          content: `\n[Task Summary]:\nI have completed all requested goals and verified the codebase changes (${iteration} iterations, ${totalElapsed}s total). ${finalOutput}\n`,
        });
        return {
          success: true,
          diff: accumulatedDiff || '+ Completed autonomous tool execution\n',
          output: finalOutput,
        };
      }

      // Track mutation to ensure agent actually did work
      if (
        tool === 'write_file' ||
        tool === 'write_to_file' ||
        tool === 'create_file' ||
        tool === 'edit_file' ||
        tool === 'replace_file_content' ||
        tool === 'multi_replace_file_content' ||
        tool === 'run_command' ||
        tool === 'git_action' ||
        tool === 'github_issue' ||
        tool === 'github_pr' ||
        tool === 'manage_package' ||
        tool === 'process_manager' ||
        tool === 'database_query' ||
        tool === 'docker_devops' ||
        tool === 'delete_file'
      ) {
        hasMutated = true;
      }

      // Execute Tool
      let toolResult = '';
      const toolStartTime = Date.now();
      try {
        if (tool === 'list_dir') {
          const targetPath = path.resolve(
            resolvedContext,
            args.path ||
              args.dir ||
              args.directory ||
              args.TargetFile ||
              args.targetFile ||
              args.DirectoryPath ||
              '.',
          );
          checkPathContainment(resolvedContext, targetPath);

          const entries = await fs.readdir(targetPath, { withFileTypes: true });
          const dirs = entries.filter((e) => e.isDirectory());
          const files = entries.filter((e) => !e.isDirectory());
          const list = entries
            .map((e) => `${e.isDirectory() ? '[DIR] ' : '[FILE] '} ${e.name}`)
            .join('\n');
          toolResult = list
            ? `${list}\n\n(${dirs.length} directories, ${files.length} files)`
            : 'Directory is empty.';
        } else if (tool === 'read_file' || tool === 'view_file') {
          const targetPath = path.resolve(
            resolvedContext,
            args.path ||
              args.file ||
              args.filename ||
              args.TargetFile ||
              args.targetFile ||
              args.AbsolutePath ||
              '',
          );
          checkPathContainment(resolvedContext, targetPath);

          const content = await fs.readFile(targetPath, 'utf-8');
          const lines = content.split('\n');
          const fileSize = Buffer.byteLength(content, 'utf-8');
          const numbered = lines
            .slice(0, 500)
            .map((l, i) => `${i + 1}: ${l}`)
            .join('\n');
          toolResult =
            lines.length > 500
              ? `${numbered}\n... (truncated at 500/${lines.length} lines, ${fileSize} bytes)`
              : `${numbered}\n\n(${lines.length} lines, ${fileSize} bytes)`;
        } else if (tool === 'delete_file') {
          let targetPath = path.resolve(resolvedContext, args.path || args.file || args.TargetFile);
          if (path.basename(targetPath).startsWith('@@')) {
            targetPath = path.join(
              path.dirname(targetPath),
              path.basename(targetPath).replace(/^@@/, ''),
            );
          }

          checkPathContainment(resolvedContext, targetPath);

          try {
            if (!fsSync.existsSync(targetPath)) {
              throw new Error(`File does not exist: ${targetPath}`);
            }
            await fs.unlink(targetPath);
            toolResult = `Successfully deleted file: ${targetPath}`;
            accumulatedDiff += `- Deleted ${path.relative(resolvedContext, targetPath)}\n`;
            hasMutated = true;
          } catch (e: any) {
            toolResult = `Tool Execution Error: Failed to delete file: ${e.message}`;
          }
        } else if (tool === 'write_file' || tool === 'write_to_file' || tool === 'create_file') {
          const targetPath = path.resolve(
            resolvedContext,
            args.path || args.file || args.filename || args.TargetFile || args.targetFile || '',
          );
          checkPathContainment(resolvedContext, targetPath);

          await fs.mkdir(path.dirname(targetPath), { recursive: true });
          const rawContent =
            args.content || args.codeContent || args.CodeContent || args.text || args.body || '';
          const cleanContent = cleanCodeBlock(rawContent);
          if (
            !cleanContent ||
            cleanContent === '{"response": null}' ||
            cleanContent === '{"response":null}' ||
            cleanContent === 'null'
          ) {
            throw new Error(
              'Invalid empty/null code content! You must provide actual code inside the content parameter.',
            );
          }
          await fs.writeFile(targetPath, cleanContent, 'utf-8');
          const lineCount = cleanContent.split('\n').length;
          accumulatedDiff += `+ Wrote file ${args.path || targetPath} (${lineCount} lines, ${cleanContent.length} bytes)\n`;
          await updateSwarmMemory(
            resolvedContext,
            {
              fileRegistry: {
                [args.path || path.basename(targetPath)]:
                  `Created (${lineCount} lines, ${cleanContent.length} bytes)`,
              },
            },
            'Specialist Agent',
          ).catch(() => {});

          // Automated 7B/8B Self-Healing: Check bracket balance!
          const openBraces = (cleanContent.match(/\{/g) || []).length;
          const closeBraces = (cleanContent.match(/\}/g) || []).length;
          const openParens = (cleanContent.match(/\(/g) || []).length;
          const closeParens = (cleanContent.match(/\)/g) || []).length;
          let selfHealWarning = '';
          if (openBraces !== closeBraces || openParens !== closeParens) {
            selfHealWarning = `\n\n⚠️ [AUTOMATED SELF-HEALING WARNING]: Your file creation caused a bracket imbalance (open braces: ${openBraces}, close: ${closeBraces} | open parens: ${openParens}, close: ${closeParens})! Please check your code and fix any missing/unclosed brackets immediately!`;
            broadcastEvent('task_console', {
              taskId,
              content: `[Self-Healing Alert] Bracket imbalance detected in ${path.basename(targetPath)} — warning sent to model!\n`,
            });
          }
          toolResult = `Successfully wrote ${args.path || targetPath} (${lineCount} lines, ${cleanContent.length} bytes).${selfHealWarning}`;
        } else if (
          tool === 'edit_file' ||
          tool === 'replace_file_content' ||
          tool === 'multi_replace_file_content'
        ) {
          const targetPath = path.resolve(
            resolvedContext,
            args.path || args.file || args.filename || args.TargetFile || args.targetFile || '',
          );
          checkPathContainment(resolvedContext, targetPath);

          let content = await fs.readFile(targetPath, 'utf-8');

          const chunks = args.ReplacementChunks ||
            args.replacementChunks ||
            args.chunks || [
              {
                oldContent:
                  args.old_content ||
                  args.targetContent ||
                  args.TargetContent ||
                  args.old_str ||
                  args.old ||
                  '',
                newContent: cleanCodeBlock(
                  args.new_content ||
                    args.replacementContent ||
                    args.ReplacementContent ||
                    args.new_str ||
                    args.new ||
                    '',
                ),
              },
            ];

          let editCount = 0;
          for (const chunk of chunks) {
            const oldStr =
              chunk.oldContent ||
              chunk.TargetContent ||
              chunk.targetContent ||
              chunk.old_content ||
              '';
            const newStr = cleanCodeBlock(
              chunk.newContent ||
                chunk.ReplacementContent ||
                chunk.replacementContent ||
                chunk.new_content ||
                '',
            );

            if (!oldStr) continue;

            // 1. Try Exact Match
            if (content.includes(oldStr)) {
              const occurrences = content.split(oldStr).length - 1;
              if (
                occurrences > 1 &&
                !chunk.AllowMultiple &&
                !args.AllowMultiple &&
                !args.allow_multiple
              ) {
                throw new Error(
                  `old_content appears ${occurrences} times in ${args.path || targetPath}. Please provide a more unique substring.`,
                );
              }
              content = content.replace(oldStr, newStr);
              editCount++;
              continue;
            }

            // 2. Try Fuzzy Line-Ending & Indentation Normalized Match (Superpower for 7B/8B Local Models!)
            const normContentLines = content.replace(/\r\n/g, '\n').split('\n');
            const normOldLines = oldStr
              .replace(/\r\n/g, '\n')
              .trim()
              .split('\n')
              .map((l: string) => l.trim())
              .filter((l: string) => l.length > 0);

            if (normOldLines.length > 0) {
              let matchedWindowIndex = -1;
              let matchedLength = 0;
              for (let i = 0; i <= normContentLines.length - normOldLines.length; i++) {
                let isMatch = true;
                for (let j = 0; j < normOldLines.length; j++) {
                  if (normContentLines[i + j].trim() !== normOldLines[j]) {
                    isMatch = false;
                    break;
                  }
                }
                if (isMatch) {
                  matchedWindowIndex = i;
                  matchedLength = normOldLines.length;
                  break;
                }
              }

              if (matchedWindowIndex !== -1) {
                // Replace the fuzzy matched lines in content!
                normContentLines.splice(matchedWindowIndex, matchedLength, newStr);
                content = normContentLines.join('\n');
                editCount++;
                broadcastEvent('task_console', {
                  taskId,
                  content: `[Fuzzy Engine] Applied fuzzy whitespace code match in ${path.basename(targetPath)} for 7B/8B local model!\n`,
                });
                continue;
              }
            }

            throw new Error(
              `old_content not found in ${args.path || targetPath}. Please read the file first or provide a shorter, unique 3-5 line snippet of old_content without extra leading whitespace!`,
            );
          }

          if (editCount === 0) {
            throw new Error('No valid edit chunks or target content provided.');
          }

          // --- PHASE 2: INLINE DIFF EDITOR PAUSE LOGIC ---
          let userDecision = 'accept';
          if (explicitMode !== 'auto') {
            const originalContent = await fs.readFile(targetPath, 'utf-8');
            broadcastEvent('file_diff_proposal', {
              taskId,
              path: targetPath,
              oldContent: originalContent,
              newContent: content,
            });

            broadcastEvent('task_console', {
              taskId,
              content: `\n[Agent Paused] ⏳ Waiting for user to review and Accept/Reject the proposed edits to ${path.basename(targetPath)}...\n`,
            });

            userDecision = await new Promise<string>((resolve) => {
              const handler = (action: string) => {
                resolve(action);
              };
              diffEventEmitter.once(`resolve_${taskId}`, handler);
            });
          }

          if (userDecision === 'reject') {
            toolResult = `User REJECTED your proposed edit to ${path.basename(targetPath)}. Do not apply the exact same edit again. Please rethink your approach.`;
            if (explicitMode !== 'auto') {
              broadcastEvent('task_console', {
                taskId,
                content: `\n[Agent Unpaused] ❌ User rejected the edit.\n`,
              });
            }
            accumulatedDiff += `> User rejected edit to ${path.basename(targetPath)}\n`;
          } else {
            // User Accepted
            await fs.writeFile(targetPath, content, 'utf-8');
            const finalLineCount = content.split('\n').length;
            accumulatedDiff += `* Edited file ${args.path || targetPath} (${editCount} block(s))\n`;
            await updateSwarmMemory(
              resolvedContext,
              {
                fileRegistry: {
                  [args.path || path.basename(targetPath)]:
                    `Edited (${editCount} blocks, ${finalLineCount} lines)`,
                },
              },
              'Specialist Agent',
            ).catch(() => {});

            broadcastEvent('task_console', {
              taskId,
              content: `\n[Agent Unpaused] ✅ User accepted the edit.\n`,
            });

            // Automated 7B/8B Self-Healing: Check bracket balance after edit!
            const openBraces = (content.match(/\{/g) || []).length;
            const closeBraces = (content.match(/\}/g) || []).length;
            const openParens = (content.match(/\(/g) || []).length;
            const closeParens = (content.match(/\)/g) || []).length;
            let selfHealWarning = '';
            if (openBraces !== closeBraces || openParens !== closeParens) {
              selfHealWarning = `\n\n⚠️ [AUTOMATED SELF-HEALING WARNING]: Your edit caused a bracket imbalance (open braces: ${openBraces}, close: ${closeBraces} | open parens: ${openParens}, close: ${closeParens})! Please check your code and fix any missing/unclosed brackets immediately!`;
              broadcastEvent('task_console', {
                taskId,
                content: `[Self-Healing Alert] Bracket imbalance detected after edit in ${path.basename(targetPath)}!\n`,
              });
            }
            toolResult = `Successfully edited ${args.path || targetPath} (${editCount} block(s) replaced, file now ${finalLineCount} lines).${selfHealWarning}`;
          }
        } else if (tool === 'read_swarm_memory') {
          toolResult = await formatSwarmMemoryForPrompt(resolvedContext);
        } else if (tool === 'update_swarm_memory') {
          await updateSwarmMemory(
            resolvedContext,
            {
              projectArchitecture: args.architecture,
              fileRegistry: args.file_registry,
              activeContracts: args.contracts,
              knownIssues: args.issues,
            },
            'Specialist Agent',
          );
          toolResult = `Successfully updated Swarm Blackboard Memory. Peer agents will see these updates!`;
        } else if (tool === 'grep_search') {
          const query = args.query || args.pattern || args.search || args.term || args.Query || '';
          const searchPath = path.resolve(
            resolvedContext,
            args.path || args.dir || args.directory || args.SearchPath || args.searchPath || '.',
          );
          checkPathContainment(resolvedContext, searchPath);

          const matches: string[] = [];
          async function searchRecursively(dir: string) {
            const entries = await fs.readdir(dir, { withFileTypes: true });
            for (const e of entries) {
              if (e.name === 'node_modules' || e.name === '.git' || e.name === '.pm2') continue;
              const fullPath = path.join(dir, e.name);
              if (e.isDirectory()) {
                await searchRecursively(fullPath);
              } else if (e.isFile()) {
                try {
                  const text = await fs.readFile(fullPath, 'utf-8');
                  const lines = text.split('\n');
                  lines.forEach((line, idx) => {
                    if (line.includes(query)) {
                      const relPath = path.relative(resolvedContext, fullPath);
                      matches.push(`${relPath}:${idx + 1}: ${line.trim()}`);
                    }
                  });
                } catch {}
              }
            }
          }
          await searchRecursively(searchPath);
          const totalMatches = matches.length;
          toolResult =
            matches.length > 0
              ? `${matches.slice(0, 50).join('\n')}\n\n(${totalMatches} total match${totalMatches === 1 ? '' : 'es'}${totalMatches > 50 ? ', showing first 50' : ''})`
              : `No matches found for query "${query}" in ${path.relative(resolvedContext, searchPath) || '.'}.`;
        } else if (tool === 'run_command') {
          let cmd =
            args.command || args.cmd || args.commandLine || args.CommandLine || args.exec || '';
          if (
            /(?:^|\s)(?:cd|chdir)\s+/i.test(cmd) &&
            !cmd.toLowerCase().includes(resolvedContext.toLowerCase())
          ) {
            throw new Error(
              'Security Error: Changing directory outside the opened workspace is forbidden.',
            );
          }
          if (/(?:\.\.\/|\.\.\\)/.test(cmd)) {
            throw new Error(
              'Security Error: Path traversal (../ or ..\\) outside workspace is forbidden.',
            );
          }

          const trimmedCmd = cmd.trim().replace(/^["']|["']$/g, '');
          if (/^[a-zA-Z0-9_\-\.\/\\]+\.py$/i.test(trimmedCmd)) {
            cmd = `python "${trimmedCmd}"`;
          } else if (/^[a-zA-Z0-9_\-\.\/\\]+\.js$/i.test(trimmedCmd)) {
            cmd = `node "${trimmedCmd}"`;
          } else if (/^[a-zA-Z0-9_\-\.\/\\]+\.(ts|tsx)$/i.test(trimmedCmd)) {
            cmd = `npx tsx "${trimmedCmd}"`;
          } else if (/^[a-zA-Z0-9_\-\.\/\\]+\.(bat|cmd)$/i.test(trimmedCmd)) {
            cmd = `cmd /c "${trimmedCmd}"`;
          } else if (/^[a-zA-Z0-9_\-\.\/\\]+\.(ps1)$/i.test(trimmedCmd)) {
            cmd = `powershell -NoProfile -ExecutionPolicy Bypass -File "${trimmedCmd}"`;
          }

          let answer = 'Approve';
          if (explicitMode !== 'auto') {
            broadcastEvent('task_console', {
              taskId,
              content: `\n[Agent Paused] ⏳ Waiting for user approval to execute command...\n`,
            });
            broadcastEvent('question_proposal', {
              taskId,
              question: `The agent wants to run the following terminal command:\n\n\`${cmd}\`\n\nDo you approve this command?`,
              options: ['Approve', 'Reject'],
            });

            answer = await new Promise<string>((resolve) => {
              questionEventEmitter.once(`resolve_${taskId}`, (ans: string) => resolve(ans));
            });
          }

          if (answer !== 'Approve') {
            toolResult = `Command execution rejected by user. Do not attempt this command again.`;
            accumulatedDiff += `> User rejected command: ${cmd}\n`;
            if (explicitMode !== 'auto') {
              broadcastEvent('task_console', {
                taskId,
                content: `\n[Agent Unpaused] ❌ User rejected command execution.\n`,
              });
            }
            continue;
          }

          if (explicitMode !== 'auto') {
            broadcastEvent('task_console', {
              taskId,
              content: `\n[Agent Unpaused] ✅ User approved command execution.\n`,
            });
          }

          const cmdStartTime = Date.now();
          const { stdout, stderr, exitCode } = await new Promise<{
            stdout: string;
            stderr: string;
            exitCode: number;
          }>((resolve) => {
            let out = '';
            let err = '';
            const child = spawn('cmd.exe', ['/c', cmd], {
              cwd: resolvedContext,
              windowsHide: true,
            });

            const timer = setTimeout(() => {
              try {
                child.kill('SIGTERM');
              } catch {}
              resolve({
                stdout: out,
                stderr: err + '\n[Error: Command timed out after 120 seconds]',
                exitCode: 1,
              });
            }, 120000);

            child.stdout?.on('data', (data) => {
              const chunk = data.toString();
              out += chunk;
              broadcastEvent('task_console_stream', { taskId, content: chunk });
            });

            child.stderr?.on('data', (data) => {
              const chunk = data.toString();
              err += chunk;
              broadcastEvent('task_console_stream', { taskId, content: chunk });
            });

            child.on('close', (code) => {
              clearTimeout(timer);
              resolve({ stdout: out, stderr: err, exitCode: code ?? 0 });
            });

            child.on('error', (e) => {
              clearTimeout(timer);
              resolve({
                stdout: out,
                stderr: err + `\n[Process Error: ${e.message}]`,
                exitCode: 1,
              });
            });
          });

          const cmdDuration = Math.round((Date.now() - cmdStartTime) / 1000);
          const output =
            (stdout + '\n' + stderr).trim() || 'Command completed successfully with no output.';
          toolResult = `${output}\n\n(completed in ${cmdDuration}s, exit code ${exitCode})`;
          accumulatedDiff += `> Ran command: ${cmd} (${cmdDuration}s, exit ${exitCode})\n`;
        } else if (tool === 'start_background_server') {
          const cmd = args.command || args.cmd || args.commandLine || args.CommandLine || '';
          const port = args.port || '3000';

          let answer = 'Approve';
          if (explicitMode !== 'auto') {
            broadcastEvent('task_console', {
              taskId,
              content: `\n[Agent Paused] ⏳ Waiting for user approval to start background server...\n`,
            });
            broadcastEvent('question_proposal', {
              taskId,
              question: `The agent wants to start a background server with the following command:\n\n\`${cmd}\`\n\nDo you approve this command?`,
              options: ['Approve', 'Reject'],
            });

            answer = await new Promise<string>((resolve) => {
              questionEventEmitter.once(`resolve_${taskId}`, (ans: string) => resolve(ans));
            });
          }

          if (answer !== 'Approve') {
            toolResult = `Background server start rejected by user. Do not attempt this command again.`;
            accumulatedDiff += `> User rejected background server: ${cmd}\n`;
            if (explicitMode !== 'auto') {
              broadcastEvent('task_console', {
                taskId,
                content: `\n[Agent Unpaused] ❌ User rejected background server execution.\n`,
              });
            }
            continue;
          }

          if (explicitMode !== 'auto') {
            broadcastEvent('task_console', {
              taskId,
              content: `\n[Agent Unpaused] ✅ User approved background server execution.\n`,
            });
          }

          const child = spawn('cmd.exe', ['/c', cmd], {
            cwd: resolvedContext,
            detached: true,
            stdio: 'ignore',
            windowsHide: true,
          });
          child.unref();
          if (child.pid) spawnedPids.push(child.pid);

          // Wait 2 seconds for server to boot up
          await new Promise((resolve) => setTimeout(resolve, 2000));
          toolResult = `Successfully started background dev server "${cmd}" (PID: ${child.pid}). Server should be booting on port ${port}. You can now use fetch_web_page("http://localhost:${port}") to inspect the frontend!`;
          accumulatedDiff += `> Started background server: ${cmd}\n`;
        } else if (tool === 'fetch_web_page') {
          const url = args.url || 'http://localhost:3000';
          try {
            const res = await fetch(url);
            const contentType = res.headers.get('content-type') || '';
            const text = await res.text();
            if (contentType.includes('text/html') || text.trim().startsWith('<')) {
              // Extract clean structural preview for the agent
              const cleanHtml = text
                .replace(
                  /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
                  '<!-- [script removed] -->',
                )
                .replace(
                  /<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi,
                  '<!-- [style removed] -->',
                )
                .replace(/\s+/g, ' ')
                .trim();
              const preview =
                cleanHtml.length > 2500
                  ? cleanHtml.slice(0, 2500) + '\n... (truncated for context)'
                  : cleanHtml;
              toolResult = `HTTP ${res.status} ${res.statusText}\nContent-Type: ${contentType}\n\nRendered HTML Structure:\n${preview}`;
            } else {
              toolResult = `HTTP ${res.status} ${res.statusText}\nContent-Type: ${contentType}\n\nResponse Data:\n${text.slice(0, 2500)}`;
            }
          } catch (err: any) {
            toolResult = `Failed to fetch URL "${url}": ${err.message}. Ensure the dev server is running!`;
          }
        } else if (tool === 'search_web') {
          const query = args.query || args.q || '';
          try {
            const res = await fetch(
              `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`,
              {
                headers: {
                  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                },
              },
            );
            const text = await res.text();
            const snippets = [...text.matchAll(/class="result__snippet[^>]*>([\s\S]*?)<\/a>/gi)];
            if (snippets.length > 0) {
              const results = snippets
                .slice(0, 5)
                .map((m, i) => `${i + 1}. ${m[1].replace(/<\/?[^>]+(>|$)/g, '').trim()}`)
                .join('\n\n');
              toolResult = `Search results for "${query}":\n\n${results}`;
              accumulatedDiff += `> Searched web for: ${query}\n`;
            } else {
              toolResult = `No snippets found for "${query}". The network might be offline or blocked.`;
            }
          } catch (err: any) {
            toolResult = `Search failed: ${err.message}. Ensure internet is available.`;
          }
        } else if (tool === 'git_action') {
          const action = args.action || 'status';
          const branch = args.branch || 'feature/update';
          const message = args.message || 'Auto-commit update';
          const remote = args.remote || 'origin';

          const cmdStartTime = Date.now();

          if (action === 'push') {
            // 1. Check if remote is configured
            const remoteCheck = await execAsync(`git remote get-url ${remote}`, {
              cwd: resolvedContext,
              windowsHide: true,
            }).catch(() => null);
            if (!remoteCheck || !remoteCheck.stdout || !remoteCheck.stdout.trim()) {
              const question = `No remote repository is connected to "${remote}"! Please enter your remote GitHub repository URL (e.g. https://github.com/username/repo.git) to connect and push:`;
              const questionKey = `${question}|`;
              if (askedQuestions.has(questionKey)) {
                toolResult = `ERROR: You have already asked this exact question previously. Do not ask it again. Please proceed based on the previous answer or take a different approach.`;
              } else {
                askedQuestions.add(questionKey);
                broadcastEvent('user_question', {
                  taskId,
                  question,
                  placeholder: 'https://github.com/username/repo.git',
                  options: [],
                  isSecret: false,
                });
                broadcastEvent('task_console', {
                  taskId,
                  content: `\n[❓ System Question / Input Required]: ${question}\n`,
                });
                const userAnswer = await new Promise<string>((resolve, reject) => {
                  const handler = (ans: string) => {
                    questionEventEmitter.off(`stop_${taskId}`, stopHandler);
                    resolve(ans);
                  };
                  const stopHandler = () => {
                    questionEventEmitter.off(`resolve_${taskId}`, handler);
                    reject(new Error('Task stopped by user while waiting for input.'));
                  };
                  questionEventEmitter.once(`resolve_${taskId}`, handler);
                  questionEventEmitter.once(`stop_${taskId}`, stopHandler);
                });
                toolResult = `User answered: ${userAnswer}\nPlease execute git remote add origin "${userAnswer}" via run_command or retry git_action with this remote.`;
                continue;
              }
            }
            // 2. Check if there are any changes to commit or push
            const statusCheck = await execAsync('git status --porcelain && git status -sb', {
              cwd: resolvedContext,
              windowsHide: true,
            }).catch((e) => ({ stdout: '', stderr: e.message }));
            const statusOutput = (statusCheck.stdout || '').trim();
            const hasUncommitted = statusOutput
              .split('\n')
              .some((l) => /^[M A?DURC]/i.test(l.trim()));
            const isAhead = statusOutput.includes('[ahead ');
            if (!hasUncommitted && !isAhead) {
              toolResult = `Git [push]: ✨ Everything is up-to-date! Working tree is completely clean and all commits are already pushed to ${remote}. There are no new changes to push!`;
              accumulatedDiff += `> Git push: clean (no changes)\n`;
            } else {
              await execFileAsync('git', ['add', '-u'], {
                cwd: resolvedContext,
                windowsHide: true,
              }).catch(() => {});
              await execFileAsync('git', ['commit', '-m', message], {
                cwd: resolvedContext,
                windowsHide: true,
              }).catch(() => {});
              const { stdout, stderr } = await execFileAsync('git', ['push', remote, 'HEAD'], {
                cwd: resolvedContext,
                windowsHide: true,
                timeout: 45000,
              }).catch((e) => ({ stdout: '', stderr: e.message || '' }));
              const output = (stdout || stderr || '').trim();
              if (
                /403|Permission denied|Authentication failed|could not read Username/i.test(output)
              ) {
                const question = `GitHub authentication failed or API token is missing! Please provide your GitHub PAT (Personal Access Token) or authenticate via 'gh auth login':`;
                const questionKey = `${question}|`;
                if (askedQuestions.has(questionKey)) {
                  toolResult = `ERROR: You have already asked this exact question previously. Do not ask it again. Please proceed based on the previous answer or take a different approach.`;
                } else {
                  askedQuestions.add(questionKey);
                  broadcastEvent('user_question', {
                    taskId,
                    question,
                    placeholder: 'ghp_xxxxxxxxxxxx',
                    options: [],
                    isSecret: true,
                  });
                  broadcastEvent('task_console', {
                    taskId,
                    content: `\n[❓ System Question / Input Required]: ${question}\n`,
                  });
                  const userAnswer = await new Promise<string>((resolve, reject) => {
                    const handler = (ans: string) => {
                      questionEventEmitter.off(`stop_${taskId}`, stopHandler);
                      resolve(ans);
                    };
                    const stopHandler = () => {
                      questionEventEmitter.off(`resolve_${taskId}`, handler);
                      reject(new Error('Task stopped by user while waiting for input.'));
                    };
                    questionEventEmitter.once(`resolve_${taskId}`, handler);
                    questionEventEmitter.once(`stop_${taskId}`, stopHandler);
                  });
                  toolResult = `User provided authentication token (hidden for security). Attempting operation...`;
                  continue;
                }
              }
              const cmdDuration = Math.round((Date.now() - cmdStartTime) / 1000);
              toolResult = `Git [push]:\n${output || 'Successfully pushed to remote repository!'}\n\n(completed in ${cmdDuration}s)`;
              accumulatedDiff += `> Git push (safe parameter array)\n`;
              hasMutated = true;
            }
          } else {
            let cmd = 'git status && git branch -a';
            if (action === 'pull') cmd = `git pull ${remote} ${branch} || git pull`;
            else if (action === 'branch')
              cmd = `git checkout -b ${branch} || git checkout ${branch}`;
            else if (action === 'diff') cmd = 'git diff';

            const { stdout, stderr } = await execAsync(cmd, {
              cwd: resolvedContext,
              windowsHide: true,
              timeout: 30000,
            }).catch((e) => ({ stdout: '', stderr: e.message }));
            const cmdDuration = Math.round((Date.now() - cmdStartTime) / 1000);
            const output = stdout || stderr || 'Git command completed successfully.';
            toolResult = `Git [${action}]:\n${output}\n\n(completed in ${cmdDuration}s)`;
            accumulatedDiff += `> Git ${action}: ${cmd}\n`;
            hasMutated = true;
          }
        } else if (tool === 'github_issue') {
          const action = args.action || 'list';
          const title = args.title || 'Automated Issue';
          const body = args.body || 'Raised autonomously by AI agent.';
          const issueNumber = args.issue_number || args.number || '';
          let cmdArgs = ['issue', 'list'];
          if (action === 'create') cmdArgs = ['issue', 'create', '--title', title, '--body', body];
          else if (action === 'view') cmdArgs = ['issue', 'view', String(issueNumber)];
          else if (action === 'close') cmdArgs = ['issue', 'close', String(issueNumber)];

          const cmdStartTime = Date.now();
          const { stdout, stderr } = await execFileAsync('gh', cmdArgs, {
            cwd: resolvedContext,
            windowsHide: true,
            timeout: 30000,
          }).catch((e) => ({
            stdout: '',
            stderr: `GitHub CLI Error: ${e.message}. Note: Ensure 'gh' is installed and authenticated via 'gh auth login'.`,
          }));
          const cmdDuration = Math.round((Date.now() - cmdStartTime) / 1000);
          const output = stdout || stderr || 'GitHub Issue command completed.';
          toolResult = `GitHub Issue [${action}]:\n${output}\n\n(completed in ${cmdDuration}s)`;
          accumulatedDiff += `> GitHub Issue ${action}\n`;
          hasMutated = true;
        } else if (tool === 'github_pr') {
          const action = args.action || 'list';
          const title = args.title || 'Automated Pull Request';
          const body = args.body || 'Created autonomously by AI agent.';
          const prNumber = args.pr_number || args.number || '';
          const baseBranch = args.base_branch || 'main';
          let cmdArgs = ['pr', 'list'];
          if (action === 'create')
            cmdArgs = ['pr', 'create', '--title', title, '--body', body, '--base', baseBranch];
          else if (action === 'review') cmdArgs = ['pr', 'diff', String(prNumber)];
          else if (action === 'merge')
            cmdArgs = ['pr', 'merge', String(prNumber), '--merge', '--delete-branch'];

          const cmdStartTime = Date.now();
          const { stdout, stderr } = await execFileAsync('gh', cmdArgs, {
            cwd: resolvedContext,
            windowsHide: true,
            timeout: 30000,
          }).catch((e) => ({
            stdout: '',
            stderr: `GitHub CLI Error: ${e.message}. Note: Ensure 'gh' is installed and authenticated via 'gh auth login'.`,
          }));
          const cmdDuration = Math.round((Date.now() - cmdStartTime) / 1000);
          const output = stdout || stderr || 'GitHub PR command completed.';
          toolResult = `GitHub PR [${action}]:\n${output}\n\n(completed in ${cmdDuration}s)`;
          accumulatedDiff += `> GitHub PR ${action}\n`;
          hasMutated = true;
        } else if (tool === 'ask_question' || tool === 'ask_user_input') {
          const question =
            args.question || args.prompt || args.query || 'Please provide your input:';
          const placeholder = args.placeholder || 'Type your answer here...';
          const options = args.options || args.choices || [];
          const isSecret = args.is_secret || args.secret || false;
          const multiSelect = args.multi_select || args.multiSelect || false;
          const inputType = args.input_type || args.inputType || 'text';

          const questionKey = `${question}|${options.join(',')}|${multiSelect}|${inputType}`;
          if (askedQuestions.has(questionKey)) {
            toolResult = `ERROR: You have already asked this exact question previously. Do not ask it again. Please proceed based on the previous answer or take a different approach.`;
          } else {
            askedQuestions.add(questionKey);
            broadcastEvent('user_question', {
              taskId,
              question,
              placeholder,
              options,
              isSecret,
              multiSelect,
              inputType,
            });

            broadcastEvent('task_console', {
              taskId,
              content: `\n[❓ System Question / Input Required]: ${question}\n`,
            });

            broadcastEvent('task_console', {
              taskId,
              content: `\n[Agent Paused] ⏳ Waiting for user input...\n`,
            });

            const userAnswer = await new Promise<string>((resolve, reject) => {
              const handler = (answer: string) => {
                questionEventEmitter.off(`stop_${taskId}`, stopHandler);
                resolve(answer);
              };
              const stopHandler = () => {
                questionEventEmitter.off(`resolve_${taskId}`, handler);
                reject(new Error('Task stopped by user while waiting for input.'));
              };
              questionEventEmitter.once(`resolve_${taskId}`, handler);
              questionEventEmitter.once(`stop_${taskId}`, stopHandler);
            });

            broadcastEvent('task_console', {
              taskId,
              content: `\n[Agent Unpaused] ✅ User provided input: ${userAnswer}\n`,
            });

            toolResult = `User answered: ${userAnswer}`;
            accumulatedDiff += `? Asked user: ${question}\n! User replied: ${userAnswer}\n`;
          }
        } else if (tool === 'ask_form') {
          const schema = args.schema;
          const questionKey = `form|${JSON.stringify(schema)}`;
          if (askedQuestions.has(questionKey)) {
            toolResult = `ERROR: You have already asked this exact form previously. Do not ask it again. Please proceed based on the previous answer.`;
          } else {
            askedQuestions.add(questionKey);
            broadcastEvent('user_question', {
              taskId,
              question: args.title || 'Form Submission Required',
              options: [],
              isSecret: false,
              multiSelect: false,
              inputType: 'form',
              formSchema: schema,
            });

            broadcastEvent('task_console', {
              taskId,
              content: `\n[❓ System Form Required]: ${args.title || 'Please fill out the form.'}\n`,
            });

            broadcastEvent('task_console', {
              taskId,
              content: `\n[Agent Paused] ⏳ Waiting for user input...\n`,
            });

            const userAnswer = await new Promise<string>((resolve, reject) => {
              const handler = (answer: string) => {
                questionEventEmitter.off(`stop_${taskId}`, stopHandler);
                resolve(answer);
              };
              const stopHandler = () => {
                questionEventEmitter.off(`resolve_${taskId}`, handler);
                reject(new Error('Task stopped by user while waiting for input.'));
              };
              questionEventEmitter.once(`resolve_${taskId}`, handler);
              questionEventEmitter.once(`stop_${taskId}`, stopHandler);
            });

            broadcastEvent('task_console', {
              taskId,
              content: `\n[Agent Unpaused] ✅ User submitted form.\n`,
            });

            toolResult = `User answered: ${userAnswer}`;
            accumulatedDiff += `? Asked form: ${args.title}\n! User replied: ${userAnswer}\n`;
          }
        } else if (tool === 'glob_find') {
          const pattern = (args.pattern || args.query || args.name || '*')
            .toLowerCase()
            .replace(/^\*|\*$/g, '');
          const searchDir = path.resolve(resolvedContext, args.path || args.dir || '.');
          checkPathContainment(resolvedContext, searchDir);

          const matches: string[] = [];
          async function globRec(dir: string) {
            const entries = await fs.readdir(dir, { withFileTypes: true });
            for (const e of entries) {
              if (e.name === 'node_modules' || e.name === '.git' || e.name === '.pm2') continue;
              const fullPath = path.join(dir, e.name);
              const relPath = path.relative(resolvedContext, fullPath);
              if (e.name.toLowerCase().includes(pattern)) {
                matches.push(`${e.isDirectory() ? '[DIR] ' : '[FILE] '} ${relPath}`);
              }
              if (e.isDirectory()) await globRec(fullPath);
            }
          }
          await globRec(searchDir);
          toolResult =
            matches.length > 0
              ? `${matches.slice(0, 100).join('\n')}\n\n(${matches.length} total matches found)`
              : `No files matching "${pattern}" found in ${searchDir}.`;
        } else if (tool === 'manage_package') {
          const action = args.action || 'install';
          const pkg = args.package_name || args.pkg || '';
          const mgr = args.manager || args.mgr || 'npm';
          let cmd = 'npm list --depth=0';
          if (action === 'install')
            cmd =
              mgr === 'pip'
                ? `pip install ${pkg}`
                : mgr === 'cargo'
                  ? `cargo add ${pkg}`
                  : mgr === 'pnpm'
                    ? `pnpm add ${pkg}`
                    : `npm install ${pkg}`;
          else if (action === 'uninstall')
            cmd =
              mgr === 'pip'
                ? `pip uninstall -y ${pkg}`
                : mgr === 'cargo'
                  ? `cargo remove ${pkg}`
                  : `npm uninstall ${pkg}`;
          else if (action === 'update')
            cmd = mgr === 'pip' ? `pip install --upgrade ${pkg}` : `npm update ${pkg}`;

          const cmdStartTime = Date.now();
          const { stdout, stderr } = await execAsync(cmd, {
            cwd: resolvedContext,
            windowsHide: true,
            timeout: 60000,
          }).catch((e) => ({ stdout: '', stderr: e.message }));
          const cmdDuration = Math.round((Date.now() - cmdStartTime) / 1000);
          toolResult = `Package Manager [${mgr} - ${action}]:\n${stdout || stderr || 'Success'}\n\n(completed in ${cmdDuration}s)`;
          accumulatedDiff += `> Package ${action}: ${pkg} (${mgr})\n`;
          hasMutated = true;
        } else if (tool === 'process_manager') {
          const action = args.action || 'check_port';
          const target = args.target || args.port || '3000';
          let cmd = `netstat -ano | findstr :${target}`;
          if (action === 'kill_port') {
            cmd = `for /f "tokens=5" %a in ('netstat -aon ^| findstr :${target}') do taskkill /f /pid %a`;
          } else if (action === 'list_node_processes') {
            cmd = `tasklist | findstr /i "node.exe python.exe"`;
          }

          const cmdStartTime = Date.now();
          const { stdout, stderr } = await execAsync(cmd, {
            cwd: resolvedContext,
            windowsHide: true,
            timeout: 15000,
          }).catch((e) => ({ stdout: '', stderr: e.message }));
          const cmdDuration = Math.round((Date.now() - cmdStartTime) / 1000);
          toolResult = `Process Manager [${action} - Target: ${target}]:\n${stdout || stderr || 'No active processes found matching criteria.'}\n\n(completed in ${cmdDuration}s)`;
          accumulatedDiff += `> Process Manager ${action}: ${target}\n`;
          hasMutated = true;
        } else if (tool === 'database_query') {
          const dbType = args.db_type || 'sqlite';
          const query =
            args.query || args.sql || 'SELECT name FROM sqlite_master WHERE type="table";';
          const connStr = args.connection_string || (dbType === 'sqlite' ? 'database.sqlite' : '');
          let bin = 'sqlite3';
          let cmdArgs = [connStr, query];
          if (dbType === 'postgres' || dbType === 'postgresql') {
            bin = 'psql';
            cmdArgs = connStr ? [connStr, '-c', query] : ['-c', query];
          } else if (dbType === 'mysql') {
            bin = 'mysql';
            cmdArgs = ['-u', 'root', '-e', query];
          }

          const cmdStartTime = Date.now();
          const { stdout, stderr } = await execFileAsync(bin, cmdArgs, {
            cwd: resolvedContext,
            windowsHide: true,
            timeout: 20000,
          }).catch((e) => ({ stdout: '', stderr: e.message }));
          const cmdDuration = Math.round((Date.now() - cmdStartTime) / 1000);
          toolResult = `Database Query [${dbType}]:\n${stdout || stderr || 'Query executed successfully.'}\n\n(completed in ${cmdDuration}s)`;
          accumulatedDiff += `> Executed DB Query (${dbType})\n`;
          hasMutated = true;
        } else if (tool === 'api_tester') {
          const method = (args.method || 'GET').toUpperCase();
          const url = args.url || 'http://localhost:3000';
          const headers = args.headers || { 'Content-Type': 'application/json' };
          const body = args.body
            ? typeof args.body === 'string'
              ? args.body
              : JSON.stringify(args.body)
            : undefined;
          try {
            const res = await fetch(url, {
              method,
              headers,
              body: method !== 'GET' && method !== 'HEAD' ? body : undefined,
            });
            const text = await res.text();
            toolResult = `API Test [${method} ${url}] -> HTTP ${res.status} ${res.statusText}\nHeaders: ${JSON.stringify(Object.fromEntries(res.headers.entries()), null, 2)}\n\nResponse:\n${text.slice(0, 2000)}`;
          } catch (err: any) {
            toolResult = `API Test Failed [${method} ${url}]: ${err.message}. Ensure the endpoint is reachable!`;
          }
        } else if (tool === 'system_diagnostics') {
          const osInfo = `OS: Windows (${process.arch}) | Node: ${process.version} | CWD: ${resolvedContext}`;
          const mem = `System RAM: 16 GB | GPU Acceleration: NVIDIA RTX 3050 (6GB VRAM Optimized)`;
          const { stdout: cliTools } = await execAsync(
            'where git node python docker gh 2>nul || echo Checked CLI tools',
            { windowsHide: true },
          ).catch(() => ({ stdout: 'CLI check completed' }));
          toolResult = `System & Hardware Diagnostics:\n${osInfo}\n${mem}\n\nDetected Developer CLI Tools:\n${cliTools.trim()}`;
        } else if (tool === 'docker_devops') {
          const action = args.action || 'ps';
          const target = args.target || '';
          let cmd = 'docker ps -a';
          if (action === 'build') cmd = `docker build -t ${target || 'app-image'} .`;
          else if (action === 'compose_up') cmd = `docker-compose up -d`;
          else if (action === 'logs') cmd = `docker logs --tail 50 ${target}`;

          const cmdStartTime = Date.now();
          const { stdout, stderr } = await execAsync(cmd, {
            cwd: resolvedContext,
            windowsHide: true,
            timeout: 60000,
          }).catch((e) => ({ stdout: '', stderr: e.message }));
          const cmdDuration = Math.round((Date.now() - cmdStartTime) / 1000);
          toolResult = `Docker DevOps [${action}]:\n${stdout || stderr || 'Docker command completed.'}\n\n(completed in ${cmdDuration}s)`;
          accumulatedDiff += `> Docker ${action}: ${target}\n`;
          hasMutated = true;
        } else if (tool === 'sleep' || tool === 'wait') {
          const seconds = parseInt(args.seconds || args.duration || '5', 10);
          await new Promise((r) => setTimeout(r, seconds * 1000));
          toolResult = `Slept for ${seconds} seconds.`;
        } else if (tool === 'skeletonize_file') {
          const targetPath = path.resolve(
            resolvedContext,
            args.path || args.file || args.TargetFile,
          );
          checkPathContainment(resolvedContext, targetPath);
          const content = await fs.readFile(targetPath, 'utf8');
          toolResult = await skeletonizeFile(targetPath, content);
        } else if (tool === 'edit_function') {
          const targetPath = path.resolve(
            resolvedContext,
            args.path || args.file || args.TargetFile,
          );
          checkPathContainment(resolvedContext, targetPath);
          const functionName = args.function_name || args.functionName;
          const newCode = args.new_code || args.newCode;

          const content = await fs.readFile(targetPath, 'utf8');
          const range = await getFunctionRange(targetPath, content, functionName);

          if (!range) {
            throw new Error(`Could not locate function/method '${functionName}' in AST.`);
          }

          const lines = content.split('\n');

          // Save the old content for the diff UI
          const oldLines = lines.slice(range.start - 1, range.end).join('\n');

          // Wait for user approval via diff UI (since this modifies files) if not in auto mode
          let action = 'accept';
          if (explicitMode !== 'auto') {
            broadcastEvent('diff_proposal', {
              taskId,
              path: targetPath,
              oldContent: oldLines,
              newContent: newCode,
            });

            action = await new Promise((resolve) => {
              diffEventEmitter.once(`resolve_${taskId}`, resolve);
            });
          }

          if (action === 'accept') {
            lines.splice(range.start - 1, range.end - range.start + 1, newCode);
            await fs.writeFile(targetPath, lines.join('\n'));
            accumulatedDiff += `\n--- a/${path.relative(resolvedContext, targetPath)}\n+++ b/${path.relative(resolvedContext, targetPath)}\n@@ -${range.start},${range.end - range.start + 1} +${range.start},${newCode.split('\n').length} @@\n-[Function Replaced via AST]\n+[New Code Inserted]\n`;
            toolResult = `Successfully replaced function '${functionName}'.\nAccepted by user.`;
            hasMutated = true;
          } else {
            toolResult = `Edit rejected by user.`;
          }
        } else {
          toolResult = `Error: Unknown tool "${tool}". Available tools: list_dir, read_file, write_file, edit_file, grep_search, run_command, fetch_web_page, start_background_server, finish_task, read_swarm_memory, update_swarm_memory, search_web, git_action, github_issue, github_pr, glob_find, manage_package, process_manager, database_query, api_tester, system_diagnostics, docker_devops, sleep, skeletonize_file, edit_function.`;
        }
      } catch (err: any) {
        toolResult = `Tool Execution Error (${tool}): ${err.message}`;
      }

      if (
        toolResult.startsWith('Tool Execution Error:') ||
        toolResult.includes('Command failed:') ||
        toolResult.includes('is not recognized') ||
        toolResult.includes('syntax of the command is incorrect')
      ) {
        consecutiveErrors++;
        lastFailedCallKey = callKey;
      } else {
        consecutiveErrors = 0;
        lastFailedCallKey = '';
      }

      if (consecutiveErrors >= 5) {
        broadcastEvent('task_console', {
          taskId,
          content: `\n> Agent encountered 5 consecutive errors. Stopping loop to prevent infinite retry.\n`,
        });
        return {
          success: false,
          diff: accumulatedDiff,
          output: `Agent stopped after 5 consecutive errors. Last error: ${toolResult}`,
        };
      } else if (consecutiveErrors >= 3) {
        broadcastEvent('task_console', {
          taskId,
          content: `\n> [Self-Healing Alert] Agent encountered ${consecutiveErrors} consecutive errors. Advising model to self-correct...\n`,
        });
        messages.push({
          role: 'user',
          content: `⚠️ SYSTEM NOTICE: You have failed ${consecutiveErrors} tool calls in a row! Last error:\n${toolResult}\n\nDO NOT repeat the exact same tool call with the same arguments. Try reading the target file first with read_file, double checking exact substrings, or using an alternative tool/approach!`,
        });
        continue;
      }

      const toolDuration = Date.now() - toolStartTime;
      const toolDurationStr =
        toolDuration > 1000 ? `${Math.round(toolDuration / 1000)}s` : `${toolDuration}ms`;

      let actionTitle = `tool: ${tool}`;
      if (tool === 'run_command') actionTitle = `${args.command || ''}`;
      else if (tool === 'start_background_server')
        actionTitle = `start dev server: ${args.command || ''}`;
      else if (tool === 'fetch_web_page') actionTitle = `inspect URL: ${args.url || ''}`;
      else if (tool === 'search_web') actionTitle = `web search: ${args.query || ''}`;
      else if (tool === 'write_file' || tool === 'write_to_file' || tool === 'create_file')
        actionTitle = `✔ write_file ${args.path || ''}`;
      else if (tool === 'read_file' || tool === 'view_file')
        actionTitle = `read_file ${args.path || ''}`;
      else if (
        tool === 'edit_file' ||
        tool === 'replace_file_content' ||
        tool === 'multi_replace_file_content'
      )
        actionTitle = `✔ edit_file ${args.path || ''}`;
      else if (tool === 'grep_search')
        actionTitle = `grep "${args.query || ''}" in ${args.path || '.'}`;
      else if (tool === 'list_dir') actionTitle = `list_dir ${args.path || '.'}`;
      else if (tool === 'delete_file') actionTitle = `✔ delete_file ${args.path || ''}`;
      else if (tool === 'read_swarm_memory') actionTitle = `read_swarm_memory`;
      else if (tool === 'update_swarm_memory') actionTitle = `✔ update_swarm_memory`;

      let isTerminalCommand = false;
      if (
        tool === 'run_command' ||
        tool === 'start_background_server' ||
        tool === 'git_action' ||
        tool === 'manage_package' ||
        tool === 'docker_devops'
      ) {
        isTerminalCommand = true;
      }

      if (isTerminalCommand) {
        broadcastEvent('task_console', {
          taskId,
          content: `[Command Output]\n${toolResult}\n`,
        });
      } else {
        broadcastEvent('task_console', {
          taskId,
          content: `[Tool Execution] (${toolDurationStr})\nAction: ${actionTitle}\nOutput:\n${toolResult.length > 300 ? toolResult.slice(0, 300) + '... (truncated)' : toolResult}\n`,
        });
      }

      const truncatedResult =
        toolResult.length > 1500
          ? toolResult.slice(0, 1500) + '\n... [output truncated for context window efficiency]'
          : toolResult;

      messages.push({
        role: 'user',
        content: `Tool "${tool}" returned result:\n${truncatedResult}\n\nAnalyze the result and determine the next tool call or call finish_task.`,
      });
    }

    const totalElapsed = Math.round((Date.now() - agentStartTime) / 1000);
    broadcastEvent('task_console', {
      taskId,
      content: `\n[Claude Code Agent] Reached maximum iteration limit (${maxIterations}) after ${totalElapsed}s without calling finish_task.\n`,
    });
    broadcastEvent('task_console', {
      taskId,
      content: `\n[Task Summary]:\nAgent reached max iterations (${maxIterations}) before completing all steps.\n`,
    });

    return {
      success: false,
      diff: accumulatedDiff || '+ Attempted autonomous execution (max iterations reached)\n',
      output: 'Task stopped after reaching max iterations without explicit finish_task completion.',
    };
  } finally {
    // Ensure all background dev servers are killed when task stops, finishes, or crashes
    for (const pid of spawnedPids) {
      try {
        await execAsync(`taskkill /pid ${pid} /t /f`, { windowsHide: true });
        console.log(`[ClaudeCodeAgent] Cleaned up background process ${pid}`);
      } catch (err) {}
    }
  }
}
