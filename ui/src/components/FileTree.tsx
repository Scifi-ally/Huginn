import React, { useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, X, FolderSimple, FolderOpen, FileText, FilePy, FileHtml, FileCss, FileTs, FileTsx, FileJs, FileJsx, FileCode, FileMd, FileSql, FileImage } from '@phosphor-icons/react';

const getFileIcon = (fileName: string) => {
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.py') || lower.endsWith('.pyw') || lower.endsWith('.ipynb')) {
    return <FilePy size={16} weight="bold" className="icon text-[#3B82F6] shrink-0" />;
  }
  if (lower.endsWith('.html') || lower.endsWith('.htm')) {
    return <FileHtml size={16} weight="bold" className="icon text-[#E34F26] shrink-0" />;
  }
  if (lower.endsWith('.css') || lower.endsWith('.scss') || lower.endsWith('.less') || lower.endsWith('.sass')) {
    return <FileCss size={16} weight="bold" className="icon text-[#1572B6] shrink-0" />;
  }
  if (lower.endsWith('.tsx')) {
    return <FileTsx size={16} weight="bold" className="icon text-[#3178C6] shrink-0" />;
  }
  if (lower.endsWith('.ts')) {
    return <FileTs size={16} weight="bold" className="icon text-[#3178C6] shrink-0" />;
  }
  if (lower.endsWith('.jsx')) {
    return <FileJsx size={16} weight="bold" className="icon text-[#F7DF1E] shrink-0" />;
  }
  if (lower.endsWith('.js') || lower.endsWith('.cjs') || lower.endsWith('.mjs')) {
    return <FileJs size={16} weight="bold" className="icon text-[#F7DF1E] shrink-0" />;
  }
  if (lower.endsWith('.json') || lower.endsWith('.xml') || lower.endsWith('.yaml') || lower.endsWith('.yml') || lower.endsWith('.config')) {
    return <FileCode size={16} weight="bold" className="icon text-[#10B981] shrink-0" />;
  }
  if (lower.endsWith('.md') || lower.endsWith('.mdx')) {
    return <FileMd size={16} weight="bold" className="icon text-[#8B5CF6] shrink-0" />;
  }
  if (lower.endsWith('.sql')) {
    return <FileSql size={16} weight="bold" className="icon text-[#00758F] shrink-0" />;
  }
  if (lower.endsWith('.svg') || lower.endsWith('.png') || lower.endsWith('.jpg') || lower.endsWith('.jpeg') || lower.endsWith('.gif') || lower.endsWith('.webp') || lower.endsWith('.ico')) {
    return <FileImage size={16} weight="bold" className="icon text-[#EC4899] shrink-0" />;
  }
  return <FileText size={16} weight="bold" className="icon text-[#71717A] dark:text-[#A1A1AA] shrink-0" />;
};

// TreeNode represents the nested structure
interface TreeNode {
  name: string;
  path: string;
  isDirectory: boolean;
  children: Record<string, TreeNode>;
}

interface FileTreeProps {
  files: { name: string; isDirectory: boolean }[];
  activeFile: string | null;
  onSelectFile: (path: string) => void;
  onDeleteFile?: (path: string) => void;
  confirmDeleteId?: string | null;
  setConfirmDeleteId?: (id: string | null) => void;
}

