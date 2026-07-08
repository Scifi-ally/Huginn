import React, { useState, useEffect, useRef } from 'react';
import { Button } from './components/ui/button';
import { Input } from './components/ui/input';
import { Tooltip, TooltipContent, TooltipTrigger } from './components/ui/tooltip';
import FileEditor from './components/FileEditor';
import FileTree from './components/FileTree';
import { motion, AnimatePresence } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { 
  FolderOpen, FileText, SpinnerGap, PaperPlaneRight, CaretLeft, Paperclip,
  Folder, X, Lightning, Pulse, CaretRight, Square, Sun, Moon,
  Cpu, HardDrives, TreeStructure, Stack, TerminalWindow, WarningCircle, MagnifyingGlass, FolderPlus, Plus, ShareNetwork,
  Brain, Users, Code, Lightbulb, CircleDashed, FileJs, FileTs, FilePy, FileHtml, FileCss, FileDoc, FileImage, FileCode,
  Trash, Check, ArrowCounterClockwise, Copy, DownloadSimple, CheckCircle, Warning, Wrench, Robot, ShieldCheck, GithubLogo, UploadSimple, Bug, GitBranch, GitPullRequest, GitCommit, GitMerge, ListChecks, Rocket, CaretDown, Question, House, Desktop, FolderSimple
} from '@phosphor-icons/react';

