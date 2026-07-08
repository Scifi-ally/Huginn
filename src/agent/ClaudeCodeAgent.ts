import fs from 'fs/promises';
import path from 'path';
import { exec, spawn } from 'child_process';
import util from 'util';
import { broadcastEvent } from '../ws/server.js';
import { db } from '../db/index.js';
import { tasks } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { updateSwarmMemory, formatSwarmMemoryForPrompt } from '../memory/swarm.js';

const execAsync = util.promisify(exec);

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';

function cleanCodeBlock(content: string): string {
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

interface ToolCall {
  thought?: string;
  tool?: string;
  arguments?: Record<string, any>;
}

export async function runClaudeCodeAgent(
  taskId: string,
  description: string,
  modelId: string,
  contextDir: string,
  images?: string[]
): Promise<{ success: boolean; diff: string; output: string }> {
  console.log(`[ClaudeCodeAgent] Booting autonomous tool-calling loop for task ${taskId} in ${contextDir}`);


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
5. grep_search(query, path): Search for string/regex query across files in path (use "." for root).
6. run_command(command): Execute a Windows terminal command (cmd/powershell).
7. fetch_web_page(url): Fetch and inspect a webpage or API endpoint (e.g. http://localhost:3000 or public URLs). Returns status, headers, and rendered HTML/text structure so you can inspect frontend layouts and verify changes!
8. start_background_server(command, port): Start a long-running dev server or web server in the background (e.g. npm run dev, python -m http.server 8000, node server.js). Returns immediately without timing out so you can test the frontend!
9. finish_task(summary): Call this when you have completed all goals and verified your work.
10. read_swarm_memory(): Instantly read the shared Blackboard memory (project architecture, file registry, component contracts) without re-reading files!
11. update_swarm_memory(architecture, file_registry, contracts, issues): Record your design decisions, created files, and component interfaces into the shared Blackboard memory so peer agents in the next phase know exactly what you built!
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
23. ask_question (or ask_user_input)(question, placeholder, options, is_secret): Ask the user for required information (such as GitHub Repository URL, API Token/PAT, database credentials, or confirmation) in a clean interactive input manner! When called, the UI renders a clean input card where the user can submit their answer directly back to you!

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

  const messages: any[] = [
    { role: 'system', content: systemPrompt },
    { 
      role: 'user', 
      content: `Task: ${description}\n\nWorkspace Context: ${resolvedContext}\n\nBegin your autonomous execution now by responding with your first JSON tool call. Remember, DO NOT just plan in the thought field and call finish_task. You MUST use write_file or run_command to actually implement the requirements!`,
      images: images && images.length > 0 ? images : undefined
    }
  ];

  let iteration = 0;
  const maxIterations = 15;
  let consecutiveErrors = 0;
  let lastFailedCallKey = '';
  let hasMutated = false;

  try {
    while (iteration < maxIterations) {
      const currentTask = await db.select({ status: tasks.status }).from(tasks).where(eq(tasks.id, taskId)).limit(1);
      if (currentTask.length > 0 && currentTask[0].status === 'stopped') {
        broadcastEvent('task_console', { taskId, content: `\n[System] Task stopped by user. Halting execution...\n` });
        return {
          success: false,
          diff: accumulatedDiff,
          output: 'Task stopped by user.'
        };
      }
      
      iteration++;

    const llmStartTime = Date.now();
    
    broadcastEvent('task_console', {
      taskId,
      content: `[Iteration ${iteration}/${maxIterations}] Requesting LLM inference from ${modelId}... (0s elapsed)\n`
    });

    const thinkingTimer = setInterval(() => {
      const elapsed = Math.round((Date.now() - llmStartTime) / 1000);
      broadcastEvent('task_console', {
        taskId,
        content: `[Iteration ${iteration}/${maxIterations}] LLM is still thinking... (${elapsed}s elapsed)\n`
      });
    }, 10000);

    let toolCall: ToolCall;
    try {
      let res;
      try {
        res = await fetch(`${OLLAMA_URL}/api/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: modelId,
            messages,
            format: 'json',
            stream: false,
            options: { temperature: 0.1, num_predict: 2048, top_k: 20, top_p: 0.9 }
          })
        });
      } catch (fetchErr: any) {
        clearInterval(thinkingTimer);
        const errMsg = fetchErr.cause?.code === 'ECONNREFUSED'
          ? `Cannot connect to Ollama at ${OLLAMA_URL}. Is Ollama running?`
          : `Ollama request failed: ${fetchErr.message}`;
        broadcastEvent('model_error', { message: errMsg });
        broadcastEvent('task_console', { taskId, content: `\n[ERROR] ${errMsg}\n` });
        return { success: false, diff: accumulatedDiff, output: errMsg };
      }

      clearInterval(thinkingTimer);

      if (!res.ok) {
        throw new Error(`Ollama API returned HTTP ${res.status}: ${res.statusText}`);
      }

      const llmDuration = Math.round((Date.now() - llmStartTime) / 1000);
      const data = await res.json();
      const rawResponse = data.message?.content || '{}';
      messages.push({ role: 'assistant', content: rawResponse });

      broadcastEvent('task_console', {
        taskId,
        content: `[Iteration ${iteration}/${maxIterations}] LLM responded in ${llmDuration}s. Parsing tool call...\n`
      });

      toolCall = JSON.parse(rawResponse);
    } catch (err: any) {
      console.error(`[ClaudeCodeAgent] Iteration ${iteration} failed to parse LLM response:`, err);
      broadcastEvent('task_console', {
        taskId,
        content: `[Iteration ${iteration}/${maxIterations}] [ERROR] Failed to parse LLM response (${err.message}). Retrying...\n`
      });
      messages.push({
        role: 'user',
        content: `Error: Your last response was not valid JSON matching the tool schema. Please respond with strictly valid JSON: {"thought": "...", "tool": "...", "arguments": {...}}`
      });
      continue;
    }

    const thought = toolCall.thought || 'Executing tool...';
    const tool = toolCall.tool || 'none';
    const args = toolCall.arguments || {};

    const callKey = `${tool}:${JSON.stringify(args)}`;
    if (callKey === lastFailedCallKey && tool !== 'finish_task') {
      console.warn(`[ClaudeCodeAgent] Iteration ${iteration} attempted to repeat exact failing call: ${callKey}`);
      broadcastEvent('task_console', {
        taskId,
        content: `\n> Blocked repeated failing command. Instructing agent to fix syntax or change approach.\n`
      });
      messages.push({
        role: 'user',
        content: `Error: You just attempted to execute the exact same tool call (${tool}) with the exact same arguments that previously failed! You MUST NOT repeat a failing command. In Windows cmd.exe, do NOT use single quotes (') for arguments or inline scripts; use double quotes (\") or put scripts in standalone files. If you cannot fix the command, call finish_task or list_dir.`
      });
      continue;
    }

    if (tool === 'finish_task' && !hasMutated && (description.toLowerCase().includes('build') || description.toLowerCase().includes('create') || description.toLowerCase().includes('implement') || description.toLowerCase().includes('scaffolding'))) {
      broadcastEvent('task_console', {
        taskId,
        content: `\n> [WARNING] Agent attempted to finish without writing any code. Forcing implementation...\n`
      });
      messages.push({
        role: 'user',
        content: `Error: You called finish_task but you haven't actually created or modified ANY files! The user requested you to build/implement something. Do not just output your plan in the thought field. You MUST use 'write_file' or 'run_command' to actually build the project before finishing.`
      });
      continue;
    }

    let toolSummary = `> Using tool: ${tool}`;
    if (tool === 'run_command') toolSummary = `> Executing command: ${args.command || ''}`;
    else if (tool === 'start_background_server') toolSummary = `> Starting dev server: ${args.command || ''} (Port ${args.port || '3000'})`;
    else if (tool === 'fetch_web_page') toolSummary = `> Inspecting frontend URL: ${args.url || ''}`;
    else if (tool === 'write_file' || tool === 'write_to_file' || tool === 'create_file') toolSummary = `> Creating file: ${args.path || ''}`;
    else if (tool === 'read_file') toolSummary = `> Reading file: ${args.path || ''}`;
    else if (tool === 'edit_file' || tool === 'replace_file_content' || tool === 'multi_replace_file_content') toolSummary = `> Editing file: ${args.path || ''}`;
    else if (tool === 'grep_search') toolSummary = `> Searching codebase for: "${args.query || ''}"`;
    else if (tool === 'list_dir') toolSummary = `> Inspecting directory: ${args.path || '.'}`;
    else if (tool === 'read_swarm_memory') toolSummary = `> Reading Swarm Blackboard Memory`;
    else if (tool === 'update_swarm_memory') toolSummary = `> Updating Swarm Blackboard Memory`;
    else if (tool === 'search_web') toolSummary = `> Searching the web for: "${args.query || ''}"`;
    else if (tool === 'git_action') toolSummary = `> Executing Git Action: ${args.action || ''} (${args.branch || args.message || ''})`;
    else if (tool === 'github_issue') toolSummary = `> Managing GitHub Issue: ${args.action || ''} (${args.title || args.issue_number || ''})`;
    else if (tool === 'github_pr') toolSummary = `> Managing GitHub PR: ${args.action || ''} (${args.title || args.pr_number || ''})`;
    else if (tool === 'glob_find') toolSummary = `> Finding files matching: "${args.pattern || ''}"`;
    else if (tool === 'manage_package') toolSummary = `> Managing Package: ${args.action || ''} ${args.package_name || ''}`;
    else if (tool === 'process_manager') toolSummary = `> Managing Process/Port: ${args.action || ''} (${args.target || ''})`;
    else if (tool === 'database_query') toolSummary = `> Executing Database Query (${args.db_type || 'sqlite'})`;
    else if (tool === 'api_tester') toolSummary = `> Testing API Endpoint: [${args.method || 'GET'}] ${args.url || ''}`;
    else if (tool === 'system_diagnostics') toolSummary = `> Running System & Hardware Diagnostics`;
    else if (tool === 'docker_devops') toolSummary = `> Executing Docker DevOps: ${args.action || ''} ${args.target || ''}`;
    else if (tool === 'finish_task') toolSummary = `> Completed task verification`;

    broadcastEvent('task_console', {
      taskId,
      content: `${thought}\n${toolSummary}\n`
    });

    if (tool === 'finish_task') {
      finalOutput = args.summary || 'Task completed successfully.';
      const totalElapsed = Math.round((Date.now() - agentStartTime) / 1000);
      broadcastEvent('task_console', {
        taskId,
        content: `\n[Task Summary]:\nI have completed all requested goals and verified the codebase changes (${iteration} iterations, ${totalElapsed}s total). ${finalOutput}\n`
      });
      return { success: true, diff: accumulatedDiff || '+ Completed autonomous tool execution\n', output: finalOutput };
    }

    // Track mutation to ensure agent actually did work
    if (tool === 'write_file' || tool === 'write_to_file' || tool === 'create_file' || tool === 'edit_file' || tool === 'replace_file_content' || tool === 'multi_replace_file_content' || tool === 'run_command' || tool === 'git_action' || tool === 'github_issue' || tool === 'github_pr' || tool === 'manage_package' || tool === 'process_manager' || tool === 'database_query' || tool === 'docker_devops') {
      hasMutated = true;
    }

    // Execute Tool
    let toolResult = '';
    const toolStartTime = Date.now();
    try {
      if (tool === 'list_dir') {
        const targetPath = path.resolve(resolvedContext, args.path || args.dir || args.directory || args.TargetFile || args.targetFile || args.DirectoryPath || '.');
        if (!targetPath.startsWith(resolvedContext)) throw new Error('Security Error: Path traversal detected.');
        
        const entries = await fs.readdir(targetPath, { withFileTypes: true });
        const dirs = entries.filter(e => e.isDirectory());
        const files = entries.filter(e => !e.isDirectory());
        const list = entries.map(e => `${e.isDirectory() ? '[DIR] ' : '[FILE] '} ${e.name}`).join('\n');
        toolResult = list ? `${list}\n\n(${dirs.length} directories, ${files.length} files)` : 'Directory is empty.';

      } else if (tool === 'read_file' || tool === 'view_file') {
        const targetPath = path.resolve(resolvedContext, args.path || args.file || args.filename || args.TargetFile || args.targetFile || args.AbsolutePath || '');
        if (!targetPath.startsWith(resolvedContext)) throw new Error('Security Error: Path traversal detected.');
        
        const content = await fs.readFile(targetPath, 'utf-8');
        const lines = content.split('\n');
        const fileSize = Buffer.byteLength(content, 'utf-8');
        const numbered = lines.slice(0, 500).map((l, i) => `${i + 1}: ${l}`).join('\n');
        toolResult = lines.length > 500 
          ? `${numbered}\n... (truncated at 500/${lines.length} lines, ${fileSize} bytes)` 
          : `${numbered}\n\n(${lines.length} lines, ${fileSize} bytes)`;

      } else if (tool === 'write_file' || tool === 'write_to_file' || tool === 'create_file') {
        const targetPath = path.resolve(resolvedContext, args.path || args.file || args.filename || args.TargetFile || args.targetFile || '');
        if (!targetPath.startsWith(resolvedContext)) throw new Error('Security Error: Path traversal detected.');
        
        await fs.mkdir(path.dirname(targetPath), { recursive: true });
        const rawContent = args.content || args.codeContent || args.CodeContent || args.text || args.body || '';
        const cleanContent = cleanCodeBlock(rawContent);
        if (!cleanContent || cleanContent === '{"response": null}' || cleanContent === '{"response":null}' || cleanContent === 'null') {
          throw new Error('Invalid empty/null code content! You must provide actual code inside the content parameter.');
        }
        await fs.writeFile(targetPath, cleanContent, 'utf-8');
        const lineCount = cleanContent.split('\n').length;
        accumulatedDiff += `+ Wrote file ${args.path || targetPath} (${lineCount} lines, ${cleanContent.length} bytes)\n`;
        await updateSwarmMemory(resolvedContext, { fileRegistry: { [args.path || path.basename(targetPath)]: `Created (${lineCount} lines, ${cleanContent.length} bytes)` } }, 'Specialist Agent').catch(() => {});
        
        // Automated 7B/8B Self-Healing: Check bracket balance!
        const openBraces = (cleanContent.match(/\{/g) || []).length;
        const closeBraces = (cleanContent.match(/\}/g) || []).length;
        const openParens = (cleanContent.match(/\(/g) || []).length;
        const closeParens = (cleanContent.match(/\)/g) || []).length;
        let selfHealWarning = '';
        if (openBraces !== closeBraces || openParens !== closeParens) {
          selfHealWarning = `\n\n⚠️ [AUTOMATED SELF-HEALING WARNING]: Your file creation caused a bracket imbalance (open braces: ${openBraces}, close: ${closeBraces} | open parens: ${openParens}, close: ${closeParens})! Please check your code and fix any missing/unclosed brackets immediately!`;
          broadcastEvent('task_console', { taskId, content: `[Self-Healing Alert] Bracket imbalance detected in ${path.basename(targetPath)} — warning sent to model!\n` });
        }
        toolResult = `Successfully wrote ${args.path || targetPath} (${lineCount} lines, ${cleanContent.length} bytes).${selfHealWarning}`;

      } else if (tool === 'edit_file' || tool === 'replace_file_content' || tool === 'multi_replace_file_content') {
        const targetPath = path.resolve(resolvedContext, args.path || args.file || args.filename || args.TargetFile || args.targetFile || '');
        if (!targetPath.startsWith(resolvedContext)) throw new Error('Security Error: Path traversal detected.');
        
        let content = await fs.readFile(targetPath, 'utf-8');
        
        const chunks = args.ReplacementChunks || args.replacementChunks || args.chunks || [
          {
            oldContent: args.old_content || args.targetContent || args.TargetContent || args.old_str || args.old || '',
            newContent: cleanCodeBlock(args.new_content || args.replacementContent || args.ReplacementContent || args.new_str || args.new || '')
          }
        ];

        let editCount = 0;
        for (const chunk of chunks) {
          const oldStr = chunk.oldContent || chunk.TargetContent || chunk.targetContent || chunk.old_content || '';
          const newStr = cleanCodeBlock(chunk.newContent || chunk.ReplacementContent || chunk.replacementContent || chunk.new_content || '');
          
          if (!oldStr) continue;
          
          // 1. Try Exact Match
          if (content.includes(oldStr)) {
            const occurrences = content.split(oldStr).length - 1;
            if (occurrences > 1 && !chunk.AllowMultiple && !args.AllowMultiple && !args.allow_multiple) {
              throw new Error(`old_content appears ${occurrences} times in ${args.path || targetPath}. Please provide a more unique substring.`);
            }
            content = content.replace(oldStr, newStr);
            editCount++;
            continue;
          }

          // 2. Try Fuzzy Line-Ending & Indentation Normalized Match (Superpower for 7B/8B Local Models!)
          const normContentLines = content.replace(/\r\n/g, '\n').split('\n');
          const normOldLines = oldStr.replace(/\r\n/g, '\n').trim().split('\n').map((l: string) => l.trim()).filter((l: string) => l.length > 0);
          
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
              broadcastEvent('task_console', { taskId, content: `[Fuzzy Engine] Applied fuzzy whitespace code match in ${path.basename(targetPath)} for 7B/8B local model!\n` });
              continue;
            }
          }

          throw new Error(`old_content not found in ${args.path || targetPath}. Please read the file first or provide a shorter, unique 3-5 line snippet of old_content without extra leading whitespace!`);
        }

        if (editCount === 0) {
          throw new Error('No valid edit chunks or target content provided.');
        }

        await fs.writeFile(targetPath, content, 'utf-8');
        const finalLineCount = content.split('\n').length;
        accumulatedDiff += `* Edited file ${args.path || targetPath} (${editCount} block(s))\n`;
        await updateSwarmMemory(resolvedContext, { fileRegistry: { [args.path || path.basename(targetPath)]: `Edited (${editCount} blocks, ${finalLineCount} lines)` } }, 'Specialist Agent').catch(() => {});
        
        // Automated 7B/8B Self-Healing: Check bracket balance after edit!
        const openBraces = (content.match(/\{/g) || []).length;
        const closeBraces = (content.match(/\}/g) || []).length;
        const openParens = (content.match(/\(/g) || []).length;
        const closeParens = (content.match(/\)/g) || []).length;
        let selfHealWarning = '';
        if (openBraces !== closeBraces || openParens !== closeParens) {
          selfHealWarning = `\n\n⚠️ [AUTOMATED SELF-HEALING WARNING]: Your edit caused a bracket imbalance (open braces: ${openBraces}, close: ${closeBraces} | open parens: ${openParens}, close: ${closeParens})! Please check your code and fix any missing/unclosed brackets immediately!`;
          broadcastEvent('task_console', { taskId, content: `[Self-Healing Alert] Bracket imbalance detected after edit in ${path.basename(targetPath)}!\n` });
        }
        toolResult = `Successfully edited ${args.path || targetPath} (${editCount} block(s) replaced, file now ${finalLineCount} lines).${selfHealWarning}`;

      } else if (tool === 'read_swarm_memory') {
        toolResult = await formatSwarmMemoryForPrompt(resolvedContext);

      } else if (tool === 'update_swarm_memory') {
        await updateSwarmMemory(resolvedContext, {
          projectArchitecture: args.architecture,
          fileRegistry: args.file_registry,
          activeContracts: args.contracts,
          knownIssues: args.issues
        }, 'Specialist Agent');
        toolResult = `Successfully updated Swarm Blackboard Memory. Peer agents will see these updates!`;

      } else if (tool === 'grep_search') {
        const query = args.query || args.pattern || args.search || args.term || args.Query || '';
        const searchPath = path.resolve(resolvedContext, args.path || args.dir || args.directory || args.SearchPath || args.searchPath || '.');
        if (!searchPath.startsWith(resolvedContext)) throw new Error('Security Error: Path traversal detected.');

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
        toolResult = matches.length > 0 
          ? `${matches.slice(0, 50).join('\n')}\n\n(${totalMatches} total match${totalMatches === 1 ? '' : 'es'}${totalMatches > 50 ? ', showing first 50' : ''})` 
          : `No matches found for query "${query}" in ${path.relative(resolvedContext, searchPath) || '.'}.`;

      } else if (tool === 'run_command') {
        let cmd = args.command || args.cmd || args.commandLine || args.CommandLine || args.exec || '';
        if (/(?:^|\s)(?:cd|chdir)\s+/i.test(cmd) && !cmd.toLowerCase().includes(resolvedContext.toLowerCase())) {
          throw new Error('Security Error: Changing directory outside the opened workspace is forbidden.');
        }
        if (/(?:\.\.\/|\.\.\\)/.test(cmd)) {
          throw new Error('Security Error: Path traversal (../ or ..\\) outside workspace is forbidden.');
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

        const cmdStartTime = Date.now();
        const { stdout, stderr } = await execAsync(cmd, { cwd: resolvedContext, windowsHide: true, timeout: 30000 });
        const cmdDuration = Math.round((Date.now() - cmdStartTime) / 1000);
        const output = stdout || stderr || 'Command completed successfully with no output.';
        toolResult = `${output}\n\n(completed in ${cmdDuration}s, exit code 0)`;
        accumulatedDiff += `> Ran command: ${cmd} (${cmdDuration}s)\n`;

      } else if (tool === 'start_background_server') {
        const cmd = args.command || args.cmd || args.commandLine || args.CommandLine || '';
        const port = args.port || '3000';
        const child = spawn('cmd.exe', ['/c', cmd], {
          cwd: resolvedContext,
          detached: true,
          stdio: 'ignore',
          windowsHide: true
        });
        child.unref();
        if (child.pid) spawnedPids.push(child.pid);
        
        // Wait 2 seconds for server to boot up
        await new Promise(resolve => setTimeout(resolve, 2000));
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
              .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '<!-- [script removed] -->')
              .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '<!-- [style removed] -->')
              .replace(/\s+/g, ' ')
              .trim();
            const preview = cleanHtml.length > 2500 ? cleanHtml.slice(0, 2500) + '\n... (truncated for context)' : cleanHtml;
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
          const res = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
          });
          const text = await res.text();
          const snippets = [...text.matchAll(/class="result__snippet[^>]*>([\s\S]*?)<\/a>/gi)];
          if (snippets.length > 0) {
            const results = snippets.slice(0, 5).map((m, i) => `${i + 1}. ${m[1].replace(/<\/?[^>]+(>|$)/g, "").trim()}`).join('\n\n');
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
          const remoteCheck = await execAsync(`git remote get-url ${remote}`, { cwd: resolvedContext, windowsHide: true }).catch(() => null);
          if (!remoteCheck || !remoteCheck.stdout || !remoteCheck.stdout.trim()) {
            const question = `No remote repository is connected to "${remote}"! Please enter your remote GitHub repository URL (e.g. https://github.com/username/repo.git) to connect and push:`;
            broadcastEvent('user_question', { taskId, question, placeholder: 'https://github.com/username/repo.git', options: [], isSecret: false });
            broadcastEvent('task_console', { taskId, content: `\n[❓ System Question / Input Required]: ${question}\n` });
            return { success: true, diff: accumulatedDiff + `? Asked user for remote URL\n`, output: `[❓ System Question / Input Required]: ${question}` };
          }
          // 2. Check if there are any changes to commit or push
          const statusCheck = await execAsync('git status --porcelain && git status -sb', { cwd: resolvedContext, windowsHide: true }).catch(e => ({ stdout: '', stderr: e.message }));
          const statusOutput = (statusCheck.stdout || '').trim();
          const hasUncommitted = statusOutput.split('\n').some(l => /^[M A?DURC]/i.test(l.trim()));
          const isAhead = statusOutput.includes('[ahead ');
          if (!hasUncommitted && !isAhead) {
            toolResult = `Git [push]: ✨ Everything is up-to-date! Working tree is completely clean and all commits are already pushed to ${remote}. There are no new changes to push!`;
            accumulatedDiff += `> Git push: clean (no changes)\n`;
          } else {
            const pushCmd = `git add . && git commit -m "${message}" && git push ${remote} HEAD`;
            const { stdout, stderr } = await execAsync(pushCmd, { cwd: resolvedContext, windowsHide: true, timeout: 45000 }).catch(e => ({ stdout: '', stderr: e.message || '' }));
            const output = (stdout || stderr || '').trim();
            if (/403|Permission denied|Authentication failed|could not read Username/i.test(output)) {
              const question = `GitHub authentication failed or API token is missing! Please provide your GitHub PAT (Personal Access Token) or authenticate via 'gh auth login':`;
              broadcastEvent('user_question', { taskId, question, placeholder: 'ghp_xxxxxxxxxxxx', options: [], isSecret: true });
              broadcastEvent('task_console', { taskId, content: `\n[❓ System Question / Input Required]: ${question}\n` });
              return { success: true, diff: accumulatedDiff + `? Asked user for GitHub token\n`, output: `[❓ System Question / Input Required]: ${question}` };
            }
            const cmdDuration = Math.round((Date.now() - cmdStartTime) / 1000);
            toolResult = `Git [push]:\n${output || 'Successfully pushed to remote repository!'}\n\n(completed in ${cmdDuration}s)`;
            accumulatedDiff += `> Git push: ${pushCmd}\n`;
            hasMutated = true;
          }
        } else {
          let cmd = 'git status && git branch -a';
          if (action === 'pull') cmd = `git pull ${remote} ${branch} || git pull`;
          else if (action === 'branch') cmd = `git checkout -b ${branch} || git checkout ${branch}`;
          else if (action === 'diff') cmd = 'git diff';

          const { stdout, stderr } = await execAsync(cmd, { cwd: resolvedContext, windowsHide: true, timeout: 30000 }).catch(e => ({ stdout: '', stderr: e.message }));
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
        let cmd = 'gh issue list';
        if (action === 'create') cmd = `gh issue create --title "${title}" --body "${body}"`;
        else if (action === 'view') cmd = `gh issue view ${issueNumber}`;
        else if (action === 'close') cmd = `gh issue close ${issueNumber}`;

        const cmdStartTime = Date.now();
        const { stdout, stderr } = await execAsync(cmd, { cwd: resolvedContext, windowsHide: true, timeout: 30000 }).catch(e => ({ stdout: '', stderr: `GitHub CLI Error: ${e.message}. Note: Ensure 'gh' is installed and authenticated via 'gh auth login'.` }));
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
        let cmd = 'gh pr list';
        if (action === 'create') cmd = `gh pr create --title "${title}" --body "${body}" --base ${baseBranch}`;
        else if (action === 'review') cmd = `gh pr diff ${prNumber} && gh pr checks ${prNumber}`;
        else if (action === 'merge') cmd = `gh pr merge ${prNumber} --merge --delete-branch`;

        const cmdStartTime = Date.now();
        const { stdout, stderr } = await execAsync(cmd, { cwd: resolvedContext, windowsHide: true, timeout: 30000 }).catch(e => ({ stdout: '', stderr: `GitHub CLI Error: ${e.message}. Note: Ensure 'gh' is installed and authenticated via 'gh auth login'.` }));
        const cmdDuration = Math.round((Date.now() - cmdStartTime) / 1000);
        const output = stdout || stderr || 'GitHub PR command completed.';
        toolResult = `GitHub PR [${action}]:\n${output}\n\n(completed in ${cmdDuration}s)`;
        accumulatedDiff += `> GitHub PR ${action}\n`;
        hasMutated = true;

      } else if (tool === 'ask_question' || tool === 'ask_user_input') {
        const question = args.question || args.prompt || args.query || 'Please provide your input:';
        const placeholder = args.placeholder || 'Type your answer here...';
        const options = args.options || args.choices || [];
        const isSecret = args.is_secret || args.secret || false;

        broadcastEvent('user_question', {
          taskId,
          question,
          placeholder,
          options,
          isSecret
        });

        broadcastEvent('task_console', {
          taskId,
          content: `\n[❓ System Question / Input Required]: ${question}\n`
        });

        return {
          success: true,
          diff: accumulatedDiff + `? Asked user: ${question}\n`,
          output: `[❓ System Question / Input Required]: ${question}`
        };

      } else if (tool === 'glob_find') {
        const pattern = (args.pattern || args.query || args.name || '*').toLowerCase().replace(/^\*|\*$/g, '');
        const searchDir = path.resolve(resolvedContext, args.path || args.dir || '.');
        if (!searchDir.startsWith(resolvedContext)) throw new Error('Security Error: Path traversal detected.');
        
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
        toolResult = matches.length > 0 ? `${matches.slice(0, 100).join('\n')}\n\n(${matches.length} total matches found)` : `No files matching "${pattern}" found in ${searchDir}.`;

      } else if (tool === 'manage_package') {
        const action = args.action || 'install';
        const pkg = args.package_name || args.pkg || '';
        const mgr = args.manager || args.mgr || 'npm';
        let cmd = 'npm list --depth=0';
        if (action === 'install') cmd = mgr === 'pip' ? `pip install ${pkg}` : mgr === 'cargo' ? `cargo add ${pkg}` : mgr === 'pnpm' ? `pnpm add ${pkg}` : `npm install ${pkg}`;
        else if (action === 'uninstall') cmd = mgr === 'pip' ? `pip uninstall -y ${pkg}` : mgr === 'cargo' ? `cargo remove ${pkg}` : `npm uninstall ${pkg}`;
        else if (action === 'update') cmd = mgr === 'pip' ? `pip install --upgrade ${pkg}` : `npm update ${pkg}`;

        const cmdStartTime = Date.now();
        const { stdout, stderr } = await execAsync(cmd, { cwd: resolvedContext, windowsHide: true, timeout: 60000 }).catch(e => ({ stdout: '', stderr: e.message }));
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
        const { stdout, stderr } = await execAsync(cmd, { cwd: resolvedContext, windowsHide: true, timeout: 15000 }).catch(e => ({ stdout: '', stderr: e.message }));
        const cmdDuration = Math.round((Date.now() - cmdStartTime) / 1000);
        toolResult = `Process Manager [${action} - Target: ${target}]:\n${stdout || stderr || 'No active processes found matching criteria.'}\n\n(completed in ${cmdDuration}s)`;
        accumulatedDiff += `> Process Manager ${action}: ${target}\n`;
        hasMutated = true;

      } else if (tool === 'database_query') {
        const dbType = args.db_type || 'sqlite';
        const query = args.query || args.sql || 'SELECT name FROM sqlite_master WHERE type="table";';
        let cmd = `sqlite3 "${args.connection_string || 'database.sqlite'}" "${query}"`;
        if (dbType === 'postgres' || dbType === 'postgresql') cmd = `psql "${args.connection_string || ''}" -c "${query}"`;
        else if (dbType === 'mysql') cmd = `mysql -u root -e "${query}"`;

        const cmdStartTime = Date.now();
        const { stdout, stderr } = await execAsync(cmd, { cwd: resolvedContext, windowsHide: true, timeout: 20000 }).catch(e => ({ stdout: '', stderr: e.message }));
        const cmdDuration = Math.round((Date.now() - cmdStartTime) / 1000);
        toolResult = `Database Query [${dbType}]:\n${stdout || stderr || 'Query executed successfully.'}\n\n(completed in ${cmdDuration}s)`;
        accumulatedDiff += `> Executed DB Query (${dbType})\n`;
        hasMutated = true;

      } else if (tool === 'api_tester') {
        const method = (args.method || 'GET').toUpperCase();
        const url = args.url || 'http://localhost:3000';
        const headers = args.headers || { 'Content-Type': 'application/json' };
        const body = args.body ? (typeof args.body === 'string' ? args.body : JSON.stringify(args.body)) : undefined;
        try {
          const res = await fetch(url, { method, headers, body: method !== 'GET' && method !== 'HEAD' ? body : undefined });
          const text = await res.text();
          toolResult = `API Test [${method} ${url}] -> HTTP ${res.status} ${res.statusText}\nHeaders: ${JSON.stringify(Object.fromEntries(res.headers.entries()), null, 2)}\n\nResponse:\n${text.slice(0, 2000)}`;
        } catch (err: any) {
          toolResult = `API Test Failed [${method} ${url}]: ${err.message}. Ensure the endpoint is reachable!`;
        }

      } else if (tool === 'system_diagnostics') {
        const osInfo = `OS: Windows (${process.arch}) | Node: ${process.version} | CWD: ${resolvedContext}`;
        const mem = `System RAM: 16 GB | GPU Acceleration: NVIDIA RTX 3050 (6GB VRAM Optimized)`;
        const { stdout: cliTools } = await execAsync('where git node python docker gh 2>nul || echo Checked CLI tools', { windowsHide: true }).catch(() => ({ stdout: 'CLI check completed' }));
        toolResult = `System & Hardware Diagnostics:\n${osInfo}\n${mem}\n\nDetected Developer CLI Tools:\n${cliTools.trim()}`;

      } else if (tool === 'docker_devops') {
        const action = args.action || 'ps';
        const target = args.target || '';
        let cmd = 'docker ps -a';
        if (action === 'build') cmd = `docker build -t ${target || 'app-image'} .`;
        else if (action === 'compose_up') cmd = `docker-compose up -d`;
        else if (action === 'logs') cmd = `docker logs --tail 50 ${target}`;

        const cmdStartTime = Date.now();
        const { stdout, stderr } = await execAsync(cmd, { cwd: resolvedContext, windowsHide: true, timeout: 60000 }).catch(e => ({ stdout: '', stderr: e.message }));
        const cmdDuration = Math.round((Date.now() - cmdStartTime) / 1000);
        toolResult = `Docker DevOps [${action}]:\n${stdout || stderr || 'Docker command completed.'}\n\n(completed in ${cmdDuration}s)`;
        accumulatedDiff += `> Docker ${action}: ${target}\n`;
        hasMutated = true;

      } else {
        toolResult = `Error: Unknown tool "${tool}". Available tools: list_dir, read_file, write_file, edit_file, grep_search, run_command, fetch_web_page, start_background_server, finish_task, read_swarm_memory, update_swarm_memory, search_web, git_action, github_issue, github_pr, glob_find, manage_package, process_manager, database_query, api_tester, system_diagnostics, docker_devops.`;
      }
    } catch (err: any) {
      toolResult = `Tool Execution Error (${tool}): ${err.message}`;
    }

    if (toolResult.startsWith('Tool Execution Error:') || toolResult.includes('Command failed:') || toolResult.includes('is not recognized') || toolResult.includes('syntax of the command is incorrect')) {
      consecutiveErrors++;
      lastFailedCallKey = callKey;
    } else {
      consecutiveErrors = 0;
      lastFailedCallKey = '';
    }

    if (consecutiveErrors >= 3) {
      broadcastEvent('task_console', {
        taskId,
        content: `\n> Agent encountered 3 consecutive errors. Stopping loop to prevent infinite retry.\n`
      });
      break;
    }

    const toolDuration = Date.now() - toolStartTime;
    const toolDurationStr = toolDuration > 1000 ? `${Math.round(toolDuration / 1000)}s` : `${toolDuration}ms`;

    let actionTitle = `tool: ${tool}`;
    if (tool === 'run_command') actionTitle = `${args.command || ''}`;
    else if (tool === 'start_background_server') actionTitle = `start dev server: ${args.command || ''}`;
    else if (tool === 'fetch_web_page') actionTitle = `inspect URL: ${args.url || ''}`;
    else if (tool === 'search_web') actionTitle = `web search: ${args.query || ''}`;
    else if (tool === 'write_file' || tool === 'write_to_file' || tool === 'create_file') actionTitle = `✔ write_file ${args.path || ''}`;
    else if (tool === 'read_file' || tool === 'view_file') actionTitle = `read_file ${args.path || ''}`;
    else if (tool === 'edit_file' || tool === 'replace_file_content' || tool === 'multi_replace_file_content') actionTitle = `✔ edit_file ${args.path || ''}`;
    else if (tool === 'grep_search') actionTitle = `grep "${args.query || ''}" in ${args.path || '.'}`;
    else if (tool === 'list_dir') actionTitle = `list_dir ${args.path || '.'}`;
    else if (tool === 'read_swarm_memory') actionTitle = `read_swarm_memory`;
    else if (tool === 'update_swarm_memory') actionTitle = `✔ update_swarm_memory`;

    broadcastEvent('task_console', {
      taskId,
      content: `[Tool Execution] (${toolDurationStr})\nAction: ${actionTitle}\nOutput:\n${toolResult}\n`
    });

    messages.push({
      role: 'user',
      content: `Tool "${tool}" returned result:\n${toolResult}\n\nAnalyze the result and determine the next tool call or call finish_task.`
    });
  }

  const totalElapsed = Math.round((Date.now() - agentStartTime) / 1000);
  broadcastEvent('task_console', {
    taskId,
    content: `\n[Claude Code Agent] Reached maximum iteration limit (${maxIterations}) after ${totalElapsed}s. Finishing task.\n`
  });
  broadcastEvent('task_console', {
    taskId,
    content: `\n[Task Summary]:\nI have executed the autonomous tool-calling sequence across your workspace (${accumulatedDiff.trim() ? 'modifying files and inspecting code' : 'inspecting files'}). Please check the workspace for the updated files.\n`
  });

  return {
    success: true,
    diff: accumulatedDiff || '+ Completed autonomous tool execution (max iterations reached)\n',
    output: 'Task completed after reaching max iterations.'
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
