import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Check, X, FileCode } from '@phosphor-icons/react';

interface InlineDiffEditorProps {
  taskId: string;
  path: string;
  oldContent: string;
  newContent: string;
  onResolve: (action: 'accept' | 'reject') => void;
}

export default function InlineDiffEditor({
  taskId,
  path,
  oldContent,
  newContent,
  onResolve,
}: InlineDiffEditorProps) {
  const [isResolved, setIsResolved] = useState(false);

  const handleResolve = async (action: 'accept' | 'reject') => {
    setIsResolved(true);
    await fetch('/api/diff/resolve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ taskId, action }),
    });
    onResolve(action);
  };

  if (isResolved) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.35, ease: [0.23, 1, 0.32, 1] }}
      className="my-4 w-full bg-white dark:bg-[#050505] rounded-2xl overflow-hidden shadow-[0_8px_30px_-4px_rgba(0,0,0,0.1)] dark:shadow-[0_8px_30px_-4px_rgba(0,0,0,0.4)]"
    >
      <div className="flex items-center justify-between px-5 py-3.5 bg-black/5 dark:bg-white/[0.04]">
        <div className="flex items-center gap-2.5">
          <FileCode size={20} className="text-[#3B82F6]" weight="duotone" />
          <span className="text-[14px] font-bold text-[#18181B] dark:text-white tracking-tight">
            Proposed Edit:{' '}
            <span className="font-mono text-[11px] ml-2 bg-black/10 dark:bg-white/10 px-2 py-1 rounded-md text-[#3B82F6]">
              {path}
            </span>
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => handleResolve('reject')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-red-500/10 text-red-600 dark:text-red-400 hover:bg-red-500/20 transition-colors"
          >
            <X size={14} weight="bold" /> Reject
          </button>
          <button
            onClick={() => handleResolve('accept')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-[#10B981]/10 text-[#10B981] dark:text-[#34D399] hover:bg-[#10B981]/20 transition-colors"
          >
            <Check size={14} weight="bold" /> Accept
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 bg-white dark:bg-black/40 overflow-hidden h-[400px]">
        {/* Before */}
        <div className="flex flex-col h-full border-r border-black/5 dark:border-white/5">
          <div className="bg-black/5 dark:bg-white/[0.04] px-4 py-2 text-[10px] font-bold text-[#52525B] dark:text-[#A1A1AA] uppercase tracking-widest">
            Before
          </div>
          <div className="p-5 overflow-auto flex-1 font-mono text-[12px] whitespace-pre text-[#EF4444] dark:text-red-400/80 bg-red-500/5 dark:bg-red-500/10 leading-[1.6]">
            {oldContent || '(Empty File)'}
          </div>
        </div>

        {/* After */}
        <div className="flex flex-col h-full">
          <div className="bg-black/5 dark:bg-white/[0.04] px-4 py-2 text-[10px] font-bold text-[#52525B] dark:text-[#A1A1AA] uppercase tracking-widest">
            After
          </div>
          <div className="p-5 overflow-auto flex-1 font-mono text-[12px] whitespace-pre text-[#10B981] dark:text-[#34D399]/80 bg-green-500/5 dark:bg-green-500/10 leading-[1.6]">
            {newContent}
          </div>
        </div>
      </div>
    </motion.div>
  );
}