function CollapsibleThought({ content, isRunning }: { content: string; isRunning?: boolean }) {
  const [isOpen, setIsOpen] = useState(false);
  const lines = content
    .split('\n')
    .map(l => l
      .replace(/^---\s*\[Iteration.*?\]\s*.*?\s*---$/i, '')
      .replace(/^\[Thought\]:?\s*/i, '')
      .replace(/^\[Main Agent\]:?\s*/i, '')
      .replace(/^\[Claude Code Agent\]:?\s*/i, '')
      .trim()
    )
    .filter(l => l !== '' && !l.includes('Agent is thinking'));

  if (lines.length === 0) return null;

  return (
    <div className="my-2 bg-transparent font-sans">
      <motion.button 
        onClick={() => setIsOpen(!isOpen)}
        whileHover={{ x: 2 }}
        whileTap={{ scale: 0.97 }}
        className={`flex items-center gap-2 text-[13px] font-sans font-medium transition-colors py-1 cursor-pointer select-none text-left w-max outline-none text-[#A1A1AA] dark:text-[#52525B] hover:text-[#71717A] dark:hover:text-[#71717A]`}
      >
        {isRunning && (
          <SpinnerGap size={14} className="animate-spin text-[#3B82F6] shrink-0" />
        )}
        <span>Agent Reasoning <span className="opacity-60 font-mono text-[12px] ml-1">({lines.length} {lines.length === 1 ? 'step' : 'steps'})</span>{isRunning ? '...' : ''}</span>
      </motion.button>
      
      <AnimatePresence>
        {isOpen && (
          <motion.div 
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="py-1.5 space-y-1.5 mt-1">
              {lines.map((line, idx) => {
                if (line.startsWith('>') || line.startsWith('tool:') || line.startsWith('Using tool:') || line.startsWith('Executing') || line.startsWith('Creating') || line.startsWith('Reading') || line.startsWith('Editing') || line.startsWith('Searching') || line.startsWith('Inspecting') || line.startsWith('Completed')) {
                  const cleanAction = line.startsWith('>') ? line.slice(1).trim() : line;
                  return (
                    <motion.div key={idx} initial={{ opacity: 0, y: 2 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2, delay: 0 }} className="flex items-center gap-2 text-[12px] font-mono font-semibold text-[#3B82F6] py-0.5">
                      <Code size={13} weight="bold" className="shrink-0" />
                      <span>{cleanAction}</span>
                    </motion.div>
                  );
                }
                if (line.startsWith('[Tool Call]')) {
                  const cleanCall = line.replace(/^\[Tool Call\]:?\s*/i, '').replace(/\(\{.*?\}\)/, '');
                  return (
                    <motion.div key={idx} initial={{ opacity: 0, y: 2 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2, delay: 0 }} className="flex items-center gap-2 text-[12px] font-mono font-semibold text-[#3B82F6] py-0.5">
                      <Code size={13} weight="bold" className="shrink-0" />
                      <span>Executing: {cleanCall}</span>
                    </motion.div>
                  );
                }
                let cleanLine = line.replace(/[⏳🧠✅❌🤖🏗️💻🧪🚀⚠️⏹️▶️📦💬🖥️]/g, '').trim();
                let IconComp = null;
                let iconCol = "text-[#71717A]";

                if (cleanLine.includes('[System]')) {
                  IconComp = TerminalWindow;
                  iconCol = "text-[#3B82F6]";
                  cleanLine = cleanLine.replace(/\[System\]\s*/i, '');
                } else if (cleanLine.includes('[Iteration')) {
                  IconComp = Brain;
                  iconCol = "text-[#8B5CF6]";
                  cleanLine = cleanLine.replace(/\[Iteration[^\]]+\]\s*/i, '');
                } else if (cleanLine.includes('[Phase')) {
                  IconComp = TreeStructure;
                  iconCol = "text-[#F59E0B]";
                  cleanLine = cleanLine.replace(/\[Phase[^\]]+\]\s*/i, '');
                } else if (cleanLine.includes('[Verifier]')) {
                  IconComp = ShieldCheck;
                  iconCol = "text-[#10B981]";
                  cleanLine = cleanLine.replace(/\[Verifier\]\s*/i, '');
                } else if (cleanLine.toLowerCase().includes('error') || cleanLine.toLowerCase().includes('crashed')) {
                  IconComp = WarningCircle;
                  iconCol = "text-[#EF4444]";
                  cleanLine = cleanLine.replace(/\[ERROR\]\s*/i, '');
                } else if (cleanLine.includes('Booting up orchestration sequence')) {
                  IconComp = Wrench;
                  iconCol = "text-[#71717A]";
                } else if (cleanLine.includes('Classifying intent')) {
                  IconComp = MagnifyingGlass;
                  iconCol = "text-[#3B82F6]";
                } else if (cleanLine.includes('Intent classified')) {
                  IconComp = CheckCircle;
                  iconCol = "text-[#10B981]";
                } else if (cleanLine.includes('Launching Claude-Level')) {
                  IconComp = TreeStructure;
                  iconCol = "text-[#F59E0B]";
                }

                if (cleanLine.startsWith('</>')) {
                   // Special rendering for Workspace/Router Model
                   const parts = cleanLine.replace('</>', '').split(':');
                   return (
                     <motion.div key={idx} initial={{ opacity: 0, y: 2 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2, delay: 0 }} className="flex items-center gap-1.5 text-[12px] font-mono py-0.5">
                       <span className="text-[#3B82F6] font-semibold">{parts[0]?.trim()}:</span>
                       <span className="text-[#52525B]">{parts.slice(1).join(':').trim()}</span>
                     </motion.div>
                   );
                }

                return (
                  <motion.div key={idx} initial={{ opacity: 0, y: 2 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2, delay: 0 }} className="flex items-start gap-2 text-[13px] font-sans text-[#52525B] leading-relaxed py-0.5">
                    {IconComp && <IconComp size={14} weight="duotone" className={`mt-[3px] shrink-0 ${iconCol}`} />}
                    <span className="flex-1">{cleanLine}</span>
                  </motion.div>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
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
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      className="my-3 font-sans text-[15px]"
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({node, ...props}) => <h1 className="text-[22px] font-bold text-[#18181B] dark:text-[#F4F4F5] mt-5 mb-3 tracking-tight" {...props} />,
          h2: ({node, ...props}) => <h2 className="text-[18px] font-bold text-[#18181B] dark:text-[#F4F4F5] mt-4 mb-2 tracking-tight" {...props} />,
          h3: ({node, ...props}) => <h3 className="text-[16px] font-semibold text-[#18181B] dark:text-[#F4F4F5] mt-3 mb-2" {...props} />,
          p: ({node, ...props}) => <p className="leading-[1.75] mb-3 text-[#3F3F46] dark:text-[#D4D4D8]" {...props} />,
          ul: ({node, ...props}) => <ul className="list-disc pl-5 mb-3 space-y-1.5 text-[#3F3F46] dark:text-[#D4D4D8]" {...props} />,
          ol: ({node, ...props}) => <ol className="list-decimal pl-5 mb-3 space-y-1.5 text-[#3F3F46] dark:text-[#D4D4D8]" {...props} />,
          li: ({node, ...props}) => <li className="leading-[1.7]" {...props} />,
          strong: ({node, ...props}) => <strong className="font-semibold text-[#18181B] dark:text-white" {...props} />,
          a: ({node, ...props}) => <a className="text-[#3B82F6] hover:underline" target="_blank" rel="noopener noreferrer" {...props} />,
          table: ({node, ...props}) => <div className="overflow-x-auto my-4"><table className="w-full text-left" {...props} /></div>,
          thead: ({node, ...props}) => <thead className="text-[#18181B] dark:text-[#F4F4F5]" {...props} />,
          tbody: ({node, ...props}) => <tbody className="text-[#3F3F46] dark:text-[#D4D4D8]" {...props} />,
          tr: ({node, ...props}) => <tr className="hover:bg-[#FAFAFA] dark:hover:bg-[#111111] transition-colors" {...props} />,
          th: ({node, ...props}) => <th className="px-4 py-2 font-semibold text-sm" {...props} />,
          td: ({node, ...props}) => <td className="px-4 py-2 text-sm" {...props} />,
          code({node, inline, className, children, ...props}: any) {
            const match = /language-(\w+)/.exec(className || '');
            return !inline && match ? (
              <div className="my-3 bg-[#F8FAFC] dark:bg-black border border-[#E2E8F0] dark:border-transparent rounded-md overflow-hidden">
                <div className="bg-[#F1F5F9] dark:bg-black px-3 py-1.5 border-b border-[#E2E8F0] dark:border-transparent text-[11px] font-bold text-[#64748B] dark:text-[#A1A1AA] uppercase tracking-wider">
                  {match[1]}
                </div>
                <div className="p-3 overflow-x-auto">
                  <pre className="text-[#0F172A] dark:text-[#E4E4E7] whitespace-pre-wrap font-mono text-[13px] leading-relaxed"><code {...props} className={className}>{children}</code></pre>
                </div>
              </div>
            ) : (
              <code className="bg-[#F4F4F5] dark:bg-white/5 text-[#18181B] dark:text-[#F4F4F5] px-1.5 py-0.5 rounded text-[13px] font-mono font-medium" {...props}>
                {children}
              </code>
            );
          }
        }}
      >
        {cleanContent}
      </ReactMarkdown>
    </motion.div>
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
  let iconColor = "text-[#71717A]";

  if (actionText.includes('[System]')) {
    IconComponent = TerminalWindow;
    iconColor = "text-[#3B82F6]";
    actionText = actionText.replace(/\[System\]\s*/i, '');
  } else if (actionText.includes('[Verifier]')) {
    IconComponent = ShieldCheck;
    iconColor = "text-[#10B981]";
    actionText = actionText.replace(/\[Verifier\]\s*/i, '');
  } else if (actionText.includes('[Iteration')) {
    IconComponent = Brain;
    iconColor = "text-[#8B5CF6]";
    actionText = actionText.replace(/\[Iteration[^\]]+\]\s*/i, '');
  } else if (actionText.includes('[Phase')) {
    IconComponent = TreeStructure;
    iconColor = "text-[#F59E0B]";
    actionText = actionText.replace(/\[Phase[^\]]+\]\s*/i, '');
  } else if (actionText.includes('[Main Agent]')) {
    IconComponent = Robot;
    iconColor = "text-[#8B5CF6]";
    actionText = actionText.replace(/\[Main Agent\]\s*/i, '');
  } else if (actionText.toLowerCase().includes('error') || actionText.toLowerCase().includes('crashed')) {
    IconComponent = WarningCircle;
    iconColor = "text-[#EF4444]";
    actionText = actionText.replace(/\[ERROR\]\s*/i, '');
  } else if (actionText.includes('[SUCCESS]')) {
    IconComponent = CheckCircle;
    iconColor = "text-[#10B981]";
    actionText = actionText.replace(/\[SUCCESS\]\s*/i, '');
  } else if (actionText.includes('[WARNING]')) {
    IconComponent = Warning;
    iconColor = "text-[#F59E0B]";
    actionText = actionText.replace(/\[WARNING\]\s*/i, '');
  } else if (actionText.includes('[STOPPED]')) {
    IconComponent = Square;
    iconColor = "text-[#EF4444]";
    actionText = actionText.replace(/\[STOPPED\]\s*/i, '');
  } else {
    IconComponent = Wrench;
    iconColor = "text-[#71717A]";
  }

  const lineCount = outputText ? outputText.split('\n').length : 0;

  return (
    <motion.div 
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="my-3 font-sans text-[14px] border-l-2 border-[#E4E4E7] dark:border-transparent ml-2 pl-4"
    >
      <button 
        onClick={() => { if (outputText) setIsOpen(!isOpen) }}
        className={`flex items-start gap-2.5 py-1.5 select-none text-left font-sans text-[14px] w-full ${outputText ? 'text-[#71717A] dark:text-[#A1A1AA] hover:text-[#52525B] dark:hover:text-[#F4F4F5] transition-colors cursor-pointer font-medium' : 'text-[#18181B] dark:text-[#D4D4D8] cursor-default font-bold'}`}
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
      
      <AnimatePresence>
        {isOpen && outputText && (
          <motion.div 
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden mt-1"
          >
            <div className="py-1 text-[#71717A] dark:text-[#A1A1AA] text-[13px] whitespace-pre-wrap leading-[1.7] tracking-normal font-mono select-text bg-[#F4F4F5] dark:bg-[#18181B] p-3 rounded-md border border-[#E4E4E7] dark:border-[#27272A]">
              {outputText}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function CleanInteractiveQuestionCard({
  question,
  placeholder,
  options,
  isSecret,
  onSendAnswer,
  disabled
}: {
  question: string;
  placeholder?: string;
  options?: string[];
  isSecret?: boolean;
  onSendAnswer: (answer: string) => void;
  disabled?: boolean;
}) {
  const [value, setValue] = useState('');
  const [submitted, setSubmitted] = useState(false);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96, y: 10 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      className="my-4 space-y-4 max-w-[650px] bg-transparent"
    >
      <div className="flex items-start gap-3">
        <div className="w-8 h-8 rounded-xl bg-[#3B82F6]/15 flex items-center justify-center text-[#3B82F6] shrink-0 mt-0.5 shadow-sm">
          <Question size={18} weight="bold" />
        </div>
        <div className="space-y-1 flex-1">
          <div className="text-[11px] font-mono font-bold text-[#3B82F6] uppercase tracking-wider">Swarm Question / Input Required</div>
          <div className="text-[14px] font-sans font-medium text-[#18181B] dark:text-white leading-relaxed">{question}</div>
        </div>
      </div>

      {!submitted ? (
        <div className="space-y-3 pt-1 pl-11">
          <div className="flex gap-2">
            <input
              type={isSecret ? "password" : "text"}
              value={value}
              onChange={e => setValue(e.target.value)}
              placeholder={placeholder || "Type your answer here..."}
              onKeyDown={e => {
                if (e.key === 'Enter' && value.trim()) {
                  setSubmitted(true);
                  onSendAnswer(value.trim());
                }
              }}
              className="flex-1 h-10 px-3.5 rounded-xl bg-black/5 dark:bg-white/5 border-transparent text-[13px] font-mono text-[#18181B] dark:text-white placeholder-[#A1A1AA] focus:outline-none focus:bg-black/10 dark:focus:bg-white/10 transition-colors"
            />
            <Button
              onClick={() => {
                if (value.trim()) {
                  setSubmitted(true);
                  onSendAnswer(value.trim());
                }
              }}
              disabled={!value.trim() || disabled}
              className="h-10 px-5 bg-[#3B82F6] hover:bg-[#2563EB] text-white font-bold rounded-xl shadow-md cursor-pointer flex items-center gap-2 transition-all"
            >
              <span>Submit</span>
              <PaperPlaneRight size={14} weight="fill" color="#FFFFFF" className="text-white fill-white" />
            </Button>
          </div>

          {options && options.length > 0 && (
            <div className="flex flex-wrap gap-2 pt-1">
              {options.map((opt, i) => (
                <button
                  key={i}
                  onClick={() => setValue(opt)}
                  className="px-3 py-1 rounded-lg text-[11.5px] font-mono bg-black/5 dark:bg-white/5 text-[#52525B] dark:text-[#D4D4D8] hover:bg-[#3B82F6]/15 hover:text-[#3B82F6] dark:hover:text-[#60A5FA] transition-colors cursor-pointer"
                >
                  {opt}
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="pl-11 flex items-center gap-2 text-[13px] font-mono text-[#10B981] py-2">
          <CheckCircle size={16} weight="fill" />
          <span>Submitted: {isSecret ? '••••••••••••••••' : value}</span>
        </div>
      )}
    </motion.div>
  );
}

function FolderPickerModal({ isOpen, onClose, onSelect, initialPath }: { isOpen: boolean, onClose: () => void, onSelect: (path: string) => void, initialPath: string }) {
  const [currentPath, setCurrentPath] = useState(initialPath);
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [filterQuery, setFilterQuery] = useState('');

  const fetchItems = () => {
    setLoading(true);
    fetch(`/api/files?dir=${encodeURIComponent(currentPath)}`)
      .then(async r => {
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then(data => {
        if (Array.isArray(data)) setItems(data.filter(i => i.isDirectory));
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
        body: JSON.stringify({ dir: currentPath, name: newFolderName.trim() })
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
      const newP = currentPath.includes('\\') ? parts.join('\\') : (isWinDrive ? parts.join('/') : '/' + parts.join('/'));
      setCurrentPath(newP || (isWinDrive ? 'C:/' : '/'));
    } else if (parts.length === 1 && currentPath.includes('\\')) {
      setCurrentPath(parts[0] + '\\');
    }
  };

  const pathParts = currentPath.split(/[\\/]/).filter(Boolean);
  const filteredItems = items.filter(i => i.name.toLowerCase().includes(filterQuery.toLowerCase()));

  const shortcuts = [
    { label: 'Home', path: 'C:\\Users\\sahaj', icon: <House size={16} weight="duotone" className="text-[#3B82F6]" /> },
    { label: 'Desktop', path: 'C:\\Users\\sahaj\\Desktop', icon: <Desktop size={16} weight="duotone" className="text-[#3B82F6]" /> },
    { label: 'Documents', path: 'C:\\Users\\sahaj\\Documents', icon: <FileText size={16} weight="duotone" className="text-[#3B82F6]" /> },
    { label: 'Downloads', path: 'C:\\Users\\sahaj\\Downloads', icon: <DownloadSimple size={16} weight="duotone" className="text-[#3B82F6]" /> },
    { label: 'C: Drive', path: 'C:\\', icon: <HardDrives size={16} weight="duotone" className="text-[#3B82F6]" /> },
  ];

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="fixed inset-0 bg-black/40 backdrop-blur-md z-[100] flex items-center justify-center p-4"
    >
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        transition={{ duration: 0.25, ease: [0.23, 1, 0.32, 1] }}
        className="w-full max-w-[660px] bg-white dark:bg-black shadow-[0_40px_100px_-20px_rgba(0,0,0,0.15)] dark:shadow-[0_40px_100px_-20px_rgba(0,0,0,0.5)] rounded-[32px] overflow-hidden flex flex-col max-h-[82vh]"
      >
        {/* Header - No bottom border for seamless flow */}
        <div className="px-7 pt-6 pb-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[#3B82F6]/10 flex items-center justify-center text-[#3B82F6]">
              <FolderOpen size={22} weight="duotone" />
            </div>
            <div>
              <h2 className="text-[15px] font-bold text-[#18181B] dark:text-white font-sans tracking-tight">Select Workspace Folder</h2>
              <p className="text-[12px] font-sans text-[#71717A] dark:text-[#A1A1AA]">Navigate and pick your general project directory</p>
            </div>
          </div>
          <button onClick={onClose} className="text-[#A1A1AA] hover:text-[#18181B] dark:hover:text-white p-2 rounded-xl hover:bg-[#F4F4F5] dark:hover:bg-[#27272A] transition-all cursor-pointer">
            <X size={18} weight="bold" />
          </button>
        </div>

        {/* Shortcuts - Completely Boxless, No QUICK text, General Folders with Phosphor Icons */}
        <div className="px-6 py-2 flex items-center gap-1.5 overflow-x-auto scrollbar-hide">
          {shortcuts.map((s, i) => (
            <button
              key={i}
              onClick={() => setCurrentPath(s.path)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-xl text-[12.5px] font-sans font-medium text-[#52525B] dark:text-[#A1A1AA] hover:text-[#18181B] dark:hover:text-white hover:bg-[#F4F4F5] dark:hover:bg-[#27272A] transition-all cursor-pointer shrink-0"
            >
              {s.icon}
              <span>{s.label}</span>
            </button>
          ))}
          {(() => {
            try {
              const rec = JSON.parse(localStorage.getItem('warden_recent_workspaces') || '[]');
              if (rec.length === 0) return null;
              return rec.map((p: string, i: number) => (
                <button
                  key={i}
                  onClick={() => setCurrentPath(p)}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-xl text-[12.5px] font-sans font-medium text-[#71717A] dark:text-[#A1A1AA] hover:text-[#3B82F6] dark:hover:text-[#60A5FA] hover:bg-[#F4F4F5] dark:hover:bg-[#27272A] transition-all shrink-0 cursor-pointer truncate max-w-[160px]"
                  title={p}
                >
                  <ArrowCounterClockwise size={15} weight="duotone" className="text-[#3B82F6]" />
                  <span>{p.split(/[\\/]/).pop() || p}</span>
                </button>
              ));
            } catch { return null; }
          })()}
        </div>

        {/* Breadcrumb Bar - Clean, boxless navigation */}
        <div className="px-6 py-2.5 flex items-center gap-2 overflow-x-auto scrollbar-hide bg-[#F4F4F5]/50 dark:bg-[#111111]/40 mx-6 rounded-2xl my-1">
          <button onClick={goUp} className="p-1.5 rounded-lg text-[#71717A] dark:text-[#A1A1AA] hover:text-[#18181B] dark:hover:text-white hover:bg-white dark:hover:bg-[#27272A] transition-colors shrink-0 shadow-2xs" title="Go up one level">
            <CaretLeft size={16} weight="bold" />
          </button>
          <div className="flex items-center gap-1.5 text-[12px] font-mono text-[#52525B] dark:text-[#A1A1AA] flex-1 overflow-x-auto scrollbar-hide">
            {pathParts.map((part, idx) => {
              const segPath = pathParts.slice(0, idx + 1).join(currentPath.includes('\\') ? '\\' : '/');
              return (
                <React.Fragment key={idx}>
                  {idx > 0 && <span className="text-[#A1A1AA] dark:text-[#52525B] opacity-50">/</span>}
                  <button
                    onClick={() => setCurrentPath(currentPath.includes('\\') && idx === 0 ? segPath + '\\' : segPath)}
                    className="hover:text-[#3B82F6] dark:hover:text-[#60A5FA] hover:bg-white dark:hover:bg-[#27272A] px-2.5 py-1 rounded-lg transition-all shrink-0 truncate max-w-[140px] shadow-2xs cursor-pointer font-medium"
                  >
                    {part}
                  </button>
                </React.Fragment>
              );
            })}
          </div>
        </div>

        {/* Filter Input - Boxless seamlessly integrated */}
        <div className="px-7 py-2 flex items-center gap-2.5">
          <MagnifyingGlass size={16} className="text-[#A1A1AA] dark:text-[#71717A]" weight="bold" />
          <input
            value={filterQuery}
            onChange={e => setFilterQuery(e.target.value)}
            placeholder="Filter folders in this directory..."
            className="flex-1 bg-transparent border-none outline-none text-[13px] font-sans text-[#18181B] dark:text-white placeholder-[#A1A1AA] dark:placeholder-[#71717A] py-1 focus:ring-0"
          />
          {filterQuery && (
            <button onClick={() => setFilterQuery('')} className="text-[#A1A1AA] hover:text-[#18181B] dark:hover:text-white text-[12px] font-sans px-2 py-0.5 rounded-md hover:bg-[#F4F4F5] dark:hover:bg-[#27272A] transition-all cursor-pointer">Clear</button>
          )}
        </div>

        {/* Directory List - Clean spacing, Phosphor icons */}
        <div className="flex-1 overflow-y-auto px-5 py-2 min-h-[260px] max-h-[380px]">
          {loading ? (
            <div className="flex flex-col items-center justify-center h-48 gap-3 text-[#A1A1AA] dark:text-[#71717A]">
              <SpinnerGap className="animate-spin text-[#3B82F6]" size={28} weight="bold" />
              <span className="text-[13px] font-sans">Scanning folders...</span>
            </div>
          ) : (
            <div className="space-y-0.5">
              <AnimatePresence>
                {isCreatingFolder && (
                  <motion.form 
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    onSubmit={handleCreateFolder} 
                    className="w-full flex items-center gap-3 px-3.5 py-2.5 bg-[#3B82F6]/5 rounded-2xl mb-2"
                  >
                    <FolderPlus size={20} className="text-[#3B82F6]" weight="duotone" />
                    <input 
                      autoFocus
                      value={newFolderName}
                      onChange={e => setNewFolderName(e.target.value)}
                      placeholder="New folder name..."
                      className="flex-1 text-[13px] font-sans text-[#18181B] dark:text-white border-none outline-none focus:ring-0 p-0 bg-transparent"
                      onBlur={() => !newFolderName && setIsCreatingFolder(false)}
                    />
                  </motion.form>
                )}
                {filteredItems.map((item, idx) => (
                  <motion.button 
                    layout
                    initial={{ opacity: 0, x: -4 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: Math.min(idx * 0.015, 0.3) }}
                    key={item.name} 
                    onClick={() => {
                      const sep = currentPath.includes('\\') ? '\\' : '/';
                      const newPath = currentPath.endsWith(sep) ? currentPath + item.name : currentPath + sep + item.name;
                      setCurrentPath(newPath);
                      setFilterQuery('');
                    }}
                    className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-2xl hover:bg-[#F4F4F5] dark:hover:bg-[#27272A] transition-all text-left group cursor-pointer"
                  >
                    <div className="flex items-center gap-3 truncate">
                      <FolderSimple size={20} className="text-[#3B82F6] group-hover:scale-110 transition-transform shrink-0" weight="duotone" />
                      <span className="text-[13px] font-sans text-[#18181B] dark:text-[#E4E4E7] font-medium truncate">{item.name}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-[11.5px] font-sans font-medium text-[#3B82F6] dark:text-[#60A5FA] opacity-0 group-hover:opacity-100 transition-all">
                      <span>Open</span>
                      <CaretLeft size={14} className="rotate-180" weight="bold" />
                    </div>
                  </motion.button>
                ))}
              </AnimatePresence>
              {filteredItems.length === 0 && !isCreatingFolder && (
                <div className="text-center py-16 text-[13px] font-sans text-[#A1A1AA] dark:text-[#71717A] flex flex-col items-center gap-3">
                  <FolderOpen size={36} className="opacity-30 text-[#3B82F6]" weight="duotone" />
                  <span className="font-medium">{filterQuery ? `No folders matching "${filterQuery}"` : "No subdirectories found."}</span>
                  <span className="text-[12px] text-[#71717A]">You can select this directory directly as your workspace.</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer Action Bar - Boxless New Folder button, clean layout */}
        <div className="px-7 py-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[#FAFAFA] dark:bg-[#111111]/80 mt-1">
          <div className="flex items-center gap-4 overflow-hidden">
            <button 
              onClick={() => setIsCreatingFolder(true)} 
              className="flex items-center gap-2 text-[13px] font-sans font-medium text-[#52525B] dark:text-[#D4D4D8] hover:text-[#3B82F6] dark:hover:text-[#60A5FA] transition-all cursor-pointer shrink-0"
            >
              <Plus size={16} weight="bold" className="text-[#3B82F6]" /> <span>New Folder</span>
            </button>
            <div className="text-[11.5px] font-mono text-[#71717A] dark:text-[#A1A1AA] truncate" title={currentPath}>
              <span className="font-bold text-[#18181B] dark:text-white font-sans mr-1">Active:</span> {currentPath}
            </div>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <button onClick={onClose} className="text-[13px] font-sans font-medium text-[#71717A] dark:text-[#A1A1AA] hover:text-[#18181B] dark:hover:text-white px-4 py-2 rounded-xl transition-colors cursor-pointer">Cancel</button>
            <button 
              onClick={() => { onSelect(currentPath); onClose(); }} 
              className="text-[13px] font-sans font-bold bg-[#3B82F6] hover:bg-[#2563EB] text-white px-6 py-2.5 rounded-2xl shadow-md hover:shadow-lg transition-all hover:scale-105 active:scale-95 cursor-pointer flex items-center gap-2"
            >
              <span>Select Workspace</span>
              <CheckCircle size={18} weight="fill" />
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

export default function App() {
  const [tasks, setTasks] = useState<any[]>([]);
  const [sysInfo, setSysInfo] = useState<{ cpuUsage: number, memoryUsedBytes: number, memoryTotalBytes: number, modelLoaded: string, gpuInfo?: string }>({ cpuUsage: 0, memoryUsedBytes: 0, memoryTotalBytes: 0, modelLoaded: 'Initializing...', gpuInfo: 'Detecting GPU...' });
  const [downloadProgress, setDownloadProgress] = useState<{ model: string, percent: number, status: string } | null>(null);
  const [modelError, setModelError] = useState<string | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [wsConnected, setWsConnected] = useState(false);
  
  // Chat Interface State
  const [chatHistories, setChatHistories] = useState<Record<string, {id: string, role: 'user' | 'thought' | 'output' | 'tool' | 'question', content: string, placeholder?: string, options?: string[], isSecret?: boolean}[]>>(() => {
    try {
      const saved = localStorage.getItem('warden_chat_histories');
      if (!saved) return {};
      const parsed = JSON.parse(saved);
      // Migration: re-classify legacy logs from 'tool' to 'thought' so they collapse properly
      for (const taskId in parsed) {
        const mapped = parsed[taskId].map((msg: any) => {
          if (msg.role === 'tool') {
            const content = msg.content;
            if (content.startsWith('[Phase') || content.startsWith('[Swarm') || content.includes('🚀 Launching Phase') || content.includes('Phase completed') || content.includes('[Iteration') || content.includes('LLM is thinking') || content.includes('LLM inference') || content.includes('⏳') || content.includes('🧠') || content.startsWith('[Verifier]') || content.startsWith('[System]') || content.includes('✅ Task completed') || content.includes('❌ Task permanently') || content.includes('⬆️ Escalating') || content.includes('🔄 Retrying') || content.includes('Intent classified') || content.includes('Workspace:') || content.includes('Router Model:') || content.includes('▶️ Running:') || content.startsWith('[Main Agent]') || content.includes('🤖 Launching') || content.includes('💬 Answering') || content.includes('📦 Initiating') || content.includes('🖥️ Preparing') || content.includes('Booting up orchestration sequence')) {
              return { ...msg, role: 'thought' };
            }
          }
          return msg;
        });

        // Merge adjacent 'thought' and 'tool' messages so they render as a single collapsible block
        const merged = [];
        for (const msg of mapped) {
          const isThoughtOrTool = msg.role === 'thought' || msg.role === 'tool';
          const lastIsThoughtOrTool = merged.length > 0 && (merged[merged.length - 1].role === 'thought' || merged[merged.length - 1].role === 'tool');
          
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
  const [attachedImage, setAttachedImage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [contextDir, setContextDir] = useState(() => localStorage.getItem('warden_workspace') || ''); 
  const [rootWorkspace, setRootWorkspace] = useState(() => localStorage.getItem('warden_root_workspace') || localStorage.getItem('warden_workspace') || '');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(() => localStorage.getItem('warden_theme') === 'dark');
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(() => {
    return localStorage.getItem('warden_selected_task_id') || null;
  });
  const selectedTask = tasks.find(t => t.id === selectedTaskId);
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
  const [fileToDelete, setFileToDelete] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [allWorkspaceFiles, setAllWorkspaceFiles] = useState<any[]>([]);
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({});

  const [referencedFiles, setReferencedFiles] = useState<string[]>([]);
  const [showMentionMenu, setShowMentionMenu] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionIndex, setMentionIndex] = useState(0);

  const [showCommandPalette, setShowCommandPalette] = useState(false);
  const [commandPaletteQuery, setCommandPaletteQuery] = useState('');
  const commandInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setShowCommandPalette(true);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    if (showCommandPalette) {
      setTimeout(() => commandInputRef.current?.focus(), 50);
    } else {
      setCommandPaletteQuery('');
    }
  }, [showCommandPalette]);

  const [gitStatus, setGitStatus] = useState<{ isRepo: boolean, remote: string | null, branch?: string, modifiedCount?: number, lastCommit?: string }>({ isRepo: false, remote: null });
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

  useEffect(() => {
    fetch('/api/tasks')
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data)) {
          setTasks(data);
          const running = data.find((t: any) => t.status === 'running');
          const savedId = localStorage.getItem('warden_selected_task_id');
          if (running) {
            setSelectedTaskId(running.id);
          } else if (savedId && !data.some((t: any) => t.id === savedId)) {
            setSelectedTaskId(null);
            localStorage.removeItem('warden_selected_task_id');
          }
        }
      })
      .catch(() => {});

    const fetchSys = () => {
      fetch('/api/system')
        .then(r => r.json())
        .then(data => setSysInfo(prev => ({ ...prev, ...data })))
        .catch(() => {});
    };
    fetchSys();
    const sysInterval = setInterval(fetchSys, 10000);

    const ignoredDirs = new Set(['node_modules', '__pycache__', '.git', '.venv', 'venv', 'env', '.next', 'dist', 'build', '.idea', '.vscode', '.DS_Store', 'coverage', 'tmp', 'temp', 'vendor']);

    const fetchWorkspaceFiles = () => {
      if (contextDir) {
        fetch(`/api/files?dir=${encodeURIComponent(contextDir)}`)
          .then(r => r.json())
          .then(data => {
            if (Array.isArray(data)) {
              const clean = data.filter((f: any) => {
                if (!f || !f.name) return false;
                const parts = f.name.split(/[\\/]/);
                return !parts.some((p: string) => ignoredDirs.has(p) || p.endsWith('.pyc') || p.endsWith('.pyo'));
              });
              setFiles(clean);
            }
          })
          .catch(() => {});
      }
    };
    const fetchAllFiles = () => {
      fetch(`/api/files?dir=${encodeURIComponent(contextDir || 'root')}&recursive=true`)
        .then(r => r.json())
        .then(data => {
          if (Array.isArray(data)) {
            const clean = data.filter((f: any) => {
              if (!f || !f.name) return false;
              const parts = f.name.split(/[\\/]/);
              return !parts.some((p: string) => ignoredDirs.has(p) || p.endsWith('.pyc') || p.endsWith('.pyo'));
            });
            setAllWorkspaceFiles(clean);
          }
        })
        .catch(() => {});
    };
    const fetchGitStatus = () => {
      if (contextDir) {
        fetch(`/api/git/status?dir=${encodeURIComponent(contextDir)}`)
          .then(r => r.json())
          .then(data => setGitStatus(data))
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
        .then(r => r.json())
        .then(data => {
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
  }, [selectedTask?.id, selectedTask?.status]);

  useEffect(() => {
    let reconnectTimer: any;
    let backoff = 1000;

    function connectWs() {
      const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsHost = window.location.hostname === 'localhost' ? 'localhost:3000' : window.location.host;
      const wsUrl = `${wsProtocol}//${wsHost}/ws`;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;
      ws.onopen = () => { backoff = 1000; setWsConnected(true); };
      ws.onmessage = (event) => {
        try {
          const { type, payload } = JSON.parse(event.data);
          if (type === 'task_created' || type === 'task_completed' || type === 'file_changed' || type === 'task_console') {
            if (dynamicRefreshRef.current) dynamicRefreshRef.current();
          }
          if (type === 'task_created') {
            setTasks(prev => [payload, ...prev]);
            setSelectedTaskId(payload.id);
            setChatHistories(prev => {
              if (prev.temp) {
                const { temp, ...rest } = prev;
                return { ...rest, [payload.id]: temp };
              }
              return prev;
            });
          } else if (type === 'model_download_progress') {
            setDownloadProgress(payload);
            if (payload.status === 'success') {
              setTimeout(() => setDownloadProgress(null), 3000);
            }
          } else if (type === 'model_loading') {
            setSysInfo(prev => ({ ...prev, modelLoaded: `Loading ${payload.model}...` }));
          } else if (type === 'model_loaded') {
            setSysInfo(prev => ({ ...prev, modelLoaded: payload.model }));
            setDownloadProgress(null);
            setModelError(null);
          } else if (type === 'user_question') {
            setChatHistories(prevMap => {
              const prev = prevMap[payload.taskId] || [];
              const qMsg = {
                id: Math.random().toString(),
                role: 'question' as const,
                content: payload.question,
                placeholder: payload.placeholder,
                options: payload.options,
                isSecret: payload.isSecret
              };
              return { ...prevMap, [payload.taskId]: [...prev, qMsg] };
            });
          } else if (type === 'task_console') {
            const rawContent = payload.content.trim();

            setChatHistories(prevMap => {
              const prev = prevMap[payload.taskId] || [];
              let role: 'thought' | 'output' | 'tool' | 'question' = 'thought';
              let content = payload.content.trim();
              if (content.startsWith('[Main Agent Answer]') || content.startsWith('[Main Agent Output]') || content.startsWith('[Task Summary]') || content.startsWith('[Claude Code Agent] Task Finished:') || content.includes('Task permanently failed') || content.includes('Agent crashed:')) {
                role = 'output';
                content = content.replace(/^\[(Main Agent Answer|Main Agent Output|Task Summary|Claude Code Agent\] Task Finished):\]?\s*/i, '').trim();
              } else if (content.startsWith('[Tool Execution]') || content.startsWith('[Tool Result]') || content.includes('Successfully wrote') || content.includes('Ran command:') || content.includes('Executing command') || content.includes('Spawned sub-agent') || content.includes('Wrote file') || content.includes('Edited file') || content.includes('Started background server') || content.includes('Reading file') || content.includes('Searching codebase') || content.includes('Completed task verification')) {
                role = 'tool';
              }
              const lastMsg = prev[prev.length - 1];
              if (lastMsg && (lastMsg.role === 'thought' || lastMsg.role === 'tool') && (role === 'thought' || role === 'tool')) {
                const newPrev = [...prev];
                newPrev[newPrev.length - 1] = { ...lastMsg, role: 'thought', content: lastMsg.content + '\n' + content };
                return { ...prevMap, [payload.taskId]: newPrev };
              }
              if (role === 'tool') role = 'thought';
              return { ...prevMap, [payload.taskId]: [...prev, { id: Math.random().toString(), role, content }] };
            });
          } else if (type === 'model_error') {
            setModelError(payload.message || 'Connection to Ollama failed');
            setTimeout(() => setModelError(null), 15000);
          } else if (type === 'tasks_updated' || type === 'task_deleted' || type === 'task_status_changed') {
            fetch('/api/tasks')
              .then(r => r.json())
              .then(data => {
                if (Array.isArray(data)) setTasks(data);
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
    setFiles(prev => [...prev, { name: createdName, isDirectory: false }]);
    setAllWorkspaceFiles(prev => [...prev, { name: createdName, isDirectory: false }]);
    setNewFileName('');
    setIsCreatingFile(false);
    try {
      await fetch('/api/files/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dir: contextDir, name: createdName })
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
    setFiles(prev => [...prev, { name: createdName, isDirectory: true }]);
    setAllWorkspaceFiles(prev => [...prev, { name: createdName, isDirectory: true }]);
    setNewFolderName('');
    setIsCreatingFolder(false);
    try {
      await fetch('/api/files', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dir: contextDir, name: createdName })
      });
      if (dynamicRefreshRef.current) dynamicRefreshRef.current();
    } catch (e) {
      if (dynamicRefreshRef.current) dynamicRefreshRef.current();
    }
  };

  const handleDeleteFile = async (name: string) => {
    if (!contextDir) return;
    const fullPath = `${contextDir}/${name}`;
    setFiles(prev => prev.filter(f => f && f.name !== name && !f.name.startsWith(name + '/') && !f.name.startsWith(name + '\\')));
    setAllWorkspaceFiles(prev => prev.filter(f => f && f.name !== name && !f.name.startsWith(name + '/') && !f.name.startsWith(name + '\\')));
    try {
      await fetch('/api/files', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetPath: fullPath, dir: contextDir })
      });
      setOpenTabs(prev => prev.filter(t => t !== fullPath));
      if (activeTab === fullPath) setActiveTab(null);
      if (dynamicRefreshRef.current) dynamicRefreshRef.current();
    } catch (e) {
      if (dynamicRefreshRef.current) dynamicRefreshRef.current();
    }
  };

  const handleDeleteTask = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await fetch(`/api/tasks/${id}`, { method: 'DELETE' });
      setTasks(prev => prev.filter(t => t.id !== id));
      if (selectedTaskId === id) setSelectedTaskId(null);
    } catch (err) {}
  };

  const handleRetryTask = async (t: any, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!t) return;
    const prompt = `Retry and continue executing the previous task: "${formatTaskDescription(t.description)}". Analyze where it stopped or if there were any errors/failures, resolve them, and complete all remaining steps.`;
    
    const msg = { id: Math.random().toString(), role: 'user' as const, content: prompt };
    setChatHistories(prev => ({ ...prev, [t.id]: [...(prev[t.id] || []), msg] }));
    setSelectedTaskId(t.id);
    setIsSubmitting(true);
    try {
      await fetch('/api/goals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ goal: prompt, contextDir: t.contextDir || contextDir, taskId: t.id })
      });
    } catch (err) {}
    setIsSubmitting(false);
  };

  const handleGoalSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!goalInput.trim()) return;

    const newGoal = goalInput;
    setGoalInput('');
    setShowMentionMenu(false);
    
    const msg = { id: Math.random().toString(), role: 'user' as const, content: newGoal };
    if (selectedTaskId) {
      setChatHistories(prev => ({
        ...prev,
        [selectedTaskId]: [...(prev[selectedTaskId] || []), msg]
      }));
    } else {
      setChatHistories(prev => ({ ...prev, temp: [msg] })); // Will be overwritten by task_created
    }

    setIsSubmitting(true);
    try {
      await fetch('/api/goals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ goal: newGoal, images: attachedImage ? [attachedImage] : undefined, contextDir, taskId: selectedTaskId || undefined })
      });
      setAttachedImage(null);
    } catch (e) {
      console.error(e);
    }
    setIsSubmitting(false);
  };

  const isAgentRunning = isSubmitting || (selectedTask && selectedTask.status === 'running') || tasks.some(t => t.status === 'running');

  const handleStopAgent = async (e?: React.FormEvent | React.MouseEvent) => {
    if (e) e.preventDefault();
    const runningTask = tasks.find(t => t.status === 'running') || selectedTask;
    if (runningTask) {
      try {
        await fetch(`/api/tasks/${runningTask.id}/stop`, { method: 'POST' });
        setTasks(prev => prev.map(t => t.id === runningTask.id ? { ...t, status: 'stopped' } : t));
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
    
    let goal = "";
    let statusMsg = "";
    if (!githubUrl || !githubUrl.trim()) {
      if (!gitStatus.isRepo) {
        goal = `Initialize a git repository in this workspace using git init, stage all files using git add ., and make an initial commit with message "Initial commit".`;
        statusMsg = `[Git] Initializing local repository and making initial commit...`;
      } else {
        alert("This workspace is already initialized as a Git repository! Please enter a remote GitHub repository URL (e.g., https://github.com/username/repo.git) in the input box above to connect and push.");
        return;
      }
    } else {
      goal = `Initialize a git repository in this workspace if not already initialized, stage all files, make an initial commit, link or update the remote origin to ${githubUrl.trim()}, and push the initial commit to the main branch.`;
      statusMsg = `[GitHub] Connecting and pushing to ${githubUrl.trim()}...`;
    }

    const msg = { id: Math.random().toString(), role: 'user' as const, content: statusMsg };
    setChatHistories(prev => ({ ...prev, temp: [msg] }));
    setSelectedTaskId(null);
    setIsSubmitting(true);

    try {
      await fetch('/api/goals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ goal, contextDir })
      });
    } catch (e) {
      console.error(e);
    }
    setIsSubmitting(false);
    if (githubUrl) setGithubUrl('');
  };

  const handleGithubAction = async (action: 'push' | 'pull' | 'scan' | 'branch' | 'issue' | 'pr_create' | 'pr_review' | 'pr_merge') => {
    if (!contextDir) return;
    let goal = '';
    if (action === 'push') {
      goal = 'Run git diff to analyze all unstaged changes. Based on the actual code diff, generate a concise and descriptive semantic commit message. Then, execute git add ., git commit -m "<your message>", and git push.';
    } else if (action === 'pull') {
      goal = 'run git pull';
    } else if (action === 'scan') {
      goal = 'Scan all files in this workspace. Identify any potential bugs, security vulnerabilities, or code quality issues. Generate a detailed Markdown QA report and CREATE A FILE named "warden_qa_report.md" in the root of the workspace containing your findings.';
    } else if (action === 'branch') {
      goal = 'Check the current git status and existing branches using git branch -a. If on main/master or if there are unstaged changes, create and checkout a clean semantic feature branch (e.g. feature/update-workspace or fix/code-improvements) using git checkout -b <branch-name> and report the new branch status.';
    } else if (action === 'issue') {
      goal = 'Check if GitHub CLI (gh) is installed by running gh --version. Analyze the codebase or recent QA findings. If gh is authenticated, create a well-structured GitHub Issue using gh issue create (with a clear title and detailed markdown body detailing any bugs or improvements). If gh is not installed or authenticated, generate a comprehensive ISSUE_TEMPLATE.md file and explain the exact steps to submit it.';
    } else if (action === 'pr_create') {
      goal = 'Check current git branch and changes. Make sure all changes are committed, then push the current branch to remote origin using git push -u origin <current-branch>. Then, check if GitHub CLI (gh) is installed and authenticated; if so, create a Pull Request using gh pr create --fill --title "<semantic title>" --body "<detailed description>". If gh is unavailable, output the exact GitHub URL to open the PR in the browser.';
    } else if (action === 'pr_review') {
      goal = 'Check if GitHub CLI (gh) is installed and authenticated. List all open pull requests using gh pr list. Select the most relevant or recent open PR, inspect its code diff using gh pr diff <PR-ID>, check for potential bugs or conflicts, and provide a comprehensive architectural review.';
    } else if (action === 'pr_merge') {
      goal = 'Check if GitHub CLI (gh) is installed and authenticated. List open pull requests using gh pr list. For the approved or correct PR, merge it cleanly into the main branch using gh pr merge <PR-ID> --merge --delete-branch. If gh is unavailable, explain the git fetch and git merge sequence.';
    }

    const msg = { id: Math.random().toString(), role: 'user' as const, content: `[GitHub] ${action.toUpperCase()} command initiated...` };
    setChatHistories(prev => ({ ...prev, temp: [msg] }));
    setSelectedTaskId(null);
    setIsSubmitting(true);

    try {
      await fetch('/api/goals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ goal, contextDir })
      });
    } catch (e) {
      console.error(e);
    }
    setIsSubmitting(false);
  };

  const formatTaskDescription = (desc: string) => {
    let formatted = desc.replace(/^\[.*?\]\s*/, '').trim();
    if (formatted.length > 110) {
      formatted = formatted.substring(0, 110) + '...';
    }
    if (formatted.length > 0) {
      formatted = formatted.charAt(0).toUpperCase() + formatted.slice(1);
    }
    return formatted;
  };

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
    } catch { return ''; }
  };

  const getRealtimeStatus = () => {
    if (!selectedTask) return 'Ready';
    
    const history = chatHistories[selectedTask.id] || [];
    const hasOutput = history.some(m => m.role === 'output');
    
    // Task is done/completed
    if (selectedTask.status !== 'running') {
      if (!hasOutput && history.length > 0) {
        // Task marked done but no output yet — still processing
        return 'Processing response...';
      }
      if (!hasOutput && history.length === 0) {
        return 'Ready';
      }
      return 'Completed';
    }
    
    // Task is running — show contextual status
    if (history.length === 0) {
      return 'Thinking...';
    }
    
    // Check latest messages for context
    for (let i = history.length - 1; i >= Math.max(0, history.length - 5); i--) {
      const text = history[i].content || '';
      if (text.includes('write_file') || text.includes('create_file') || text.includes('Generating file') || text.includes('Successfully wrote')) {
        return 'Writing files...';
      }
      if (text.includes('edit_file') || text.includes('Edited file')) {
        return 'Editing code...';
      }
      if (text.includes('read_file') || text.includes('list_dir') || text.includes('grep_search')) {
        return 'Reading codebase...';
      }
      if (text.includes('Running:') || text.includes('Executing:') || text.includes('run_command')) {
        return 'Running command...';
      }
      if (text.includes('Answering question')) {
        return 'Composing answer...';
      }
    }
    return 'Thinking...';
  };

  const statusText = getRealtimeStatus();

  const memPercent = Math.round((sysInfo.memoryUsedBytes / (sysInfo.memoryTotalBytes || 1)) * 100) || 0;

  const renderTaskNode = (t: any, depth: number = 0) => {
    const isSubTask = depth > 0;
    const children = tasks.filter(sub => sub.parentId === t.id);
    const relTime = getRelativeTime(t.createdAt);
    return (
      <div key={t.id} className="relative flex flex-col gap-1">
        <motion.div 
          layout
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, x: -250, height: 0, overflow: 'hidden', marginBottom: 0, paddingBottom: 0, paddingTop: 0 }}
          transition={{ duration: 0.3, ease: [0.32, 0.72, 0, 1] }}
          className={`cursor-pointer transition-all group relative flex items-center justify-between py-1.5 px-2.5 rounded-xl hover:bg-black/5 dark:hover:bg-white/5 ${selectedTaskId === t.id ? 'bg-black/5 dark:bg-white/10 opacity-100' : 'opacity-80 hover:opacity-100'} ${isSubTask ? 'pl-6 ml-2 border-l border-[#E4E4E7] dark:border-[#27272A]' : ''}`}
          onClick={() => {
            if (selectedTaskId !== t.id) {
              setSelectedTaskId(t.id);
            }
          }}
        >
          <div className="flex items-center gap-2.5 min-w-0 flex-1 pr-2">
            <span className={`text-[13px] font-sans truncate ${selectedTaskId === t.id ? 'text-[#18181B] dark:text-white font-bold' : 'text-[#52525B] dark:text-[#D4D4D8] font-normal group-hover:text-[#18181B] dark:group-hover:text-white'}`}>
              {formatTaskDescription(t.description)}
            </span>
          </div>
          
          <div className="flex items-center gap-2 shrink-0">
            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
              <AnimatePresence>
                {confirmDeleteId === t.id && (
                  <motion.button
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                    transition={{ type: "spring", stiffness: 450, damping: 25 }}
                    onClick={(e) => { handleDeleteTask(t.id, e); setConfirmDeleteId(null); }}
                    title="Confirm Delete"
                    className="text-[#10B981] hover:bg-[#10B981]/20 p-1 rounded transition-colors"
                  >
                    <Check size={14} weight="bold" />
                  </motion.button>
                )}
              </AnimatePresence>
              {t.status !== 'running' && (
                <button
                  onClick={(e) => handleRetryTask(t, e)}
                  className="p-1 rounded text-[#3B82F6] hover:bg-[#3B82F6]/15 transition-colors"
                  title="Retry / Continue Task"
                >
                  <ArrowCounterClockwise size={13} weight="bold" />
                </button>
              )}
              <button 
                onClick={(e) => { 
                  e.stopPropagation(); 
                  setConfirmDeleteId(confirmDeleteId === t.id ? null : t.id); 
                }} 
                className={`p-1 rounded transition-colors ${confirmDeleteId === t.id ? 'text-[#EF4444] bg-[#FEF2F2] dark:bg-red-500/20' : 'text-[#A1A1AA] hover:text-[#EF4444] hover:bg-red-500/10'}`}
                title={confirmDeleteId === t.id ? "Cancel" : "Delete"}
              >
                <X size={13} weight="bold" />
              </button>
            </div>
            
            <div className="flex items-center gap-1.5 min-w-[24px] justify-end">
              {selectedTaskId === t.id ? (
                <span className="w-2 h-2 rounded-full bg-[#3B82F6] shrink-0 shadow-[0_0_8px_rgba(59,130,246,0.6)]" title="Active Chat" />
              ) : t.status === 'running' ? (
                <span className="w-2 h-2 rounded-full bg-[#3B82F6] animate-pulse shrink-0" title="Running" />
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
            {children.map(child => renderTaskNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className={`h-screen w-screen overflow-hidden flex font-sans antialiased selection:bg-fuchsia-500/30 ${isDarkMode ? 'dark bg-black text-white' : 'bg-[#FAFAFA] text-[#111111]'}`}>
      
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
              transition={{ duration: 0.15, ease: "easeOut" }}
              onClick={e => e.stopPropagation()}
              className="w-[600px] bg-white dark:bg-black border border-[#E4E4E7] dark:border-transparent rounded-2xl shadow-[0_20px_60px_rgba(0,0,0,0.15)] dark:shadow-[0_20px_60px_rgba(0,0,0,0.4)] overflow-hidden flex flex-col"
            >
              <div className="flex items-center px-4 py-4 border-b border-[#E4E4E7] dark:border-transparent">
                <MagnifyingGlass size={20} className="text-[#A1A1AA] mr-3" />
                <input
                  ref={commandInputRef}
                  value={commandPaletteQuery}
                  onChange={e => setCommandPaletteQuery(e.target.value)}
                  placeholder="Type a command or search..."
                  className="flex-1 bg-transparent border-none outline-none text-[16px] font-sans text-[#18181B] dark:text-[#F4F4F5] placeholder-[#A1A1AA] dark:placeholder-[#52525B]"
                  onKeyDown={e => {
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
                        const msg = { id: Math.random().toString(), role: 'user' as const, content: goal };
                        setChatHistories(prev => ({ ...prev, temp: [msg] }));
                        setSelectedTaskId(null);
                        setIsSubmitting(true);
                        fetch('/api/goals', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ goal, contextDir })
                        }).finally(() => setIsSubmitting(false));
                        setShowCommandPalette(false);
                        setCommandPaletteQuery('');
                      }
                    }
                  }}
                />
                <div className="flex items-center gap-1">
                  <kbd className="px-1.5 py-0.5 bg-[#F4F4F5] dark:bg-[#27272A] rounded text-[10px] font-mono text-[#71717A] dark:text-[#A1A1AA] font-bold border border-[#E4E4E7] dark:border-[#3F3F46]">ESC</kbd>
                </div>
              </div>
              <div className="p-2 space-y-1 max-h-[300px] overflow-y-auto">
                <div onClick={(e) => { 
                  const nextMode = !isDarkMode;
                  setShowCommandPalette(false);
                  if (!document.startViewTransition) { setIsDarkMode(nextMode); return; }
                  const x = e.clientX || innerWidth / 2;
                  const y = e.clientY || innerHeight / 2;
                  const endRadius = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
                  const transition = document.startViewTransition(() => setIsDarkMode(nextMode));
                  transition.ready.then(() => {
                    document.documentElement.animate(
                      { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${endRadius}px at ${x}px ${y}px)`] },
                      { duration: 500, easing: 'ease-in-out', pseudoElement: '::view-transition-new(root)' }
                    );
                  });
                }} className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-[#F4F4F5] dark:hover:bg-[#27272A] cursor-pointer group">
                  {isDarkMode ? <Sun size={16} className="text-[#A1A1AA] group-hover:text-[#18181B] dark:group-hover:text-[#F4F4F5]" /> : <Moon size={16} className="text-[#A1A1AA] group-hover:text-[#18181B] dark:group-hover:text-[#F4F4F5]" />}
                  <span className="text-[13px] font-sans text-[#52525B] dark:text-[#A1A1AA] group-hover:text-[#18181B] dark:group-hover:text-[#F4F4F5]">Toggle Theme</span>
                </div>
                <div onClick={() => { handleGithubAction('push'); setShowCommandPalette(false); }} className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-[#F4F4F5] dark:hover:bg-[#27272A] cursor-pointer group">
                  <UploadSimple size={16} className="text-[#A1A1AA] group-hover:text-[#3B82F6]" />
                  <span className="text-[13px] font-sans text-[#52525B] dark:text-[#A1A1AA] group-hover:text-[#18181B] dark:group-hover:text-[#F4F4F5]">Git: Auto-commit & Push</span>
                </div>
                <div onClick={() => { handleWipeAll(); setShowCommandPalette(false); }} className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-[#FEF2F2] dark:hover:bg-[#EF4444]/10 cursor-pointer group">
                  <Trash size={16} className="text-[#A1A1AA] group-hover:text-[#EF4444]" />
                  <span className="text-[13px] font-sans text-[#52525B] dark:text-[#A1A1AA] group-hover:text-[#EF4444]">Clear Chat Histories</span>
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
                const rec = JSON.parse(localStorage.getItem('warden_recent_workspaces') || '[]');
                const next = [path, ...rec.filter((p: string) => p !== path)].slice(0, 6);
                localStorage.setItem('warden_recent_workspaces', JSON.stringify(next));
              } catch {}
            }} 
            initialPath={contextDir || 'C:\\Users\\sahaj\\Desktop'}
          />
        )}
      </AnimatePresence>


      {/* LEFT COLUMN - SEAMLESS (NO BORDERS OR SHADOWS) */}
      <nav className="w-[300px] flex flex-col flex-shrink-0 z-20 h-full relative bg-white dark:bg-black">
        <div className="flex-1 overflow-y-auto px-6 py-6 space-y-8 flex flex-col">
          
          <section>
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-transparent dark:border-transparent">
              <div className="flex items-center gap-2">
                <FolderOpen size={18} className="text-fuchsia-500 shrink-0" weight="duotone" />
                <span className="text-[15px] font-bold font-sans text-[#18181B] dark:text-white tracking-tight">
                  Workspaces
                </span>
              </div>
              {rootWorkspace ? (
                <motion.button 
                  whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
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
                  <span className="text-[12px] font-normal font-sans text-[#71717A] group-hover:text-[#3B82F6] transition-colors">Select workspace</span>
                </div>
              )}
            </div>
            
            {/* File Tree Header with action buttons */}
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-mono font-bold text-[#71717A] dark:text-[#A1A1AA] uppercase tracking-wider">
                Files
              </span>
              {rootWorkspace && (
                <div className="flex items-center gap-1">
                  <Button onClick={() => { setIsCreatingFile(true); setIsCreatingFolder(false); }} variant="ghost" size="sm" className="h-6 w-6 p-0 bg-transparent hover:bg-black/5 text-[#71717A] hover:text-[#18181B] dark:bg-transparent dark:hover:bg-white/10 dark:text-[#A1A1AA] dark:hover:text-white cursor-pointer transition-colors rounded" title="New File">
                    <Plus size={14} weight="bold" />
                  </Button>
                  <Button onClick={() => { setIsCreatingFolder(true); setIsCreatingFile(false); }} variant="ghost" size="sm" className="h-6 w-6 p-0 bg-transparent hover:bg-black/5 text-[#71717A] hover:text-[#18181B] dark:bg-transparent dark:hover:bg-white/10 dark:text-[#A1A1AA] dark:hover:text-white cursor-pointer transition-colors rounded" title="New Folder">
                    <FolderPlus size={14} weight="bold" />
                  </Button>
                  <Button 
                    onClick={() => {
                      fetch('/api/open-explorer', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ dir: contextDir || rootWorkspace })
                      }).catch(() => {});
                    }}
                    variant="ghost" size="sm" className="h-6 w-6 p-0 bg-transparent hover:bg-black/5 text-[#71717A] hover:text-[#18181B] dark:bg-transparent dark:hover:bg-white/10 dark:text-[#A1A1AA] dark:hover:text-white cursor-pointer transition-colors rounded"
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
                          animate={{ opacity: 1, x: 0, height: "auto", y: 0, scale: 1 }}
                          exit={{ opacity: 0, height: 0, y: -12, scale: 0.95 }}
                          transition={{ type: "spring", stiffness: 450, damping: 28 }}
                          onSubmit={handleCreateFile} 
                          className="flex items-center gap-2 mb-2 overflow-hidden"
                        >
                          <input 
                            autoFocus
                            value={newFileName}
                            onChange={e => setNewFileName(e.target.value)}
                            onKeyDown={e => {
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
                          animate={{ opacity: 1, x: 0, height: "auto", y: 0, scale: 1 }}
                          exit={{ opacity: 0, height: 0, y: -12, scale: 0.95 }}
                          transition={{ type: "spring", stiffness: 450, damping: 28 }}
                          onSubmit={handleCreateFolder} 
                          className="flex items-center gap-2 mb-2 overflow-hidden"
                        >
                          <input 
                            autoFocus
                            value={newFolderName}
                            onChange={e => setNewFolderName(e.target.value)}
                            onKeyDown={e => {
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
                    <FileTree
                      files={allWorkspaceFiles}
                      activeFile={activeTab}
                      onSelectFile={(relPath) => {
                        const fullPath = `${contextDir}/${relPath}`;
                        if (!openTabs.includes(fullPath)) {
                          setOpenTabs(prev => [...prev, fullPath]);
                        }
                        setActiveTab(fullPath);
                      }}
                      onDeleteFile={handleDeleteFile}
                      confirmDeleteId={confirmDeleteId}
                      setConfirmDeleteId={setConfirmDeleteId}
                    />
                  </div>
                </>
              ) : (
                <div 
                  onClick={() => setPickerOpen(true)}
                  className="cursor-pointer group flex items-center gap-3 p-2 hover:bg-[#111111]/[0.02] rounded-lg transition-all"
                >
                  <div className="text-[#A1A1AA] group-hover:text-[#3B82F6] transition-colors">
                    <FolderPlus size={16} weight="bold" />
                  </div>
                  <span className="text-[11px] font-bold font-mono text-[#A1A1AA] uppercase tracking-widest group-hover:text-[#3B82F6] transition-colors">Select Workspace</span>
                </div>
              )}
            </div>
          </section>

          <section>
            <div className="flex items-center justify-between mb-4 group cursor-pointer" onClick={() => setSelectedTaskId(null)} title="Click to start a new chat in active folder">
              <h2 className="text-[13px] font-normal text-[#52525B] dark:text-[#A1A1AA] font-sans tracking-tight group-hover:text-[#18181B] dark:group-hover:text-[#F4F4F5] transition-colors">
                Workspace Threads
              </h2>
              <Button 
                onClick={(e) => { e.stopPropagation(); setSelectedTaskId(null); }}
                size="sm"
                className="h-7 px-3 gap-1.5 text-[12px] font-bold bg-transparent hover:bg-black/5 text-[#18181B] dark:bg-transparent dark:hover:bg-white/10 dark:text-white border-0 shadow-none cursor-pointer transition-all rounded-md"
                title="New chat in active folder"
              >
                <Plus size={14} weight="bold" />
                <span>New Chat</span>
              </Button>
            </div>
            
            <div className="space-y-4">
              {(() => {
                const rootTasks = tasks.filter(t => !t.parentId || !tasks.some(p => p.id === t.parentId));
                if (rootTasks.length === 0) {
                  return (
                    <div className="text-[12px] font-sans text-[#71717A] dark:text-[#A1A1AA] py-4 text-center font-medium">
                      No active chat threads.
                    </div>
                  );
                }
                
                // Group tasks by folder (contextDir or rootWorkspace)
                const grouped: Record<string, any[]> = {};
                rootTasks.forEach(t => {
                  const dir = t.contextDir || rootWorkspace || 'Root Workspace';
                  if (!grouped[dir]) grouped[dir] = [];
                  grouped[dir].push(t);
                });

                return (
                  <div className="space-y-5">
                    {Object.entries(grouped).map(([dirPath, dirTasks]) => {
                      const dirName = dirPath.split(/[\\/]/).pop() || dirPath;
                      const isCurrent = dirPath.replace(/\\/g, '/').toLowerCase() === (contextDir || rootWorkspace).replace(/\\/g, '/').toLowerCase();
                      const isExpanded = expandedFolders[dirPath];
                      const visibleTasks = isExpanded ? dirTasks : dirTasks.slice(0, 6);
                      return (
                        <div key={dirPath} className="space-y-1.5">
                          <div 
                            onClick={() => {
                              setContextDir(dirPath);
                              if (!rootWorkspace) setRootWorkspace(dirPath);
                              localStorage.setItem('warden_workspace', dirPath);
                            }}
                            className="flex items-center justify-between py-1.5 cursor-pointer group/folder"
                            title={`Click to switch workspace to ${dirPath}`}
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <Folder size={18} weight="duotone" className={isCurrent ? "text-[#3B82F6] shrink-0" : "text-[#71717A] dark:text-[#A1A1AA] group-hover/folder:text-[#18181B] dark:group-hover/folder:text-white transition-colors shrink-0"} />
                              <span className={`text-[14px] font-sans tracking-tight transition-colors truncate ${isCurrent ? 'text-[#18181B] dark:text-white font-bold' : 'text-[#52525B] dark:text-[#D4D4D8] font-semibold group-hover/folder:text-[#18181B] dark:group-hover/folder:text-white'}`}>
                                {dirName}
                              </span>
                            </div>
                            {isCurrent && <span className="w-1.5 h-1.5 rounded-full bg-[#3B82F6] shrink-0 ml-2" title="Active Workspace" />}
                          </div>
                          
                          <div className="pl-3 space-y-1 pt-0.5">
                            <AnimatePresence>
                              {visibleTasks.map(t => renderTaskNode(t))}
                            </AnimatePresence>
                            {dirTasks.length > 6 && !isExpanded && (
                              <div 
                                onClick={(e) => { e.stopPropagation(); setExpandedFolders(prev => ({ ...prev, [dirPath]: true })); }}
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
      </nav>

      {/* MAIN CENTER - SEAMLESS CANVAS */}
      <main className="flex-1 flex flex-col relative h-full bg-white dark:bg-black overflow-hidden z-10">
        
        {/* TAB BAR - Flush, Sleek, Minimalist IDE style */}
        <div className="w-full flex items-center bg-white dark:bg-black overflow-x-auto scrollbar-hide shrink-0 h-10 select-none z-30">
          {/* Permanent Studio Dashboard Tab */}
          <div
            onClick={() => setActiveTab(null)}
            className="group my-1 ml-2 mr-1 h-8 flex items-center gap-2 px-5 rounded-md text-[13px] font-sans font-medium cursor-pointer transition-all relative bg-[#FFBA00] text-[#111111] shadow-sm"
          >
            <Lightning size={15} weight={activeTab === null ? "fill" : "regular"} className="text-[#111111]" />
            <span>Studio</span>
          </div>

          {/* Open File Tabs */}
          <AnimatePresence mode="popLayout">
            {openTabs.map(tabPath => {
              const fileName = tabPath.split(/[\\/]/).pop() || tabPath;
              const isActive = activeTab === tabPath;
              return (
                <motion.div
                  layout
                  initial={{ opacity: 0, scale: 0.8, x: -10 }}
                  animate={{ opacity: 1, scale: 1, x: 0 }}
                  exit={{ opacity: 0, scale: 0.8, width: 0, padding: 0, margin: 0, overflow: "hidden" }}
                  transition={{ type: "spring", stiffness: 500, damping: 30 }}
                  key={tabPath}
                  onClick={() => setActiveTab(tabPath)}
                  className={`group my-1 mr-1 h-8 flex items-center gap-2.5 px-4 rounded-md text-[12.5px] font-sans cursor-pointer transition-colors relative ${
                    isActive
                      ? 'bg-[#F4F4F5] dark:bg-[#18181B] text-[#18181B] dark:text-white font-medium shadow-none'
                      : 'text-[#71717A] dark:text-[#A1A1AA] hover:text-[#18181B] dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/5'
                  }`}
                >
                  <FileText size={14} weight={isActive ? "duotone" : "regular"} className={isActive ? "text-[#3B82F6]" : "text-[#A1A1AA]"} />
                  <span className="truncate max-w-[160px]">{fileName}</span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      const newTabs = openTabs.filter(t => t !== tabPath);
                      setOpenTabs(newTabs);
                      if (activeTab === tabPath) {
                        setActiveTab(newTabs.length > 0 ? newTabs[newTabs.length - 1] : null);
                      }
                    }}
                    className={`p-1 rounded hover:bg-[#E4E4E7] text-[#A1A1AA] hover:text-[#EF4444] transition-colors ${isActive ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
                  >
                    <X size={12} weight="bold" />
                  </button>
                </motion.div>
              );
            })}
          </AnimatePresence>

          {/* Professional Pill Dark Mode Toggle */}
          <div className="flex items-center my-1 ml-auto mr-4 shrink-0">
            <button
              onClick={(e) => {
                const nextMode = !isDarkMode;
                if (!document.startViewTransition) {
                  setIsDarkMode(nextMode);
                  localStorage.setItem('warden_theme', nextMode ? 'dark' : 'light');
                  return;
                }
                const x = e.clientX || innerWidth / 2;
                const y = e.clientY || innerHeight / 2;
                const endRadius = Math.hypot(
                  Math.max(x, innerWidth - x),
                  Math.max(y, innerHeight - y)
                );
                const transition = document.startViewTransition(() => {
                  setIsDarkMode(nextMode);
                  localStorage.setItem('warden_theme', nextMode ? 'dark' : 'light');
                });
                transition.ready.then(() => {
                  document.documentElement.animate(
                    { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${endRadius}px at ${x}px ${y}px)`] },
                    { duration: 500, easing: 'ease-in-out', pseudoElement: '::view-transition-new(root)' }
                  );
                });
              }}
              title={isDarkMode ? "Switch to Light Mode" : "Switch to Dark Mode"}
              className="relative w-[56px] h-[28px] rounded-full bg-[#E4E4E7] dark:bg-[#27272A] p-[3px] cursor-pointer transition-colors duration-300 border-0 shadow-none flex items-center"
            >
              <motion.div
                className="absolute w-[22px] h-[22px] rounded-full bg-white dark:bg-[#18181B] shadow-sm"
                animate={{ x: isDarkMode ? 28 : 0 }}
                transition={{ type: "spring", stiffness: 500, damping: 30 }}
              />
              <div className="relative z-10 flex items-center justify-between w-full px-[3px]">
                <Sun size={14} weight="bold" className={`transition-colors duration-200 ${isDarkMode ? 'text-[#71717A]' : 'text-[#F59E0B]'}`} />
                <Moon size={14} weight="bold" className={`transition-colors duration-200 ${isDarkMode ? 'text-[#60A5FA]' : 'text-[#A1A1AA]'}`} />
              </div>
            </button>
          </div>
        </div>

        {activeTab !== null ? (
          <div className="flex-1 flex flex-col w-full h-full relative z-20 overflow-hidden bg-white/90 dark:bg-black/80 backdrop-blur-md rounded-tl-2xl shadow-sm border-t border-l border-white/40 dark:border-white/5">
            <FileEditor
              filePath={activeTab}
              onClose={() => {
                const newTabs = openTabs.filter(t => t !== activeTab);
                setOpenTabs(newTabs);
                setActiveTab(newTabs.length > 0 ? newTabs[newTabs.length - 1] : null);
              }}
              onDelete={() => {
                const newTabs = openTabs.filter(t => t !== activeTab);
                setOpenTabs(newTabs);
                setActiveTab(newTabs.length > 0 ? newTabs[newTabs.length - 1] : null);
              }}
            />
          </div>
        ) : (
          <div className="flex-1 flex flex-col w-full h-full relative overflow-hidden">
            {/* STATIC HEADER - Permanently at top */}
            <div className="w-full px-12 max-w-[1500px] mx-auto pt-[3px] flex-shrink-0 z-20 bg-transparent">
          <div className="flex justify-between items-start pt-12 pb-6 gap-8 flex-nowrap">
            {/* Left: Title & Status */}
            <div className="flex flex-col min-w-0">
              <h2 className="text-[48px] font-display font-extrabold text-[#18181B] dark:text-white tracking-normal mb-2 flex items-center gap-4 whitespace-nowrap shrink-0">
                Studio Dashboard
              </h2>
              {downloadProgress ? (
                <div className="flex flex-col gap-2 w-[300px] mt-1">
                  <div className="flex justify-between text-[11px] font-mono text-[#3B82F6] font-bold">
                    <span>Downloading {downloadProgress.model}...</span>
                    <span>{downloadProgress.percent}%</span>
                  </div>
                  <div className="w-full h-1 bg-[#E4E4E7]/50 rounded-full overflow-hidden shadow-inner">
                    <motion.div 
                      className="h-full bg-[#3B82F6]"
                      initial={{ width: 0 }}
                      animate={{ width: `${downloadProgress.percent}%` }}
                      transition={{ ease: "linear" }}
                    />
                  </div>
                </div>
              ) : modelError ? (
                <div className="flex items-center gap-2 mt-1">
                  <WarningCircle size={16} weight="fill" className="text-[#EF4444] shrink-0" />
                  <span className="text-[13px] font-mono text-[#EF4444]">{modelError}</span>
                </div>
              ) : (
                <div className="flex items-center gap-2.5 min-h-[20px]">
                  {selectedTask && selectedTask.status === 'running' ? (
                    <span className="w-2 h-2 rounded-full bg-[#3B82F6] animate-pulse shrink-0 shadow-[0_0_6px_rgba(59,130,246,0.5)]" />
                  ) : statusText === 'Completed' ? (
                    <span className="w-2 h-2 rounded-full bg-[#10B981] shrink-0" />
                  ) : null}
                  <span className={`text-[13px] font-mono font-medium leading-none ${selectedTask && selectedTask.status === 'running' ? 'text-[#3B82F6] dark:text-[#60A5FA]' : statusText === 'Completed' ? 'text-[#10B981] dark:text-[#34D399]' : 'text-[#A1A1AA] dark:text-[#52525B]'}`}>
                    {statusText}
                  </span>
                  {selectedTask && selectedTask.status === 'running' && (
                    <span className="text-[12px] font-mono text-[#A1A1AA] dark:text-[#52525B]">{elapsedSeconds}s</span>
                  )}
                </div>
              )}
            </div>
            
            {/* Right: Metric Pills — single row, never wrap */}
            <div className="flex gap-4 items-center shrink-0 whitespace-nowrap">
              {/* Compute */}
              <div className="flex items-center gap-1.5 shrink-0">
                 <Cpu size={14} weight="duotone" className="text-[#3B82F6]" />
                 <span className="text-[11px] font-sans text-[#71717A]">CPU</span>
                 <span className="text-[12px] font-sans text-[#18181B]">{sysInfo.cpuUsage || 0}%</span>
              </div>
              {/* Memory */}
              <div className="flex items-center gap-1.5 shrink-0">
                 <HardDrives size={14} weight="duotone" className="text-[#A855F7]" />
                 <span className="text-[11px] font-sans text-[#71717A]">MEM</span>
                 <span className="text-[12px] font-sans text-[#18181B]">{memPercent}%</span>
              </div>
              {/* Router */}
              <div className="flex items-center gap-1.5 shrink-0">
                 <ShareNetwork size={14} weight="duotone" className="text-[#10B981]" />
                 <span className="text-[11px] font-sans text-[#71717A]">LLM</span>
                 <span className="text-[12px] font-sans text-[#18181B] max-w-[100px] truncate">
                   {sysInfo.modelLoaded}
                 </span>
              </div>
              {/* WebSocket */}
              <div className="flex items-center gap-1.5 shrink-0" title={wsConnected ? 'WebSocket connected' : 'Reconnecting...'}>
                 <div className={`w-1.5 h-1.5 rounded-full ${wsConnected ? 'bg-[#10B981]' : 'bg-[#EF4444] animate-pulse'}`} />
                 <span className={`text-[11px] font-sans ${wsConnected ? 'text-[#10B981]' : 'text-[#EF4444]'}`}>
                   {wsConnected ? 'Live' : 'Offline'}
                 </span>
              </div>
            </div>
          </div>
        </div>
        
        {/* Dynamic Layout Wrapper */}
        <div 
          className={`flex-1 flex flex-col px-12 max-w-[1500px] w-full mx-auto relative overflow-y-auto scroll-smooth scrollbar-hide z-10 pb-40 transition-all duration-700 ease-[0.23,1,0.32,1] ${
            selectedTask ? 'pt-6 justify-start' : 'justify-center h-full'
          }`}
        >
          
          <div className="w-full flex flex-col mt-4">

            {/* Dynamic Bottom Area */}
            <AnimatePresence mode="wait">
              {selectedTask && (
                <motion.div
                  key="chat-stream"
                  layout
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20, filter: 'blur(4px)' }}
                  transition={{ duration: 0.4 }}
                  className="space-y-6 pb-32"
                >
                  {(chatHistories[selectedTask.id] || []).length === 0 && selectedTask.status === 'running' && (
                    <div className="flex items-center gap-3 text-[#A1A1AA]">
                  <SpinnerGap size={14} className="animate-spin" />
                      <span className="text-[12px] font-mono">Agent is thinking...</span>
                    </div>
                  )}

                  {(() => {
                    const sorted = [...(chatHistories[selectedTask.id] || [])].sort((a, b) => {
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
                      merged.push({ ...msg, role: (msg.role as any) === 'tool' ? 'thought' : msg.role });
                    }
                    return merged.map((msg, idx, arr) => (
                      <motion.div 
                        key={msg.id} 
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ type: "spring", stiffness: 350, damping: 25 }}
                        className="flex flex-col w-full text-left my-1"
                      >
                      {msg.role === 'user' && (
                        <div className="flex justify-end w-full my-6 px-1">
                           <div className="text-[17px] font-display font-medium text-[#18181B] dark:text-[#F4F4F5] leading-[1.7] max-w-[85%] text-left tracking-tight">
                             {msg.content}
                           </div>
                        </div>
                      )}

                      {msg.role === 'thought' && (
                        <CollapsibleThought 
                          content={msg.content} 
                          isRunning={selectedTask.status === 'running' && idx === arr.length - 1} 
                        />
                      )}

                      {msg.role === 'output' && (
                        <FormattedOutput content={msg.content} />
                      )}



                      {msg.role === 'question' && (
                        <CleanInteractiveQuestionCard
                          question={msg.content}
                          placeholder={msg.placeholder}
                          options={msg.options}
                          isSecret={msg.isSecret}
                          disabled={isSubmitting}
                          onSendAnswer={(answer) => {
                            const goal = `[User Input Provided]: ${answer}`;
                            const ansMsg = { id: Math.random().toString(), role: 'user' as const, content: `[Answer to Swarm]: ${msg.isSecret ? '••••••••••••••••' : answer}` };
                            if (selectedTask) {
                              setChatHistories(prev => ({ ...prev, [selectedTask.id]: [...(prev[selectedTask.id] || []), ansMsg] }));
                              setIsSubmitting(true);
                              fetch('/api/goals', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ goal, contextDir, taskId: selectedTask.id })
                              }).finally(() => setIsSubmitting(false));
                            } else {
                              setChatHistories(prev => ({ ...prev, temp: [ansMsg] }));
                              setIsSubmitting(true);
                              fetch('/api/goals', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ goal, contextDir })
                              }).finally(() => setIsSubmitting(false));
                            }
                          }}
                        />
                      )}
                    </motion.div>
                  ))})()}
                  
                  <div ref={chatEndRef} />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Minimalist Input Field - Seamless blending with Optical Lens Refraction */}
        <div className="absolute bottom-0 left-0 w-full h-[140px] bg-gradient-to-t from-[#FAFAFA] dark:from-black via-[#FAFAFA] dark:via-black to-transparent pointer-events-none z-20"></div>
        <div className="absolute bottom-16 left-1/2 -translate-x-1/2 w-full max-w-[800px] z-50">
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
                  .filter(f => !f.isDirectory && f.name.toLowerCase().includes(mentionQuery.toLowerCase()))
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
                      <FileText size={15} className={i === mentionIndex ? 'text-white' : 'text-[#3B82F6]'} />
                      <span>@{f.name}</span>
                    </div>
                  ))}
              </motion.div>
            )}
          </AnimatePresence>

          <div className="flex flex-col gap-2 w-full">
            <motion.form 
              initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.1, ease: "easeOut" }}
              onSubmit={e => {
                e.preventDefault();
                if (isAgentRunning) {
                  handleStopAgent(e);
                } else {
                  handleGoalSubmit(e);
                }
              }} 
              className="flex flex-col gap-2 group bg-white dark:bg-black border border-transparent dark:border-transparent shadow-[0_12px_40px_rgba(0,0,0,0.08)] dark:shadow-[0_12px_40px_rgba(0,0,0,0.3)] rounded-[28px] px-4 py-3 transition-all duration-300 hover:shadow-[0_16px_50px_rgba(0,0,0,0.12)] hover:border-transparent dark:hover:border-transparent focus-within:bg-white dark:focus-within:bg-black focus-within:shadow-[0_20px_60px_rgba(217,70,239,0.15)] dark:focus-within:shadow-[0_20px_60px_rgba(217,70,239,0.2)] focus-within:border-fuchsia-500/50 dark:focus-within:border-fuchsia-500/50"
            >
              {(goalInput.match(/@([a-zA-Z0-9_\-\.\/\\]+)/g) || attachedImage) && (
                <div className="flex flex-wrap gap-2 items-center pb-2 border-b border-transparent dark:border-transparent w-full">
                  {goalInput.match(/@([a-zA-Z0-9_\-\.\/\\]+)/g)?.map((mention, idx) => (
                    <div key={idx} className="flex items-center gap-1.5 px-2.5 py-0.5 bg-[#3B82F6]/10 dark:bg-[#3B82F6]/20 border border-[#3B82F6]/30 rounded-md shadow-sm">
                      <FileText size={12} className="text-[#3B82F6]" weight="duotone" />
                      <span className="text-[11px] font-mono font-medium text-[#3B82F6] dark:text-[#60A5FA]">{mention}</span>
                    </div>
                  ))}
                  {attachedImage && (
                    <div className="relative w-fit group/img">
                      <img src={attachedImage} alt="Attachment" className="h-10 rounded-md border border-transparent dark:border-transparent object-cover opacity-90 transition-opacity group-hover/img:opacity-100" />
                      <button type="button" onClick={() => setAttachedImage(null)} className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover/img:opacity-100 transition-opacity shadow-sm">
                        <X size={10} weight="bold" />
                      </button>
                    </div>
                  )}
                </div>
              )}
              <div className="flex items-end gap-3 w-full">
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
              <button 
                type="button" 
                onClick={() => fileInputRef.current?.click()} 
                className="w-10 h-10 flex items-center justify-center bg-transparent hover:bg-black/5 text-[#18181B] dark:bg-transparent dark:hover:bg-white/10 dark:text-white rounded-full transition-colors flex-shrink-0 cursor-pointer border-0 shadow-none"
                title="Attach Image"
              >
                <Paperclip size={18} weight="bold" />
              </button>
            <textarea 
              ref={promptInputRef}
              rows={1}
              className="flex-1 bg-transparent border-none outline-none focus:ring-0 text-[#18181B] dark:text-white placeholder-[#A1A1AA] dark:placeholder-[#A1A1AA] text-[15.5px] font-sans font-normal resize-none h-[40px] leading-[24px] py-2 px-0 overflow-y-auto transition-[height] duration-200 ease-out scrollbar-hide" 
              placeholder={isAgentRunning ? "Agent is running... (Press Enter or click Stop to halt)" : "Command the swarm... (Type @ to reference any file across folders)"}
              value={goalInput}
              onChange={e => {
                const val = e.target.value;
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
              onKeyDown={e => {
                if (showMentionMenu) {
                  if (e.key === 'Escape') {
                    setShowMentionMenu(false);
                    return;
                  }
                  if (e.key === 'Enter' || e.key === 'Tab') {
                    e.preventDefault();
                    const filtered = allWorkspaceFiles.filter(f => !f.isDirectory && f.name.toLowerCase().includes(mentionQuery.toLowerCase()));
                    if (filtered.length > 0) {
                      const selected = filtered[mentionIndex] || filtered[0];
                      const lastAt = goalInput.lastIndexOf('@');
                      const prefix = lastAt >= 0 ? goalInput.substring(0, lastAt) : goalInput;
                      setGoalInput(`${prefix}@${selected.name} `);
                      setShowMentionMenu(false);
                      setMentionQuery('');
                    }
                    return;
                  }
                  if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    setMentionIndex(prev => (prev + 1) % 8);
                    return;
                  }
                  if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    setMentionIndex(prev => (prev - 1 + 8) % 8);
                    return;
                  }
                }
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  if (isAgentRunning) {
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
                      reader.onload = () => setAttachedImage(reader.result as string);
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
            {isAgentRunning ? (
              <button 
                type="button" 
                onClick={handleStopAgent}
                className="w-10 h-10 flex items-center justify-center bg-[#FEE2E2] text-[#EF4444] hover:bg-[#EF4444] hover:text-white dark:bg-[#EF4444]/20 dark:text-[#EF4444] dark:hover:bg-[#EF4444] dark:hover:text-white rounded-full transition-all flex-shrink-0 shadow-sm cursor-pointer"
                title="Stop running agent"
              >
                <Square size={16} weight="fill" className="text-current" />
              </button>
            ) : (
              <motion.button whileHover={{ scale: goalInput.trim() ? 1.05 : 1 }} whileTap={{ scale: goalInput.trim() ? 0.95 : 1 }} type="submit" disabled={!goalInput.trim()} className="w-10 h-10 flex items-center justify-center bg-fuchsia-500 text-white rounded-full transition-all flex-shrink-0 cursor-pointer border-0 shadow-[0_4px_14px_rgba(217,70,239,0.4)] disabled:shadow-none disabled:bg-transparent disabled:text-[#A1A1AA] dark:disabled:bg-transparent dark:disabled:text-[#52525B]">
                <PaperPlaneRight size={18} weight="bold" className="text-current" />
              </motion.button>
            )}
              </div>
            </motion.form>
          </div>
        </div>
      </div>
        )}
      </main>
    </div>
  );
}
