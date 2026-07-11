import React, { useState, useEffect, useRef, Suspense } from 'react';
import { Button } from './components/ui/button';
import { Input } from './components/ui/input';
import { Tooltip, TooltipContent, TooltipTrigger } from './components/ui/tooltip';

const FileEditor = React.lazy(() => import('./components/FileEditor'));
const FileTree = React.lazy(() => import('./components/FileTree'));
import TerminalEmulator from './components/TerminalEmulator';
import InlineDiffEditor from './components/InlineDiffEditor';
import { motion, AnimatePresence } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  FolderOpen,
  FileText,
  SpinnerGap,
  PaperPlaneRight,
  CaretLeft,
  Paperclip,
  Folder,
  X,
  Lightning,
  Pulse,
  CaretRight,
  Square,
  Sparkle,
  ArrowUp,
  ArrowsClockwise,
  MagicWand,
  Coffee,
  Faders,
  Pencil,
  Ghost,
  Smiley,
  Alien,
  Cat,
  Sun,
  Moon,
  Cpu,
  HardDrives,
  TreeStructure,
  Stack,
  TerminalWindow,
  WarningCircle,
  MagnifyingGlass,
  FolderPlus,
  Plus,
  ShareNetwork,
  Brain,
  Users,
  Code,
  Lightbulb,
  CircleDashed,
  FileJs,
  FileTs,
  FilePy,
  FileHtml,
  FileCss,
  FileDoc,
  FileImage,
  FileCode,
  Trash,
  Check,
  ArrowCounterClockwise,
  Copy,
  Cube,
  ArrowUUpLeft,
  Play,
  DownloadSimple,
  CheckCircle,
  Warning,
  Wrench,
  Robot,
  ShieldCheck,
  GithubLogo,
  UploadSimple,
  Bug,
  GitBranch,
  GitPullRequest,
  GitCommit,
  GitMerge,
  ListChecks,
  Rocket,
  CaretDown,
  Question,
  House,
  Desktop,
  FolderSimple,
  ArrowClockwise,
  Eye,
  EyeSlash,
  Clock,
  CloudArrowUp,
  ImageSquare,
  ArrowRight,
  ArrowsOut,
  Gauge,
  ChartLineUp,
  PencilSimple,
} from '@phosphor-icons/react';
import ImageEditorModal from './components/ImageEditorModal';

function CollapsibleThought({
  content,
  isRunning,
  task,
}: {
  content: string;
  isRunning?: boolean;
  task?: any;
}) {
  const [expandedCards, setExpandedCards] = useState<Record<number, boolean>>({});
  const [elapsed, setElapsed] = useState(0);
  const [isTimelineExpanded, setIsTimelineExpanded] = useState(!!isRunning);

  const toggleCard = (idx: number) => {
    setExpandedCards((prev) => ({ ...prev, [idx]: !prev[idx] }));
  };

  useEffect(() => {
    let timer: any;
    if (isRunning) {
      const initialElapsed = task?.createdAt
        ? Math.floor((Date.now() - new Date(task.createdAt).getTime()) / 1000)
        : 0;
      setElapsed(initialElapsed);
      timer = setInterval(() => setElapsed((e) => e + 1), 1000);
      setIsTimelineExpanded(true);
    } else {
      // If finished, calculate exact total time from database timestamps
      if (
        task?.createdAt &&
        task?.updatedAt &&
        task.status !== 'queued' &&
        task.status !== 'ready'
      ) {
        const created = new Date(task.createdAt).getTime();
        let updated = new Date(task.updatedAt).getTime();
        // Fallback if updated is somehow before created or not set properly
        if (updated <= created) updated = Date.now();
        setElapsed(Math.max(0, Math.floor((updated - created) / 1000)));
      }
      setIsTimelineExpanded(false);
    }
    return () => clearInterval(timer);
  }, [isRunning, task?.createdAt, task?.updatedAt, task?.status]);

  // Parse content into structured blocks: thinking, tool calls, system messages
  const rawLines = content
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l !== '' && !l.includes('Agent is thinking'));

  type Block =
    | { type: 'thinking'; text: string }
    | { type: 'tool'; name: string; detail: string; output: string; isLast: boolean }
    | { type: 'system'; text: string; variant: 'info' | 'error' | 'success' | 'iteration' }
    | { type: 'command'; cmd: string; output: string; isLast: boolean };

  const blocks: Block[] = [];
  let i = 0;

  while (i < rawLines.length) {
    let line = rawLines[i]
      .replace(/^---\s*\[Iteration.*?\]\s*.*?\s*---$/i, '')
      .replace(/^\[Thought\]:?\s*/i, '')
      .replace(/^\[Main Agent\]:?\s*/i, '')
      .replace(/^\[Claude Code Agent\]:?\s*/i, '')
      .replace(/[⏳🧠✅❌🤖🏗️💻🧪🚀⚠️⏹️▶️📦💬🖥️]/g, '')
      .trim();

    if (!line) {
      i++;
      continue;
    }

    // System messages
    if (line.includes('[System]')) {
      blocks.push({ type: 'system', text: line.replace(/\[System\]\s*/i, ''), variant: 'info' });
      i++;
      continue;
    }
    if (line.toLowerCase().includes('error') || line.toLowerCase().includes('crashed')) {
      blocks.push({ type: 'system', text: line.replace(/\[ERROR\]\s*/i, ''), variant: 'error' });
      i++;
      continue;
    }
    if (line.includes('[Verifier]') || line.includes('Completed task verification')) {
      blocks.push({
        type: 'system',
        text: line.replace(/\[Verifier\]\s*/i, ''),
        variant: 'success',
      });
      i++;
      continue;
    }
    if (line.includes('[Phase')) {
      blocks.push({
        type: 'system',
        text: line.replace(/\[Phase[^\]]+\]\s*/i, ''),
        variant: 'info',
      });
      i++;
      continue;
    }
    if (line.includes('[Iteration')) {
      let cleanLine = line.replace(/\[Iteration[^\]]+\]\s*/i, '');
      cleanLine = cleanLine
        .replace(/Requesting LLM inference from .*?\.\.\. \(\d+s elapsed\)/i, '')
        .trim();

      if (!cleanLine && isRunning && i === rawLines.length - 1) {
        cleanLine = `Thinking... (${elapsed}s)`;
      } else if (!cleanLine) {
        cleanLine = 'Thinking...';
      }

      blocks.push({ type: 'system', text: cleanLine, variant: 'iteration' });
      i++;
      continue;
    }

    // [Tool Execution] blocks
    if (line.startsWith('[Tool Execution]')) {
      // Find Action and Output
      let actionName = 'Tool Execution';
      let outputText = '';
      let j = i + 1;

      while (j < rawLines.length && !rawLines[j].startsWith('[') && !rawLines[j].startsWith('> ')) {
        if (rawLines[j].startsWith('Action:')) {
          actionName = rawLines[j].replace('Action:', '').replace('>', '').trim();
        } else if (rawLines[j].startsWith('Output:')) {
          // Collect all following lines as output until the next marker
          let k = j + 1;
          const outLines = [];
          while (
            k < rawLines.length &&
            !rawLines[k].startsWith('[') &&
            !rawLines[k].startsWith('> ')
          ) {
            outLines.push(rawLines[k]);
            k++;
          }
          outputText = outLines.join('\n').trim();
          j = k - 1; // advance j to end of output
        }
        j++;
      }
      blocks.push({
        type: 'command',
        cmd: actionName,
        output: outputText,
        isLast: j === rawLines.length,
      });
      i = j;
      continue;
    }

    // [Command Output] blocks
    if (line.startsWith('[Command Output]')) {
      let k = i + 1;
      const outLines = [];
      while (k < rawLines.length && !rawLines[k].startsWith('[') && !rawLines[k].startsWith('> ')) {
        outLines.push(rawLines[k]);
        k++;
      }
      const outputText = outLines.join('\n').trim();

      // Try to attach this output to the previous command block if it exists
      const lastBlock = blocks[blocks.length - 1];
      if (lastBlock && lastBlock.type === 'command' && !lastBlock.output) {
        lastBlock.output = outputText;
      } else {
        blocks.push({
          type: 'command',
          cmd: 'Command Output',
          output: outputText,
          isLast: k === rawLines.length,
        });
      }

      i = k;
      continue;
    }

    // Direct tool call summaries (e.g. "> Executing command: ...")
    if (line.startsWith('>')) {
      const cmd = line.slice(1).trim();
      blocks.push({ type: 'command', cmd, output: '', isLast: i === rawLines.length - 1 });
      i++;
      continue;
    }

    // Tool Call payload block
    if (line.startsWith('[Tool Call]')) {
      const toolName = line
        .replace(/^\[Tool Call\]:?\s*/i, '')
        .replace(/\(\{.*?\}\)/, '')
        .trim();
      blocks.push({
        type: 'tool',
        name: toolName,
        detail: '',
        output: '',
        isLast: i === rawLines.length - 1,
      });
      i++;
      continue;
    }

    // Misc tool execution summaries (Wrote file, Edited file, etc)
    if (
      line.startsWith('Successfully wrote') ||
      line.startsWith('Wrote file') ||
      line.startsWith('Edited file') ||
      line.startsWith('Reading file') ||
      line.startsWith('Searching codebase') ||
      line.startsWith('Spawned sub-agent') ||
      line.startsWith('Creating') ||
      line.startsWith('Inspecting')
    ) {
      blocks.push({
        type: 'tool',
        name: line,
        detail: '',
        output: '',
        isLast: i === rawLines.length - 1,
      });
      i++;
      continue;
    }

    // Everything else is thinking text
    const lastBlock = blocks[blocks.length - 1];
    if (lastBlock && lastBlock.type === 'thinking') {
      lastBlock.text += '\n' + line;
    } else {
      blocks.push({ type: 'thinking', text: line });
    }
    i++;
  }

  if (blocks.length === 0) return null;

  // Get tool/command icons
  const getToolIcon = (name: string) => {
    const lower = name.toLowerCase();
    if (
      lower.includes('command') ||
      lower.includes('server') ||
      lower.includes('docker') ||
      lower.includes('git action') ||
      lower.includes('package')
    )
      return { icon: TerminalWindow, color: 'text-[#10B981]' };
    if (
      lower.includes('wrote') ||
      lower.includes('created') ||
      lower.includes('edited') ||
      lower.includes('creating')
    )
      return { icon: PencilSimple, color: 'text-[#F59E0B]' };
    if (lower.includes('reading') || lower.includes('inspecting'))
      return { icon: Eye, color: 'text-[#3B82F6]' };
    if (lower.includes('searching') || lower.includes('search'))
      return { icon: MagnifyingGlass, color: 'text-[#8B5CF6]' };
    if (lower.includes('sub-agent') || lower.includes('spawned'))
      return { icon: TreeStructure, color: 'text-[#EC4899]' };
    return { icon: Code, color: 'text-[#3B82F6]' };
  };

  return (
    <div className="my-2 font-sans w-full space-y-0.5">
      <button
        type="button"
        onClick={() => setIsTimelineExpanded(!isTimelineExpanded)}
        className="flex items-center gap-2 text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors text-[13px] font-medium py-1.5 w-max cursor-pointer bg-transparent border-none outline-none mb-1"
      >
        {isRunning && (
          <SpinnerGap
            size={14}
            className="animate-spin text-zinc-500 dark:text-zinc-400 shrink-0"
          />
        )}
        <span className="text-gray-500">
          {isRunning
            ? `Working on this for ${elapsed >= 60 ? Math.floor(elapsed / 60) + 'm ' + (elapsed % 60) + 's' : elapsed + 's'}...`
            : elapsed > 0
              ? `Worked for ${elapsed >= 60 ? Math.floor(elapsed / 60) + 'm ' + (elapsed % 60) + 's' : elapsed + 's'}`
              : `Worked for ${elapsed}s`}
        </span>
        <CaretDown
          size={12}
          weight="bold"
          className={`transition-transform duration-300 shrink-0`}
          style={{ transform: isTimelineExpanded ? 'rotate(180deg)' : 'rotate(-90deg)' }}
        />
      </button>

      <div
        style={{
          maxHeight: isTimelineExpanded ? '5000px' : '0',
          opacity: isTimelineExpanded ? 1 : 0,
          overflow: 'hidden',
          transition: 'all 0.4s ease-in-out',
        }}
      >
        <div className="pl-1 py-1 space-y-0.5">
          {blocks.map((block, idx) => {
            const isExpanded = expandedCards[idx] || false;

            if (block.type === 'thinking') {
              return (
                <div key={idx} className="flex flex-col">
                  <button
                    type="button"
                    onClick={() => toggleCard(idx)}
                    className="flex items-center gap-2 text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors text-[13px] font-medium py-1.5 w-max cursor-pointer bg-transparent border-none outline-none"
                  >
                    <span>Thought process</span>
                    <CaretDown
                      size={12}
                      weight="bold"
                      className={`transition-transform duration-200 shrink-0`}
                      style={{ transform: isExpanded ? 'rotate(180deg)' : 'rotate(-90deg)' }}
                    />
                  </button>
                  <div
                    style={{
                      maxHeight: isExpanded ? '1000px' : '0',
                      opacity: isExpanded ? 1 : 0,
                      transition: 'max-height 0.3s ease-in-out, opacity 0.2s ease-in-out',
                      overflow: 'hidden',
                    }}
                  >
                    <div className="pl-4 py-2 text-[13.5px] text-[#71717A] leading-relaxed font-normal whitespace-pre-wrap border-l-2 border-[#27272A] ml-1.5 my-1">
                      {block.text}
                    </div>
                  </div>
                </div>
              );
            }

            if (block.type === 'system') {
              if (block.variant === 'iteration') {
                return (
                  <div key={idx} className="flex items-center gap-2 py-1">
                    <span className="text-[13.5px] font-sans italic text-zinc-500 dark:text-zinc-400">
                      {block.text}
                    </span>
                  </div>
                );
              }
              return (
                <div
                  key={idx}
                  className="flex items-center gap-2 text-[12px] font-mono font-medium text-zinc-500 dark:text-zinc-400 py-1 opacity-80"
                >
                  <span>{block.text}</span>
                </div>
              );
            }

            if (block.type === 'command') {
              const isActive = isRunning && block.isLast;
              const _isExpanded = expandedCards[idx] ?? isActive;
              let cmdName = block.cmd
                .replace('Executing command: ', '')
                .replace('Started background server: ', '')
                .replace(/[✓✔]/g, '')
                .trim();

              if (cmdName.startsWith('Using tool:')) {
                cmdName = `Preparing to run ${cmdName.replace('Using tool:', '').trim()}...`;
              }

              return (
                <div key={idx} className="flex flex-col">
                  <button
                    type="button"
                    onClick={() => (block.output || isActive) && toggleCard(idx)}
                    className={`flex items-center gap-2 text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors text-[13px] font-medium py-1.5 w-max bg-transparent border-none outline-none ${block.output || isActive ? 'cursor-pointer' : 'cursor-default'}`}
                  >
                    {isActive && (
                      <SpinnerGap
                        size={14}
                        className="animate-spin text-zinc-500 dark:text-zinc-400 shrink-0"
                      />
                    )}
                    <span className="font-sans">{cmdName}</span>
                    {(block.output || isActive) && (
                      <CaretDown
                        size={12}
                        weight="bold"
                        className={`text-zinc-500 dark:text-zinc-400 transition-transform duration-200 shrink-0`}
                        style={{ transform: _isExpanded ? 'rotate(180deg)' : 'rotate(-90deg)' }}
                      />
                    )}
                  </button>

                  <div
                    style={{
                      maxHeight: _isExpanded ? '2000px' : '0',
                      opacity: _isExpanded ? 1 : 0,
                      transition: 'max-height 0.3s ease-in-out, opacity 0.2s ease-in-out',
                      overflow: 'hidden',
                    }}
                  >
                    {block.output && (
                      <div className="mt-1 mb-2 ml-1 px-4 py-3 bg-[#18181B] border border-[#27272A] rounded-lg text-[#A1A1AA] text-[12.5px] font-mono leading-relaxed max-h-[350px] overflow-y-auto scrollbar-hide whitespace-pre-wrap shadow-inner w-full">
                        {block.output}
                      </div>
                    )}
                  </div>
                </div>
              );
            }

            if (block.type === 'tool') {
              const isActive = isRunning && block.isLast;
              return (
                <div
                  key={idx}
                  className="flex items-center gap-2 py-1.5 text-[13px] font-medium text-zinc-500 dark:text-zinc-400"
                >
                  {isActive && (
                    <SpinnerGap
                      size={14}
                      className="animate-spin text-zinc-500 dark:text-zinc-400 shrink-0"
                    />
                  )}
                  <span>{block.name}</span>
                </div>
              );
            }

            return null;
          })}

          {/* Streaming indicator at the bottom when running */}
          {isRunning && blocks.length > 0 && blocks[blocks.length - 1].type !== 'system' && (
            <div className="flex items-center gap-2 text-[#A1A1AA] py-2">
              <SpinnerGap size={14} className="animate-spin" />
              <span className="text-[13px] font-medium">Agent is thinking...</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function FormattedOutput({ content }: { content: string }) {
  // Clean up ALL system prefixes cleanly without boxes or borders
  const cleanContent = content
    .replace(/^\[Task Summary\]:?\s*/i, '')
    .replace(/^\[Main Agent Answer\]:?\s*/i, '')
    .replace(/^\[Main Agent\]:?\s*/i, '')
    .replace(/^\[Answer\]:?\s*/i, '')
    .replace(/^\[Output\]:?\s*/i, '')
    .replace(/^\(generated in [0-9]+[a-z]+\):\s*/i, '')
    .trim();

  return (
    <div className="my-4 font-sans text-[16.5px] text-[#111111] dark:text-[#F4F4F5] leading-[1.8] tracking-[-0.01em] antialiased w-full">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ node, ...props }) => (
            <h1
              className="text-[24px] font-bold text-[#111111] dark:text-white mt-6 mb-3 tracking-tight"
              {...props}
            />
          ),
          h2: ({ node, ...props }) => (
            <h2
              className="text-[20px] font-bold text-[#111111] dark:text-white mt-5 mb-2.5 tracking-tight"
              {...props}
            />
          ),
          h3: ({ node, ...props }) => (
            <h3
              className="text-[17px] font-semibold text-[#111111] dark:text-white mt-4 mb-2"
              {...props}
            />
          ),
          p: ({ node, ...props }) => (
            <p
              className="leading-[1.8] mb-4 text-[#111111] dark:text-[#EDEDED] font-normal"
              {...props}
            />
          ),
          ul: ({ node, ...props }) => (
            <ul
              className="list-disc pl-6 mb-4 space-y-2 text-[#111111] dark:text-[#EDEDED]"
              {...props}
            />
          ),
          ol: ({ node, ...props }) => (
            <ol
              className="list-decimal pl-6 mb-4 space-y-2 text-[#111111] dark:text-[#EDEDED]"
              {...props}
            />
          ),
          li: ({ node, ...props }) => <li className="leading-[1.8]" {...props} />,
          strong: ({ node, ...props }) => (
            <strong className="font-bold text-[#111111] dark:text-white" {...props} />
          ),
          a: ({ node, ...props }) => (
            <a
              className="text-[#3B82F6] hover:underline"
              target="_blank"
              rel="noopener noreferrer"
              {...props}
            />
          ),
          table: ({ node, ...props }) => (
            <div className="overflow-x-auto my-4">
              <table className="w-full text-left" {...props} />
            </div>
          ),
          thead: ({ node, ...props }) => (
            <thead className="text-[#18181B] dark:text-[#F4F4F5]" {...props} />
          ),
          tbody: ({ node, ...props }) => (
            <tbody className="text-[#3F3F46] dark:text-[#D4D4D8]" {...props} />
          ),
          tr: ({ node, ...props }) => (
            <tr
              className="hover:bg-[#FAFAFA] dark:hover:bg-[#111111] transition-colors"
              {...props}
            />
          ),
          th: ({ node, ...props }) => <th className="px-4 py-2 font-semibold text-sm" {...props} />,
          td: ({ node, ...props }) => <td className="px-4 py-2 text-sm" {...props} />,
          code({ node, inline, className, children, ...props }: any) {
            const match = /language-(\w+)/.exec(className || '');
            return !inline && match ? (
              <div className="my-3 bg-[#F8FAFC] dark:bg-black border border-[#E2E8F0] dark:border-transparent rounded-md overflow-hidden">
                <div className="bg-[#F1F5F9] dark:bg-black px-3 py-1.5 border-b border-[#E2E8F0] dark:border-transparent flex items-center justify-between">
                  <span className="text-[11px] font-bold text-[#64748B] dark:text-[#A1A1AA] uppercase tracking-wider">
                    {match[1]}
                  </span>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(String(children).replace(/\n$/, ''));
                    }}
                    className="flex items-center gap-1.5 text-[11px] font-medium text-[#64748B] hover:text-[#0F172A] dark:text-[#A1A1AA] dark:hover:text-white transition-colors"
                    title="Copy Code"
                  >
                    <Copy size={13} weight="bold" /> Copy
                  </button>
                </div>
                <div className="p-3 overflow-x-auto">
                  <pre className="text-[#0F172A] dark:text-[#E4E4E7] whitespace-pre-wrap font-mono text-[13px] leading-relaxed">
                    <code {...props} className={className}>
                      {children}
                    </code>
                  </pre>
                </div>
              </div>
            ) : (
              <code
                className="bg-[#F4F4F5] dark:bg-white/[0.04] text-[#18181B] dark:text-[#F4F4F5] px-1.5 py-0.5 rounded text-[13px] font-mono font-medium"
                {...props}
              >
                {children}
              </code>
            );
          },
        }}
      >
        {cleanContent}
      </ReactMarkdown>
    </div>
  );
}

function ToolExecutionOutput({ content }: { content: string }) {
  const [isOpen, setIsOpen] = useState(false);
  let actionText = '';
  let outputText = '';
  let timingText = '';

  // Extract timing info from [Tool Execution] (Xs) format
  const timingMatch = content.match(/\[Tool Execution\]\s*\(([^)]+)\)/);
  if (timingMatch) timingText = timingMatch[1];

  if (content.includes('Action:') && content.includes('Output:')) {
    const parts = content.split('Output:');
    actionText = parts[0]
      .replace(/^\[Tool Execution\](?:\s*\([^)]*\))?:?\s*/i, '')
      .replace(/^\[Tool Result\]:?\s*/i, '')
      .replace(/Action:\s*/i, '')
      .trim();
    outputText = parts.slice(1).join('Output:').trim();
  } else {
    const clean = content
      .replace(/^\[Tool Execution\](?:\s*\([^)]*\))?:?\s*/i, '')
      .replace(/^\[Tool Result\]:?\s*/i, '')
      .replace(/^\[Main Agent\]:?\s*/i, '')
      .trim();
    const lines = clean.split('\n');
    if (lines.length === 1) {
      actionText = lines[0];
      outputText = '';
    } else {
      actionText = lines[0].startsWith('>') ? lines[0].slice(1).trim() : lines[0];
      outputText = lines.slice(1).join('\n').trim();
    }
  }

  if (!actionText && !outputText) return null;

  let IconComponent = TerminalWindow;
  let iconColor = 'text-[#71717A]';

  if (actionText.includes('[System]')) {
    IconComponent = TerminalWindow;
    iconColor = 'text-[#3B82F6]';
    actionText = actionText.replace(/\[System\]\s*/i, '');
  } else if (actionText.includes('[Verifier]')) {
    IconComponent = ShieldCheck;
    iconColor = 'text-[#10B981]';
    actionText = actionText.replace(/\[Verifier\]\s*/i, '');
  } else if (actionText.includes('[Iteration')) {
    IconComponent = Brain;
    iconColor = 'text-[#8B5CF6]';
    actionText = actionText.replace(/\[Iteration[^\]]+\]\s*/i, '');
  } else if (actionText.includes('[Phase')) {
    IconComponent = TreeStructure;
    iconColor = 'text-[#F59E0B]';
    actionText = actionText.replace(/\[Phase[^\]]+\]\s*/i, '');
  } else if (actionText.includes('[Main Agent]')) {
    IconComponent = Robot;
    iconColor = 'text-[#8B5CF6]';
    actionText = actionText.replace(/\[Main Agent\]\s*/i, '');
  } else if (
    actionText.toLowerCase().includes('error') ||
    actionText.toLowerCase().includes('crashed')
  ) {
    IconComponent = WarningCircle;
    iconColor = 'text-[#EF4444]';
    actionText = actionText.replace(/\[ERROR\]\s*/i, '');
  } else if (actionText.includes('[SUCCESS]')) {
    IconComponent = CheckCircle;
    iconColor = 'text-[#10B981]';
    actionText = actionText.replace(/\[SUCCESS\]\s*/i, '');
  } else if (actionText.includes('[WARNING]')) {
    IconComponent = Warning;
    iconColor = 'text-[#F59E0B]';
    actionText = actionText.replace(/\[WARNING\]\s*/i, '');
  } else if (actionText.includes('[STOPPED]')) {
    IconComponent = Square;
    iconColor = 'text-[#EF4444]';
    actionText = actionText.replace(/\[STOPPED\]\s*/i, '');
  } else {
    IconComponent = Wrench;
    iconColor = 'text-[#71717A]';
  }

  const lineCount = outputText ? outputText.split('\n').length : 0;

  return (
    <div className="my-1.5 font-sans text-[14px] border-l-2 border-[#E4E4E7] dark:border-transparent ml-2 pl-3">
      <button
        onClick={() => {
          if (outputText) setIsOpen(!isOpen);
        }}
        className={`flex items-start gap-2 py-0.5 select-none text-left font-sans text-[14px] w-full ${outputText ? 'text-[#71717A] dark:text-[#A1A1AA] hover:text-[#52525B] dark:hover:text-[#F4F4F5] transition-colors cursor-pointer font-medium' : 'text-[#18181B] dark:text-[#D4D4D8] cursor-default font-bold'}`}
      >
        <div className="mt-[2px] shrink-0">
          <IconComponent size={15} weight="duotone" className={`${iconColor}`} />
        </div>
        <div className="flex-1 leading-[1.6]">
          <span className="tracking-tight">{actionText}</span>
          {timingText && (
            <span className="text-[10.5px] font-mono font-medium text-[#3B82F6] bg-[#EFF6FF] dark:bg-[#1E3A8A]/30 dark:text-[#60A5FA] px-1.5 py-0.5 rounded ml-1.5 whitespace-nowrap align-middle">
              {timingText}
            </span>
          )}
          {lineCount > 0 && (
            <span className="text-[12px] font-normal text-[#71717A] dark:text-[#A1A1AA] ml-1.5 font-mono whitespace-nowrap align-middle">
              ({lineCount} {lineCount === 1 ? 'line' : 'lines'})
            </span>
          )}
        </div>
      </button>

      {isOpen && outputText && (
        <div className="mt-1">
          <div className="py-1 text-[#71717A] dark:text-[#A1A1AA] text-[13px] whitespace-pre-wrap leading-[1.7] tracking-normal font-mono select-text bg-[#F4F4F5] dark:bg-[#121212] p-3 rounded-md border border-[#E4E4E7] dark:border-[#1F1F1F]">
            {outputText}
          </div>
        </div>
      )}
    </div>
  );
}