function FolderItem({
  node,
  depth,
  renderChild,
  onDeleteFile,
  activeConfirmId,
  handleSetConfirmId
}: {
  node: TreeNode;
  depth: number;
  renderChild: (node: TreeNode, depth: number) => React.ReactNode;
  onDeleteFile?: (path: string) => void;
  activeConfirmId: string | null;
  handleSetConfirmId: (id: string | null) => void;
}) {
  const [isOpen, setIsOpen] = React.useState(depth < 2);

  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.2 }}
      className="select-none my-0.5"
      key={node.path}
    >
      <div 
        onClick={(e) => {
          e.stopPropagation();
          setIsOpen(!isOpen);
        }}
        className="flex items-center justify-between py-1 px-2 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 text-[#52525B] dark:text-[#D4D4D8] hover:text-[#18181B] dark:hover:text-white cursor-pointer transition-colors group"
      >
        <div className="flex items-center gap-2 min-w-0 flex-1 pr-2">
          {isOpen ? (
            <FolderOpen size={17} weight="duotone" className="text-[#3B82F6] shrink-0" />
          ) : (
            <FolderSimple size={17} weight="duotone" className="text-[#3B82F6] shrink-0" />
          )}
          <span className="truncate font-mono text-[13px] font-medium">{node.name}</span>
        </div>
        
        {onDeleteFile && (
          <div className="flex items-center gap-1 shrink-0 ml-1 z-10" onClick={(e) => e.stopPropagation()}>
            {activeConfirmId === node.path && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  onDeleteFile(node.path);
                  handleSetConfirmId(null);
                }}
                title="Confirm Delete Folder"
                className="text-[#10B981] hover:bg-[#10B981]/20 p-1 rounded transition-colors"
              >
                <Check size={14} weight="bold" />
              </button>
            )}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                handleSetConfirmId(activeConfirmId === node.path ? null : node.path);
              }}
              className={`p-1 rounded transition-colors ${activeConfirmId === node.path ? 'opacity-100 text-[#EF4444] bg-[#FEF2F2] dark:bg-red-500/20' : 'opacity-0 group-hover:opacity-100 text-[#EF4444] hover:bg-red-500/10'}`}
              title={activeConfirmId === node.path ? "Cancel" : "Delete Folder"}
            >
              <X size={13} weight="bold" />
            </button>
          </div>
        )}
      </div>
      
      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.ul
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="pl-3.5 border-l border-[#E4E4E7]/60 dark:border-[#27272A]/80 ml-2.5 space-y-0.5 mt-0.5 overflow-hidden"
          >
            {Object.values(node.children)
              .sort((a, b) => {
                if (a.isDirectory === b.isDirectory) return a.name.localeCompare(b.name);
                return a.isDirectory ? -1 : 1;
              })
              .map(child => renderChild(child, depth + 1))}
          </motion.ul>
        )}
      </AnimatePresence>
    </motion.li>
  );
}

function FileItemNode({
  node,
  isSelected,
  onSelectFile,
  onDeleteFile,
  activeConfirmId,
  handleSetConfirmId
}: {
  node: TreeNode;
  isSelected: boolean;
  onSelectFile: (path: string) => void;
  onDeleteFile?: (path: string) => void;
  activeConfirmId: string | null;
  handleSetConfirmId: (id: string | null) => void;
}) {
  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.15 }}
      className="select-none my-0.5"
      key={node.path}
    >
      <div 
        onClick={(e) => {
          e.stopPropagation();
          onSelectFile(node.path);
        }}
        className={`flex items-center justify-between py-1 px-2 rounded-lg cursor-pointer transition-colors group ${isSelected ? 'bg-[#3B82F6]/15 text-[#3B82F6] dark:text-[#60A5FA] font-medium' : 'text-[#52525B] dark:text-[#A1A1AA] hover:bg-black/5 dark:hover:bg-white/10 hover:text-[#18181B] dark:hover:text-white'}`}
      >
        <div className="flex items-center gap-2 min-w-0 flex-1 pr-2">
          {getFileIcon(node.name)}
          <span className="truncate font-mono text-[13px]">{node.name}</span>
        </div>

        {onDeleteFile && (
          <div className="flex items-center gap-1 shrink-0 ml-1 z-10" onClick={(e) => e.stopPropagation()}>
            {activeConfirmId === node.path && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  onDeleteFile(node.path);
                  handleSetConfirmId(null);
                }}
                title="Confirm Delete"
                className="text-[#10B981] hover:bg-[#10B981]/20 p-1 rounded transition-colors"
              >
                <Check size={14} weight="bold" />
              </button>
            )}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                handleSetConfirmId(activeConfirmId === node.path ? null : node.path);
              }}
              className={`p-1 rounded transition-colors ${activeConfirmId === node.path ? 'opacity-100 text-[#EF4444] bg-[#FEF2F2] dark:bg-red-500/20' : 'opacity-0 group-hover:opacity-100 text-[#EF4444] hover:bg-red-500/10'}`}
              title={activeConfirmId === node.path ? "Cancel" : "Delete"}
            >
              <X size={13} weight="bold" />
            </button>
          </div>
        )}
      </div>
    </motion.li>
  );
}

