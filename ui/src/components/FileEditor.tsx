import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  X,
  FloppyDisk,
  SpinnerGap,
  Check,
  DownloadSimple,
  Trash,
  Copy,
  ArrowCounterClockwise,
  Play,
} from '@phosphor-icons/react';
import { motion, AnimatePresence } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import _Editor from 'react-simple-code-editor';
const Editor = (_Editor as any).default || _Editor;
import Prism from 'prismjs';
import 'prismjs/themes/prism.css';
import 'prismjs/components/prism-javascript';
import 'prismjs/components/prism-typescript';
import 'prismjs/components/prism-jsx';
import 'prismjs/components/prism-tsx';
import 'prismjs/components/prism-css';
import 'prismjs/components/prism-python';
import 'prismjs/components/prism-json';
import 'prismjs/components/prism-bash';
import 'prismjs/components/prism-markdown';

interface FileEditorProps {
  filePath: string;
  onClose: () => void;
  onDelete?: () => void;
}

const LANG_MAP: Record<string, string> = {
  ts: 'TypeScript',
  tsx: 'TypeScript JSX',
  js: 'JavaScript',
  jsx: 'JavaScript JSX',
  py: 'Python',
  java: 'Java',
  rs: 'Rust',
  go: 'Go',
  rb: 'Ruby',
  cpp: 'C++',
  c: 'C',
  h: 'C Header',
  cs: 'C#',
  php: 'PHP',
  swift: 'Swift',
  kt: 'Kotlin',
  html: 'HTML',
  css: 'CSS',
  scss: 'SCSS',
  json: 'JSON',
  xml: 'XML',
  yaml: 'YAML',
  yml: 'YAML',
  md: 'Markdown',
  txt: 'Plain Text',
  sh: 'Shell',
  bash: 'Bash',
  ps1: 'PowerShell',
  sql: 'SQL',
  graphql: 'GraphQL',
  toml: 'TOML',
  ini: 'INI',
  cfg: 'Config',
  dockerfile: 'Dockerfile',
  gitignore: 'Git Ignore',
  env: 'Environment',
  svg: 'SVG',
  png: 'PNG Image',
  jpg: 'JPEG Image',
  jpeg: 'JPEG Image',
  gif: 'GIF Image',
  webp: 'WebP Image',
  ico: 'Icon',
};

