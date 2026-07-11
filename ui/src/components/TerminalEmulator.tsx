import React, { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { TerminalWindow, Circle, CircleDashed } from '@phosphor-icons/react';

interface TerminalEmulatorProps {
  logs: string[];
  commandName?: string;
  isRunning?: boolean;
}

export default function TerminalEmulator({
  logs,
  commandName = 'Terminal Execution',
  isRunning = false,
}: TerminalEmulatorProps) {
  const terminalEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom of terminal
  useEffect(() => {
    if (terminalEndRef.current) {
      terminalEndRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }, [logs]);

  if (logs.length === 0 && !isRunning) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 5 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.23, 1, 0.32, 1] }}
      className="my-3 flex flex-col w-full max-w-[85%] rounded-2xl overflow-hidden bg-white dark:bg-[#0A0A0A] shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)] dark:shadow-[0_4px_20px_-4px_rgba(0,0,0,0.3)]"
    >
      {/* Terminal Header */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-black/5 dark:bg-white/[0.04] select-none">
        <div className="flex items-center gap-2">
          <TerminalWindow
            size={16}
            className="text-[#71717A] dark:text-[#A1A1AA]"
            weight="duotone"
          />
          <span className="text-xs font-mono font-medium text-[#52525B] dark:text-[#A1A1AA]">
            {commandName}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          {isRunning ? (
            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400">
              <CircleDashed size={10} className="animate-spin" weight="bold" />
              <span className="text-[10px] font-bold tracking-wide uppercase">Running</span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-green-500/10 text-green-600 dark:text-green-400">
              <Circle size={10} weight="fill" />
              <span className="text-[10px] font-bold tracking-wide uppercase">Exited</span>
            </div>
          )}
        </div>
      </div>

      {/* Terminal Output Body */}
      <div className="p-3 max-h-[300px] overflow-y-auto font-mono text-[12px] leading-relaxed text-[#3F3F46] dark:text-[#D4D4D8] bg-white dark:bg-black/40">
        {logs.map((log, index) => (
          <div key={index} className="whitespace-pre-wrap break-all mb-1">
            {log}
          </div>
        ))}
        {isRunning && (
          <div className="flex items-center gap-2 mt-2 opacity-60">
            <span className="w-2 h-4 bg-fuchsia-500 animate-pulse" />
          </div>
        )}
        <div ref={terminalEndRef} />
      </div>
    </motion.div>
  );
}