export default function FileTree({ 
  files, 
  activeFile, 
  onSelectFile,
  onDeleteFile,
  confirmDeleteId,
  setConfirmDeleteId
}: FileTreeProps) {
  const [localConfirmId, setLocalConfirmId] = React.useState<string | null>(null);
  const activeConfirmId = confirmDeleteId !== undefined ? confirmDeleteId : localConfirmId;
  const handleSetConfirmId = (id: string | null) => {
    if (setConfirmDeleteId) setConfirmDeleteId(id);
    setLocalConfirmId(id);
  };
  
  // 1. Parse the flat file array into a deeply nested tree
  const tree = useMemo(() => {
    const root: TreeNode = { name: 'root', path: '', isDirectory: true, children: {} };
    const ignoredDirs = new Set(['node_modules', '__pycache__', '.git', '.venv', 'venv', 'env', '.next', 'dist', 'build', '.idea', '.vscode', '.DS_Store', 'coverage', 'tmp', 'temp', 'vendor']);

    files.forEach(file => {
      // file.name is the relative path (e.g. "src/components/ui/button.tsx")
      const parts = file.name.split(/[\\/]/).filter(Boolean);
      if (parts.some(part => ignoredDirs.has(part) || part.endsWith('.pyc') || part.endsWith('.pyo'))) {
        return;
      }
      let currentNode = root;

      for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        const isLast = i === parts.length - 1;
        
        if (!currentNode.children[part]) {
          currentNode.children[part] = {
            name: part,
            path: parts.slice(0, i + 1).join('/'),
            // If it's not the last part, it MUST be a directory.
            // If it is the last part, its type matches the flat file.
            isDirectory: !isLast || file.isDirectory,
            children: {}
          };
        }
        currentNode = currentNode.children[part];
      }
    });

    return root;
  }, [files]);

  // 2. Render Node recursively
  const renderNode = (node: TreeNode, depth: number = 0): React.ReactNode => {
    if (depth === 0) {
      return (
        <ul key="root" className="space-y-0.5">
          {Object.values(node.children)
            .sort((a, b) => {
              if (a.isDirectory === b.isDirectory) return a.name.localeCompare(b.name);
              return a.isDirectory ? -1 : 1; // Folders first
            })
            .map(child => renderNode(child, depth + 1))}
        </ul>
      );
    }

    if (node.isDirectory) {
      return (
        <FolderItem
          key={node.path}
          node={node}
          depth={depth}
          renderChild={renderNode}
          onDeleteFile={onDeleteFile}
          activeConfirmId={activeConfirmId}
          handleSetConfirmId={handleSetConfirmId}
        />
      );
    }

    const isSelected = activeFile !== null && activeFile.endsWith(node.path);
    return (
      <FileItemNode
        key={node.path}
        node={node}
        isSelected={isSelected}
        onSelectFile={onSelectFile}
        onDeleteFile={onDeleteFile}
        activeConfirmId={activeConfirmId}
        handleSetConfirmId={handleSetConfirmId}
      />
    );
  };

  return (
    <div className="w-full">
      {Object.keys(tree.children).length === 0 ? (
        <div className="text-[12px] font-mono text-[#A1A1AA] dark:text-[#52525B] py-3 text-center">No files in directory.</div>
      ) : (
        renderNode(tree)
      )}
    </div>
  );
}