function getLanguage(filePath: string): string {
  const name = filePath.split(/[\\/]/).pop() || '';
  const lower = name.toLowerCase();
  if (lower === 'dockerfile') return 'Dockerfile';
  if (lower === '.gitignore') return 'Git Ignore';
  if (lower === '.env') return 'Environment';
  const ext = name.split('.').pop()?.toLowerCase() || '';
  return LANG_MAP[ext] || ext.toUpperCase() || 'Plain Text';
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

export default function FileEditor({ filePath, onClose, onDelete }: FileEditorProps) {
  const [content, setContent] = useState('');
  const [originalContent, setOriginalContent] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saved' | 'error'>('idle');
  const [error, setError] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [viewMode, setViewMode] = useState<'code' | 'preview'>(() => {
    const isMarkdown = /\.md$/i.test(filePath);
    return isMarkdown ? 'preview' : 'code';
  });
  const [screenSize, setScreenSize] = useState<'desktop' | 'tablet' | 'mobile'>('desktop');
  const [isRunning, setIsRunning] = useState(false);
  const [runMessage, setRunMessage] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const lineNumbersRef = useRef<HTMLDivElement>(null);

  const handleScroll = useCallback(() => {
    if (textareaRef.current && lineNumbersRef.current) {
      lineNumbersRef.current.scrollTop = textareaRef.current.scrollTop;
    }
  }, []);

  const isImage = /\.(png|jpe?g|gif|svg|webp|ico)$/i.test(filePath);
  const isBinary = /\.(pdf|zip|tar|gz|exe|dll|so|wasm|mp3|mp4|mov|avi|ttf|otf|woff2?)$/i.test(
    filePath,
  );
  const isHtml = /\.(html?|svg|md)$/i.test(filePath);
  const isMarkdown = /\.md$/i.test(filePath);
  const isWebProject = /\.(html?|tsx?|jsx?|css|json|js|ts)$/i.test(filePath);
  const isDirty = content !== originalContent;
  const language = getLanguage(filePath);
  const lineCount = content.split('\n').length;
  const charCount = content.length;
  const fileName = filePath.split(/[\\/]/).pop() || '';

  // Load file content
  useEffect(() => {
    if (isImage || isBinary) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError('');
    fetch(`/api/files/content?path=${encodeURIComponent(filePath)}`)
      .then(async (res) => {
        if (res.status === 404) throw new Error(`File not found: ${filePath.split(/[\\/]/).pop()}`);
        if (!res.ok) {
          let errMsg = `Failed to read file (HTTP ${res.status})`;
          try {
            const data = await res.json();
            if (data.error) errMsg = data.error;
          } catch (e) {}
          throw new Error(errMsg);
        }
        return res.text();
      })
      .then((text) => {
        setContent(text);
        setOriginalContent(text);
      })
      .catch((err) => setError(err.message))
      .finally(() => setIsLoading(false));
  }, [filePath, isImage, isBinary]);

  // Save handler
  const handleSave = useCallback(async () => {
    if (isSaving || !isDirty) return;
    setIsSaving(true);
    setSaveStatus('idle');
    try {
      const res = await fetch(`/api/files/content?path=${encodeURIComponent(filePath)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'text/plain' },
        body: content,
      });
      if (!res.ok) {
        let errMsg = `Failed to save file (HTTP ${res.status})`;
        try {
          const data = await res.json();
          if (data.error) errMsg = data.error;
        } catch (e) {}
        throw new Error(errMsg);
      }
      setOriginalContent(content);
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2500);
    } catch (err: any) {
      setError(err.message);
      setSaveStatus('error');
    } finally {
      setIsSaving(false);
    }
  }, [content, filePath, isDirty, isSaving]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        handleSave();
      }
      if (e.key === 'Escape') {
        if (isDirty) {
          (window as any)
            .customConfirm('You have unsaved changes. Close without saving?')
            .then((res: boolean) => {
              if (res) onClose();
            });
        } else {
          onClose();
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleSave, isDirty, onClose]);

  // Tab key support in textarea
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const ta = e.currentTarget;
      const start = ta.selectionStart;
      const end = ta.selectionEnd;
      const newVal = content.substring(0, start) + '  ' + content.substring(end);
      setContent(newVal);
      requestAnimationFrame(() => {
        ta.selectionStart = ta.selectionEnd = start + 2;
      });
    }
  };

  // Download file
  const handleDownload = () => {
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = isImage ? `/api/files/content?path=${encodeURIComponent(filePath)}` : url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Copy content
  const handleCopy = async () => {
    await navigator.clipboard.writeText(content);
  };

  // Revert to original
  const handleRevert = () => {
    (window as any)
      .customConfirm('Revert all changes to the last saved version?')
      .then((res: boolean) => {
        if (res) setContent(originalContent);
      });
  };

  // Delete file
  const handleDelete = async () => {
    try {
      await fetch('/api/files', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetPath: filePath }),
      });
      onDelete?.();
      onClose();
    } catch (err: any) {
      setError(err.message);
    }
  };

  // Close with unsaved changes guard
  const handleClose = () => {
    if (isDirty) {
      (window as any)
        .customConfirm('You have unsaved changes. Close without saving?')
        .then((res: boolean) => {
          if (res) onClose();
        });
    } else {
      onClose();
    }
  };

  // Generate line numbers
  const lines = content.split('\n');

  return (
    <div
      className="flex-1 flex flex-col w-full h-full bg-white dark:bg-[#0A0A0A] relative z-20 overflow-hidden"
      style={{ animation: 'fadeIn 0.15s ease-out' }}
    >
      {/* ═══ Editor Breadcrumb & Toolbar ═══ */}
      <div className="flex items-center justify-between px-6 h-11 border-b border-zinc-200/60 dark:border-zinc-800/60 bg-white dark:bg-[#0A0A0A] shrink-0 select-none">
        <div className="flex items-center gap-2 text-[12px] font-mono text-[#71717A] dark:text-[#A1A1AA]">
          <span className="text-[#A1A1AA] dark:text-[#71717A]">workspace</span>
          <span className="text-[#D4D4D8] dark:text-[#3F3F46]">/</span>
          <span className="text-[#111111] dark:text-[#E4E4E7] font-semibold">{fileName}</span>
          {isDirty && (
            <span className="w-2 h-2 rounded-full bg-[#F59E0B] ml-1.5" title="Unsaved changes" />
          )}
          {saveStatus === 'saved' && (
            <span className="flex items-center gap-1 text-[#10B981] ml-2 font-medium">
              <Check size={12} weight="bold" /> Saved
            </span>
          )}
        </div>

        <div className="flex items-center gap-1">
          {isHtml && (
            <div className="flex items-center bg-black/5 dark:bg-[#1A1A1A] p-0.5 rounded-lg mr-2">
              <button
                onClick={() => setViewMode('code')}
                className={`px-2.5 py-1 rounded-md text-[11px] font-mono font-bold transition-all ${viewMode === 'code' ? 'bg-white dark:bg-[#0A0A0A] text-[#111111] dark:text-[#E4E4E7] shadow-sm' : 'text-[#71717A] dark:text-[#A1A1AA] hover:text-[#111111] dark:hover:text-white'}`}
              >
                Code
              </button>
              <button
                onClick={() => setViewMode('preview')}
                className={`px-2.5 py-1 rounded-md text-[11px] font-mono font-bold transition-all ${viewMode === 'preview' ? 'bg-white dark:bg-[#0A0A0A] text-[#111111] dark:text-[#E4E4E7] shadow-sm' : 'text-[#71717A] dark:text-[#A1A1AA] hover:text-[#111111] dark:hover:text-white'}`}
              >
                Preview
              </button>
            </div>
          )}

          {isHtml && viewMode === 'preview' && (
            <div className="flex items-center bg-black/5 dark:bg-[#1A1A1A] p-0.5 rounded-lg mr-2">
              <button
                onClick={() => setScreenSize('desktop')}
                className={`px-2 py-1 rounded-md text-[10px] font-mono transition-all ${screenSize === 'desktop' ? 'bg-white dark:bg-[#0A0A0A] text-[#111111] dark:text-[#E4E4E7] font-bold shadow-sm' : 'text-[#71717A] dark:text-[#A1A1AA] hover:text-[#111111] dark:hover:text-white'}`}
                title="Desktop View (Full Width)"
              >
                Desktop
              </button>
              <button
                onClick={() => setScreenSize('tablet')}
                className={`px-2 py-1 rounded-md text-[10px] font-mono transition-all ${screenSize === 'tablet' ? 'bg-white dark:bg-[#0A0A0A] text-[#111111] dark:text-[#E4E4E7] font-bold shadow-sm' : 'text-[#71717A] dark:text-[#A1A1AA] hover:text-[#111111] dark:hover:text-white'}`}
                title="Tablet View (768px)"
              >
                Tablet
              </button>
              <button
                onClick={() => setScreenSize('mobile')}
                className={`px-2 py-1 rounded-md text-[10px] font-mono transition-all ${screenSize === 'mobile' ? 'bg-white dark:bg-[#0A0A0A] text-[#111111] dark:text-[#E4E4E7] font-bold shadow-sm' : 'text-[#71717A] dark:text-[#A1A1AA] hover:text-[#111111] dark:hover:text-white'}`}
                title="Mobile View (375px)"
              >
                Mobile
              </button>
            </div>
          )}

          {isWebProject && (
            <button
              onClick={async () => {
                setIsRunning(true);
                setRunMessage('Starting dev server...');
                try {
                  const dir = filePath.substring(
                    0,
                    filePath.lastIndexOf(/\\|\//.exec(filePath)?.[0] || ''),
                  );
                  const res = await fetch('/api/run', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ dir, scriptName: 'dev' }),
                  });
                  const data = await res.json();
                  setRunMessage(data.message || 'Running!');
                  if (isHtml) setViewMode('preview');
                  setTimeout(() => setRunMessage(''), 4000);
                } catch (err) {
                  setRunMessage('Error running');
                }
                setIsRunning(false);
              }}
              disabled={isRunning}
              className="flex items-center gap-1.5 bg-[#10B981] text-white px-3 py-1 rounded-md text-[11px] font-mono font-bold hover:bg-[#059669] transition-all shadow-sm mr-2"
            >
              {isRunning ? (
                <SpinnerGap size={12} className="animate-spin" />
              ) : (
                <span className="flex items-center gap-1">
                  <Play size={12} weight="fill" /> Run Project
                </span>
              )}
            </button>
          )}

          {runMessage && (
            <span className="text-[11px] font-mono text-[#10B981] font-bold mr-2 animate-pulse">
              {runMessage}
            </span>
          )}

          {!isImage && !isBinary && isDirty && (
            <button
              onClick={handleRevert}
              title="Revert changes"
              className="p-1.5 text-[#71717A] hover:text-[#111111] hover:bg-[#E4E4E7]/60 rounded transition-all"
            >
              <ArrowCounterClockwise size={14} />
            </button>
          )}
          {!isBinary && (
            <button
              onClick={handleCopy}
              className="p-1.5 text-[#71717A] hover:text-[#111111] hover:bg-black/5 rounded transition-colors"
            >
              <Copy size={14} />
            </button>
          )}
          <button
            onClick={handleDownload}
            className="p-1.5 text-[#71717A] hover:text-[#111111] hover:bg-black/5 rounded transition-colors"
          >
            <DownloadSimple size={14} />
          </button>

          {/* Delete with confirmation */}
          <AnimatePresence mode="wait">
            {showDeleteConfirm ? (
              <motion.div
                key="confirm"
                initial={{ opacity: 0, scale: 0.8, x: 10 }}
                animate={{ opacity: 1, scale: 1, x: 0 }}
                exit={{ opacity: 0, scale: 0.8, x: 10 }}
                transition={{ type: 'spring', stiffness: 450, damping: 25 }}
                className="flex items-center gap-1 ml-1"
              >
                <button
                  onClick={handleDelete}
                  title="Confirm Delete"
                  className="text-[#10B981] hover:bg-[#10B981]/15 p-1.5 rounded-lg transition-colors"
                >
                  <Check size={15} weight="bold" />
                </button>
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  title="Cancel"
                  className="text-[#EF4444] hover:bg-[#EF4444]/15 p-1.5 rounded-lg transition-colors"
                >
                  <X size={15} weight="bold" />
                </button>
              </motion.div>
            ) : (
              <motion.button
                key="btn"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                onClick={() => setShowDeleteConfirm(true)}
                title="Delete file"
                className="p-1.5 text-[#71717A] hover:text-[#EF4444] hover:bg-[#FEF2F2] rounded-lg transition-all ml-1"
              >
                <Trash size={14} />
              </motion.button>
            )}
          </AnimatePresence>

          <div className="w-px h-5 bg-transparent dark:bg-transparent mx-1" />

          {!isImage && !isBinary && (
            <button
              onClick={handleSave}
              disabled={isLoading || isSaving || !isDirty}
              className="flex items-center gap-2 bg-[#111111] dark:bg-white text-white dark:text-[#111111] px-3.5 py-1.5 rounded-md text-[11px] font-mono font-bold hover:bg-[#27272A] dark:hover:bg-[#E4E4E7] transition-colors disabled:bg-[#E4E4E7] disabled:text-[#A1A1AA] disabled:dark:bg-[#1A1A1A] disabled:dark:text-[#71717A] disabled:cursor-not-allowed"
            >
              {isSaving ? (
                <SpinnerGap size={12} className="animate-spin" />
              ) : (
                <FloppyDisk size={12} weight="duotone" />
              )}
              Save
            </button>
          )}
        </div>
      </div>

      {/* ═══ Editor Body ═══ */}
      <div className="flex-1 overflow-hidden relative bg-white dark:bg-[#0A0A0A]">
        {error && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 bg-red-50 text-red-600 px-4 py-2 rounded-md text-[11px] font-mono z-10 border border-red-200 shadow-sm flex items-center gap-2">
            {error}
            <button onClick={() => setError('')} className="hover:text-red-800">
              <X size={12} />
            </button>
          </div>
        )}

        {isLoading ? (
          <div className="flex items-center justify-center h-full text-[#A1A1AA]">
            <SpinnerGap size={24} className="animate-spin" />
          </div>
        ) : isBinary ? (
          <div className="flex flex-col items-center justify-center h-full text-[#A1A1AA] gap-3">
            <p className="font-mono text-[13px]">Binary file — cannot be edited in the browser.</p>
            <button
              onClick={handleDownload}
              className="flex items-center gap-2 bg-[#111111] text-white px-4 py-2 rounded-md text-[12px] font-mono font-bold hover:bg-[#27272A] transition-colors"
            >
              <DownloadSimple size={14} /> Download Instead
            </button>
          </div>
        ) : isImage ? (
          <div className="flex items-center justify-center h-full bg-white dark:bg-[#0A0A0A] p-8 overflow-auto">
            <img
              src={`/api/files/content?path=${encodeURIComponent(filePath)}&t=${Date.now()}`}
              alt={filePath}
              className="max-w-full max-h-full object-contain shadow-sm border border-transparent dark:border-transparent rounded-sm bg-white dark:bg-[#0A0A0A]"
            />
          </div>
        ) : isHtml && viewMode === 'preview' ? (
          <AnimatePresence mode="wait">
            <motion.div
              key="preview"
              initial={{ opacity: 0, scale: 0.98, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.98, y: -10 }}
              transition={{ duration: 0.2, ease: 'easeInOut' }}
              className="flex items-center justify-center h-full bg-white dark:bg-[#0A0A0A] p-6 overflow-auto w-full"
            >
              <div
                className={`relative ${
                  screenSize === 'desktop'
                    ? 'w-full h-full'
                    : screenSize === 'tablet'
                      ? 'w-[768px] h-[95%] shadow-xl rounded-lg border border-transparent dark:border-transparent bg-white dark:bg-[#0A0A0A] overflow-hidden resize-x min-w-[320px] max-w-[100%]'
                      : 'w-[375px] h-[95%] shadow-xl rounded-lg border border-transparent dark:border-transparent bg-white dark:bg-[#0A0A0A] overflow-hidden resize-x min-w-[320px] max-w-[100%]'
                }`}
              >
                {isMarkdown ? (
                  <div className="w-full h-full bg-white dark:bg-[#0A0A0A] overflow-auto p-8 font-sans max-w-none text-left">
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      components={{
                        h1: ({ node, ...props }) => (
                          <h1
                            className="text-[22px] font-bold text-[#18181B] dark:text-[#F4F4F5] mt-5 mb-3 tracking-tight"
                            {...props}
                          />
                        ),
                        h2: ({ node, ...props }) => (
                          <h2
                            className="text-[18px] font-bold text-[#18181B] dark:text-[#F4F4F5] mt-4 mb-2 tracking-tight"
                            {...props}
                          />
                        ),
                        h3: ({ node, ...props }) => (
                          <h3
                            className="text-[16px] font-semibold text-[#18181B] dark:text-[#F4F4F5] mt-3 mb-2"
                            {...props}
                          />
                        ),
                        p: ({ node, ...props }) => (
                          <p
                            className="leading-[1.75] mb-3 text-[#3F3F46] dark:text-[#D4D4D8]"
                            {...props}
                          />
                        ),
                        ul: ({ node, ...props }) => (
                          <ul
                            className="list-disc pl-5 mb-3 space-y-1.5 text-[#3F3F46] dark:text-[#D4D4D8]"
                            {...props}
                          />
                        ),
                        ol: ({ node, ...props }) => (
                          <ol
                            className="list-decimal pl-5 mb-3 space-y-1.5 text-[#3F3F46] dark:text-[#D4D4D8]"
                            {...props}
                          />
                        ),
                        li: ({ node, ...props }) => <li className="leading-[1.7]" {...props} />,
                        strong: ({ node, ...props }) => (
                          <strong
                            className="font-semibold text-[#18181B] dark:text-white"
                            {...props}
                          />
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
                            className="hover:bg-black/5 dark:hover:bg-[#111111] transition-colors"
                            {...props}
                          />
                        ),
                        th: ({ node, ...props }) => (
                          <th className="px-4 py-2 font-semibold text-sm" {...props} />
                        ),
                        td: ({ node, ...props }) => <td className="px-4 py-2 text-sm" {...props} />,
                        code({ node, inline, className, children, ...props }: any) {
                          const match = /language-(\w+)/.exec(className || '');
                          return !inline && match ? (
                            <div className="my-3 bg-white dark:bg-[#0A0A0A] border border-transparent dark:border-transparent rounded-md overflow-hidden">
                              <div className="bg-white dark:bg-[#0A0A0A] px-3 py-1.5 border-b border-transparent dark:border-transparent text-[11px] font-bold text-[#64748B] dark:text-[#A1A1AA] uppercase tracking-wider">
                                {match[1]}
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
                              className="bg-black/5 dark:bg-[#1A1A1A] text-[#18181B] dark:text-[#F4F4F5] px-1.5 py-0.5 rounded text-[13px] font-mono font-medium"
                              {...props}
                            >
                              {children}
                            </code>
                          );
                        },
                      }}
                    >
                      {content}
                    </ReactMarkdown>
                  </div>
                ) : (
                  <iframe
                    srcDoc={content}
                    title="HTML Preview"
                    className="w-full h-full border-none bg-white dark:bg-[#0A0A0A]"
                    sandbox="allow-scripts allow-same-origin"
                  />
                )}
              </div>
            </motion.div>
          </AnimatePresence>
        ) : (
          <AnimatePresence mode="wait">
            <motion.div
              key="code"
              initial={{ opacity: 0, scale: 0.98, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.98, y: -10 }}
              transition={{ duration: 0.2, ease: 'easeInOut' }}
              className="flex h-full overflow-hidden w-full"
            >
              {/* Line numbers */}
              <div
                ref={lineNumbersRef}
                className="shrink-0 pt-4 pb-4 pl-4 pr-2 text-right select-none bg-white dark:bg-[#0A0A0A] border-r border-transparent dark:border-transparent overflow-hidden"
              >
                {lines.map((_, i) => (
                  <div key={i} className="font-mono text-[12px] leading-[22px] text-[#D4D4D8]">
                    {i + 1}
                  </div>
                ))}
              </div>
              <div
                className="flex-1 bg-transparent overflow-auto relative"
                onScroll={(e) => {
                  if (lineNumbersRef.current) {
                    lineNumbersRef.current.scrollTop = (e.target as HTMLDivElement).scrollTop;
                  }
                }}
              >
                <Editor
                  value={content}
                  onValueChange={(code: string) => setContent(code)}
                  highlight={(code: string) => {
                    const ext = filePath.split('.').pop()?.toLowerCase() || '';
                    const lang =
                      Prism.languages[ext] || Prism.languages.javascript || Prism.languages.text;
                    try {
                      return Prism.highlight(code, lang, ext);
                    } catch (e) {
                      return code; // Fallback if Prism fails
                    }
                  }}
                  padding={16}
                  style={{
                    fontFamily: 'monospace',
                    fontSize: 13,
                    lineHeight: '22px',
                    minHeight: '100%',
                  }}
                  className="w-full text-[#111111] dark:text-[#E4E4E7]"
                  textareaClassName="focus:outline-none"
                />
              </div>
            </motion.div>
          </AnimatePresence>
        )}
      </div>

      {/* ═══ Status Bar ═══ */}
      <div className="flex items-center justify-between px-5 py-1.5 border-t border-transparent dark:border-transparent bg-white dark:bg-[#0A0A0A] shrink-0">
        <div className="flex items-center gap-4">
          <span className="font-mono text-[10px] text-[#A1A1AA]">{language}</span>
          {!isImage && !isBinary && (
            <>
              <span className="font-mono text-[10px] text-[#D4D4D8]">•</span>
              <span className="font-mono text-[10px] text-[#A1A1AA]">{lineCount} lines</span>
              <span className="font-mono text-[10px] text-[#D4D4D8]">•</span>
              <span className="font-mono text-[10px] text-[#A1A1AA]">{formatBytes(charCount)}</span>
            </>
          )}
        </div>
        <div className="flex items-center gap-4">
          <span className="font-mono text-[10px] text-[#D4D4D8]">Ctrl+S save</span>
          <span className="font-mono text-[10px] text-[#D4D4D8]">Esc close</span>
        </div>
      </div>
    </div>
  );
}