function UnifiedInteractionPanel({
  question,
  placeholder,
  options,
  isSecret,
  multiSelect,
  inputType,
  formSchema,
  onSendAnswer,
  disabled,
}: {
  question: string;
  placeholder?: string;
  options?: string[];
  isSecret?: boolean;
  multiSelect?: boolean;
  inputType?: 'text' | 'file' | 'directory' | 'form';
  formSchema?: any;
  onSendAnswer: (answer: string) => void;
  disabled?: boolean;
}) {
  const [value, setValue] = useState('');
  const [selectedOptions, setSelectedOptions] = useState<string[]>([]);
  const [showSecret, setShowSecret] = useState(false);
  const [formData, setFormData] = useState<Record<string, any>>({});

  return (
    <div className="w-full bg-transparent px-1 pt-1 pb-2">
      <div className="flex flex-col gap-1.5">
        <div className="text-[11px] font-mono font-bold text-[#EAB308] uppercase tracking-wider">
          Input Required
        </div>
        <div className="text-[14px] font-sans font-medium text-[#18181B] dark:text-white leading-relaxed">
          {question}
        </div>
      </div>

      <div className="mt-2.5">
        {options && options.length > 0 ? (
          multiSelect ? (
            <div className="flex flex-col gap-2 pl-2">
              {options.map((opt) => (
                <label key={opt} className="flex items-center gap-2.5 cursor-pointer group w-max">
                  <input
                    type="checkbox"
                    checked={selectedOptions.includes(opt)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedOptions([...selectedOptions, opt]);
                      } else {
                        setSelectedOptions(selectedOptions.filter((o) => o !== opt));
                      }
                    }}
                    disabled={disabled}
                    className="w-3.5 h-3.5 rounded-sm border-gray-300 dark:border-gray-600 text-[#3B82F6] focus:ring-[#3B82F6] bg-transparent cursor-pointer transition-colors"
                  />
                  <span className="text-[13.5px] font-medium text-[#18181B] dark:text-[#E4E4E7] group-hover:text-[#3B82F6] transition-colors select-none">
                    {opt}
                  </span>
                </label>
              ))}
              <div className="mt-2.5">
                <button
                  type="button"
                  onClick={() => onSendAnswer(JSON.stringify(selectedOptions))}
                  disabled={disabled || selectedOptions.length === 0}
                  className="px-4 py-1.5 rounded-md text-[12px] font-bold tracking-wide uppercase bg-[#3B82F6] text-white hover:bg-[#2563EB] disabled:opacity-50 transition-colors shadow-sm cursor-pointer"
                >
                  Submit Selection
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-1.5 pl-2">
              {options.map((opt) => (
                <button
                  type="button"
                  key={opt}
                  onClick={() => {
                    setValue(opt);
                    onSendAnswer(opt);
                  }}
                  disabled={disabled}
                  className="text-left text-[13.5px] font-medium text-[#3B82F6] hover:text-[#2563EB] dark:text-[#60A5FA] dark:hover:text-[#93C5FD] hover:underline underline-offset-2 transition-all disabled:opacity-50"
                >
                  {opt}
                </button>
              ))}
            </div>
          )
        ) : inputType === 'form' && formSchema ? (
          <div className="flex flex-col gap-3 pl-2 max-w-md">
            {Object.entries(formSchema.properties || {}).map(([key, field]: [string, any]) => (
              <div key={key} className="flex flex-col gap-1">
                <label className="text-[12.5px] font-medium text-[#52525B] dark:text-[#A1A1AA]">
                  {field.description || key}{' '}
                  {formSchema.required?.includes(key) && <span className="text-red-500">*</span>}
                </label>
                {field.enum ? (
                  <select
                    value={formData[key] || ''}
                    onChange={(e) => setFormData({ ...formData, [key]: e.target.value })}
                    disabled={disabled}
                    className="w-full bg-white dark:bg-[#18181B] border border-gray-200 dark:border-gray-700 rounded-md px-3 py-1.5 text-[13px] text-[#18181B] dark:text-white focus:outline-none focus:border-[#3B82F6]"
                  >
                    <option value="" disabled>
                      Select {key}...
                    </option>
                    {field.enum.map((opt: string) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type={field.type === 'number' ? 'number' : 'text'}
                    value={formData[key] || ''}
                    onChange={(e) => setFormData({ ...formData, [key]: e.target.value })}
                    placeholder={`Enter ${key}...`}
                    disabled={disabled}
                    className="w-full bg-white dark:bg-[#18181B] border border-gray-200 dark:border-gray-700 rounded-md px-3 py-1.5 text-[13px] text-[#18181B] dark:text-white focus:outline-none focus:border-[#3B82F6]"
                  />
                )}
              </div>
            ))}
            <div className="mt-1">
              <button
                type="button"
                onClick={() => onSendAnswer(JSON.stringify(formData))}
                disabled={disabled || (formSchema.required || []).some((k: string) => !formData[k])}
                className="px-4 py-1.5 rounded-md text-[12px] font-bold tracking-wide uppercase bg-[#3B82F6] text-white hover:bg-[#2563EB] disabled:opacity-50 transition-colors shadow-sm cursor-pointer"
              >
                Submit Form
              </button>
            </div>
          </div>
        ) : isSecret || inputType === 'file' || inputType === 'directory' ? (
          <div className="flex flex-col gap-2 pl-2 max-w-md">
            <div className="relative">
              <input
                type={isSecret && !showSecret ? 'password' : 'text'}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && value.trim()) {
                    onSendAnswer(value);
                  }
                }}
                placeholder={
                  placeholder ||
                  (inputType === 'file'
                    ? 'Enter file path...'
                    : inputType === 'directory'
                      ? 'Enter directory path...'
                      : 'Type answer here...')
                }
                disabled={disabled}
                className="w-full bg-white dark:bg-[#18181B] border border-gray-200 dark:border-gray-700 rounded-md px-3 py-2 text-[13px] text-[#18181B] dark:text-white focus:outline-none focus:border-[#3B82F6] pr-10"
              />
              {isSecret && (
                <button
                  type="button"
                  onClick={() => setShowSecret(!showSecret)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                >
                  {showSecret ? <EyeSlash size={16} /> : <Eye size={16} />}
                </button>
              )}
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => onSendAnswer(value)}
                disabled={disabled || !value.trim()}
                className="px-4 py-1.5 rounded-md text-[12px] font-bold tracking-wide uppercase bg-[#3B82F6] text-white hover:bg-[#2563EB] disabled:opacity-50 transition-colors shadow-sm cursor-pointer"
              >
                Submit
              </button>
              {(inputType === 'file' || inputType === 'directory') && (
                <div className="text-[11px] text-gray-500 self-center">
                  You can also use the '@' menu in the main prompt below.
                </div>
              )}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function FolderPickerModal({
  isOpen,
  onClose,
  onSelect,
  initialPath,
}: {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (path: string) => void;
  initialPath: string;
}) {
  const [currentPath, setCurrentPath] = useState(initialPath);
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [filterQuery, setFilterQuery] = useState('');

  const fetchItems = () => {
    setLoading(true);
    fetch(`/api/files?dir=${encodeURIComponent(currentPath)}`)
      .then(async (r) => {
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then((data) => {
        if (Array.isArray(data)) setItems(data.filter((i) => i.isDirectory));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (isOpen) {
      setFilterQuery('');
      fetchItems();
    }
  }, [currentPath, isOpen]);

  const handleCreateFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFolderName.trim()) return;
    try {
      const res = await fetch('/api/files', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dir: currentPath, name: newFolderName.trim() }),
      });
      if (res.ok) {
        setNewFolderName('');
        setIsCreatingFolder(false);
        fetchItems();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const goUp = () => {
    const parts = currentPath.split(/[\\/]/).filter(Boolean);
    if (parts.length > 1) {
      parts.pop();
      const isWinDrive = /^[a-zA-Z]:/.test(currentPath);
      const newP = currentPath.includes('\\')
        ? parts.join('\\')
        : isWinDrive
          ? parts.join('/')
          : '/' + parts.join('/');
      setCurrentPath(newP || (isWinDrive ? 'C:/' : '/'));
    } else if (parts.length === 1 && currentPath.includes('\\')) {
      setCurrentPath(parts[0] + '\\');
    }
  };

  const pathParts = currentPath.split(/[\\/]/).filter(Boolean);
  const filteredItems = items.filter((i) =>
    i.name.toLowerCase().includes(filterQuery.toLowerCase()),
  );

  const shortcuts = [
    {
      label: 'Home',
      path: 'C:\\Users\\sahaj',
      icon: <House size={16} weight="duotone" className="text-[#111111] dark:text-white" />,
    },
    {
      label: 'Desktop',
      path: 'C:\\Users\\sahaj\\Desktop',
      icon: <Desktop size={16} weight="duotone" className="text-[#111111] dark:text-white" />,
    },
    {
      label: 'Documents',
      path: 'C:\\Users\\sahaj\\Documents',
      icon: <FileText size={16} weight="duotone" className="text-[#111111] dark:text-white" />,
    },
    {
      label: 'Downloads',
      path: 'C:\\Users\\sahaj\\Downloads',
      icon: (
        <DownloadSimple size={16} weight="duotone" className="text-[#111111] dark:text-white" />
      ),
    },
    {
      label: 'C: Drive',
      path: 'C:\\',
      icon: <HardDrives size={16} weight="duotone" className="text-[#111111] dark:text-white" />,
    },
  ];

  return (
    <div
      className="fixed inset-0 bg-black/20 dark:bg-black/40 backdrop-blur-sm z-[100] flex items-center justify-center p-4"
      style={{ animation: 'fadeIn 0.15s ease-out' }}
    >
      <div
        className="w-full max-w-[640px] bg-white dark:bg-[#0A0A0A] border border-[#E5E5E5] dark:border-[#1F1F1F] shadow-2xl rounded-2xl overflow-hidden flex flex-col max-h-[85vh]"
        style={{ animation: 'slideUp 0.2s cubic-bezier(0.23, 1, 0.32, 1)' }}
      >
        {/* Minimalist Header */}
        <div className="px-6 pt-6 pb-2 flex items-center justify-between border-b border-transparent">
          <div className="flex items-center gap-3">
            <h2 className="text-[16px] font-bold text-[#111111] dark:text-white font-sans tracking-tight">
              Select Workspace
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-[#A1A1AA] hover:text-[#111111] dark:hover:text-white p-1 rounded-md transition-colors cursor-pointer"
          >
            <X size={16} weight="bold" />
          </button>
        </div>

        {/* Seamless Shortcuts */}
        <div className="px-6 py-2 flex items-center gap-4 overflow-x-auto scrollbar-hide border-b border-[#E5E5E5]/50 dark:border-[#1F1F1F]/50 pb-3">
          {shortcuts.map((s, i) => (
            <button
              key={i}
              onClick={() => setCurrentPath(s.path)}
              className="flex items-center gap-2 text-[13px] font-sans font-medium text-[#52525B] dark:text-[#A1A1AA] hover:text-[#111111] dark:hover:text-white transition-colors cursor-pointer shrink-0"
            >
              {s.icon}
              <span>{s.label}</span>
            </button>
          ))}
          {(() => {
            try {
              const rec = JSON.parse(localStorage.getItem('warden_recent_workspaces') || '[]');
              if (rec.length === 0) return null;

              const uniqueRec: string[] = [];
              const seen = new Set<string>();
              for (const p of rec) {
                const norm = p.replace(/\\/g, '/').toLowerCase();
                if (!seen.has(norm)) {
                  seen.add(norm);
                  uniqueRec.push(p);
                }
              }

              return uniqueRec.slice(0, 5).map((p: string, i: number) => (
                <button
                  key={`rec-${i}`}
                  onClick={() => setCurrentPath(p)}
                  className="flex items-center gap-2 text-[13px] font-sans font-medium text-[#71717A] dark:text-[#A1A1AA] hover:text-[#111111] dark:hover:text-white transition-colors cursor-pointer shrink-0 truncate max-w-[160px]"
                  title={p}
                >
                  <ArrowCounterClockwise
                    size={15}
                    weight="duotone"
                    className="text-[#111111] dark:text-white opacity-60"
                  />
                  <span>{p.split(/[\\/]/).pop() || p}</span>
                </button>
              ));
            } catch {
              return null;
            }
          })()}
        </div>

        {/* Seamless Breadcrumb Bar */}
        <div className="px-6 pt-4 pb-2 flex items-center gap-2 overflow-x-auto scrollbar-hide">
          <button
            onClick={goUp}
            className="text-[#A1A1AA] hover:text-[#111111] dark:hover:text-white transition-colors shrink-0"
            title="Go up one level"
          >
            <CaretLeft size={16} weight="bold" />
          </button>
          <div className="flex items-center gap-1.5 text-[13px] font-mono text-[#52525B] dark:text-[#A1A1AA] flex-1 overflow-x-auto scrollbar-hide">
            {pathParts.map((part, idx) => {
              const segPath = pathParts
                .slice(0, idx + 1)
                .join(currentPath.includes('\\') ? '\\' : '/');
              return (
                <React.Fragment key={idx}>
                  {idx > 0 && <span className="text-[#D4D4D8] dark:text-[#3F3F46]">/</span>}
                  <button
                    onClick={() =>
                      setCurrentPath(
                        currentPath.includes('\\') && idx === 0 ? segPath + '\\' : segPath,
                      )
                    }
                    className="hover:text-[#111111] dark:hover:text-white transition-colors shrink-0 truncate max-w-[140px] cursor-pointer font-medium"
                  >
                    {part}
                  </button>
                </React.Fragment>
              );
            })}
          </div>
        </div>

        {/* Minimalist Filter Input */}
        <div className="px-6 py-1 flex items-center gap-2 border-b border-[#E5E5E5]/50 dark:border-[#1F1F1F]/50 pb-3">
          <MagnifyingGlass size={15} className="text-[#A1A1AA]" />
          <input
            value={filterQuery}
            onChange={(e) => setFilterQuery(e.target.value)}
            placeholder="Search folders..."
            className="flex-1 bg-transparent border-none outline-none text-[13px] font-sans text-[#111111] dark:text-white placeholder-[#A1A1AA] py-1 focus:ring-0"
          />
        </div>

        {/* Clean Directory List */}
        <div className="flex-1 overflow-y-auto px-4 py-2 min-h-[260px] max-h-[380px]">
          {loading ? (
            <div className="flex flex-col items-center justify-center h-48 gap-3 text-[#A1A1AA]">
              <SpinnerGap
                className="animate-spin text-[#111111] dark:text-white"
                size={24}
                weight="bold"
              />
            </div>
          ) : (
            <div className="space-y-0.5">
              <AnimatePresence>
                {isCreatingFolder && (
                  <form
                    onSubmit={handleCreateFolder}
                    className="w-full flex items-center gap-3 px-3 py-2 bg-black/[0.03] dark:bg-white/[0.03] rounded-lg mb-1"
                  >
                    <FolderPlus
                      size={18}
                      className="text-[#111111] dark:text-white"
                      weight="duotone"
                    />
                    <input
                      autoFocus
                      value={newFolderName}
                      onChange={(e) => setNewFolderName(e.target.value)}
                      placeholder="Folder name..."
                      className="flex-1 text-[13px] font-sans text-[#111111] dark:text-white border-none outline-none focus:ring-0 p-0 bg-transparent"
                      onBlur={() => !newFolderName && setIsCreatingFolder(false)}
                    />
                  </form>
                )}
                {filteredItems.map((item, idx) => (
                  <button
                    key={item.name}
                    onClick={() => {
                      const sep = currentPath.includes('\\') ? '\\' : '/';
                      const newPath = currentPath.endsWith(sep)
                        ? currentPath + item.name
                        : currentPath + sep + item.name;
                      setCurrentPath(newPath);
                      setFilterQuery('');
                    }}
                    className="w-full flex items-center justify-between px-3 py-2 rounded-lg hover:bg-black/[0.03] dark:hover:bg-white/[0.03] transition-colors text-left group cursor-pointer"
                  >
                    <div className="flex items-center gap-3 truncate">
                      <FolderSimple
                        size={18}
                        className="text-[#111111] dark:text-[#A1A1AA] group-hover:text-[#111111] dark:group-hover:text-white transition-colors shrink-0"
                        weight="duotone"
                      />
                      <span className="text-[13px] font-sans text-[#111111] dark:text-white font-medium truncate">
                        {item.name}
                      </span>
                    </div>
                  </button>
                ))}
              </AnimatePresence>
              {filteredItems.length === 0 && !isCreatingFolder && (
                <div className="text-center py-16 text-[13px] font-sans text-[#A1A1AA] flex flex-col items-center gap-3">
                  <FolderOpen
                    size={32}
                    className="opacity-20 text-[#111111] dark:text-white"
                    weight="duotone"
                  />
                  <span className="font-medium">
                    {filterQuery ? `No folders matching "${filterQuery}"` : 'Empty directory'}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Minimalist Footer Action Bar */}
        <div className="px-6 py-4 flex items-center justify-between border-t border-[#E5E5E5] dark:border-[#1F1F1F]">
          <button
            onClick={() => setIsCreatingFolder(true)}
            className="flex items-center gap-1.5 text-[13px] font-sans font-medium text-[#A1A1AA] hover:text-[#111111] dark:hover:text-white transition-colors cursor-pointer shrink-0"
          >
            <Plus size={14} weight="bold" /> <span>New Folder</span>
          </button>

          <div className="flex items-center gap-3 shrink-0">
            <button
              onClick={onClose}
              className="text-[13px] font-sans font-medium text-[#A1A1AA] hover:text-[#111111] dark:hover:text-white px-3 py-2 rounded-lg transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              onClick={() => {
                onSelect(currentPath);
                onClose();
              }}
              className="text-[13px] font-sans font-semibold bg-[#3B82F6] hover:bg-[#2563EB] !text-white px-5 py-2 rounded-lg transition-colors cursor-pointer flex items-center gap-2 shadow-sm"
            >
              Select Directory
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function SketchedPanelPattern({ title, isGlobal = false }: { title: string; isGlobal?: boolean }) {
  return (
    <div
      className={`absolute inset-0 w-full h-full select-none pointer-events-none overflow-hidden ${isGlobal ? 'bg-transparent text-[#111111]/[0.18] dark:text-white/[0.18]' : 'bg-transparent text-[#A1A1AA] dark:text-[#71717A]'}`}
    >
      <svg
        className="absolute inset-0 w-full h-full stroke-current stroke-1 fill-none opacity-60 dark:opacity-70"
        xmlns="http://www.w3.org/2000/svg"
      >
        <style>{`
          
          }
          
          }
          @keyframes pulseNode {
            0%, 100% { transform: scale(1); opacity: 0.75; }
            50% { transform: scale(1.35); opacity: 1; }
          }
          @keyframes floatSubtle {
            0%, 100% { transform: translateY(0px) translateX(0px); }
            33% { transform: translateY(-4px) translateX(2px); }
            66% { transform: translateY(4px) translateX(-2px); }
          }
          
          
          .anim-node {
            transform-origin: center;
            animation: pulseNode 3s ease-in-out infinite;
          }
          .anim-float {
            animation: floatSubtle 12s ease-in-out infinite;
          }
        `}</style>
        <g className="anim-float">
          {isGlobal && (
            <>
              <defs>
                <pattern
                  id="sketch-grid-global"
                  width="48"
                  height="48"
                  patternUnits="userSpaceOnUse"
                >
                  <path
                    d="M 48 0 L 0 0 0 48"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="0.8"
                    strokeDasharray="2 6"
                    className="opacity-30 anim-dash-bg"
                  />
                </pattern>
              </defs>
              <rect width="100%" height="100%" fill="url(#sketch-grid-global)" />
            </>
          )}
          {/* High Quality, Large Scale Global Network Animations removed per user request */}
          {/* Hand-drawn blueprints and node animations removed per user request */}
        </g>
      </svg>
    </div>
  );
}

function FlippableGridCell({
  positionClass,
  title,
  icon: IconComp,
  children,
  fullBleed = false,
  isOpen: externalIsOpen,
  animDelay = 0,
}: {
  positionClass: string;
  title: string;
  icon: any;
  children: React.ReactNode;
  fullBleed?: boolean;
  isOpen?: boolean;
  animDelay?: number;
}) {
  const [isOpen, setIsOpen] = useState(false);

  // Respond to external open/close commands with a staggered delay
  useEffect(() => {
    if (externalIsOpen === undefined) return;
    const timer = setTimeout(() => {
      setIsOpen(externalIsOpen);
    }, animDelay);
    return () => clearTimeout(timer);
  }, [externalIsOpen, animDelay]);

  return (
    <div className={`absolute ${positionClass} pointer-events-auto z-20`}>
      {/* Back Face - Sketched Cover (always rendered, fades out when open) */}
      <div
        onClick={() => setIsOpen(true)}
        className="absolute inset-0 w-full h-full bg-transparent overflow-hidden cursor-pointer group"
        style={{
          opacity: isOpen ? 0 : 1,
          transform: isOpen ? 'scale(1.02)' : 'scale(1)',
          filter: isOpen ? 'blur(4px)' : 'blur(0px)',
          transition:
            'opacity 0.5s cubic-bezier(0.32, 0.72, 0, 1), transform 0.5s cubic-bezier(0.32, 0.72, 0, 1), filter 0.5s cubic-bezier(0.32, 0.72, 0, 1)',
          pointerEvents: isOpen ? 'none' : 'auto',
        }}
        title="Click to open panel"
      >
        <SketchedPanelPattern title={title} />
      </div>

      {/* Front Face - Live Panel (scales up from slightly smaller) */}
      <div
        onContextMenu={(e) => {
          e.preventDefault();
          setIsOpen(false);
        }}
        className={`absolute inset-0 w-full h-full bg-white/[0.03] backdrop-blur-xl rounded-2xl overflow-hidden flex flex-col ${fullBleed ? 'pt-5' : 'p-5'} cursor-default`}
        style={{
          opacity: isOpen ? 1 : 0,
          transform: isOpen ? 'scale(1)' : 'scale(0.92)',
          filter: isOpen ? 'blur(0px)' : 'blur(6px)',
          transition:
            'opacity 0.5s cubic-bezier(0.32, 0.72, 0, 1), transform 0.6s cubic-bezier(0.32, 0.72, 0, 1), filter 0.5s cubic-bezier(0.32, 0.72, 0, 1)',
          pointerEvents: isOpen ? 'auto' : 'none',
        }}
      >
        {/* Header */}
        <div
          className={`flex items-center justify-between shrink-0 mb-4 ${fullBleed ? 'px-5' : ''}`}
        >
          <div className="flex items-center gap-2">
            <h2 className="text-[11px] font-semibold text-white/40 uppercase tracking-widest font-sans">
              {title}
            </h2>
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setIsOpen(false);
            }}
            className="p-1 rounded-md text-[#71717A] hover:text-[#111111] dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
            title={`Close ${title}`}
          >
            <X size={14} weight="bold" />
          </button>
        </div>
        <div
          className={`flex-1 flex flex-col min-h-0 relative z-10 overflow-y-auto scrollbar-hide ${fullBleed ? 'w-full px-1 pb-2' : ''}`}
        >
          {children ? (
            children
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-[#A1A1AA] text-[12px] font-medium">
              No component data attached.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ChangedFilesPanel({
  gitStatus,
  onSelectFile,
  contextDir,
  fetchGitStatus,
  onOpenConnectModal,
  autoCommitEnabled,
  setAutoCommitEnabled,
  userIdentity,
  onUpdateIdentity,
}: any) {
  if (!gitStatus.isRepo) {
    return (
      <div className="flex flex-col h-full items-center justify-center text-[12.5px] font-sans text-[#A1A1AA] opacity-80 gap-2">
        <GitBranch size={22} weight="duotone" className="text-[#A1A1AA]/50" />
        <span>Not a git repository</span>
      </div>
    );
  }

  const files = gitStatus.modifiedFiles || [];
  const statusColor = (s: string) => {
    if (s === 'M') return 'text-[#F59E0B]';
    if (s === 'A' || s === '??') return 'text-[#10B981]';
    if (s === 'D') return 'text-[#EF4444]';
    if (s === 'R') return 'text-[#3B82F6]';
    return 'text-[#A1A1AA]';
  };
  const statusLabel = (s: string) => {
    if (s === 'M') return 'M';
    if (s === 'A') return 'A';
    if (s === '??') return 'U';
    if (s === 'D') return 'D';
    if (s === 'R') return 'R';
    return s;
  };

  return (
    <div className="flex flex-col h-full font-sans select-none">
      {/* Branch header */}
      <div className="flex items-center justify-between px-3 pb-2 shrink-0">
        <div className="flex items-center gap-1.5 min-w-0">
          <GitBranch size={13} weight="bold" className="text-[#3B82F6] shrink-0" />
          <span className="text-[12px] font-bold font-mono text-[#111111] dark:text-white truncate">
            {gitStatus.branch || 'main'}
          </span>
        </div>
        <span
          className={`text-[10px] font-mono font-bold ${files.length > 0 ? 'text-[#F59E0B]' : 'text-[#10B981]'}`}
        >
          {files.length > 0 ? `${files.length} changed` : 'Clean'}
        </span>
      </div>
      {/* File list */}
      <div className="flex-1 overflow-y-auto scrollbar-hide px-1">
        {files.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 py-6">
            <Check size={28} className="text-[#10B981]/40" />
            <div className="text-[12.5px] font-sans text-white/50">Working tree clean</div>
            <button
              onClick={() => fetchGitStatus && fetchGitStatus()}
              className="px-3 py-1.5 bg-white/5 hover:bg-white/10 text-white/70 text-[11px] rounded-lg transition-colors border border-white/10"
            >
              Refresh Status
            </button>
          </div>
        ) : (
          <div className="space-y-0.5">
            {files.map((f: any, i: number) => {
              const displayName =
                (f.path || '').replace(/\/$/, '').split('/').pop() || f.path || 'unknown';
              const isDir = f.isDirectory || (typeof f.path === 'string' && f.path.endsWith('/'));
              return (
                <button
                  key={i}
                  onClick={() => !isDir && onSelectFile(f.path)}
                  className={`w-full flex items-center gap-2 px-2 py-1 rounded-md text-left transition-colors group ${
                    isDir
                      ? 'cursor-default opacity-80'
                      : 'hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer'
                  }`}
                >
                  <span
                    className={`text-[10px] font-mono font-bold w-3 shrink-0 ${statusColor(f.status)}`}
                  >
                    {statusLabel(f.status)}
                  </span>
                  <span className="text-[11.5px] font-medium text-[#3F3F46] dark:text-[#D4D4D8] truncate group-hover:text-[#3B82F6] transition-colors">
                    {displayName}
                    {isDir ? '/' : ''}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Auto-Git & Docs Smart Control Center */}
      <div className="border-t border-[#E4E4E7] dark:border-[#27272A] px-2 py-2 mt-1 shrink-0 flex flex-col gap-1.5 bg-[#F8FAFC] dark:bg-[#18181B]/60 rounded-b-lg">
        <div className="flex items-center justify-between text-[10px] font-mono text-[#52525B] dark:text-[#A1A1AA]">
          <span
            className="truncate flex items-center gap-1"
            title={`Author: ${userIdentity?.name || 'User'} <${userIdentity?.email || ''}>`}
          >
            👤 {userIdentity?.name || 'Auto Author'}
          </span>
          <button
            onClick={onUpdateIdentity}
            className="text-[#3B82F6] hover:underline cursor-pointer shrink-0 ml-1 font-bold"
          >
            [Identity]
          </button>
        </div>

        <div className="flex items-center justify-between gap-1 text-[10px]">
          <label className="flex items-center gap-1.5 cursor-pointer text-[#3F3F46] dark:text-[#D4D4D8]">
            <input
              type="checkbox"
              checked={autoCommitEnabled}
              onChange={(e) => setAutoCommitEnabled(e.target.checked)}
              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 h-3 w-3 cursor-pointer"
            />
            <span>Auto-Commit on Build</span>
          </label>
        </div>

        <div className="flex items-center gap-1.5 mt-0.5">
          <button
            onClick={async () => {
              if (!contextDir) return;
              try {
                await fetch('/api/git/smart-commit', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ dir: contextDir }),
                });
                await fetch('/api/git/smart-docs', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ dir: contextDir }),
                });
                if (fetchGitStatus) fetchGitStatus();
              } catch {}
            }}
            className="flex-1 px-2 py-1 text-[10px] font-bold font-mono bg-[#3B82F6] hover:bg-[#2563EB] text-white rounded transition-colors shadow-sm cursor-pointer truncate text-center"
            title="Smart stage, semantic commit, and update README/CHANGELOG"
          >
            ⚡ Commit & Docs
          </button>

          <button
            onClick={async () => {
              if (!contextDir) return;
              try {
                const r = await fetch('/api/git/smart-push', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ dir: contextDir }),
                }).then((res) => res.json());

                if (r.needsConnection && onOpenConnectModal) {
                  onOpenConnectModal();
                } else if (r.success) {
                  if (fetchGitStatus) fetchGitStatus();
                  alert(r.message || 'Pushed successfully!');
                } else {
                  if (r.needsConnection && onOpenConnectModal) onOpenConnectModal();
                  else alert(r.message || 'Push failed.');
                }
              } catch (e: any) {
                alert('Push error: ' + e.message);
              }
            }}
            className="px-2 py-1 text-[10px] font-bold font-mono bg-[#10B981] hover:bg-[#059669] text-white rounded transition-colors shadow-sm cursor-pointer shrink-0"
            title="Push to remote GitHub repository"
          >
            🚀 Push
          </button>
        </div>
      </div>
    </div>
  );
}

function RecentCommitsPanel({ gitStatus }: { gitStatus: any }) {
  const commits = gitStatus.recentCommits || [];

  if (!gitStatus.isRepo) {
    return (
      <div className="flex flex-col h-full items-center justify-center text-[12.5px] font-sans text-[#A1A1AA] opacity-80 gap-2">
        <GitCommit size={22} weight="duotone" className="text-[#A1A1AA]/50" />
        <span>No commit history</span>
      </div>
    );
  }

  if (commits.length === 0) {
    return (
      <div className="flex flex-col h-full items-center justify-center text-[12.5px] font-sans gap-3 py-6">
        <GitCommit size={32} weight="duotone" className="text-white/20" />
        <span className="text-white/50 text-[13px]">No commits yet</span>
        <button
          className="px-3 py-1.5 bg-white/5 text-white/30 cursor-not-allowed text-[11px] rounded-lg border border-white/5"
          disabled
        >
          Initial Commit Needed
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2.5 px-2 py-1 font-sans overflow-y-auto scrollbar-hide h-full select-none">
      {commits.map((c: any, i: number) => (
        <div key={i} className="flex flex-col gap-0.5">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono font-bold text-[#3B82F6] shrink-0">
              {c.hash}
            </span>
            <span className="text-[11px] text-[#71717A] dark:text-[#A1A1AA] font-mono shrink-0">
              {c.time}
            </span>
          </div>
          <span className="text-[12px] font-medium text-[#111111] dark:text-[#E4E4E7] truncate leading-snug">
            {c.message}
          </span>
        </div>
      ))}
    </div>
  );
}

function AgentActivityPanel({
  tasks,
  chatHistories,
  selectedTaskId,
}: {
  tasks: any[];
  chatHistories: Record<string, any[]>;
  selectedTaskId: string | null;
}) {
  const runningTasks = tasks.filter((t) => t.status === 'running');
  const completedCount = tasks.filter((t) => t.status === 'done').length;
  const failedCount = tasks.filter((t) => t.status === 'error').length;

  // Extract latest activity from chat history
  const getRecentActivities = () => {
    const taskId = selectedTaskId || (runningTasks.length > 0 ? runningTasks[0].id : null);
    if (!taskId || !chatHistories[taskId]) return [];
    const history = chatHistories[taskId];
    const activities: string[] = [];

    for (let i = history.length - 1; i >= 0; i--) {
      const msg = history[i];
      if (msg.role === 'thought' || msg.role === 'tool') {
        const lines = msg.content
          .split('\n')
          .filter((l: string) => l.trim())
          .reverse();
        for (const line of lines) {
          const clean = line.replace(/[⏳🧠✅❌🤖🏗️💻🧪🚀⚠️⏹️▶️📦💬🖥️]/g, '').trim();
          if (clean.startsWith('>')) {
            activities.push(clean.slice(1).trim());
          } else if (clean.includes('Requesting LLM inference')) {
            activities.push('Thinking...');
          } else if (
            clean.length > 5 &&
            !clean.startsWith('[') &&
            !clean.startsWith('Action:') &&
            !clean.startsWith('Output:')
          ) {
            activities.push(clean.length > 70 ? clean.slice(0, 70) + '...' : clean);
          }
          if (activities.length >= 6) return activities;
        }
      }
    }
    return activities;
  };

  const recentActivities = getRecentActivities();

  return (
    <div className="flex flex-col justify-between px-3 py-2 font-sans h-full select-none gap-3">
      {/* Status row */}
      <div className="flex items-center justify-between shrink-0 pb-1 border-b border-black/5 dark:border-white/5">
        <span className="text-[11px] font-sans uppercase tracking-wider font-semibold text-[#71717A] dark:text-[#A1A1AA]">
          Status
        </span>
        {runningTasks.length > 0 ? (
          <div className="flex items-center gap-1.5">
            <SpinnerGap size={12} className="animate-spin text-[#3B82F6]" />
            <span className="text-[11px] font-mono font-bold text-[#3B82F6]">
              {runningTasks.length} Running
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-[#10B981] shadow-[0_0_4px_#10B981]" />
            <span className="text-[11px] font-mono font-bold text-[#10B981]">Idle</span>
          </div>
        )}
      </div>

      {/* Recent activity feed */}
      <div className="flex-1 overflow-y-auto scrollbar-hide py-1 -mx-1 px-1">
        {recentActivities.length > 0 ? (
          <div className="flex flex-col gap-2.5">
            {recentActivities.map((act, idx) => (
              <div
                key={idx}
                className="flex items-start gap-2"
                style={{ opacity: Math.max(0.3, 1 - idx * 0.15) }}
              >
                <span
                  className={`text-[12px] shrink-0 mt-0.5 ${idx === 0 ? 'text-[#3B82F6] animate-pulse' : 'text-[#A1A1AA]'}`}
                >
                  {idx === 0 ? '▶' : '•'}
                </span>
                <span className="text-[11.5px] font-medium text-[#111111] dark:text-[#E4E4E7] leading-snug break-words">
                  {act}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="h-full flex items-center justify-center text-[11px] text-[#A1A1AA] italic">
            No recent activity
          </div>
        )}
      </div>

      {/* Stats */}
      <div className="flex items-center gap-3 shrink-0">
        <div className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-[#10B981]" />
          <span className="text-[11px] font-mono font-medium text-[#52525B] dark:text-[#A1A1AA]">
            {completedCount} done
          </span>
        </div>
        {failedCount > 0 && (
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-[#EF4444]" />
            <span className="text-[11px] font-mono font-medium text-[#52525B] dark:text-[#A1A1AA]">
              {failedCount} failed
            </span>
          </div>
        )}
        <div className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-[#3B82F6]" />
          <span className="text-[11px] font-mono font-medium text-[#52525B] dark:text-[#A1A1AA]">
            {tasks.length} total
          </span>
        </div>
      </div>
    </div>
  );
}

function formatTaskDescriptionHelper(desc?: string): string {
  if (!desc) return 'Untitled Thread';
  let formatted = desc.replace(/^(?:\[.*?\]\s*)+/, '').trim();
  if (formatted.length > 110) {
    formatted = formatted.substring(0, 110) + '...';
  }
  if (formatted.length > 0) {
    formatted = formatted.charAt(0).toUpperCase() + formatted.slice(1);
  }
  return formatted || 'Untitled Thread';
}

function formatOpenedAgo(timeStr?: string) {
  if (!timeStr) return 'Just now';
  try {
    const diffMs = Date.now() - new Date(timeStr).getTime();
    if (isNaN(diffMs) || diffMs < 0) return 'Just now';
    const mins = Math.floor(diffMs / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  } catch {
    return 'Just now';
  }
}

function ThreadsPanel({
  tasks,
  onSelect,
  onDelete,
  onStop,
  onResume,
}: {
  tasks: any[];
  onSelect: (id: string) => void;
  onDelete?: (id: string) => void;
  onStop?: (id: string) => void;
  onResume?: (id: string) => void;
}) {
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  useEffect(() => {
    if (confirmDeleteId) {
      const handleGlobalClick = () => setConfirmDeleteId(null);
      window.addEventListener('click', handleGlobalClick);
      return () => window.removeEventListener('click', handleGlobalClick);
    }
  }, [confirmDeleteId]);

  if (!tasks || tasks.length === 0) {
    return (
      <div className="flex flex-col h-full items-center justify-center text-[12.5px] font-sans text-[#A1A1AA] opacity-80 py-12 gap-2">
        <Stack size={28} weight="duotone" className="text-[#A1A1AA]/50" />
        <span>No workspace threads found</span>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-4 px-2 py-1 font-sans overflow-y-auto scrollbar-hide h-full select-none">
      {tasks
        .slice()
        .reverse()
        .map((t: any) => (
          <div
            key={t.id}
            onClick={() => onSelect(t.id)}
            className="group relative flex flex-col gap-1 cursor-pointer transition-colors"
          >
            <div className="flex items-center justify-between gap-3">
              <span className="text-[13.5px] font-bold text-[#111111] dark:text-white group-hover:text-[#3B82F6] transition-colors truncate min-w-0 flex-1">
                {t.goal || formatTaskDescriptionHelper(t.description)}
              </span>
              {t.status === 'running' ? (
                <div className="shrink-0 flex items-center gap-1.5 text-[10.5px] font-mono uppercase font-bold text-[#3B82F6]">
                  <span className="w-2 h-2 rounded-full bg-[#3B82F6] shadow-[0_0_6px_#3B82F6] animate-pulse" />
                  <span>EXEC</span>
                </div>
              ) : t.status === 'error' ? (
                <div className="shrink-0 flex items-center gap-1.5 text-[10.5px] font-mono uppercase font-bold text-[#EF4444]">
                  <span className="w-2 h-2 rounded-full bg-[#EF4444] shadow-[0_0_6px_#EF4444]" />
                  <span>ERR</span>
                </div>
              ) : (
                <span className="w-1.5 h-1.5 rounded-full bg-[#71717A] dark:bg-[#A1A1AA] opacity-40 shrink-0" />
              )}
            </div>
            <div className="flex items-center justify-between text-[11.5px] text-[#71717A] dark:text-[#A1A1AA] font-medium mt-1">
              <span>{formatOpenedAgo(t.createdAt)}</span>
              <div className="flex items-center gap-2">
                {onStop && t.status === 'running' && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onStop(t.id);
                    }}
                    className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-[#3B82F6]/10 text-[#3B82F6]"
                    title="Stop Task"
                  >
                    <Square size={14} weight="fill" />
                  </button>
                )}
                {onResume && (t.status === 'stopped' || t.status === 'error') && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onResume(t.id);
                    }}
                    className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-[#10B981]/10 text-[#10B981]"
                    title="Resume Task"
                  >
                    <Play size={14} weight="fill" />
                  </button>
                )}
                {onDelete && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (confirmDeleteId === t.id) {
                        onDelete(t.id);
                        setConfirmDeleteId(null);
                      } else {
                        setConfirmDeleteId(t.id);
                      }
                    }}
                    className={`transition-all duration-150 p-1 rounded ${
                      confirmDeleteId === t.id
                        ? 'opacity-100 text-[#10B981] hover:bg-[#10B981]/10 bg-[#10B981]/10'
                        : 'opacity-0 group-hover:opacity-100 text-[#A1A1AA] hover:text-[#EF4444] hover:bg-[#EF4444]/10'
                    }`}
                    title={
                      confirmDeleteId === t.id ? 'Click again to confirm deletion' : 'Delete Thread'
                    }
                  >
                    {confirmDeleteId === t.id ? (
                      <Check size={14} weight="bold" />
                    ) : (
                      <Trash size={14} weight="bold" />
                    )}
                  </button>
                )}
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-150 text-[#3B82F6] font-semibold text-[11px]">
                  <span>Open</span>
                  <CaretRight size={12} weight="bold" />
                </div>
              </div>
            </div>
          </div>
        ))}
    </div>
  );
}

export default function App() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [tasks, setTasks] = useState<any[]>([]);
  const [recentWorkspaces, setRecentWorkspaces] = useState<string[]>([]);
  const [sysInfo, setSysInfo] = useState<{
    cpuUsage: number;
    memoryUsedBytes: number;
    memoryTotalBytes: number;
    modelLoaded: string;
    gpuInfo?: string;
  }>({
    cpuUsage: 0,
    memoryUsedBytes: 0,
    memoryTotalBytes: 0,
    modelLoaded: 'Initializing...',
    gpuInfo: 'Detecting GPU...',
  });
  const [downloadProgress, setDownloadProgress] = useState<{
    model: string;
    percent: number;
    status: string;
  } | null>(null);
  const [modelError, setModelError] = useState<string | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [wsConnected, setWsConnected] = useState(false);
  const [autoCommitEnabled, setAutoCommitEnabled] = useState(true);
  const [userIdentity, setUserIdentity] = useState<{ name: string; email: string } | null>(null);
  const [showGitHubConnectModal, setShowGitHubConnectModal] = useState(false);
  const [showIdentityModal, setShowIdentityModal] = useState(false);
  const [globalConfirm, setGlobalConfirm] = useState<{
    message: string;
    resolve: (val: boolean) => void;
  } | null>(null);

  useEffect(() => {
    (window as any).customConfirm = (message: string) => {
      return new Promise((resolve) => {
        setGlobalConfirm({ message, resolve });
      });
    };
  }, []);

  // Chat Interface State
  const [chatHistories, setChatHistories] = useState<
    Record<
      string,
      {
        id: string;
        role: 'user' | 'thought' | 'output' | 'tool' | 'question';
        content: string;
        placeholder?: string;
        options?: string[];
        isSecret?: boolean;
        multiSelect?: boolean;
        inputType?: 'text' | 'file' | 'directory' | 'form';
        formSchema?: any;
      }[]
    >
  >(() => {
    try {
      const saved = localStorage.getItem('warden_chat_histories');
      if (!saved) return {};
      const parsed = JSON.parse(saved);
      // Migration: re-classify legacy logs from 'tool' to 'thought' so they collapse properly
      for (const taskId in parsed) {
        const mapped = parsed[taskId].map((msg: any) => {
          if (msg.role === 'tool') {
            const content = msg.content;
            if (
              content.startsWith('[Phase') ||
              content.startsWith('[Swarm') ||
              content.includes('🚀 Launching Phase') ||
              content.includes('Phase completed') ||
              content.includes('[Iteration') ||
              content.includes('LLM is thinking') ||
              content.includes('LLM inference') ||
              content.includes('⏳') ||
              content.includes('🧠') ||
              content.startsWith('[Verifier]') ||
              content.startsWith('[System]') ||
              content.includes('✅ Task completed') ||
              content.includes('❌ Task permanently') ||
              content.includes('⬆️ Escalating') ||
              content.includes('🔄 Retrying') ||
              content.includes('Intent classified') ||
              content.includes('Workspace:') ||
              content.includes('Router Model:') ||
              content.includes('▶️ Running:') ||
              content.startsWith('[Main Agent]') ||
              content.includes('🤖 Launching') ||
              content.includes('💬 Answering') ||
              content.includes('📦 Initiating') ||
              content.includes('🖥️ Preparing') ||
              content.includes('Booting up orchestration sequence')
            ) {
              return { ...msg, role: 'thought' };
            }
          }
          return msg;
        });

        // Merge adjacent 'thought' and 'tool' messages so they render as a single collapsible block
        const merged = [];
        for (const msg of mapped) {
          const isThoughtOrTool = msg.role === 'thought' || msg.role === 'tool';
          const lastIsThoughtOrTool =
            merged.length > 0 &&
            (merged[merged.length - 1].role === 'thought' ||
              merged[merged.length - 1].role === 'tool');

          if (isThoughtOrTool && lastIsThoughtOrTool) {
            merged[merged.length - 1].role = 'thought';
            merged[merged.length - 1].content += '\n' + msg.content;
          } else {
            if (msg.role === 'tool') msg.role = 'thought';
            merged.push(msg);
          }
        }
        parsed[taskId] = merged;
      }
      return parsed;
    } catch {
      return {};
    }
  });

  useEffect(() => {
    const timer = setTimeout(() => {
      localStorage.setItem('warden_chat_histories', JSON.stringify(chatHistories));
    }, 2000);
    return () => clearTimeout(timer);
  }, [chatHistories]);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const [files, setFiles] = useState<any[]>([]);
  const [goalInput, setGoalInput] = useState('');
  const initialContextDir = (() => {
    try {
      const rec = JSON.parse(localStorage.getItem('warden_recent_workspaces') || '[]');
      return rec.length > 0 ? rec[0] : null;
    } catch {
      return null;
    }
  })();

  const [contextDir, setContextDir] = useState<string | null>(initialContextDir);
  const [isModeDropdownOpen, setIsModeDropdownOpen] = useState(false);
  const [attachedImage, setAttachedImage] = useState<string | null>(null);
  const [isImageEditorOpen, setIsImageEditorOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [swarmMode, setSwarmMode] = useState(() => {
    if (!initialContextDir) return 'interactive';
    return localStorage.getItem(`warden_mode_${initialContextDir}`) || 'interactive';
  });
  const [hasConfirmedFullPermissions, setHasConfirmedFullPermissions] = useState(() => {
    if (!initialContextDir) return false;
    return localStorage.getItem(`warden_perms_${initialContextDir}`) === 'true';
  });

  useEffect(() => {
    if (contextDir) {
      setSwarmMode(localStorage.getItem(`warden_mode_${contextDir}`) || 'interactive');
      setHasConfirmedFullPermissions(localStorage.getItem(`warden_perms_${contextDir}`) === 'true');
    }
  }, [contextDir]);

  useEffect(() => {
    const handleGlobalClick = () => {
      setConfirmDeleteId(null);
      setIsModeDropdownOpen(false);
    };

    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      // Ctrl+P or Cmd+P to focus prompt
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'p') {
        e.preventDefault();
        promptInputRef.current?.focus();
      }

      // Ctrl+Shift+E or Cmd+Shift+E to toggle sidebar
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'e') {
        e.preventDefault();
        setIsSidebarOpen((prev) => !prev);
      }

      // Esc to close sidebar if open
      if (e.key === 'Escape') {
        if (isSidebarOpen) {
          setIsSidebarOpen(false);
        }
      }
    };

    window.addEventListener('click', handleGlobalClick);
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => {
      window.removeEventListener('click', handleGlobalClick);
      window.removeEventListener('keydown', handleGlobalKeyDown);
    };
  }, [isSidebarOpen]);
  const [rootWorkspace, setRootWorkspace] = useState(
    () =>
      localStorage.getItem('warden_root_workspace') ||
      localStorage.getItem('warden_workspace') ||
      '',
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(
    () => localStorage.getItem('warden_theme') === 'dark',
  );
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const selectedTask = tasks.find((t) => t.id === selectedTaskId);
  const [taskHistoryLog, setTaskHistoryLog] = useState<any[]>([]);

  useEffect(() => {
    if (selectedTaskId) {
      localStorage.setItem('warden_selected_task_id', selectedTaskId);
    } else {
      localStorage.removeItem('warden_selected_task_id');
    }
  }, [selectedTaskId]);

  const chatHistory = chatHistories[selectedTaskId || ''] || [];

  // Auto-scroll chat with smooth animation
  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }, [chatHistory, selectedTaskId]);

  const [pickerOpen, setPickerOpen] = useState(false);
  const [isCreatingFile, setIsCreatingFile] = useState(false);
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [newFileName, setNewFileName] = useState('');
  const [newFolderName, setNewFolderName] = useState('');
  const [openTabs, setOpenTabs] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<string | null>(null);
  const [tabContextMenu, setTabContextMenu] = useState<{
    x: number;
    y: number;
    tabPath: string;
  } | null>(null);
  const [fileToDelete, setFileToDelete] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [allWorkspaceFiles, setAllWorkspaceFiles] = useState<any[]>([]);
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({});
  const [closedPanels, setClosedPanels] = useState<Record<string, boolean>>({});

  // ═══ Panel orchestration: staggered open/close on task select ═══
  const PANEL_NAMES = useRef([
    'fileExplorer',
    'changedFiles',
    'commits',
    'threads',
    'activity',
  ]).current;
  const [panelsOpen, setPanelsOpen] = useState(false);
  const [panelDelays, setPanelDelays] = useState<Record<string, number>>({});

  useEffect(() => {
    if (contextDir || selectedTask) {
      // Generate randomized stagger delays (panels open one by one in random order)
      const shuffled = [...PANEL_NAMES].sort(() => Math.random() - 0.5);
      const delays: Record<string, number> = {};
      shuffled.forEach((name, i) => {
        delays[name] = 150 + i * 200; // 150ms base + 200ms between each
      });
      setPanelDelays(delays);
      setPanelsOpen(true);
    } else {
      // Close panels with a quick reverse stagger
      const shuffled = [...PANEL_NAMES].sort(() => Math.random() - 0.5);
      const delays: Record<string, number> = {};
      shuffled.forEach((name, i) => {
        delays[name] = i * 120;
      });
      setPanelDelays(delays);
      setPanelsOpen(false);
    }
  }, [selectedTask]);

  const [referencedFiles, setReferencedFiles] = useState<string[]>([]);
  const [showMentionMenu, setShowMentionMenu] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionIndex, setMentionIndex] = useState(0);

  const [showSearchModal, setShowSearchModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const [showCommandPalette, setShowCommandPalette] = useState(false);
  const [commandPaletteQuery, setCommandPaletteQuery] = useState('');
  const commandInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setShowCommandPalette(true);
      } else if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        setShowSearchModal(true);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    if (showSearchModal) {
      setTimeout(() => searchInputRef.current?.focus(), 50);
    }
  }, [showSearchModal]);

  const executeSearch = async (query: string) => {
    setSearchQuery(query);
    if (!query.trim()) {
      setSearchResults([]);
      return;
    }
    setIsSearching(true);
    try {
      const res = await fetch(
        `/api/search?dir=${encodeURIComponent(contextDir || rootWorkspace)}&q=${encodeURIComponent(query)}`,
      );
      const data = await res.json();
      setSearchResults(Array.isArray(data) ? data : []);
    } catch {
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  useEffect(() => {
    if (showCommandPalette) {
      setTimeout(() => commandInputRef.current?.focus(), 50);
    } else {
      setCommandPaletteQuery('');
    }
  }, [showCommandPalette]);

  const [gitStatus, setGitStatus] = useState<{
    isRepo: boolean;
    remote: string | null;
    branch?: string;
    modifiedCount?: number;
    lastCommit?: string;
  }>({ isRepo: false, remote: null });
  const [gitPanelOpen, setGitPanelOpen] = useState(false);
  const [connectGithubModalOpen, setConnectGithubModalOpen] = useState(false);
  const [githubUrl, setGithubUrl] = useState('');

  const wsRef = useRef<WebSocket | null>(null);
  const promptInputRef = useRef<HTMLTextAreaElement>(null);
  const dynamicRefreshRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (promptInputRef.current) {
      if (!goalInput || goalInput.trim() === '') {
        promptInputRef.current.style.height = '40px';
      } else {
        promptInputRef.current.style.height = '40px';
        const scrollHeight = promptInputRef.current.scrollHeight;
        promptInputRef.current.style.height = `${Math.min(Math.max(scrollHeight, 40), 240)}px`;
      }
    }
  }, [goalInput]);

  const fetchTasks = () => {
    fetch('/api/tasks')
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setTasks(data);
          // Removed auto-selection logic to always show welcome screen
        }
      })
      .catch(() => {});
  };

  useEffect(() => {
    fetchTasks();
    try {
      setRecentWorkspaces(JSON.parse(localStorage.getItem('warden_recent_workspaces') || '[]'));
    } catch {}

    const fetchSys = () => {
      fetch('/api/system')
        .then((r) => r.json())
        .then((data) => setSysInfo((prev) => ({ ...prev, ...data })))
        .catch(() => {});
    };
    fetchSys();
    const sysInterval = setInterval(fetchSys, 10000);

    const ignoredDirs = new Set([
      'node_modules',
      '__pycache__',
      '.git',
      '.venv',
      'venv',
      'env',
      '.next',
      'dist',
      'build',
      '.idea',
      '.vscode',
      '.DS_Store',
      'coverage',
      'tmp',
      'temp',
      'vendor',
    ]);

    const fetchWorkspaceFiles = () => {
      if (contextDir) {
        fetch(`/api/files?dir=${encodeURIComponent(contextDir)}`)
          .then((r) => r.json())
          .then((data) => {
            if (Array.isArray(data)) {
              const clean = data.filter((f: any) => {
                if (!f || !f.name) return false;
                const parts = f.name.split(/[\\/]/);
                return !parts.some(
                  (p: string) => ignoredDirs.has(p) || p.endsWith('.pyc') || p.endsWith('.pyo'),
                );
              });
              setFiles(clean);
            }
          })
          .catch(() => {});
      }
    };
    const fetchAllFiles = () => {
      fetch(`/api/files?dir=${encodeURIComponent(contextDir || 'root')}&recursive=true`)
        .then((r) => r.json())
        .then((data) => {
          if (Array.isArray(data)) {
            const clean = data.filter((f: any) => {
              if (!f || !f.name) return false;
              const parts = f.name.split(/[\\/]/);
              return !parts.some(
                (p: string) => ignoredDirs.has(p) || p.endsWith('.pyc') || p.endsWith('.pyo'),
              );
            });
            setAllWorkspaceFiles(clean);
          }
        })
        .catch(() => {});
    };
    const fetchGitStatus = () => {
      if (contextDir) {
        fetch(`/api/git/status?dir=${encodeURIComponent(contextDir)}`)
          .then((r) => r.json())
          .then((data) => setGitStatus(data))
          .catch(() => {});
        fetch(`/api/git/config?dir=${encodeURIComponent(contextDir)}`)
          .then((r) => r.json())
          .then((data) => setUserIdentity(data))
          .catch(() => {});
      }
    };
    let debounceTimer: any = null;
    dynamicRefreshRef.current = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        fetchWorkspaceFiles();
        fetchAllFiles();
        fetchGitStatus();
      }, 500);
    };
    fetchWorkspaceFiles();
    fetchAllFiles();
    fetchGitStatus();
    // Only poll files/git infrequently — WebSocket events trigger dynamicRefresh for real-time updates
    const filesInterval = setInterval(() => {
      fetchWorkspaceFiles();
    }, 60000);

    return () => {
      clearInterval(sysInterval);
      clearInterval(filesInterval);
    };
  }, [contextDir]);

  useEffect(() => {
    if (selectedTaskId) {
      fetch(`/api/tasks/${selectedTaskId}/history`)
        .then((r) => r.json())
        .then((data) => {
          if (Array.isArray(data)) setTaskHistoryLog(data);
        })
        .catch(() => {});
    } else {
      setTaskHistoryLog([]);
    }
  }, [selectedTaskId, selectedTask?.status]);

  useEffect(() => {
    if (!selectedTask || selectedTask.status !== 'running') {
      setElapsedSeconds(0);
      return;
    }
    const startTime = Date.now();
    const timer = setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, [selectedTask]);

  useEffect(() => {
    if (promptInputRef.current) {
      promptInputRef.current.style.height = 'auto';
      promptInputRef.current.style.height = `${promptInputRef.current.scrollHeight}px`;
    }
  }, [goalInput]);

  useEffect(() => {
    const handleGlobalClick = () => setTabContextMenu(null);
    window.addEventListener('click', handleGlobalClick);
    return () => window.removeEventListener('click', handleGlobalClick);
  }, []);

  useEffect(() => {
    let reconnectTimer: any;
    let backoff = 1000;

    function connectWs() {
      const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsHost = window.location.host;
      const wsUrl = `${wsProtocol}//${wsHost}/ws`;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;
      ws.onopen = () => {
        backoff = 1000;
        setWsConnected(true);
        fetchTasks();
      };
      ws.onmessage = (event) => {
        try {
          const { type, payload } = JSON.parse(event.data);
          if (
            type === 'task_created' ||
            type === 'task_completed' ||
            type === 'task_running' ||
            type === 'task_queued' ||
            type === 'file_changed' ||
            type === 'workspace_changed' ||
            type === 'task_console'
          ) {
            if (dynamicRefreshRef.current) dynamicRefreshRef.current();
          }
          if (type === 'task_created') {
            setTasks((prev) => {
              if (prev.find((t) => t.id === payload.id)) return prev;
              return [payload, ...prev];
            });
            setSelectedTaskId(payload.id);
            setChatHistories((prev) => {
              if (prev.temp) {
                const { temp, ...rest } = prev;
                const existing = rest[payload.id] || [];
                return { ...rest, [payload.id]: [...temp, ...existing] };
              }
              return prev;
            });
          } else if (type === 'model_download_progress') {
            setDownloadProgress(payload);
            if (payload.status === 'success') {
              setTimeout(() => setDownloadProgress(null), 3000);
            }
          } else if (type === 'model_loading') {
            setSysInfo((prev) => ({ ...prev, modelLoaded: `Loading ${payload.model}...` }));
          } else if (type === 'model_loaded') {
            setSysInfo((prev) => ({ ...prev, modelLoaded: payload.model }));
            setDownloadProgress(null);
            setModelError(null);
          } else if (type === 'user_question') {
            setChatHistories((prevMap) => {
              const prev = prevMap[payload.taskId] || [];
              const qMsg = {
                id: Math.random().toString(),
                role: 'question' as const,
                content: payload.question,
                placeholder: payload.placeholder,
                options: payload.options,
                isSecret: payload.isSecret,
                multiSelect: payload.multiSelect,
                inputType: payload.inputType,
                formSchema: payload.formSchema,
              };
              return { ...prevMap, [payload.taskId]: [...prev, qMsg] };
            });
          } else if (type === 'file_diff_proposal') {
            setChatHistories((prevMap) => {
              const prev = prevMap[payload.taskId] || [];
              const diffMsg = {
                id: Math.random().toString(),
                role: 'diff_proposal' as any,
                content: payload.path,
                oldContent: payload.oldContent,
                newContent: payload.newContent,
              };
              return { ...prevMap, [payload.taskId]: [...prev, diffMsg] };
            });
          } else if (type === 'task_console_stream') {
            setChatHistories((prevMap) => {
              const prev = prevMap[payload.taskId] || [];
              const lastMsg = prev[prev.length - 1];
              if (lastMsg && (lastMsg.role === 'thought' || lastMsg.role === 'tool')) {
                const newPrev = [...prev];
                newPrev[newPrev.length - 1] = {
                  ...lastMsg,
                  role: 'thought',
                  content: lastMsg.content + payload.content,
                };
                return { ...prevMap, [payload.taskId]: newPrev };
              }
              const newMsg = {
                id: Math.random().toString(),
                role: 'thought' as const,
                content: payload.content,
              };
              return { ...prevMap, [payload.taskId]: [...prev, newMsg] };
            });
          } else if (type === 'task_console') {
            const rawContent = payload.content.trim();

            setChatHistories((prevMap) => {
              const prev = prevMap[payload.taskId] || [];
              let role: 'thought' | 'output' | 'tool' | 'question' = 'thought';
              let content = payload.content.trim();
              if (
                content.startsWith('[Main Agent Answer]') ||
                content.startsWith('[Main Agent Output]') ||
                content.startsWith('[Task Summary]') ||
                content.startsWith('[Claude Code Agent] Task Finished:') ||
                content.includes('Task permanently failed') ||
                content.includes('Agent crashed:') ||
                content.includes('Cannot connect to Ollama')
              ) {
                role = 'output';
                content = content
                  .replace(
                    /^\[(Main Agent Answer|Main Agent Output|Task Summary|Claude Code Agent\] Task Finished):\]?\s*/i,
                    '',
                  )
                  .trim();
                content = content.replace(/⚠️\s*/, '').trim(); // Clean up warning emoji
              } else if (
                content.startsWith('[Tool Execution]') ||
                content.startsWith('[Tool Result]') ||
                content.includes('Successfully wrote') ||
                content.includes('Ran command:') ||
                content.includes('Executing command') ||
                content.includes('Spawned sub-agent') ||
                content.includes('Wrote file') ||
                content.includes('Edited file') ||
                content.includes('Started background server') ||
                content.includes('Reading file') ||
                content.includes('Searching codebase') ||
                content.includes('Completed task verification') ||
                content.startsWith('> ')
              ) {
                role = 'tool';
              }
              const lastMsg = prev[prev.length - 1];
              if (
                lastMsg &&
                (lastMsg.role === 'thought' || lastMsg.role === 'tool') &&
                (role === 'thought' || role === 'tool')
              ) {
                const newPrev = [...prev];
                newPrev[newPrev.length - 1] = {
                  ...lastMsg,
                  role: 'thought',
                  content: lastMsg.content + '\n' + content,
                };
                return { ...prevMap, [payload.taskId]: newPrev };
              }
              if (role === 'tool') role = 'thought';
              return {
                ...prevMap,
                [payload.taskId]: [...prev, { id: Math.random().toString(), role, content }],
              };
            });
          } else if (type === 'model_error') {
            setModelError(payload.message || 'Connection to Ollama failed');
            setTimeout(() => setModelError(null), 15000);
          } else if (
            type === 'tasks_updated' ||
            type === 'task_deleted' ||
            type === 'task_status_changed' ||
            type === 'task_done' ||
            type === 'task_escalated'
          ) {
            if (type === 'task_done' && autoCommitEnabled && contextDir) {
              fetch('/api/git/smart-commit', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ dir: contextDir }),
              })
                .then(() => {
                  fetch('/api/git/smart-docs', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ dir: contextDir }),
                  });
                })
                .catch(() => {});
            }
            fetch('/api/tasks')
              .then((r) => r.json())
              .then((data) => {
                if (Array.isArray(data)) {
                  setTasks((prev) => {
                    return data.map((fetchedTask) => {
                      const existing = prev.find((t) => t.id === fetchedTask.id);
                      if (
                        existing &&
                        existing.status === 'running' &&
                        fetchedTask.status === 'ready'
                      ) {
                        return { ...fetchedTask, status: 'running' };
                      }
                      return fetchedTask;
                    });
                  });
                }
              });
          }
        } catch (e) {}
      };
      ws.onerror = () => ws.close();
      ws.onclose = () => {
        setWsConnected(false);
        clearTimeout(reconnectTimer);
        reconnectTimer = setTimeout(() => {
          backoff = Math.min(backoff * 1.5, 10000);
          connectWs();
        }, backoff);
      };
    }
    connectWs();

    return () => {
      clearTimeout(reconnectTimer);
      if (wsRef.current) {
        const ws = wsRef.current;
        ws.onclose = null;
        ws.onerror = null;
        ws.onmessage = null;
        if (ws.readyState === WebSocket.CONNECTING) {
          ws.onopen = () => ws.close();
        } else if (ws.readyState === WebSocket.OPEN) {
          ws.close();
        }
      }
    };
  }, []);

  const handleCreateFile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFileName.trim() || !contextDir) return;
    const createdName = newFileName.trim();
    setFiles((prev) => [...prev, { name: createdName, isDirectory: false }]);
    setAllWorkspaceFiles((prev) => [...prev, { name: createdName, isDirectory: false }]);
    setNewFileName('');
    setIsCreatingFile(false);
    try {
      await fetch('/api/files/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dir: contextDir, name: createdName }),
      });
      if (dynamicRefreshRef.current) dynamicRefreshRef.current();
    } catch (e) {
      if (dynamicRefreshRef.current) dynamicRefreshRef.current();
    }
  };

  const handleCreateFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFolderName.trim() || !contextDir) return;
    const createdName = newFolderName.trim();
    setFiles((prev) => [...prev, { name: createdName, isDirectory: true }]);
    setAllWorkspaceFiles((prev) => [...prev, { name: createdName, isDirectory: true }]);
    setNewFolderName('');
    setIsCreatingFolder(false);
    try {
      await fetch('/api/files', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dir: contextDir, name: createdName }),
      });
      if (dynamicRefreshRef.current) dynamicRefreshRef.current();
    } catch (e) {
      if (dynamicRefreshRef.current) dynamicRefreshRef.current();
    }
  };

  const handleDeleteFile = async (name: string) => {
    if (!contextDir) return;
    const fullPath = `${contextDir}/${name}`;
    setFiles((prev) =>
      prev.filter(
        (f) =>
          f && f.name !== name && !f.name.startsWith(name + '/') && !f.name.startsWith(name + '\\'),
      ),
    );
    setAllWorkspaceFiles((prev) =>
      prev.filter(
        (f) =>
          f && f.name !== name && !f.name.startsWith(name + '/') && !f.name.startsWith(name + '\\'),
      ),
    );
    try {
      await fetch('/api/files', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetPath: fullPath, dir: contextDir }),
      });
      setOpenTabs((prev) => prev.filter((t) => t !== fullPath));
      if (activeTab === fullPath) setActiveTab(null);
      if (dynamicRefreshRef.current) dynamicRefreshRef.current();
    } catch (e) {
      if (dynamicRefreshRef.current) dynamicRefreshRef.current();
    }
  };

  const handleResumeTask = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await fetch(`/api/tasks/${id}/resume`, { method: 'POST' });
      setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, status: 'ready' } : t)));
    } catch (err) {
      console.error('Failed to resume task:', err);
    }
  };

  const handleDeleteTask = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await fetch(`/api/tasks/${id}`, { method: 'DELETE' });
      setTasks((prev) => prev.filter((t) => t.id !== id));
      if (selectedTaskId === id) setSelectedTaskId(null);
    } catch (err) {}
  };

  const handleRetryTask = async (t: any, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!t) return;
    const prompt = `Retry and continue executing the previous task: "${formatTaskDescription(t.description)}". Analyze where it stopped or if there were any errors/failures, resolve them, and complete all remaining steps.`;

    const msg = { id: Math.random().toString(), role: 'user' as const, content: prompt };
    setChatHistories((prev) => ({ ...prev, [t.id]: [...(prev[t.id] || []), msg] }));
    setSelectedTaskId(t.id);
    setIsSubmitting(true);
    try {
      await fetch('/api/goals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          goal: prompt,
          contextDir: t.contextDir || contextDir,
          taskId: t.id,
        }),
      });
    } catch (err) {}
    setIsSubmitting(false);
  };

  const handleGoalSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!goalInput.trim()) return;

    const historyArr = selectedTaskId
      ? chatHistories[selectedTaskId] || []
      : chatHistories['temp'] || [];
    let activeQuestion = null;
    for (let i = historyArr.length - 1; i >= 0; i--) {
      const m = historyArr[i];
      if (m.role === 'user' && m.content.includes('[Answer to Swarm]')) break;
      if (m.role === 'question') {
        activeQuestion = m;
        break;
      }
    }

    if (activeQuestion && (!activeQuestion.options || activeQuestion.options.length === 0)) {
      const answer = goalInput.trim();
      const goal = `[User Input Provided]: ${answer}`;
      const ansMsg = {
        id: Math.random().toString(),
        role: 'user' as const,
        content: `[Answer to Swarm]: ${activeQuestion.isSecret ? '••••••••••••••••' : answer}`,
      };

      setGoalInput('');
      setShowMentionMenu(false);

      if (selectedTaskId) {
        setChatHistories((prev) => ({
          ...prev,
          [selectedTaskId]: [...(prev[selectedTaskId] || []), ansMsg],
        }));
        setIsSubmitting(true);
        fetch('/api/goals', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            goal,
            contextDir,
            taskId: selectedTaskId,
          }),
        }).finally(() => setIsSubmitting(false));
      } else {
        setChatHistories((prev) => ({ ...prev, temp: [ansMsg] }));
        setIsSubmitting(true);
        fetch('/api/goals', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ goal, contextDir }),
        }).finally(() => setIsSubmitting(false));
      }
      return;
    }

    const displayGoal = goalInput;
    // Strip @ from file mentions and wrap in quotes so the agent doesn't create files literally starting with @
    const backendGoal = goalInput.replace(/(^|\s)@([@a-zA-Z0-9_\-./\\]+)/g, "$1'$2'");

    const referencedFiles: string[] = [];
    const refRegex = /(^|\s)@([@a-zA-Z0-9_\-./\\]+)/g;
    let match;
    while ((match = refRegex.exec(goalInput)) !== null) {
      referencedFiles.push(match[2]);
    }

    setGoalInput('');
    setShowMentionMenu(false);

    const msg = { id: Math.random().toString(), role: 'user' as const, content: displayGoal };
    if (selectedTaskId) {
      setChatHistories((prev) => ({
        ...prev,
        [selectedTaskId]: [...(prev[selectedTaskId] || []), msg],
      }));
    } else {
      setChatHistories((prev) => ({ ...prev, temp: [msg] })); // Will be overwritten by task_created
    }

    setIsSubmitting(true);
    try {
      const res = await fetch('/api/goals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          goal: backendGoal,
          images: attachedImage ? [attachedImage] : undefined,
          referencedFiles,
          contextDir,
          taskId: selectedTaskId || undefined,
          mode: swarmMode,
        }),
      });
      const data = await res.json();
      if (data.success && data.tasks && data.tasks.length > 0) {
        const newTask = data.tasks[0];
        setTasks((prev) => {
          const exists = prev.find((t) => t.id === newTask.id);
          if (exists) return prev.map((t) => (t.id === newTask.id ? { ...newTask, ...t } : t));
          return [newTask, ...prev];
        });
        setSelectedTaskId(newTask.id);

        setChatHistories((prev) => {
          if (prev.temp && !selectedTaskId) {
            const { temp, ...rest } = prev;
            const existing = rest[newTask.id] || [];
            return { ...rest, [newTask.id]: [...temp, ...existing] };
          }
          return prev;
        });
      }
      setAttachedImage(null);
    } catch (e) {
      console.error(e);
    }
    setIsSubmitting(false);
  };

  const isAgentRunning =
    isSubmitting ||
    (selectedTask && selectedTask.status === 'running') ||
    tasks.some((t) => t.status === 'running');

  const handleStopAgent = async (e?: React.FormEvent | React.MouseEvent) => {
    if (e) e.preventDefault();
    const runningTask = tasks.find((t) => t.status === 'running') || selectedTask;
    if (runningTask) {
      try {
        await fetch(`/api/tasks/${runningTask.id}/stop`, { method: 'POST' });
        setTasks((prev) =>
          prev.map((t) => (t.id === runningTask.id ? { ...t, status: 'stopped' } : t)),
        );
      } catch (err) {}
    }
    setIsSubmitting(false);
  };

  const handleWipeAll = () => {
    setChatHistories({});
    setTasks([]);
    setSelectedTaskId(null);
    localStorage.removeItem('warden_chat_histories');
    localStorage.removeItem('warden_tasks');
  };

  const handleConnectGithub = async () => {
    if (!contextDir) return;
    setConnectGithubModalOpen(false);

    let goal = '';
    let statusMsg = '';
    if (!githubUrl || !githubUrl.trim()) {
      if (!gitStatus.isRepo) {
        goal = `Initialize a git repository in this workspace using git init, stage all files using git add ., and make an initial commit with message "Initial commit".`;
        statusMsg = `[Git] Initializing local repository and making initial commit...`;
      } else {
        alert(
          'This workspace is already initialized as a Git repository! Please enter a remote GitHub repository URL (e.g., https://github.com/username/repo.git) in the input box above to connect and push.',
        );
        return;
      }
    } else {
      goal = `Initialize a git repository in this workspace if not already initialized, stage all files, make an initial commit, link or update the remote origin to ${githubUrl.trim()}, and push the initial commit to the main branch.`;
      statusMsg = `[GitHub] Connecting and pushing to ${githubUrl.trim()}...`;
    }

    const msg = { id: Math.random().toString(), role: 'user' as const, content: statusMsg };
    setChatHistories((prev) => ({ ...prev, temp: [msg] }));
    setSelectedTaskId(null);
    setIsSubmitting(true);

    try {
      await fetch('/api/goals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ goal, contextDir }),
      });
    } catch (e) {
      console.error(e);
    }
    setIsSubmitting(false);
    if (githubUrl) setGithubUrl('');
  };

  const handleGithubAction = async (
    action:
      | 'commit'
      | 'push'
      | 'pull'
      | 'scan'
      | 'branch'
      | 'issue'
      | 'pr_create'
      | 'pr_review'
      | 'pr_merge',
  ) => {
    if (!contextDir) return;
    let goal = '';
    if (action === 'commit') {
      goal =
        'Run git diff to analyze all unstaged changes. Based on the actual code diff, generate a concise and descriptive semantic commit message. Then, execute git add . and git commit -m "<your message>".';
    } else if (action === 'push') {
      goal =
        'Run git diff to analyze all unstaged changes. Based on the actual code diff, generate a concise and descriptive semantic commit message. Then, execute git add ., git commit -m "<your message>", and git push.';
    } else if (action === 'pull') {
      goal = 'run git pull';
    } else if (action === 'scan') {
      goal =
        'Scan all files in this workspace. Identify any potential bugs, security vulnerabilities, or code quality issues. Generate a detailed Markdown QA report and CREATE A FILE named "warden_qa_report.md" in the root of the workspace containing your findings.';
    } else if (action === 'branch') {
      goal =
        'Check the current git status and existing branches using git branch -a. If on main/master or if there are unstaged changes, create and checkout a clean semantic feature branch (e.g. feature/update-workspace or fix/code-improvements) using git checkout -b <branch-name> and report the new branch status.';
    } else if (action === 'issue') {
      goal =
        'Check if GitHub CLI (gh) is installed by running gh --version. Analyze the codebase or recent QA findings. If gh is authenticated, create a well-structured GitHub Issue using gh issue create (with a clear title and detailed markdown body detailing any bugs or improvements). If gh is not installed or authenticated, generate a comprehensive ISSUE_TEMPLATE.md file and explain the exact steps to submit it.';
    } else if (action === 'pr_create') {
      goal =
        'Check current git branch and changes. Make sure all changes are committed, then push the current branch to remote origin using git push -u origin <current-branch>. Then, check if GitHub CLI (gh) is installed and authenticated; if so, create a Pull Request using gh pr create --fill --title "<semantic title>" --body "<detailed description>". If gh is unavailable, output the exact GitHub URL to open the PR in the browser.';
    } else if (action === 'pr_review') {
      goal =
        'Check if GitHub CLI (gh) is installed and authenticated. List all open pull requests using gh pr list. Select the most relevant or recent open PR, inspect its code diff using gh pr diff <PR-ID>, check for potential bugs or conflicts, and provide a comprehensive architectural review.';
    } else if (action === 'pr_merge') {
      goal =
        'Check if GitHub CLI (gh) is installed and authenticated. List open pull requests using gh pr list. For the approved or correct PR, merge it cleanly into the main branch using gh pr merge <PR-ID> --merge --delete-branch. If gh is unavailable, explain the git fetch and git merge sequence.';
    }

    const msg = {
      id: Math.random().toString(),
      role: 'user' as const,
      content: `[GitHub] ${action.toUpperCase()} command initiated...`,
    };
    setChatHistories((prev) => ({ ...prev, temp: [msg] }));
    setSelectedTaskId(null);
    setIsSubmitting(true);

    try {
      await fetch('/api/goals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ goal, contextDir }),
      });
    } catch (e) {
      console.error(e);
    }
    setIsSubmitting(false);
  };

  const formatTaskDescription = (desc: string) => formatTaskDescriptionHelper(desc);

  const getRelativeTime = (timeStr?: string) => {
    if (!timeStr) return '';
    try {
      const diffMs = Date.now() - new Date(timeStr).getTime();
      if (isNaN(diffMs)) return '';
      const mins = Math.floor(diffMs / 60000);
      if (mins < 60) return `${Math.max(1, mins)}m`;
      const hours = Math.floor(mins / 60);
      if (hours < 24) return `${hours}h`;
      const days = Math.floor(hours / 24);
      return `${days}d`;
    } catch {
      return '';
    }
  };

  const getRealtimeStatus = () => {
    if (!selectedTask) return 'Ready';

    const history = chatHistories[selectedTask.id] || [];
    const hasOutput = history.some((m) => m.role === 'output');

    if (selectedTask.status === 'ready') return 'Starting...';
    if (selectedTask.status === 'done') return 'Completed';
    if (selectedTask.status === 'failed') return 'Failed';
    if (selectedTask.status === 'escalated') return 'Needs Input';

    // Task is running — show contextual status
    if (history.length === 0) {
      return 'Thinking...';
    }

    // Check latest messages for context
    for (let i = history.length - 1; i >= Math.max(0, history.length - 5); i--) {
      const text = history[i].content || '';
      if (
        text.includes('write_file') ||
        text.includes('create_file') ||
        text.includes('Generating file') ||
        text.includes('Successfully wrote')
      ) {
        return 'Writing files...';
      }
      if (text.includes('edit_file') || text.includes('Edited file')) {
        return 'Editing code...';
      }
      if (text.includes('read_file') || text.includes('list_dir') || text.includes('grep_search')) {
        return 'Reading codebase...';
      }
      if (
        text.includes('Running:') ||
        text.includes('Executing:') ||
        text.includes('run_command')
      ) {
        return 'Running command...';
      }
      if (text.includes('Answering question')) {
        return 'Composing answer...';
      }
    }
    return 'Thinking...';
  };

  const statusText = getRealtimeStatus();

  const memPercent =
    Math.round((sysInfo.memoryUsedBytes / (sysInfo.memoryTotalBytes || 1)) * 100) || 0;

  const renderTaskNode = (t: any, depth: number = 0) => {
    const isSubTask = depth > 0;
    const children = tasks.filter((sub) => sub.parentId === t.id);
    const relTime = getRelativeTime(t.createdAt);
    return (
      <div key={t.id} className="relative flex flex-col gap-1">
        <motion.div
          layout
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{
            opacity: 0,
            x: -250,
            height: 0,
            overflow: 'hidden',
            marginBottom: 0,
            paddingBottom: 0,
            paddingTop: 0,
          }}
          transition={{ duration: 0.3, ease: [0.32, 0.72, 0, 1] }}
          className={`cursor-pointer transition-all group relative flex items-center justify-between py-1.5 px-2.5 rounded-xl hover:bg-black/5 dark:hover:bg-white/[0.04] ${selectedTaskId === t.id ? 'bg-black/5 dark:bg-white/10 opacity-100' : 'opacity-80 hover:opacity-100'} ${isSubTask ? 'pl-6 ml-2 border-l border-[#E4E4E7] dark:border-[#1F1F1F]' : ''}`}
          onClick={() => {
            if (selectedTaskId !== t.id) {
              setSelectedTaskId(t.id);
            }
          }}
        >
          <div className="flex items-center gap-2.5 min-w-0 flex-1 pr-2">
            <span
              className={`text-[13px] font-sans truncate ${selectedTaskId === t.id ? 'text-[#18181B] dark:text-white font-medium' : 'text-[#52525B] dark:text-[#D4D4D8] font-normal group-hover:text-[#18181B] dark:group-hover:text-white'}`}
            >
              {formatTaskDescription(t.description)}
            </span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <div
              className="flex items-center gap-1 opacity-50 hover:opacity-100 transition-opacity"
              onClick={(e) => e.stopPropagation()}
            >
              <AnimatePresence>
                {confirmDeleteId === t.id && (
                  <motion.button
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                    transition={{ type: 'spring', stiffness: 400, damping: 35 }}
                    onClick={(e) => {
                      handleDeleteTask(t.id, e);
                      setConfirmDeleteId(null);
                    }}
                    title="Confirm Delete"
                    className="text-[#10B981] hover:bg-[#10B981]/20 p-1 rounded transition-colors"
                  >
                    <Check size={14} weight="bold" />
                  </motion.button>
                )}
              </AnimatePresence>

              {(t.status === 'stopped' || t.status === 'failed') && (
                <button
                  onClick={(e) => handleResumeTask(t.id, e)}
                  className={`p-1 rounded transition-colors text-[#A1A1AA] hover:text-[#10B981] hover:bg-[#10B981]/10`}
                  title="Resume Task"
                >
                  <ArrowClockwise size={13} weight="bold" />
                </button>
              )}

              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setConfirmDeleteId(confirmDeleteId === t.id ? null : t.id);
                }}
                className={`p-1 rounded transition-colors ${confirmDeleteId === t.id ? 'text-[#EF4444] bg-[#FEF2F2] dark:bg-red-500/20' : 'text-[#A1A1AA] hover:text-[#EF4444] hover:bg-red-500/10'}`}
                title={confirmDeleteId === t.id ? 'Cancel' : 'Delete'}
              >
                <X size={13} weight="bold" />
              </button>
            </div>

            <div className="flex items-center gap-1.5 min-w-[24px] justify-end">
              {t.status === 'running' ? (
                <span
                  className="w-2 h-2 rounded-full bg-[#3B82F6] animate-pulse shrink-0"
                  title="Running"
                />
              ) : (
                <span className="text-[11px] font-sans text-[#71717A] dark:text-[#71717A] shrink-0 group-hover:hidden">
                  {relTime || '1d'}
                </span>
              )}
            </div>
          </div>
        </motion.div>

        {children.length > 0 && (
          <div className="flex flex-col gap-1 pl-2">
            {children.map((child) => renderTaskNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  const activeProjectTasks = tasks.filter((t) => {
    const taskDir = (t.contextDir || '').replace(/\\/g, '/').toLowerCase();
    const currentDir = (contextDir || rootWorkspace || '').replace(/\\/g, '/').toLowerCase();
    return taskDir === currentDir;
  });

  return (
    <div
      className={`h-screen w-screen overflow-hidden flex font-sans antialiased selection:bg-fuchsia-500/30 bg-[#0A0A0A] text-[#F4F4F5]`}
    >
      <AnimatePresence>
        {showSearchModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[105] flex items-start justify-center pt-[10vh] bg-black/20 dark:bg-black/60 backdrop-blur-sm"
            onClick={() => setShowSearchModal(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: -20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: -10 }}
              transition={{ duration: 0.15, ease: 'easeOut' }}
              onClick={(e) => e.stopPropagation()}
              className="w-[700px] max-h-[80vh] bg-white dark:bg-[#0A0A0A] border border-[#E4E4E7] dark:border-white/[0.08] rounded-2xl shadow-2xl overflow-hidden flex flex-col"
            >
              <div className="flex items-center px-4 py-4 border-b border-[#E4E4E7] dark:border-white/[0.08]">
                <MagnifyingGlass size={20} className="text-[#A1A1AA] mr-3 shrink-0" />
                <input
                  ref={searchInputRef}
                  value={searchQuery}
                  onChange={(e) => executeSearch(e.target.value)}
                  placeholder="Search across all files (Ctrl+Shift+F)..."
                  className="flex-1 bg-transparent border-none outline-none text-[16px] font-sans text-[#18181B] dark:text-[#F4F4F5] placeholder-[#A1A1AA]"
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') setShowSearchModal(false);
                  }}
                />
                {isSearching && (
                  <SpinnerGap size={18} className="text-[#3B82F6] animate-spin shrink-0" />
                )}
                <div className="flex items-center gap-1 ml-3">
                  <kbd className="px-1.5 py-0.5 bg-[#F4F4F5] dark:bg-white/[0.04] rounded text-[10px] font-mono text-[#71717A] dark:text-[#A1A1AA] font-bold border border-[#E4E4E7] dark:border-white/[0.08]">
                    ESC
                  </kbd>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-2 bg-white dark:bg-[#0A0A0A]">
                {searchResults.length === 0 && searchQuery && !isSearching && (
                  <div className="p-8 text-center text-[#71717A]">
                    No results found for "{searchQuery}"
                  </div>
                )}
                {searchResults.map((res, i) => (
                  <div
                    key={i}
                    onClick={() => {
                      const fullPath = `${contextDir || rootWorkspace}/${res.file}`;
                      if (!openTabs.includes(fullPath)) setOpenTabs((prev) => [...prev, fullPath]);
                      setActiveTab(fullPath);
                      setShowSearchModal(false);
                    }}
                    className="flex flex-col gap-1 p-3 hover:bg-black/5 dark:hover:bg-white/[0.04] rounded-xl cursor-pointer border border-transparent hover:border-[#E4E4E7] dark:hover:border-white/5 transition-colors group"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[12px] font-mono text-[#3B82F6] font-semibold">
                        {res.file}
                      </span>
                      <span className="text-[11px] font-mono text-[#A1A1AA]">Line {res.line}</span>
                    </div>
                    <code className="text-[12px] font-mono text-[#18181B] dark:text-[#E4E4E7] truncate opacity-80 group-hover:opacity-100">
                      {res.content}
                    </code>
                  </div>
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {showCommandPalette && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh] bg-black/20 dark:bg-black/60 backdrop-blur-sm"
            onClick={() => setShowCommandPalette(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: -20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: -10 }}
              transition={{ duration: 0.15, ease: 'easeOut' }}
              onClick={(e) => e.stopPropagation()}
              className="w-[600px] bg-white dark:bg-black border border-[#E4E4E7] dark:border-transparent rounded-2xl shadow-[0_20px_60px_rgba(0,0,0,0.15)] dark:shadow-[0_20px_60px_rgba(0,0,0,0.4)] overflow-hidden flex flex-col"
            >
              <div className="flex items-center px-4 py-4 border-b border-[#E4E4E7] dark:border-transparent">
                <MagnifyingGlass size={20} className="text-[#A1A1AA] mr-3" />
                <input
                  ref={commandInputRef}
                  value={commandPaletteQuery}
                  onChange={(e) => setCommandPaletteQuery(e.target.value)}
                  placeholder="Type a command or search..."
                  className="flex-1 bg-transparent border-none outline-none text-[16px] font-sans text-[#18181B] dark:text-[#F4F4F5] placeholder-[#A1A1AA] dark:placeholder-[#52525B]"
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') setShowCommandPalette(false);
                    if (e.key === 'Enter') {
                      const q = commandPaletteQuery.toLowerCase();
                      if (q.includes('clear')) {
                        handleWipeAll();
                        setShowCommandPalette(false);
                      } else if (q.includes('dark') || q.includes('light') || q.includes('theme')) {
                        setIsDarkMode(!isDarkMode);
                        localStorage.setItem('warden_theme', !isDarkMode ? 'dark' : 'light');
                        setShowCommandPalette(false);
                      } else if (q.includes('push')) {
                        handleGithubAction('push');
                        setShowCommandPalette(false);
                      } else if (q.includes('pull') && !q.includes('request')) {
                        handleGithubAction('pull');
                        setShowCommandPalette(false);
                      } else if (q.includes('scan') || q.includes('bug')) {
                        handleGithubAction('scan');
                        setShowCommandPalette(false);
                      } else if (q.includes('branch')) {
                        handleGithubAction('branch');
                        setShowCommandPalette(false);
                      } else if (q.includes('issue')) {
                        handleGithubAction('issue');
                        setShowCommandPalette(false);
                      } else if (q.includes('pr') || q.includes('pull request')) {
                        if (q.includes('review')) handleGithubAction('pr_review');
                        else if (q.includes('merge')) handleGithubAction('pr_merge');
                        else handleGithubAction('pr_create');
                        setShowCommandPalette(false);
                      } else if (q.includes('review')) {
                        handleGithubAction('pr_review');
                        setShowCommandPalette(false);
                      } else if (q.includes('merge')) {
                        handleGithubAction('pr_merge');
                        setShowCommandPalette(false);
                      } else if (q.trim().length > 0 && contextDir) {
                        // Launch any freeform command or prompt directly as an autonomous AI task!
                        const goal = commandPaletteQuery.trim();
                        const msg = {
                          id: Math.random().toString(),
                          role: 'user' as const,
                          content: goal,
                        };
                        setChatHistories((prev) => ({ ...prev, temp: [msg] }));
                        setSelectedTaskId(null);
                        setIsSubmitting(true);
                        fetch('/api/goals', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ goal, contextDir }),
                        }).finally(() => setIsSubmitting(false));
                        setShowCommandPalette(false);
                        setCommandPaletteQuery('');
                      }
                    }
                  }}
                />
                <div className="flex items-center gap-1">
                  <kbd className="px-1.5 py-0.5 bg-[#F4F4F5] dark:bg-[#1A1A1A] rounded text-[10px] font-mono text-[#71717A] dark:text-[#A1A1AA] font-bold border border-[#E4E4E7] dark:border-[#2A2A2A]">
                    ESC
                  </kbd>
                </div>
              </div>
              <div className="p-2 space-y-1 max-h-[300px] overflow-y-auto">
                <div
                  onClick={(e) => {
                    const nextMode = !isDarkMode;
                    setShowCommandPalette(false);
                    if (!document.startViewTransition) {
                      setIsDarkMode(nextMode);
                      return;
                    }
                    const x = e.clientX || innerWidth / 2;
                    const y = e.clientY || innerHeight / 2;
                    const endRadius = Math.hypot(
                      Math.max(x, innerWidth - x),
                      Math.max(y, innerHeight - y),
                    );
                    const transition = document.startViewTransition(() => setIsDarkMode(nextMode));
                    transition.ready.then(() => {
                      document.documentElement.animate(
                        {
                          clipPath: [
                            `circle(0px at ${x}px ${y}px)`,
                            `circle(${endRadius}px at ${x}px ${y}px)`,
                          ],
                        },
                        {
                          duration: 500,
                          easing: 'ease-in-out',
                          pseudoElement: '::view-transition-new(root)',
                        },
                      );
                    });
                  }}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-[#F4F4F5] dark:hover:bg-[#27272A] cursor-pointer group"
                >
                  {isDarkMode ? (
                    <Sun
                      size={16}
                      className="text-[#A1A1AA] group-hover:text-[#18181B] dark:group-hover:text-[#F4F4F5]"
                    />
                  ) : (
                    <Moon
                      size={16}
                      className="text-[#A1A1AA] group-hover:text-[#18181B] dark:group-hover:text-[#F4F4F5]"
                    />
                  )}
                  <span className="text-[13px] font-sans text-[#52525B] dark:text-[#A1A1AA] group-hover:text-[#18181B] dark:group-hover:text-[#F4F4F5]">
                    Toggle Theme
                  </span>
                </div>
                <div
                  onClick={() => {
                    handleGithubAction('push');
                    setShowCommandPalette(false);
                  }}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-[#F4F4F5] dark:hover:bg-[#27272A] cursor-pointer group"
                >
                  <UploadSimple size={16} className="text-[#A1A1AA] group-hover:text-[#3B82F6]" />
                  <span className="text-[13px] font-sans text-[#52525B] dark:text-[#A1A1AA] group-hover:text-[#18181B] dark:group-hover:text-[#F4F4F5]">
                    Git: Auto-commit & Push
                  </span>
                </div>
                <div
                  onClick={() => {
                    handleWipeAll();
                    setShowCommandPalette(false);
                  }}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-[#FEF2F2] dark:hover:bg-[#EF4444]/10 cursor-pointer group"
                >
                  <Trash size={16} className="text-[#A1A1AA] group-hover:text-[#EF4444]" />
                  <span className="text-[13px] font-sans text-[#52525B] dark:text-[#A1A1AA] group-hover:text-[#EF4444]">
                    Clear Chat Histories
                  </span>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {pickerOpen && (
          <FolderPickerModal
            isOpen={pickerOpen}
            onClose={() => setPickerOpen(false)}
            onSelect={(path) => {
              setContextDir(path);
              setRootWorkspace(path);
              localStorage.setItem('warden_workspace', path);
              localStorage.setItem('warden_root_workspace', path);
              try {
                const rawRec = JSON.parse(localStorage.getItem('warden_recent_workspaces') || '[]');
                const rec = rawRec.filter(
                  (p: string, i: number, arr: string[]) =>
                    arr.findIndex(
                      (item) =>
                        item.replace(/\\/g, '/').toLowerCase() ===
                        p.replace(/\\/g, '/').toLowerCase(),
                    ) === i,
                );
                const next = [
                  path,
                  ...rec.filter(
                    (p: string) =>
                      p.replace(/\\/g, '/').toLowerCase() !==
                      path.replace(/\\/g, '/').toLowerCase(),
                  ),
                ].slice(0, 6);
                localStorage.setItem('warden_recent_workspaces', JSON.stringify(next));
                setRecentWorkspaces(next);
              } catch {}
            }}
            initialPath={contextDir || 'C:\\Users\\sahaj\\Desktop'}
          />
        )}
      </AnimatePresence>

      {/* LEFT COLUMN - SEAMLESS (NO BORDERS OR SHADOWS) */}
      <AnimatePresence>
        {isSidebarOpen && (
          <motion.nav
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 300, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 450, damping: 45 }}
            className="w-[300px] flex flex-col flex-shrink-0 z-20 h-full relative bg-white dark:bg-black overflow-hidden"
          >
            <div className="flex-1 overflow-y-auto px-6 py-6 space-y-8 flex flex-col w-[300px]">
              <section>
                <div className="flex items-center justify-between mb-4 pb-3 border-b border-transparent dark:border-transparent">
                  <div className="flex items-center gap-2">
                    <FolderOpen size={18} className="text-fuchsia-500 shrink-0" weight="duotone" />
                    <span className="text-[15px] font-bold font-sans text-[#18181B] dark:text-white tracking-tight">
                      Workspaces
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {rootWorkspace ? (
                      <motion.button
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => setPickerOpen(true)}
                        className="flex items-center h-7 px-2.5 gap-1.5 text-[12px] font-bold bg-fuchsia-500/10 hover:bg-fuchsia-500/20 text-fuchsia-500 border-0 shadow-none cursor-pointer transition-colors rounded-md"
                        title="Switch to another workspace"
                      >
                        <ShareNetwork size={14} weight="bold" />
                        <span>Switch</span>
                      </motion.button>
                    ) : (
                      <div className="flex items-center gap-1 text-[#3B82F6]">
                        <ShareNetwork size={13} className="animate-spin" />
                        <span className="text-[12px] font-normal font-sans text-[#71717A] group-hover:text-[#3B82F6] transition-colors">
                          Select workspace
                        </span>
                      </div>
                    )}
                    <button
                      onClick={() => setIsSidebarOpen(false)}
                      className="p-1 rounded-md text-[#A1A1AA] hover:text-[#18181B] dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
                      title="Close Sidebar"
                    >
                      <X size={16} weight="bold" />
                    </button>
                  </div>
                </div>

                {/* File Tree Header with action buttons */}
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] font-sans font-semibold text-[#71717A] dark:text-[#A1A1AA] uppercase tracking-wider">
                    Files
                  </span>
                  {rootWorkspace && (
                    <div className="flex items-center gap-1">
                      <Button
                        onClick={() => {
                          setIsCreatingFile(true);
                          setIsCreatingFolder(false);
                        }}
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0 bg-transparent hover:bg-black/5 text-[#71717A] hover:text-[#18181B] dark:bg-transparent dark:hover:bg-white/[0.08] dark:text-[#A1A1AA] dark:hover:text-white cursor-pointer transition-colors rounded"
                        title="New File"
                      >
                        <Plus size={14} weight="bold" />
                      </Button>
                      <Button
                        onClick={() => {
                          setIsCreatingFolder(true);
                          setIsCreatingFile(false);
                        }}
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0 bg-transparent hover:bg-black/5 text-[#71717A] hover:text-[#18181B] dark:bg-transparent dark:hover:bg-white/[0.08] dark:text-[#A1A1AA] dark:hover:text-white cursor-pointer transition-colors rounded"
                        title="New Folder"
                      >
                        <FolderPlus size={14} weight="bold" />
                      </Button>
                      <Button
                        onClick={() => {
                          fetch('/api/open-explorer', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ dir: contextDir || rootWorkspace }),
                          }).catch(() => {});
                        }}
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0 bg-transparent hover:bg-black/5 text-[#71717A] hover:text-[#18181B] dark:bg-transparent dark:hover:bg-white/[0.08] dark:text-[#A1A1AA] dark:hover:text-white cursor-pointer transition-colors rounded"
                        title="Open in File Explorer"
                      >
                        <FolderOpen size={14} weight="bold" />
                      </Button>
                    </div>
                  )}
                </div>

                <div className="space-y-4 max-h-[38vh] overflow-y-auto pr-1">
                  {contextDir ? (
                    <>
                      <div className="pl-4 space-y-2">
                        <AnimatePresence>
                          {isCreatingFile && (
                            <motion.form
                              initial={{ opacity: 0, height: 0, y: -12, scale: 0.95 }}
                              animate={{ opacity: 1, x: 0, height: 'auto', y: 0, scale: 1 }}
                              exit={{ opacity: 0, height: 0, y: -12, scale: 0.95 }}
                              transition={{ type: 'spring', stiffness: 400, damping: 35 }}
                              onSubmit={handleCreateFile}
                              className="flex items-center gap-2 mb-2 overflow-hidden"
                            >
                              <input
                                autoFocus
                                value={newFileName}
                                onChange={(e) => setNewFileName(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Escape') {
                                    setIsCreatingFile(false);
                                    setNewFileName('');
                                  }
                                }}
                                className="bg-transparent border-0 outline-none shadow-none text-[12px] font-mono text-[#111111] dark:text-white w-full py-0.5 px-0 focus:outline-none focus:ring-0 focus:border-0 focus:bg-transparent focus:shadow-none"
                                placeholder="filename.ext"
                              />
                            </motion.form>
                          )}
                        </AnimatePresence>
                        <AnimatePresence>
                          {isCreatingFolder && (
                            <motion.form
                              initial={{ opacity: 0, height: 0, y: -12, scale: 0.95 }}
                              animate={{ opacity: 1, x: 0, height: 'auto', y: 0, scale: 1 }}
                              exit={{ opacity: 0, height: 0, y: -12, scale: 0.95 }}
                              transition={{ type: 'spring', stiffness: 400, damping: 35 }}
                              onSubmit={handleCreateFolder}
                              className="flex items-center gap-2 mb-2 overflow-hidden"
                            >
                              <input
                                autoFocus
                                value={newFolderName}
                                onChange={(e) => setNewFolderName(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Escape') {
                                    setIsCreatingFolder(false);
                                    setNewFolderName('');
                                  }
                                }}
                                className="bg-transparent border-0 outline-none shadow-none text-[12px] font-mono text-[#111111] dark:text-white w-full py-0.5 px-0 focus:outline-none focus:ring-0 focus:border-0 focus:bg-transparent focus:shadow-none"
                                placeholder="folder_name"
                              />
                            </motion.form>
                          )}
                        </AnimatePresence>
                        <Suspense
                          fallback={
                            <div className="p-4 text-[#A1A1AA] text-sm flex items-center gap-2">
                              <SpinnerGap className="animate-spin" /> Loading File Tree...
                            </div>
                          }
                        >
                          <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ duration: 0.3 }}
                          >
                            <FileTree
                              files={allWorkspaceFiles}
                              activeFile={
                                activeTab && contextDir && activeTab.startsWith(contextDir + '/')
                                  ? activeTab.slice(contextDir.length + 1)
                                  : activeTab
                              }
                              onSelectFile={(relPath) => {
                                const fullPath = `${contextDir}/${relPath}`;
                                if (!openTabs.includes(fullPath)) {
                                  setOpenTabs((prev) => [...prev, fullPath]);
                                }
                                setActiveTab(fullPath);
                              }}
                              onDeleteFile={handleDeleteFile}
                              confirmDeleteId={confirmDeleteId}
                              setConfirmDeleteId={setConfirmDeleteId}
                            />
                          </motion.div>
                        </Suspense>
                      </div>
                    </>
                  ) : (
                    <div className="group flex flex-col items-center justify-center gap-3 p-4 py-8 rounded-lg transition-all">
                      <div className="text-[#A1A1AA] dark:text-[#52525B]">
                        <Folder size={32} weight="duotone" />
                      </div>
                      <span className="text-[12px] font-medium font-sans text-[#71717A] dark:text-[#A1A1AA] text-center leading-relaxed">
                        Select a project from the sidebar to view files.
                      </span>
                    </div>
                  )}
                </div>
              </section>

              <section className="border-t border-[#E4E4E7] dark:border-white/[0.08] pt-4 mt-2">
                <div
                  className="flex items-center justify-between mb-3 cursor-pointer group"
                  onClick={() => setGitPanelOpen(!gitPanelOpen)}
                >
                  <div className="flex items-center gap-2">
                    <GitBranch size={18} className="text-[#F97316] shrink-0" weight="duotone" />
                    <span className="text-[14px] font-bold font-sans text-[#18181B] dark:text-white tracking-tight">
                      Source Control (Git)
                    </span>
                  </div>
                  <CaretDown
                    size={14}
                    className={`text-[#A1A1AA] transition-transform ${gitPanelOpen ? 'rotate-180' : ''}`}
                  />
                </div>

                <AnimatePresence>
                  {gitPanelOpen && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden space-y-2"
                    >
                      <div className="text-[12px] font-mono text-[#71717A] dark:text-[#A1A1AA]">
                        Quick Git Actions
                      </div>
                      <div className="flex flex-col gap-1.5 mt-2">
                        <Button
                          onClick={() => handleGithubAction('commit')}
                          size="sm"
                          variant="outline"
                          className="w-full justify-start text-[12px] bg-white dark:bg-black text-[#18181B] dark:text-[#F4F4F5] border-[#E4E4E7] dark:border-white/[0.08] hover:bg-[#F4F4F5] dark:hover:bg-white/[0.08]"
                        >
                          <Check size={14} className="mr-2" /> Commit All Changes
                        </Button>
                        <Button
                          onClick={() => handleGithubAction('push')}
                          size="sm"
                          variant="outline"
                          className="w-full justify-start text-[12px] bg-white dark:bg-black text-[#18181B] dark:text-[#F4F4F5] border-[#E4E4E7] dark:border-white/[0.08] hover:bg-[#F4F4F5] dark:hover:bg-white/[0.08]"
                        >
                          <UploadSimple size={14} className="mr-2" /> Push to Remote
                        </Button>
                        <Button
                          onClick={() => handleGithubAction('branch')}
                          size="sm"
                          variant="outline"
                          className="w-full justify-start text-[12px] bg-white dark:bg-black text-[#18181B] dark:text-[#F4F4F5] border-[#E4E4E7] dark:border-white/[0.08] hover:bg-[#F4F4F5] dark:hover:bg-white/[0.08]"
                        >
                          <GitBranch size={14} className="mr-2" /> Create New Branch
                        </Button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </section>

              <section className="border-t border-[#E4E4E7] dark:border-white/[0.08] pt-4 mt-2">
                <div
                  className="flex items-center justify-between mb-4 group cursor-pointer"
                  onClick={() => setSelectedTaskId(null)}
                  title="Click to start a new chat in active folder"
                >
                  <h2 className="text-[13px] font-normal text-[#52525B] dark:text-[#A1A1AA] font-sans tracking-tight group-hover:text-[#18181B] dark:group-hover:text-[#F4F4F5] transition-colors">
                    Workspace Threads
                  </h2>
                  <Button
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedTaskId(null);
                    }}
                    size="sm"
                    className="h-7 px-3 gap-1.5 text-[12px] font-bold bg-transparent hover:bg-black/5 text-[#18181B] dark:bg-transparent dark:hover:bg-white/[0.08] dark:text-white border-0 shadow-none cursor-pointer transition-all rounded-md"
                    title="New chat in active folder"
                  >
                    <Plus size={14} weight="bold" />
                    <span>New Chat</span>
                  </Button>
                </div>

                <div className="space-y-4">
                  {(() => {
                    const rootTasks = tasks.filter(
                      (t) => !t.parentId || !tasks.some((p) => p.id === t.parentId),
                    );

                    // Load explicit projects
                    let recentWorkspaces: string[] = [];
                    try {
                      recentWorkspaces = JSON.parse(
                        localStorage.getItem('warden_recent_workspaces') || '[]',
                      );
                    } catch {}

                    // Group tasks by folder (contextDir)
                    const grouped: Record<string, any[]> = {};
                    const displayNames: Record<string, string> = {};

                    const normalizePath = (p: string) => p.replace(/\\/g, '/').toLowerCase();

                    // Initialize groups for all saved projects
                    recentWorkspaces.forEach((dir) => {
                      if (dir) {
                        const norm = normalizePath(dir);
                        grouped[norm] = [];
                        displayNames[norm] = dir;
                      }
                    });

                    const unlistedTasks: any[] = [];

                    rootTasks.forEach((t) => {
                      if (t.contextDir) {
                        const norm = normalizePath(t.contextDir);
                        // ONLY add to grouped if the user explicitly added this workspace
                        if (grouped[norm]) {
                          grouped[norm].push(t);
                        }
                      } else {
                        unlistedTasks.push(t);
                      }
                    });

                    if (unlistedTasks.length > 0) {
                      grouped['global_tasks'] = unlistedTasks;
                      displayNames['global_tasks'] = 'Global Tasks';
                    }

                    const projectKeys = Object.keys(grouped);

                    if (projectKeys.length === 0) {
                      return (
                        <div className="text-[12px] font-sans text-[#71717A] dark:text-[#A1A1AA] py-4 text-center font-medium">
                          No projects or active chat threads. Add a workspace to begin.
                        </div>
                      );
                    }

                    return (
                      <div className="space-y-5">
                        {projectKeys.map((normPath) => {
                          const dirTasks = grouped[normPath];
                          const originalPath = displayNames[normPath];
                          const dirName = originalPath.split(/[\\/]/).pop() || originalPath;
                          const isCurrent =
                            normPath ===
                            (contextDir || rootWorkspace || '').replace(/\\/g, '/').toLowerCase();
                          const isExpanded = expandedFolders[normPath];
                          const visibleTasks = isExpanded ? dirTasks : dirTasks.slice(0, 6);
                          return (
                            <div key={normPath} className="space-y-1.5">
                              <div
                                onClick={() => {
                                  setContextDir(originalPath);
                                  if (!rootWorkspace) setRootWorkspace(originalPath);
                                  localStorage.setItem('warden_workspace', originalPath);
                                }}
                                className="flex items-center justify-between py-1.5 cursor-pointer group/folder"
                                title={`Click to switch workspace to ${originalPath}`}
                              >
                                <div className="flex items-center gap-2.5 min-w-0">
                                  <div
                                    className="w-1.5 h-1.5 rounded-full bg-[#3B82F6] opacity-0 group-hover/folder:opacity-100 transition-opacity shrink-0"
                                    style={{ opacity: isCurrent ? 1 : undefined }}
                                  />
                                  <span
                                    className={`text-[14px] font-medium tracking-tight transition-colors truncate ${isCurrent ? 'text-[#18181B] dark:text-white' : 'text-[#52525B] dark:text-[#D4D4D8] group-hover/folder:text-[#18181B] dark:group-hover/folder:text-white'}`}
                                  >
                                    {dirName}
                                  </span>
                                </div>
                                {normPath !== 'global_tasks' && (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      try {
                                        const rec = JSON.parse(
                                          localStorage.getItem('warden_recent_workspaces') || '[]',
                                        );
                                        const normTarget = originalPath
                                          .replace(/\\/g, '/')
                                          .toLowerCase();
                                        const next = rec.filter(
                                          (p: string) =>
                                            p.replace(/\\/g, '/').toLowerCase() !== normTarget,
                                        );
                                        localStorage.setItem(
                                          'warden_recent_workspaces',
                                          JSON.stringify(next),
                                        );
                                        setRecentWorkspaces(next);

                                        const normContext = (contextDir || '')
                                          .replace(/\\/g, '/')
                                          .toLowerCase();
                                        const normRoot = (rootWorkspace || '')
                                          .replace(/\\/g, '/')
                                          .toLowerCase();
                                        if (normContext === normTarget || normRoot === normTarget) {
                                          const nextDir = next.length > 0 ? next[0] : null;
                                          setContextDir(nextDir);
                                          setRootWorkspace(nextDir);
                                          setOpenTabs([]);
                                          setActiveTab(null);
                                          if (nextDir) {
                                            localStorage.setItem('warden_workspace', nextDir);
                                            localStorage.setItem('warden_root_workspace', nextDir);
                                          } else {
                                            localStorage.removeItem('warden_workspace');
                                            localStorage.removeItem('warden_root_workspace');
                                          }
                                        }
                                        setTasks((prev) => [...prev]); // Force re-render
                                      } catch {}
                                    }}
                                    className="opacity-0 group-hover/folder:opacity-100 p-1 text-[#A1A1AA] hover:text-red-500 hover:bg-red-500/10 rounded transition-all"
                                    title="Remove workspace from list"
                                  >
                                    <X size={14} weight="bold" />
                                  </button>
                                )}
                              </div>

                              <div className="pl-3 space-y-1 pt-0.5">
                                <AnimatePresence>
                                  {visibleTasks.map((t) => renderTaskNode(t))}
                                </AnimatePresence>
                                {dirTasks.length > 6 && !isExpanded && (
                                  <div
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setExpandedFolders((prev) => ({ ...prev, [normPath]: true }));
                                    }}
                                    className="text-[12px] font-sans font-medium text-[#71717A] dark:text-[#71717A] hover:text-[#3B82F6] dark:hover:text-[#60A5FA] cursor-pointer py-1 pl-2.5 transition-colors"
                                  >
                                    See all ({dirTasks.length})
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()}
                </div>
              </section>
            </div>
          </motion.nav>
        )}
      </AnimatePresence>

      {/* MAIN CENTER - SEAMLESS CANVAS */}
      <main className="flex-1 flex flex-col relative h-full bg-white dark:bg-[#0A0A0A] overflow-hidden z-10">
        {/* Background Grid Lines and Panels */}
        <div className="absolute inset-0 z-0 overflow-hidden pointer-events-auto">
          {/* Hatched background row (only in center input area on home screen) */}
          {/* Global Animated Pattern to cover missing places and empty canvas */}
          <div className="absolute inset-0 z-0 pointer-events-none opacity-50">
            <SketchedPanelPattern title="Workspace Overview" isGlobal={true} />
          </div>

          {/* Flippable Grid — 5 useful panels */}
          <FlippableGridCell
            positionClass="top-0 bottom-[55%] left-0 right-[85%]"
            title="File Explorer"
            icon={TreeStructure}
            fullBleed={true}
            isOpen={panelsOpen}
            animDelay={panelDelays['fileExplorer'] || 0}
          >
            <div className="flex-1 w-full flex flex-col min-h-0">
              <Suspense fallback={<div className="p-4 text-xs">Loading...</div>}>
                <FileTree
                  files={allWorkspaceFiles}
                  activeFile={
                    activeTab && contextDir && activeTab.startsWith(contextDir + '/')
                      ? activeTab.slice(contextDir.length + 1)
                      : activeTab
                  }
                  contextDir={contextDir || ''}
                  onRefreshFiles={() => dynamicRefreshRef.current && dynamicRefreshRef.current()}
                  onSelectFile={(relPath) => {
                    const fullPath = `${contextDir}/${relPath}`;
                    if (!openTabs.includes(fullPath)) {
                      setOpenTabs((prev) => [...prev, fullPath]);
                    }
                    setActiveTab(fullPath);
                  }}
                  onDeleteFile={handleDeleteFile}
                  confirmDeleteId={confirmDeleteId}
                  setConfirmDeleteId={setConfirmDeleteId}
                />
              </Suspense>
            </div>
          </FlippableGridCell>

          <FlippableGridCell
            positionClass="top-[45%] bottom-[30%] left-0 right-[85%]"
            title="Changed Files"
            icon={PencilSimple}
            isOpen={panelsOpen}
            animDelay={panelDelays['changedFiles'] || 0}
          >
            <ChangedFilesPanel
              gitStatus={gitStatus}
              onSelectFile={(filePath: string) => {
                const fullPath = `${contextDir}/${filePath}`;
                if (!openTabs.includes(fullPath)) {
                  setOpenTabs((prev) => [...prev, fullPath]);
                }
                setActiveTab(fullPath);
              }}
              contextDir={contextDir}
              fetchGitStatus={() => {
                if (contextDir) {
                  fetch(`/api/git/status?dir=${encodeURIComponent(contextDir)}`)
                    .then((r) => r.json())
                    .then((data) => setGitStatus(data))
                    .catch(() => {});
                }
              }}
              onOpenConnectModal={() => setShowGitHubConnectModal(true)}
              autoCommitEnabled={autoCommitEnabled}
              setAutoCommitEnabled={setAutoCommitEnabled}
              userIdentity={userIdentity}
              onUpdateIdentity={() => setShowIdentityModal(true)}
            />
          </FlippableGridCell>

          <FlippableGridCell
            positionClass="top-[70%] bottom-0 left-0 right-[85%]"
            title="Recent Commits"
            icon={GitCommit}
            isOpen={panelsOpen}
            animDelay={panelDelays['commits'] || 0}
          >
            <RecentCommitsPanel gitStatus={gitStatus} />
          </FlippableGridCell>

          {/* Workspace Threads — top 70% of right column */}
          <FlippableGridCell
            positionClass="top-0 bottom-[30%] left-[85%] right-0"
            title="Workspace Threads"
            icon={Stack}
            isOpen={panelsOpen}
            animDelay={panelDelays['threads'] || 0}
          >
            <ThreadsPanel
              tasks={activeProjectTasks}
              onSelect={(id) => setSelectedTaskId(id)}
              onStop={(id) => {
                fetch(`/api/tasks/${id}/stop`, { method: 'POST' }).then(() => fetchTasks());
              }}
              onResume={(id) => {
                fetch(`/api/tasks/${id}/resume`, { method: 'POST' }).then(() => fetchTasks());
              }}
              onDelete={(id) => {
                fetch(`/api/tasks/${id}`, { method: 'DELETE' }).then(() => {
                  fetchTasks();
                  if (selectedTaskId === id) setSelectedTaskId(null);
                });
              }}
            />
          </FlippableGridCell>

          {/* Agent Activity — bottom 30% of right column */}
          <FlippableGridCell
            positionClass="top-[70%] bottom-0 left-[85%] right-0"
            title="Agent Activity"
            icon={Pulse}
            isOpen={panelsOpen}
            animDelay={panelDelays['activity'] || 0}
          >
            <AgentActivityPanel
              tasks={activeProjectTasks}
              chatHistories={chatHistories}
              selectedTaskId={selectedTaskId}
            />
          </FlippableGridCell>
        </div>

        {/* Minimalist Sidebar Toggle */}
        {!isSidebarOpen && (
          <button
            onClick={() => setIsSidebarOpen(true)}
            className={`absolute ${selectedTask ? 'top-6' : 'top-[50%] -translate-y-1/2'} left-6 z-50 p-2 rounded-lg text-[#A1A1AA] hover:text-[#18181B] dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/10 transition-all opacity-0 hover:opacity-100 group-hover:opacity-100`}
            title="Open Sidebar"
          >
            <div className="w-4 h-0.5 bg-current mb-1 rounded-full" />
            <div className="w-4 h-0.5 bg-current mb-1 rounded-full" />
            <div className="w-4 h-0.5 bg-current rounded-full" />
          </button>
        )}
        {/* TAB BAR - Flush, Sleek, Minimalist IDE style positioned in Center Block */}
        {/* TAB BAR - Flush, Sleek, Minimalist IDE style positioned in Center Block */}
        {(openTabs.length > 0 || selectedTask !== null) && activeTab === null && (
          <div className="absolute top-0 left-[15%] right-[15%] flex items-center bg-transparent dark:bg-[#09090B] border-b border-transparent dark:border-zinc-800/80 overflow-x-auto scrollbar-hide shrink-0 h-12 select-none z-40 px-6 gap-2.5 shadow-none">
            {/* Permanent Studio Dashboard Tab */}
            <div
              onClick={() => {
                setActiveTab(null);
              }}
              className={`group my-auto ${activeTab === null && selectedTask === null ? 'mr-1.5' : 'mr-0'} h-9 flex items-center gap-2.5 px-4 rounded-xl text-[14.5px] font-sans transition-all relative cursor-pointer bg-[#FACC15] text-black font-extrabold shadow-sm border border-black/10 z-10 shrink-0`}
            >
              <Lightning
                size={18}
                weight={activeTab === null && selectedTask === null ? 'fill' : 'duotone'}
                className="text-black"
              />
              <span>Studio</span>
            </div>
            <AnimatePresence>
              {activeTab === null && selectedTaskId !== null && (
                <motion.div
                  initial={{ opacity: 0, width: 0, scale: 0.8, x: -10 }}
                  animate={{ opacity: 1, width: 'auto', scale: 1, x: 0 }}
                  exit={{ opacity: 0, width: 0, scale: 0.8, x: -10 }}
                  transition={{ duration: 0.2, ease: 'easeOut' }}
                  className="overflow-hidden flex items-center h-9 my-1"
                >
                  <div
                    onClick={() => {
                      setActiveTab(null);
                      setSelectedTaskId(null);
                    }}
                    className="flex items-center gap-1.5 px-3 h-full bg-[#18181B] dark:bg-white text-white dark:text-black font-bold text-[13px] rounded-xl cursor-pointer hover:bg-black dark:hover:bg-[#E4E4E7] transition-all shadow-sm ml-1 whitespace-nowrap"
                  >
                    <Plus size={14} weight="bold" />
                    <span>New Chat</span>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>{' '}
            {/* Open File Tabs */}
            <AnimatePresence mode="popLayout">
              {openTabs.map((tabPath) => {
                const fileName = tabPath.split(/[\\/]/).pop() || tabPath;
                const isActive = activeTab === tabPath;
                return (
                  <motion.div
                    layout
                    initial={{ opacity: 0, scale: 0.9, x: -6 }}
                    animate={{ opacity: 1, scale: 1, x: 0 }}
                    exit={{
                      opacity: 0,
                      scale: 0.9,
                      width: 0,
                      padding: 0,
                      margin: 0,
                      overflow: 'hidden',
                    }}
                    transition={{ type: 'spring', stiffness: 400, damping: 35 }}
                    key={tabPath}
                    onClick={() => setActiveTab(tabPath)}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setTabContextMenu({ x: e.clientX, y: e.clientY, tabPath });
                    }}
                    className={`group my-auto mr-1.5 h-9 flex items-center gap-2.5 px-4 rounded-xl text-[14.5px] font-sans transition-all relative cursor-pointer shrink-0 ${
                      isActive
                        ? 'bg-white text-black font-extrabold shadow-sm border border-black/10'
                        : 'text-[#71717A] hover:text-black hover:bg-black/5 border border-transparent font-medium'
                    }`}
                  >
                    <FileText
                      size={18}
                      weight={isActive ? 'duotone' : 'regular'}
                      className={isActive ? 'text-black' : 'text-[#A1A1AA]'}
                    />
                    <span className="truncate max-w-[160px]">{fileName}</span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        const newTabs = openTabs.filter((t) => t !== tabPath);
                        setOpenTabs(newTabs);
                        if (activeTab === tabPath) {
                          setActiveTab(newTabs.length > 0 ? newTabs[newTabs.length - 1] : null);
                        }
                      }}
                      className={`p-1 rounded hover:bg-[#E4E4E7] dark:hover:bg-white/10 text-[#A1A1AA] hover:text-[#EF4444] transition-colors ${isActive ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
                    >
                      <X size={12} weight="bold" />
                    </button>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        )}

        {/* Tab Context Menu */}
        <AnimatePresence>
          {tabContextMenu && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.1 }}
              className="fixed z-[100] bg-white dark:bg-[#18181B] border border-[#E4E4E7] dark:border-white/[0.08] rounded-xl shadow-[0_12px_40px_rgba(0,0,0,0.15)] dark:shadow-[0_12px_40px_rgba(0,0,0,0.5)] py-1.5 min-w-[160px] flex flex-col font-sans"
              style={{ top: tabContextMenu.y, left: tabContextMenu.x }}
              onClick={(e) => e.stopPropagation()}
              onContextMenu={(e) => e.preventDefault()}
            >
              <button
                className="px-3 py-1.5 text-[12.5px] font-medium text-left text-[#111111] dark:text-white hover:bg-[#F4F4F5] dark:hover:bg-white/[0.05] flex items-center gap-2.5 transition-colors"
                onClick={() => {
                  const newTabs = openTabs.filter((t) => t !== tabContextMenu.tabPath);
                  setOpenTabs(newTabs);
                  if (activeTab === tabContextMenu.tabPath) {
                    setActiveTab(newTabs.length > 0 ? newTabs[newTabs.length - 1] : null);
                  }
                  setTabContextMenu(null);
                }}
              >
                Close
              </button>
              <button
                className="px-3 py-1.5 text-[12.5px] font-medium text-left text-[#111111] dark:text-white hover:bg-[#F4F4F5] dark:hover:bg-white/[0.05] flex items-center gap-2.5 transition-colors"
                onClick={() => {
                  setOpenTabs([tabContextMenu.tabPath]);
                  setActiveTab(tabContextMenu.tabPath);
                  setTabContextMenu(null);
                }}
              >
                Close Others
              </button>
              <button
                className="px-3 py-1.5 text-[12.5px] font-medium text-left text-[#111111] dark:text-white hover:bg-[#F4F4F5] dark:hover:bg-white/[0.05] flex items-center gap-2.5 transition-colors"
                onClick={() => {
                  setOpenTabs([]);
                  setActiveTab(null);
                  setTabContextMenu(null);
                }}
              >
                Close All
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {activeTab !== null ? (
          <div className="absolute top-0 bottom-0 left-[15%] right-[15%] z-30 flex flex-col overflow-hidden bg-white dark:bg-[#0A0A0A] shadow-sm">
            {/* Integrated Tab Bar inside Editor box so tabs never cross box border */}
            {(openTabs.length > 0 || selectedTask !== null) && (
              <div className="flex items-center bg-transparent dark:bg-[#09090B] border-b border-transparent dark:border-zinc-800/80 overflow-x-auto scrollbar-hide shrink-0 h-12 select-none px-6 gap-2.5 shadow-none">
                {/* Permanent Studio Dashboard Tab */}
                <div
                  onClick={() => {
                    setActiveTab(null);
                  }}
                  className={`group my-auto ${activeTab === null && selectedTask === null ? 'mr-1.5' : 'mr-0'} h-9 flex items-center gap-2.5 px-4 rounded-xl text-[14.5px] font-sans transition-all relative cursor-pointer bg-[#FACC15] text-black font-extrabold shadow-sm border border-black/10 z-10 shrink-0`}
                >
                  <Lightning
                    size={18}
                    weight={activeTab === null && selectedTask === null ? 'fill' : 'duotone'}
                    className="text-black"
                  />
                  <span>Studio</span>
                </div>

                {/* Open File Tabs */}
                <AnimatePresence mode="popLayout">
                  {openTabs.map((tabPath) => {
                    const fileName = tabPath.split(/[\\/]/).pop() || tabPath;
                    const isActive = activeTab === tabPath;
                    return (
                      <motion.div
                        layout
                        initial={{ opacity: 0, scale: 0.9, x: -6 }}
                        animate={{ opacity: 1, scale: 1, x: 0 }}
                        exit={{
                          opacity: 0,
                          scale: 0.9,
                          width: 0,
                          padding: 0,
                          margin: 0,
                          overflow: 'hidden',
                        }}
                        transition={{ type: 'spring', stiffness: 400, damping: 35 }}
                        key={tabPath}
                        onClick={() => setActiveTab(tabPath)}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setTabContextMenu({ x: e.clientX, y: e.clientY, tabPath });
                        }}
                        className={`group my-auto mr-1.5 h-9 flex items-center gap-2.5 px-4 rounded-xl text-[14.5px] font-sans transition-all relative cursor-pointer shrink-0 ${
                          isActive
                            ? 'bg-white text-black font-extrabold shadow-sm border border-black/10'
                            : 'text-[#71717A] hover:text-black hover:bg-black/5 border border-transparent font-medium'
                        }`}
                      >
                        <FileText
                          size={18}
                          weight={isActive ? 'duotone' : 'regular'}
                          className={isActive ? 'text-black' : 'text-[#A1A1AA]'}
                        />
                        <span className="truncate max-w-[160px]">{fileName}</span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            const newTabs = openTabs.filter((t) => t !== tabPath);
                            setOpenTabs(newTabs);
                            if (activeTab === tabPath) {
                              setActiveTab(newTabs.length > 0 ? newTabs[newTabs.length - 1] : null);
                            }
                          }}
                          className={`p-1 rounded hover:bg-[#E4E4E7] dark:hover:bg-white/10 text-[#A1A1AA] hover:text-[#EF4444] transition-colors ${isActive ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
                        >
                          <X size={12} weight="bold" />
                        </button>
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
              </div>
            )}

            <Suspense
              fallback={
                <div className="flex-1 flex items-center justify-center h-full w-full text-[#A1A1AA] flex-col gap-3">
                  <SpinnerGap size={24} className="animate-spin" />{' '}
                  <span className="font-mono text-xs">Loading Editor Module...</span>
                </div>
              }
            >
              <FileEditor
                filePath={activeTab}
                onClose={() => {
                  const newTabs = openTabs.filter((t) => t !== activeTab);
                  setOpenTabs(newTabs);
                  setActiveTab(newTabs.length > 0 ? newTabs[newTabs.length - 1] : null);
                }}
                onDelete={() => {
                  const newTabs = openTabs.filter((t) => t !== activeTab);
                  setOpenTabs(newTabs);
                  setActiveTab(newTabs.length > 0 ? newTabs[newTabs.length - 1] : null);
                }}
              />
            </Suspense>
          </div>
        ) : (
          <div className="absolute top-0 bottom-0 left-[15%] right-[15%] flex flex-col overflow-hidden pointer-events-none z-10">
            {/* Dynamic Layout Wrapper */}
            <div
              className={`flex-1 flex flex-col px-8 w-full mx-auto relative overflow-y-auto scroll-smooth scrollbar-hide z-10 pb-[320px] transition-all duration-700 ease-[0.23,1,0.32,1] justify-start pointer-events-none`}
            >
              <div className="w-full flex flex-col mt-24">
                {/* Dynamic Bottom Area */}
                {selectedTask && (
                  <div className="space-y-6 pb-6 pointer-events-auto">
                    {(chatHistories[selectedTask.id] || []).filter((m) => m.role !== 'user')
                      .length === 0 &&
                      selectedTask.status === 'running' && (
                        <div className="flex items-center gap-3 text-[#A1A1AA]">
                          <SpinnerGap size={14} className="animate-spin" />
                          <span className="text-[12px] font-mono">Agent is thinking...</span>
                        </div>
                      )}

                    {(() => {
                      const historyArr = chatHistories[selectedTask.id] || [];
                      let activeQuestionId = null;
                      for (let i = historyArr.length - 1; i >= 0; i--) {
                        const m = historyArr[i];
                        if (m.role === 'user' && m.content.includes('[Answer to Swarm]')) break;
                        if (m.role === 'question') {
                          activeQuestionId = m.id;
                          break;
                        }
                      }
                      const filtered = historyArr.filter((m) => m.id !== activeQuestionId);

                      const sorted = [...filtered].sort((a, b) => {
                        if (a.role === 'output' && b.role !== 'output') return 1;
                        if (a.role !== 'output' && b.role === 'output') return -1;
                        return 0;
                      });
                      const merged = [];
                      for (const msg of sorted) {
                        if (msg.role === 'thought' || msg.role === 'tool') {
                          const last = merged[merged.length - 1];
                          if (last && (last.role === 'thought' || last.role === 'tool')) {
                            last.content += '\n' + msg.content;
                            continue;
                          }
                        }
                        merged.push({
                          ...msg,
                          role: (msg.role as any) === 'tool' ? 'thought' : msg.role,
                        });
                      }
                      return merged.map((msg, idx, arr) => (
                        <div key={msg.id} className="flex flex-col w-full text-left my-1">
                          {msg.role === 'user' && (
                            <div className="flex justify-end w-full my-2 px-2">
                              <div className="text-[14px] font-mono font-light text-[#111111] max-w-[90%] text-right leading-relaxed tracking-tight whitespace-pre-wrap break-words">
                                {msg.content
                                  .split(/(^|\s)@([@a-zA-Z0-9_\-./\\]+)/g)
                                  .map((part, i) =>
                                    i % 3 === 2 ? (
                                      <span
                                        key={i}
                                        onClick={() => {
                                          const fileName = part;
                                          const found = allWorkspaceFiles.find(
                                            (f) => f.name === fileName || f.path.endsWith(fileName),
                                          );
                                          if (found) {
                                            const fullPath = `${contextDir}/${found.path}`;
                                            if (!openTabs.includes(fullPath)) {
                                              setOpenTabs((prev) => [...prev, fullPath]);
                                            }
                                            setActiveTab(fullPath);
                                          }
                                        }}
                                        className="text-[#EAB308] dark:text-[#FDE047] bg-[#EAB308]/10 dark:bg-[#EAB308]/20 rounded-md cursor-pointer hover:underline px-1 py-0.5 font-bold"
                                      >
                                        @{part}
                                      </span>
                                    ) : (
                                      <span key={i}>{part}</span>
                                    ),
                                  )}
                              </div>
                            </div>
                          )}

                          {msg.role === 'thought' && (
                            <CollapsibleThought
                              content={msg.content}
                              isRunning={
                                selectedTask.status === 'running' && idx === arr.length - 1
                              }
                              task={selectedTask}
                            />
                          )}

                          {msg.role === 'output' &&
                            (msg.content.includes('Cannot connect to Ollama') ? (
                              <div className="my-6 p-6 rounded-2xl bg-[#EF4444]/10 border border-[#EF4444]/20 shadow-[0_8px_30px_-4px_rgba(239,68,68,0.1)]">
                                <div className="flex items-center gap-3 text-[#EF4444] mb-2">
                                  <WarningCircle size={24} weight="duotone" />
                                  <h3 className="font-bold text-[16px] tracking-tight">
                                    Ollama is Not Running
                                  </h3>
                                </div>
                                <div className="text-[14px] font-medium text-[#EF4444]/80 dark:text-[#F87171] mb-5 leading-relaxed">
                                  {msg.content.replace(/^\[.*?\]\s*/, '')}
                                </div>
                                <div className="flex items-center gap-3">
                                  <button
                                    onClick={() => {
                                      fetch('/api/ollama/start', { method: 'POST' });
                                    }}
                                    className="flex items-center gap-2 px-5 py-2.5 bg-[#EF4444] hover:bg-[#DC2626] text-white rounded-xl text-[14px] font-semibold transition-all shadow-[0_4px_12px_rgba(239,68,68,0.3)] hover:shadow-[0_6px_16px_rgba(239,68,68,0.4)] hover:-translate-y-0.5"
                                  >
                                    <TerminalWindow size={18} weight="bold" /> Start Ollama
                                  </button>
                                  <button
                                    onClick={(e) =>
                                      selectedTask && handleRetryTask(selectedTask, e)
                                    }
                                    className="flex items-center gap-2 px-5 py-2.5 bg-[#EF4444]/10 hover:bg-[#EF4444]/20 text-[#EF4444] dark:text-[#F87171] rounded-xl text-[14px] font-semibold transition-colors"
                                  >
                                    <ArrowCounterClockwise size={18} weight="bold" /> Retry Task
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <FormattedOutput content={msg.content} />
                            ))}

                          {(msg.role as any) === 'diff_proposal' && (
                            <InlineDiffEditor
                              taskId={selectedTask.id}
                              path={msg.content}
                              oldContent={(msg as any).oldContent}
                              newContent={(msg as any).newContent}
                              onResolve={(action) => {
                                setChatHistories((prev) => {
                                  const arr = prev[selectedTask.id] || [];
                                  const next = arr.map((m) =>
                                    m.id === msg.id
                                      ? {
                                          ...m,
                                          content: `[${action.toUpperCase()}] ${m.content}`,
                                          role: 'output',
                                        }
                                      : m,
                                  );
                                  return { ...prev, [selectedTask.id]: next };
                                });
                              }}
                            />
                          )}
                        </div>
                      ));
                    })()}

                    <div ref={chatEndRef} />
                  </div>
                )}
              </div>
            </div>

            {/* Minimalist Input Field - Seamless blending with Optical Lens Refraction */}
            <div
              className={`absolute bottom-0 left-0 right-0 h-[140px] bg-gradient-to-t from-white dark:from-[#0A0A0A] via-white dark:via-[#0A0A0A] to-transparent pointer-events-none z-20 transition-opacity duration-700 ${selectedTask ? 'opacity-100' : 'opacity-0'}`}
            ></div>

            <div
              className={`absolute left-1/2 -translate-x-1/2 w-[90%] max-w-[720px] z-50 flex flex-col items-center justify-center transition-all duration-700 ease-[0.23,1,0.32,1] ${selectedTask ? 'bottom-10' : 'top-[50%] -translate-y-1/2'} pointer-events-auto`}
            >
              <AnimatePresence>
                {!selectedTask && (
                  <motion.div
                    initial="hidden"
                    animate="visible"
                    exit="hidden"
                    variants={{
                      hidden: { opacity: 0 },
                      visible: {
                        opacity: 1,
                        transition: { staggerChildren: 0.1, delayChildren: 0.1 },
                      },
                    }}
                    className="flex flex-col items-center justify-center w-full mb-10 z-10"
                  >
                    <motion.h1
                      variants={{
                        hidden: { opacity: 0, y: 15 },
                        visible: {
                          opacity: 1,
                          y: 0,
                          transition: { type: 'spring', stiffness: 350, damping: 30 },
                        },
                      }}
                      className="text-[36px] md:text-[40px] font-sans font-semibold text-[#111111] dark:text-white mb-2 tracking-[-0.03em] flex items-center justify-center whitespace-nowrap"
                    >
                      {new Date().getHours() < 12
                        ? 'Good morning'
                        : new Date().getHours() < 18
                          ? 'Good afternoon'
                          : 'Good evening'}{' '}
                      <Coffee size={36} weight="fill" className="mx-2" />{' '}
                      <span className="text-[#A1A1AA] mr-2">Scifi-ally, ready to create</span>{' '}
                      <MagicWand size={36} weight="fill" /> <span className="ml-1">?</span>
                    </motion.h1>
                    <motion.div
                      variants={{
                        hidden: { opacity: 0 },
                        visible: { opacity: 1, transition: { staggerChildren: 0.08 } },
                      }}
                      className="rounded-full bg-white/[0.03] border border-white/[0.06] px-4 py-1.5 inline-flex items-center divide-x divide-white/10 text-[12px] mb-8 font-sans"
                    >
                      <motion.div
                        variants={{
                          hidden: { opacity: 0, scale: 0.9 },
                          visible: { opacity: 1, scale: 1 },
                        }}
                        className="flex items-center gap-2 pr-4 text-white/50"
                      >
                        <div className="w-2 h-2 rounded-full bg-[#10B981] animate-pulse" />
                        <span>
                          Connected to{' '}
                          <strong className="font-mono text-white/80 font-normal">
                            {contextDir ? contextDir.split(/[/\\]/).pop() : 'Workspace'}
                          </strong>
                        </span>
                      </motion.div>
                      <motion.div
                        variants={{
                          hidden: { opacity: 0, scale: 0.9 },
                          visible: { opacity: 1, scale: 1 },
                        }}
                        className="flex items-center gap-1.5 px-4 text-white/50"
                      >
                        <Cpu size={14} className="opacity-60" weight="duotone" />
                        <span>
                          CPU{' '}
                          <strong className="font-mono text-white/80 font-normal">
                            {sysInfo.cpuUsage?.toFixed(1) || '0.0'}%
                          </strong>
                        </span>
                      </motion.div>
                      <motion.div
                        variants={{
                          hidden: { opacity: 0, scale: 0.9 },
                          visible: { opacity: 1, scale: 1 },
                        }}
                        className="flex items-center gap-1.5 px-4 text-white/50"
                      >
                        <Stack size={14} className="opacity-60" weight="duotone" />
                        <span>
                          Memory{' '}
                          <strong className="font-mono text-white/80 font-normal">
                            {sysInfo.memoryUsedBytes
                              ? (sysInfo.memoryUsedBytes / 1024 / 1024 / 1024).toFixed(1)
                              : '0'}
                            GB
                          </strong>
                        </span>
                      </motion.div>
                      <motion.div
                        variants={{
                          hidden: { opacity: 0, scale: 0.9 },
                          visible: { opacity: 1, scale: 1 },
                        }}
                        className="flex items-center gap-1.5 pl-4 text-white/50"
                      >
                        <span className="w-2 h-2 rounded-full bg-[#10B981]" />
                        <span>
                          Agent{' '}
                          <strong className="font-mono text-white/80 font-normal">Online</strong>
                        </span>
                      </motion.div>
                    </motion.div>
                  </motion.div>
                )}
              </AnimatePresence>
              {/* ═══ BOXLESS, SIMPLIFIED @ FILE AUTOCOMPLETE ═══ */}
              <AnimatePresence>
                {showMentionMenu && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 5 }}
                    className="absolute bottom-16 left-8 z-[60] max-h-48 overflow-y-auto scrollbar-hide space-y-1"
                  >
                    {allWorkspaceFiles
                      .filter(
                        (f) =>
                          !f.isDirectory &&
                          f.name.toLowerCase().includes(mentionQuery.toLowerCase()),
                      )
                      .slice(0, 8)
                      .map((f, i) => (
                        <div
                          key={f.name}
                          onClick={() => {
                            const lastAt = goalInput.lastIndexOf('@');
                            const prefix = lastAt >= 0 ? goalInput.substring(0, lastAt) : goalInput;
                            setGoalInput(`${prefix}@${f.name} `);
                            setShowMentionMenu(false);
                            setMentionQuery('');
                          }}
                          onMouseEnter={() => setMentionIndex(i)}
                          className={`cursor-pointer px-3 py-1.5 text-[13px] font-mono transition-all flex items-center gap-2.5 rounded-xl ${i === mentionIndex ? 'bg-[#3B82F6] text-white font-bold shadow-md' : 'text-[#111111] bg-white/90 backdrop-blur-md hover:bg-white shadow-sm'}`}
                        >
                          <FileText
                            size={15}
                            className={i === mentionIndex ? 'text-white' : 'text-[#3B82F6]'}
                          />
                          <span>@{f.name}</span>
                        </div>
                      ))}
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="flex flex-col gap-2 w-full">
                {(() => {
                  const historyArr = selectedTask
                    ? chatHistories[selectedTask.id] || []
                    : chatHistories['temp'] || [];
                  let activeQuestion = null;
                  for (let i = historyArr.length - 1; i >= 0; i--) {
                    const m = historyArr[i];
                    if (
                      (m.role === 'user' || m.role === 'thought') &&
                      m.content.includes('[Answer to Swarm]')
                    )
                      break;
                    if (m.role === 'question') {
                      activeQuestion = m;
                      break;
                    }
                  }

                  return (
                    <>
                      <motion.form
                        initial={{ y: 30, opacity: 0, scale: 0.98 }}
                        animate={{ y: 0, opacity: 1, scale: 1 }}
                        transition={{
                          delay: selectedTask ? 0 : 0.4,
                          type: 'spring',
                          stiffness: 400,
                          damping: 35,
                        }}
                        onSubmit={(e) => {
                          e.preventDefault();
                          if (
                            activeQuestion &&
                            (!activeQuestion.options || activeQuestion.options.length === 0)
                          ) {
                            // Text questions are answered by pressing enter in the textarea
                            if (!goalInput.trim()) return;
                            const answer = goalInput.trim();
                            const ansMsg = {
                              id: Math.random().toString(),
                              role: 'thought' as const,
                              content: `[Answer to Swarm]: ${activeQuestion.isSecret ? '••••••••••••••••' : answer}`,
                            };
                            if (selectedTask) {
                              setChatHistories((prev) => ({
                                ...prev,
                                [selectedTask.id]: [...(prev[selectedTask.id] || []), ansMsg],
                              }));
                              setIsSubmitting(true);
                              fetch('/api/questions/resolve', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                  answer,
                                  taskId: selectedTask.id,
                                }),
                              }).finally(() => setIsSubmitting(false));
                              setGoalInput('');
                            }
                          } else if (isAgentRunning) {
                            handleStopAgent(e as any);
                          } else {
                            handleGoalSubmit(e as any);
                          }
                        }}
                        className={`flex flex-col group bg-white/80 dark:bg-[#0A0A0A]/70 backdrop-blur-xl rounded-2xl px-5 py-5 transition-all duration-500 relative z-10 w-full border border-white/10 shadow-none focus-within:border-[#3B82F6]/50 focus-within:shadow-[0_0_30px_rgba(59,130,246,0.15)]`}
                      >
                        <AnimatePresence>
                          {globalConfirm ? (
                            <motion.div
                              initial={{ opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: 'auto' }}
                              exit={{ opacity: 0, height: 0 }}
                              transition={{ duration: 0.3, ease: 'easeInOut' }}
                              className="w-full overflow-hidden"
                            >
                              <UnifiedInteractionPanel
                                question={globalConfirm.message}
                                options={['Yes', 'No']}
                                disabled={isSubmitting}
                                onSendAnswer={(answer) => {
                                  globalConfirm.resolve(answer === 'Yes');
                                  setGlobalConfirm(null);
                                }}
                              />
                            </motion.div>
                          ) : activeQuestion ? (
                            <motion.div
                              initial={{ opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: 'auto' }}
                              exit={{ opacity: 0, height: 0 }}
                              transition={{ duration: 0.3, ease: 'easeInOut' }}
                              className="w-full overflow-hidden"
                            >
                              <UnifiedInteractionPanel
                                question={activeQuestion.content}
                                options={activeQuestion.options}
                                placeholder={activeQuestion.placeholder}
                                isSecret={activeQuestion.isSecret}
                                multiSelect={activeQuestion.multiSelect}
                                inputType={activeQuestion.inputType}
                                formSchema={activeQuestion.formSchema}
                                disabled={isSubmitting}
                                onSendAnswer={(answer) => {
                                  const ansMsg = {
                                    id: Math.random().toString(),
                                    role: 'thought' as const,
                                    content: `[Answer to Swarm]: ${answer}`,
                                  };
                                  if (selectedTask) {
                                    setChatHistories((prev) => ({
                                      ...prev,
                                      [selectedTask.id]: [...(prev[selectedTask.id] || []), ansMsg],
                                    }));
                                    setIsSubmitting(true);
                                    fetch('/api/questions/resolve', {
                                      method: 'POST',
                                      headers: { 'Content-Type': 'application/json' },
                                      body: JSON.stringify({
                                        answer,
                                        taskId: selectedTask.id,
                                      }),
                                    }).finally(() => setIsSubmitting(false));
                                  } else {
                                    // Fallback just in case
                                    setChatHistories((prev) => ({ ...prev, temp: [ansMsg] }));
                                  }
                                }}
                              />
                            </motion.div>
                          ) : null}
                        </AnimatePresence>
                        {attachedImage && (
                          <div className="flex flex-wrap gap-2 items-center pb-2 w-full">
                            <div
                              className="relative w-12 h-12 rounded-xl group/img cursor-pointer overflow-hidden border-2 border-transparent hover:border-[#3B82F6] transition-colors shadow-sm bg-black/5 dark:bg-white/5"
                              onClick={() => setIsImageEditorOpen(true)}
                              title="Click to crop and edit"
                            >
                              <img
                                src={attachedImage}
                                alt="Attachment"
                                className="w-full h-full object-cover opacity-90 transition-opacity group-hover/img:opacity-100"
                              />
                              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/img:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
                                <ArrowsOut
                                  size={16}
                                  weight="bold"
                                  className="text-white drop-shadow-md"
                                />
                              </div>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setAttachedImage(null);
                                }}
                                className="absolute top-1 right-1 bg-red-500 hover:bg-red-600 text-white rounded-full p-1 opacity-0 group-hover/img:opacity-100 transition-all shadow-md z-10 scale-75 origin-top-right hover:scale-100"
                              >
                                <X size={10} weight="bold" />
                              </button>
                            </div>
                          </div>
                        )}
                        <div className="flex flex-col w-full">
                          <div className="flex items-start w-full gap-2">
                            <div className="relative flex-1 min-h-[48px]">
                              {/* Highlight Overlay */}
                              <div
                                className="absolute inset-0 pointer-events-none whitespace-pre-wrap break-words text-[16px] font-sans font-normal leading-[26px] py-1 z-0 overflow-hidden"
                                aria-hidden="true"
                              >
                                {!goalInput ? (
                                  <span className="text-white/30">
                                    {isAgentRunning
                                      ? (selectedTask && selectedTask.status === 'running') ||
                                        (!tasks.some((t) => t.status === 'running') && isSubmitting)
                                        ? 'Agent is currently executing this task...'
                                        : 'Agent is executing a different task...'
                                      : 'Ask anything or instruct the agent... (Type @ to reference files across your workspace)'}
                                  </span>
                                ) : (
                                  goalInput
                                    .split(/(^|\s)@([@a-zA-Z0-9_\-./\\]+)/g)
                                    .map((part, i) =>
                                      i % 3 === 2 ? (
                                        <span
                                          key={i}
                                          className="text-[#8B5CF6] dark:text-[#A78BFA] bg-[#8B5CF6]/15 dark:bg-[#8B5CF6]/25 rounded-md font-medium px-1 cursor-pointer transition-colors hover:bg-[#8B5CF6]/25 dark:hover:bg-[#8B5CF6]/40"
                                        >
                                          @{part}
                                        </span>
                                      ) : (
                                        <span key={i} className="text-[#18181B] dark:text-white">
                                          {part}
                                        </span>
                                      ),
                                    )
                                )}
                                {/* Ensure exact height match for trailing newlines */}
                                {goalInput.endsWith('\n') && <br />}
                              </div>

                              <textarea
                                name="prompt"
                                ref={promptInputRef}
                                rows={1}
                                className="relative z-10 w-full bg-transparent border-none outline-none focus:ring-0 text-transparent caret-[#18181B] dark:caret-white placeholder-transparent dark:placeholder-transparent text-[16px] font-sans font-normal resize-none h-auto min-h-[26px] leading-[26px] py-1 overflow-y-auto transition-[height] duration-200 ease-out scrollbar-hide cursor-text"
                                placeholder=""
                                value={goalInput}
                                onClick={(e) => {
                                  const el = e.target as HTMLTextAreaElement;
                                  const pos = el.selectionStart;
                                  const regex = /(^|\s)@([@a-zA-Z0-9_\-./\\]+)/g;
                                  let match: RegExpExecArray | null;
                                  while ((match = regex.exec(goalInput)) !== null) {
                                    const start = match.index + match[1].length;
                                    const end = match.index + match[0].length;
                                    const fileName = match[2];
                                    if (pos >= start && pos <= end) {
                                      const found = allWorkspaceFiles.find(
                                        (f) => f.name === fileName || f.path.endsWith(fileName),
                                      );
                                      if (found) {
                                        const fullPath = `${contextDir}/${found.path}`;
                                        if (!openTabs.includes(fullPath)) {
                                          setOpenTabs((prev) => [...prev, fullPath]);
                                        }
                                        setActiveTab(fullPath);
                                      }
                                    }
                                  }
                                }}
                                onChange={(e) => {
                                  const el = e.target;
                                  el.style.height = 'auto';
                                  el.style.height = `${el.scrollHeight}px`;
                                  const val = el.value;
                                  setGoalInput(val);
                                  const lastAt = val.lastIndexOf('@');
                                  if (lastAt !== -1 && !/\s/.test(val.slice(lastAt))) {
                                    setShowMentionMenu(true);
                                    setMentionQuery(val.slice(lastAt + 1));
                                  } else {
                                    setShowMentionMenu(false);
                                  }
                                }}
                                disabled={false}
                                onKeyDown={(e) => {
                                  if (showMentionMenu) {
                                    if (e.key === 'Escape') {
                                      setShowMentionMenu(false);
                                      return;
                                    }
                                    if (e.key === 'Enter' || e.key === 'Tab') {
                                      e.preventDefault();
                                      const filtered = allWorkspaceFiles.filter(
                                        (f) =>
                                          !f.isDirectory &&
                                          f.name.toLowerCase().includes(mentionQuery.toLowerCase()),
                                      );
                                      if (filtered.length > 0) {
                                        const selected = filtered[mentionIndex] || filtered[0];
                                        const lastAt = goalInput.lastIndexOf('@');
                                        const prefix =
                                          lastAt >= 0 ? goalInput.substring(0, lastAt) : goalInput;
                                        setGoalInput(`${prefix}@${selected.name} `);
                                        setShowMentionMenu(false);
                                        setMentionQuery('');
                                      }
                                      return;
                                    }
                                    if (e.key === 'ArrowDown') {
                                      e.preventDefault();
                                      setMentionIndex((prev) => (prev + 1) % 8);
                                      return;
                                    }
                                    if (e.key === 'ArrowUp') {
                                      e.preventDefault();
                                      setMentionIndex((prev) => (prev - 1 + 8) % 8);
                                      return;
                                    }
                                  }
                                  if (e.key === 'Enter' && !e.shiftKey) {
                                    e.preventDefault();
                                    if (activeQuestion) {
                                      if (!goalInput.trim()) return;
                                      const answer = goalInput.trim();
                                      const ansMsg = {
                                        id: Math.random().toString(),
                                        role: 'thought' as const,
                                        content: `[Answer to Swarm]: ${activeQuestion.isSecret ? '••••••••••••••••' : answer}`,
                                      };
                                      if (selectedTask) {
                                        setChatHistories((prev) => ({
                                          ...prev,
                                          [selectedTask.id]: [
                                            ...(prev[selectedTask.id] || []),
                                            ansMsg,
                                          ],
                                        }));
                                        setIsSubmitting(true);
                                        fetch('/api/questions/resolve', {
                                          method: 'POST',
                                          headers: { 'Content-Type': 'application/json' },
                                          body: JSON.stringify({
                                            answer,
                                            taskId: selectedTask.id,
                                          }),
                                        }).finally(() => setIsSubmitting(false));
                                        setGoalInput('');
                                      }
                                    } else if (isAgentRunning) {
                                      handleStopAgent(e as any);
                                    } else {
                                      handleGoalSubmit(e as any);
                                    }
                                  }
                                }}
                                onPaste={(e) => {
                                  const items = e.clipboardData?.items;
                                  if (!items) return;
                                  for (let i = 0; i < items.length; i++) {
                                    if (items[i].type.indexOf('image') === 0) {
                                      e.preventDefault();
                                      const file = items[i].getAsFile();
                                      if (file) {
                                        const reader = new FileReader();
                                        reader.onload = () =>
                                          setAttachedImage(reader.result as string);
                                        reader.readAsDataURL(file);
                                      }
                                      break;
                                    }
                                  }
                                }}
                                onDragOver={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                }}
                                onDrop={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  const file = e.dataTransfer.files?.[0];
                                  if (file && file.type.startsWith('image/')) {
                                    const reader = new FileReader();
                                    reader.onload = () => setAttachedImage(reader.result as string);
                                    reader.readAsDataURL(file);
                                  }
                                }}
                                spellCheck={false}
                              />
                            </div>
                          </div>

                          <div className="flex items-end justify-between w-full mt-6 pt-2">
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => fileInputRef.current?.click()}
                                className="w-8 h-8 flex items-center justify-center text-[#A1A1AA] hover:text-[#111111] dark:hover:text-white border border-transparent hover:border-[#E5E5E5] dark:hover:border-[#3F3F46] transition-colors rounded"
                              >
                                <Plus size={16} weight="bold" />
                              </button>
                              <input
                                type="file"
                                accept="image/*"
                                ref={fileInputRef}
                                className="hidden"
                                onChange={(e) => {
                                  const file = e.target.files?.[0];
                                  if (file) {
                                    const reader = new FileReader();
                                    reader.onload = () => setAttachedImage(reader.result as string);
                                    reader.readAsDataURL(file);
                                  }
                                  e.target.value = '';
                                }}
                              />
                            </div>

                            <div className="flex items-center gap-2 relative">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setIsModeDropdownOpen(!isModeDropdownOpen);
                                }}
                                className="h-8 flex items-center gap-1.5 bg-transparent border-0 outline-none text-[#111111] dark:text-[#A1A1AA] text-[12px] font-sans font-medium px-2 focus:ring-0 cursor-pointer hover:text-[#18181B] dark:hover:text-white transition-colors"
                                title="Execution Mode"
                              >
                                <AnimatePresence mode="wait">
                                  <motion.div
                                    key={swarmMode}
                                    initial={{ y: 10, opacity: 0, filter: 'blur(4px)' }}
                                    animate={{ y: 0, opacity: 1, filter: 'blur(0px)' }}
                                    exit={{ y: -10, opacity: 0, filter: 'blur(4px)' }}
                                    transition={{ duration: 0.2, ease: 'easeOut' }}
                                    className="flex items-center gap-1.5"
                                  >
                                    {swarmMode === 'interactive' ? (
                                      <>
                                        <Pencil
                                          size={14}
                                          weight="bold"
                                          className="text-[#3B82F6]"
                                        />
                                        <span className="text-[#3B82F6]">Ask after edit</span>
                                      </>
                                    ) : (
                                      <>
                                        <Lightning
                                          size={14}
                                          weight="bold"
                                          className="text-[#EF4444]"
                                        />
                                        <span className="text-[#EF4444]">Full permission</span>
                                      </>
                                    )}
                                  </motion.div>
                                </AnimatePresence>
                                <CaretDown
                                  size={12}
                                  weight="bold"
                                  className="ml-1 text-[#A1A1AA] transition-transform duration-300"
                                  style={{
                                    transform: isModeDropdownOpen
                                      ? 'rotate(180deg)'
                                      : 'rotate(0deg)',
                                  }}
                                />
                              </button>

                              <AnimatePresence>
                                {isModeDropdownOpen && (
                                  <motion.div
                                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                                    animate={{ opacity: 1, y: 0, scale: 1 }}
                                    exit={{ opacity: 0, y: 10, scale: 0.95 }}
                                    transition={{ duration: 0.15 }}
                                    className="absolute bottom-full right-0 mb-2 w-48 bg-white dark:bg-[#0A0A0A] border border-[#E4E4E7] dark:border-white/[0.08] rounded-xl shadow-[0_10px_40px_rgba(0,0,0,0.1)] dark:shadow-[0_10px_40px_rgba(0,0,0,0.5)] z-50 overflow-hidden p-1"
                                  >
                                    {[
                                      { id: 'interactive', label: 'Ask after each edit' },
                                      { id: 'auto', label: 'Full permissions mode' },
                                    ].map((mode) => (
                                      <div
                                        key={mode.id}
                                        onClick={() => {
                                          if (mode.id === 'auto' && !hasConfirmedFullPermissions) {
                                            (window as any)
                                              .customConfirm(
                                                'Are you sure you want to enable Full Permissions Mode? The agent will have unrestricted access to modify files and execute commands automatically without asking for confirmation.',
                                              )
                                              .then((res: boolean) => {
                                                if (res) {
                                                  setHasConfirmedFullPermissions(true);
                                                  setSwarmMode(mode.id);
                                                  if (contextDir) {
                                                    localStorage.setItem(
                                                      `warden_perms_${contextDir}`,
                                                      'true',
                                                    );
                                                    localStorage.setItem(
                                                      `warden_mode_${contextDir}`,
                                                      mode.id,
                                                    );
                                                  }
                                                }
                                              });
                                          } else {
                                            setSwarmMode(mode.id);
                                            if (contextDir) {
                                              localStorage.setItem(
                                                `warden_mode_${contextDir}`,
                                                mode.id,
                                              );
                                            }
                                          }
                                          setIsModeDropdownOpen(false);
                                        }}
                                        className={`px-3 py-2 text-[12px] font-medium font-sans cursor-pointer rounded-lg transition-colors flex items-center gap-2 ${
                                          swarmMode === mode.id
                                            ? mode.id === 'auto'
                                              ? 'bg-red-500/10 text-red-600 dark:text-red-500'
                                              : 'bg-blue-500/10 text-blue-600 dark:text-blue-500'
                                            : 'text-[#52525B] dark:text-[#A1A1AA] hover:bg-black/5 dark:hover:bg-white/[0.04] hover:text-[#18181B] dark:hover:text-white'
                                        }`}
                                      >
                                        {swarmMode === mode.id && (
                                          <Check size={14} weight="bold" className="shrink-0" />
                                        )}
                                        <span className={swarmMode === mode.id ? '' : 'pl-5'}>
                                          {mode.label}
                                        </span>
                                      </div>
                                    ))}
                                  </motion.div>
                                )}
                              </AnimatePresence>

                              {isAgentRunning ? (
                                (selectedTask && selectedTask.status === 'running') ||
                                (!tasks.some((t) => t.status === 'running') && isSubmitting) ? (
                                  <button
                                    type="button"
                                    onClick={handleStopAgent}
                                    className="w-8 h-8 flex items-center justify-center bg-[#EF4444] text-white rounded-lg transition-all flex-shrink-0 shadow-sm cursor-pointer"
                                    title="Stop running agent"
                                  >
                                    <Square size={14} weight="fill" className="text-current" />
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      const rTask = tasks.find((t) => t.status === 'running');
                                      if (rTask) setSelectedTaskId(rTask.id);
                                    }}
                                    className="w-8 h-8 flex items-center justify-center bg-[#3B82F6] hover:bg-[#2563EB] text-white rounded-full transition-all flex-shrink-0 shadow-sm cursor-pointer"
                                    title="Go to running agent"
                                  >
                                    <ArrowRight size={16} weight="bold" className="text-current" />
                                  </button>
                                )
                              ) : (
                                <button
                                  type="submit"
                                  disabled={!goalInput.trim() && !attachedImage}
                                  className={`w-8 h-8 flex items-center justify-center rounded-full transition-all flex-shrink-0 border-0 shadow-none ${
                                    !goalInput.trim() && !attachedImage
                                      ? 'bg-[#E4E4E7] dark:bg-[#27272A] text-[#A1A1AA] dark:text-[#52525B] cursor-not-allowed opacity-60'
                                      : 'bg-[#3B82F6] text-white hover:bg-[#2563EB] shadow-sm cursor-pointer'
                                  }`}
                                >
                                  <ArrowUp size={16} weight="bold" />
                                </button>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* ═══ PROJECT SELECTOR (Attached Notch) ═══ */}
                        <div className="absolute top-[calc(100%-1px)] left-4 bg-white dark:bg-[#0A0A0A] rounded-b-xl px-3 py-0.5 flex items-center text-[12px] font-sans font-medium text-[#111111] dark:text-white border border-[#E5E5E5] dark:border-[#27272A] border-t-0 z-20 transition-all">
                          <div className="relative group/projtrig cursor-pointer w-fit">
                            <div className="flex items-center gap-1.5 py-1 transition-opacity hover:opacity-70">
                              <FolderOpen size={14} weight="fill" className="text-[#A1A1AA]" />
                              <span>
                                {contextDir
                                  ? contextDir.split(/[/\\]/).pop()
                                  : 'Select a project...'}
                              </span>
                              <CaretDown
                                size={12}
                                weight="bold"
                                className="text-[#A1A1AA] ml-0.5"
                              />
                            </div>

                            {/* Dropdown Menu */}
                            <div className="absolute bottom-full left-0 mb-1 w-56 bg-white dark:bg-[#0A0A0A] border border-[#E4E4E7] dark:border-white/[0.08] rounded-xl shadow-[0_10px_40px_rgba(0,0,0,0.15)] dark:shadow-[0_10px_40px_rgba(0,0,0,0.6)] z-50 opacity-0 invisible group-hover/projtrig:opacity-100 group-hover/projtrig:visible transition-all duration-200 overflow-hidden">
                              <div className="px-3 py-2 text-[11px] font-bold text-[#A1A1AA] uppercase tracking-wider">
                                Recent Projects
                              </div>
                              <div className="flex flex-col px-1 pb-1">
                                {(() => {
                                  try {
                                    if (recentWorkspaces.length === 0) {
                                      return (
                                        <div className="px-2 py-1.5 text-[12px] font-sans text-[#A1A1AA]">
                                          No recent projects
                                        </div>
                                      );
                                    }

                                    const uniqueRec: string[] = [];
                                    const seen = new Set<string>();
                                    for (const p of recentWorkspaces) {
                                      const norm = p.replace(/\\/g, '/').toLowerCase();
                                      if (!seen.has(norm)) {
                                        seen.add(norm);
                                        uniqueRec.push(p);
                                      }
                                    }

                                    return uniqueRec.slice(0, 5).map((p: string, i: number) => (
                                      <div
                                        key={i}
                                        className="flex items-center justify-between group/proj hover:bg-black/5 dark:hover:bg-white/[0.04] rounded-md px-2 py-1 transition-colors"
                                      >
                                        <button
                                          onClick={(e) => {
                                            e.preventDefault();
                                            e.stopPropagation();
                                            setContextDir(p);
                                            setRootWorkspace(p);
                                            localStorage.setItem('warden_workspace', p);
                                            localStorage.setItem('warden_root_workspace', p);
                                          }}
                                          className="text-left py-0.5 text-[13px] font-sans font-medium text-[#18181B] dark:text-white flex items-center gap-2 cursor-pointer flex-1 min-w-0 truncate"
                                          title={p}
                                        >
                                          <Folder size={14} className="text-[#A1A1AA] shrink-0" />
                                          <span className="truncate">{p.split(/[/\\]/).pop()}</span>
                                        </button>
                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            e.preventDefault();
                                            e.stopPropagation();
                                            try {
                                              const recList = JSON.parse(
                                                localStorage.getItem('warden_recent_workspaces') ||
                                                  '[]',
                                              );
                                              const normTarget = p
                                                .replace(/\\/g, '/')
                                                .toLowerCase();
                                              const filtered = recList.filter(
                                                (item: string) =>
                                                  item.replace(/\\/g, '/').toLowerCase() !==
                                                  normTarget,
                                              );
                                              localStorage.setItem(
                                                'warden_recent_workspaces',
                                                JSON.stringify(filtered),
                                              );
                                              setRecentWorkspaces(filtered);

                                              const normContext = (contextDir || '')
                                                .replace(/\\/g, '/')
                                                .toLowerCase();
                                              const normRoot = (rootWorkspace || '')
                                                .replace(/\\/g, '/')
                                                .toLowerCase();
                                              if (
                                                normContext === normTarget ||
                                                normRoot === normTarget
                                              ) {
                                                const nextDir =
                                                  filtered.length > 0 ? filtered[0] : null;
                                                setContextDir(nextDir);
                                                setRootWorkspace(nextDir);
                                                setOpenTabs([]);
                                                setActiveTab(null);
                                                if (nextDir) {
                                                  localStorage.setItem('warden_workspace', nextDir);
                                                  localStorage.setItem(
                                                    'warden_root_workspace',
                                                    nextDir,
                                                  );
                                                } else {
                                                  localStorage.removeItem('warden_workspace');
                                                  localStorage.removeItem('warden_root_workspace');
                                                }
                                              }
                                              setTasks((prev) => [...prev]); // Force re-render
                                            } catch {}
                                          }}
                                          className="opacity-70 group-hover/proj:opacity-100 text-[#A1A1AA] hover:text-[#EF4444] dark:hover:text-[#EF4444] hover:bg-red-500/10 p-1.5 rounded transition-all shrink-0 ml-1 group/btn"
                                          title="Delete project from list"
                                        >
                                          <Trash
                                            size={14}
                                            className="transition-colors group-hover/btn:text-[#EF4444]"
                                          />
                                        </button>
                                      </div>
                                    ));
                                  } catch {
                                    return null;
                                  }
                                })()}
                              </div>
                              <div className="border-t border-[#E5E5E5] dark:border-[#27272A] mt-1 p-1 space-y-0.5">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    setPickerOpen(true);
                                  }}
                                  className="w-full text-left px-2 py-1.5 text-[13px] font-sans font-medium text-[#3B82F6] hover:bg-black/5 dark:hover:bg-white/[0.04] rounded-md transition-colors flex items-center gap-2 cursor-pointer"
                                >
                                  <Plus size={14} /> Open new project
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      </motion.form>
                    </>
                  );
                })()}
              </div>
            </div>
          </div>
        )}
      </main>

      <AnimatePresence>
        {isImageEditorOpen && attachedImage && (
          <ImageEditorModal
            isOpen={isImageEditorOpen}
            imageSrc={attachedImage}
            onClose={() => setIsImageEditorOpen(false)}
            onSave={(croppedImg) => setAttachedImage(croppedImg)}
          />
        )}

        {showGitHubConnectModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white dark:bg-[#18181B] border border-[#E4E4E7] dark:border-[#27272A] rounded-xl shadow-2xl w-full max-w-md p-6 font-sans"
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-base font-bold text-[#111111] dark:text-white flex items-center gap-2">
                  <span>🚀 Connect GitHub Repository</span>
                </h3>
                <button
                  onClick={() => setShowGitHubConnectModal(false)}
                  className="text-[#A1A1AA] hover:text-[#111111] dark:hover:text-white cursor-pointer"
                >
                  ✕
                </button>
              </div>

              <p className="text-xs text-[#52525B] dark:text-[#A1A1AA] mb-4">
                Your local repository isn't linked to a remote GitHub URL yet. Connect to an
                existing remote or create a new GitHub repository automatically (`gh repo create`).
              </p>

              <div className="space-y-4">
                <div className="p-3 bg-[#F8FAFC] dark:bg-[#27272A]/50 rounded-lg border border-[#E2E8F0] dark:border-[#3F3F46]">
                  <label className="block text-[11px] font-bold font-mono uppercase text-[#3B82F6] mb-1">
                    Option A: Connect Existing Remote URL
                  </label>
                  <form
                    onSubmit={async (e: any) => {
                      e.preventDefault();
                      const url = e.target.elements.remoteUrl.value.trim();
                      if (!url || !contextDir) return;
                      try {
                        const r = await fetch('/api/git/connect', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ dir: contextDir, remoteUrl: url }),
                        }).then((res) => res.json());
                        if (r.success) {
                          setShowGitHubConnectModal(false);
                          alert('Connected! Pushing now...');
                          await fetch('/api/git/smart-push', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ dir: contextDir }),
                          });
                          if ((window as any).fetchGitStatus) (window as any).fetchGitStatus();
                        } else {
                          alert(r.error || 'Connection failed.');
                        }
                      } catch (err: any) {
                        alert(err.message);
                      }
                    }}
                    className="flex gap-2"
                  >
                    <input
                      name="remoteUrl"
                      type="text"
                      placeholder="https://github.com/username/project.git"
                      className="flex-1 px-2.5 py-1.5 text-xs bg-white dark:bg-[#18181B] border border-[#CBD5E1] dark:border-[#3F3F46] rounded text-[#111111] dark:text-white focus:outline-none focus:border-[#3B82F6]"
                    />
                    <button
                      type="submit"
                      className="px-3 py-1.5 bg-[#3B82F6] hover:bg-[#2563EB] text-white text-xs font-bold rounded cursor-pointer shrink-0"
                    >
                      Connect
                    </button>
                  </form>
                </div>

                <div className="p-3 bg-[#F8FAFC] dark:bg-[#27272A]/50 rounded-lg border border-[#E2E8F0] dark:border-[#3F3F46]">
                  <label className="block text-[11px] font-bold font-mono uppercase text-[#10B981] mb-1">
                    Option B: Auto-Create GitHub Repo (via `gh`)
                  </label>
                  <form
                    onSubmit={async (e: any) => {
                      e.preventDefault();
                      const name =
                        e.target.elements.repoName.value.trim() ||
                        (contextDir ? contextDir.split(/[/\\]/).pop() : 'warden-project');
                      const isPriv = e.target.elements.isPrivate.checked;
                      if (!contextDir) return;
                      try {
                        const r = await fetch('/api/git/connect', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            dir: contextDir,
                            repoName: name,
                            isPrivate: isPriv,
                          }),
                        }).then((res) => res.json());
                        if (r.success) {
                          setShowGitHubConnectModal(false);
                          alert(r.message || 'Repo created! Pushing...');
                          await fetch('/api/git/smart-push', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ dir: contextDir }),
                          });
                          if ((window as any).fetchGitStatus) (window as any).fetchGitStatus();
                        } else {
                          alert(r.error || 'GitHub repo creation failed.');
                        }
                      } catch (err: any) {
                        alert(err.message);
                      }
                    }}
                    className="space-y-2"
                  >
                    <div className="flex gap-2 items-center">
                      <input
                        name="repoName"
                        type="text"
                        defaultValue={contextDir ? contextDir.split(/[/\\]/).pop() : 'project'}
                        placeholder="Repository name"
                        className="flex-1 px-2.5 py-1.5 text-xs bg-white dark:bg-[#18181B] border border-[#CBD5E1] dark:border-[#3F3F46] rounded text-[#111111] dark:text-white focus:outline-none focus:border-[#10B981]"
                      />
                      <label className="flex items-center gap-1.5 text-xs text-[#3F3F46] dark:text-[#D4D4D8] cursor-pointer shrink-0">
                        <input
                          name="isPrivate"
                          type="checkbox"
                          defaultChecked
                          className="rounded border-gray-300 text-green-600 h-3.5 w-3.5 cursor-pointer"
                        />
                        <span>Private</span>
                      </label>
                    </div>
                    <button
                      type="submit"
                      className="w-full py-1.5 bg-[#10B981] hover:bg-[#059669] text-white text-xs font-bold rounded cursor-pointer transition-colors shadow-sm"
                    >
                      Create & Link on GitHub
                    </button>
                  </form>
                </div>
              </div>
            </motion.div>
          </div>
        )}

        {showIdentityModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white dark:bg-[#18181B] border border-[#E4E4E7] dark:border-[#27272A] rounded-xl shadow-2xl w-full max-w-sm p-6 font-sans"
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-base font-bold text-[#111111] dark:text-white">
                  👤 Set Git Author Attribution
                </h3>
                <button
                  onClick={() => setShowIdentityModal(false)}
                  className="text-[#A1A1AA] hover:text-[#111111] dark:hover:text-white cursor-pointer"
                >
                  ✕
                </button>
              </div>

              <p className="text-xs text-[#52525B] dark:text-[#A1A1AA] mb-4">
                Configure exact name and email attribution so all automated commits and pushes are
                authored cleanly under your identity.
              </p>

              <form
                onSubmit={async (e: any) => {
                  e.preventDefault();
                  const name = e.target.elements.name.value.trim();
                  const email = e.target.elements.email.value.trim();
                  if (!name || !email || !contextDir) return;
                  try {
                    const r = await fetch('/api/git/config', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        dir: contextDir,
                        name,
                        email,
                        isGlobal: e.target.elements.isGlobal.checked,
                      }),
                    }).then((res) => res.json());
                    if (r.success) {
                      setUserIdentity(r.identity);
                      setShowIdentityModal(false);
                    } else {
                      alert(r.error || 'Failed to update identity.');
                    }
                  } catch (err: any) {
                    alert(err.message);
                  }
                }}
                className="space-y-3"
              >
                <div>
                  <label className="block text-[11px] font-mono font-bold text-[#71717A] dark:text-[#A1A1AA] mb-1">
                    Your Name
                  </label>
                  <input
                    name="name"
                    type="text"
                    required
                    defaultValue={userIdentity?.name || ''}
                    placeholder="e.g. Sahaj"
                    className="w-full px-2.5 py-1.5 text-xs bg-white dark:bg-[#27272A] border border-[#CBD5E1] dark:border-[#3F3F46] rounded text-[#111111] dark:text-white focus:outline-none focus:border-[#3B82F6]"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-mono font-bold text-[#71717A] dark:text-[#A1A1AA] mb-1">
                    Your Email
                  </label>
                  <input
                    name="email"
                    type="email"
                    required
                    defaultValue={userIdentity?.email || ''}
                    placeholder="e.g. you@example.com"
                    className="w-full px-2.5 py-1.5 text-xs bg-white dark:bg-[#27272A] border border-[#CBD5E1] dark:border-[#3F3F46] rounded text-[#111111] dark:text-white focus:outline-none focus:border-[#3B82F6]"
                  />
                </div>

                <label className="flex items-center gap-1.5 text-xs text-[#3F3F46] dark:text-[#D4D4D8] cursor-pointer pt-1">
                  <input
                    name="isGlobal"
                    type="checkbox"
                    className="rounded border-gray-300 text-blue-600 h-3.5 w-3.5 cursor-pointer"
                  />
                  <span>Save globally (`git config --global`)</span>
                </label>

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowIdentityModal(false)}
                    className="px-3 py-1.5 text-xs font-medium text-[#71717A] dark:text-[#A1A1AA] hover:bg-black/5 dark:hover:bg-white/5 rounded cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-1.5 bg-[#3B82F6] hover:bg-[#2563EB] text-white text-xs font-bold rounded cursor-pointer transition-colors shadow-sm"
                  >
                    Save Identity
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
