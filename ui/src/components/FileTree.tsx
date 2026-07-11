import React, { useState, useMemo, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Folder,
  FolderOpen,
  File,
  FileCode,
  FileText,
  FileImage,
  ImageSquare,
  TerminalWindow,
  Trash,
  Check,
  X,
  DotsThree,
  PencilSimple,
  Plus,
  FolderDashed,
} from '@phosphor-icons/react';
import {
  FileCode as FileCodeLucide,
  FileImage as FileImageLucide,
  FileText as FileTextLucide,
  FileJson,
  FileType2,
  Terminal,
  Database,
  Home,
  FilePlus,
  FolderPlus,
  RefreshCw,
  ChevronsDownUp,
  Edit2,
  Trash2,
} from 'lucide-react';

const getFileIcon = (fileName: string) => {
  return <div className="w-2.5 h-px bg-[#D4D4D8] dark:bg-[#52525B] shrink-0 mr-1.5" />;
};

interface TreeNode {
  id: string;
  name: string;
  isDirectory: boolean;
  children: TreeNode[];
}

interface FileTreeProps {
  files: { name: string; isDirectory: boolean }[];
  activeFile: string | null;
  contextDir?: string;
  onRefreshFiles?: () => void;
  onSelectFile: (path: string) => void;
  onDeleteFile?: (path: string) => void;
  confirmDeleteId?: string | null;
  setConfirmDeleteId?: (id: string | null) => void;
}

export default function FileTree({
  files,
  activeFile,
  contextDir = '',
  onRefreshFiles,
  onSelectFile,
  onDeleteFile,
}: FileTreeProps) {
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [breadcrumbRoot, setBreadcrumbRoot] = useState<string>('');

  // Reset folders to closed by default when directory/workspace changes
  useEffect(() => {
    setExpandedFolders(new Set());
    setBreadcrumbRoot('');
  }, [contextDir]);

  // Creation state: type ('file' | 'folder'), parentId ('' for root or folder path)
  const [creatingItem, setCreatingItem] = useState<{
    type: 'file' | 'folder';
    parentId: string;
  } | null>(null);
  const [createInput, setCreateInput] = useState<string>('');

  // Renaming state
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameInput, setRenameInput] = useState<string>('');

  // Context Menu state
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    nodeId: string;
    isDirectory: boolean;
  } | null>(null);

  useEffect(() => {
    const closeMenu = () => setContextMenu(null);
    window.addEventListener('click', closeMenu);
    return () => window.removeEventListener('click', closeMenu);
  }, []);

  // Automatically adjust breadcrumb if activeFile is deeper than 4 folders
  useEffect(() => {
    if (!activeFile) return;
    const parts = activeFile.split(/[\\/]/).filter(Boolean);
    if (parts.length > 5) {
      const prefixCount = parts.length - 5;
      const prefix = parts.slice(0, prefixCount).join('/');
      setBreadcrumbRoot(prefix);
    }
  }, [activeFile]);

  // Build tree hierarchy
  const { rootNodes } = useMemo(() => {
    const root: Record<string, any> = {};
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

    files.forEach((file) => {
      let relName = file.name.replace(/\\/g, '/');

      if (breadcrumbRoot) {
        if (!relName.startsWith(breadcrumbRoot + '/')) {
          return;
        }
        relName = relName.slice(breadcrumbRoot.length + 1);
      }

      const parts = relName.split('/').filter(Boolean);
      if (
        parts.some(
          (part) => ignoredDirs.has(part) || part.endsWith('.pyc') || part.endsWith('.pyo'),
        )
      ) {
        return;
      }

      let currentLevel = root;
      let pathAccum = breadcrumbRoot ? breadcrumbRoot : '';

      for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        const isLast = i === parts.length - 1;
        pathAccum = pathAccum ? `${pathAccum}/${part}` : part;

        const isDir = !isLast || file.isDirectory;

        if (!currentLevel[part]) {
          currentLevel[part] = {
            id: pathAccum,
            name: part,
            isDirectory: isDir,
            children: {},
          };
        }
        currentLevel = currentLevel[part].children;
      }
    });

    const convertToNodeArray = (nodeRecord: Record<string, any>): TreeNode[] => {
      return Object.values(nodeRecord)
        .sort((a, b) => {
          if (a.isDirectory === b.isDirectory) return a.name.localeCompare(b.name);
          return a.isDirectory ? -1 : 1;
        })
        .map((node) => ({
          id: node.id,
          name: node.name,
          isDirectory: node.isDirectory,
          children: convertToNodeArray(node.children),
        }));
    };

    return {
      rootNodes: convertToNodeArray(root),
    };
  }, [files, breadcrumbRoot]);

  // Expand default hierarchy only for activeFile
  useEffect(() => {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (activeFile) {
        const parts = activeFile.split(/[\\/]/).filter(Boolean);
        let accum = '';
        for (let i = 0; i < parts.length - 1; i++) {
          accum = accum ? `${accum}/${parts[i]}` : parts[i];
          next.add(accum);
        }
      }
      return next;
    });
  }, [rootNodes, activeFile]);

  const toggleFolder = (id: string) => {
    const parts = id.split('/');
    const relParts = breadcrumbRoot ? parts.slice(breadcrumbRoot.split('/').length) : parts;
    if (relParts.length > 4) {
      const shift = relParts.length - 4;
      const newPrefixParts = parts.slice(
        0,
        (breadcrumbRoot ? breadcrumbRoot.split('/').length : 0) + shift,
      );
      setBreadcrumbRoot(newPrefixParts.join('/'));
      return;
    }

    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // API Call: Create File / Folder
  const handleCreateSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!creatingItem || !createInput.trim() || !contextDir) return;

    const targetRelPath = creatingItem.parentId
      ? `${creatingItem.parentId}/${createInput.trim()}`
      : createInput.trim();

    const endpoint = creatingItem.type === 'file' ? '/api/files/create' : '/api/files';

    try {
      await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dir: contextDir, name: targetRelPath }),
      });
      setCreatingItem(null);
      setCreateInput('');
      if (onRefreshFiles) onRefreshFiles();
    } catch (err) {
      console.error('Failed to create item:', err);
    }
  };

  // API Call: Rename Item
  const handleRenameSubmit = async (node: TreeNode, e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!renamingId || !renameInput.trim() || renameInput.trim() === node.name || !contextDir) {
      setRenamingId(null);
      return;
    }

    const oldFullPath = `${contextDir}/${node.id}`;

    try {
      await fetch('/api/files/rename', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dir: contextDir,
          oldPath: oldFullPath,
          newName: renameInput.trim(),
        }),
      });
      setRenamingId(null);
      setRenameInput('');
      if (onRefreshFiles) onRefreshFiles();
    } catch (err) {
      console.error('Failed to rename item:', err);
    }
  };

  // API Call: Delete Item
  const handleDeleteNode = async (node: TreeNode | string) => {
    if (!contextDir) return;
    const id = typeof node === 'string' ? node : node.id;
    const fullPath = `${contextDir}/${id}`;
    if (onDeleteFile) {
      onDeleteFile(id);
    } else {
      try {
        await fetch('/api/files', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ targetPath: fullPath, dir: contextDir }),
        });
        if (onRefreshFiles) onRefreshFiles();
      } catch (err) {
        console.error('Failed to delete item:', err);
      }
    }
  };

  const handleContextMenu = (e: React.MouseEvent, nodeId: string, isDirectory: boolean) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      nodeId,
      isDirectory,
    });
  };
  // Trigger inline creation inside root or specific folder
  const startCreate = (type: 'file' | 'folder', parentId: string = '') => {
    if (parentId) {
      setExpandedFolders((prev) => new Set(prev).add(parentId));
    }
    setCreatingItem({ type, parentId });
    setCreateInput('');
  };

  return (
    <div className="w-full flex-1 flex flex-col min-h-0 bg-transparent select-none">
      {/* Scoped Uiverse ashif_6672 Tree CSS */}
      <style
        dangerouslySetInnerHTML={{
          __html: `
        .tree-container-uiverse {
          width: 100%;
          flex: 1;
          min-height: 0;
          display: flex;
          flex-direction: column;
          border: none;
          padding: 4px 2px;
          background: transparent;
          overflow-y: auto;
        }
        .tree-container-uiverse ul {
          list-style: none;
          padding: 0;
          margin: 0;
        }
        .tree-container-uiverse ul ul {
          margin-left: 12px;
          padding-left: 10px;
          border-left: 1px solid #E4E4E7;
        }
        .dark .tree-container-uiverse ul ul {
          border-left-color: rgba(255, 255, 255, 0.08);
        }
        .tree-container-uiverse .tree-item {
          position: relative;
          margin-top: 2px;
        }
        .tree-container-uiverse ul ul .tree-item::before {
          content: "";
          position: absolute;
          left: -10px;
          top: 15px;
          width: 10px;
          height: 1px;
          background-color: #E4E4E7;
        }
        .dark .tree-container-uiverse ul ul .tree-item::before {
          background-color: rgba(255, 255, 255, 0.08);
        }
        .tree-container-uiverse .tree-label,
        .tree-container-uiverse .file-item {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 4px 8px;
          border-radius: 6px;
          cursor: pointer;
          font-size: 13px;
          font-family: var(--font-sans);
          color: #09090B;
          transition: all 0.15s ease;
          user-select: none;
          text-decoration: none;
          min-height: 29px;
          white-space: nowrap;
        }
        .dark .tree-container-uiverse .tree-label,
        .dark .tree-container-uiverse .file-item {
          color: #E4E4E7;
        }
        .tree-container-uiverse .tree-label:hover,
        .tree-container-uiverse .file-item:hover {
          background-color: rgba(0, 0, 0, 0.05);
        }
        .dark .tree-container-uiverse .tree-label:hover,
        .dark .tree-container-uiverse .file-item:hover {
          background-color: rgba(255, 255, 255, 0.06);
        }
        .tree-container-uiverse .is-selected {
          background-color: rgba(59, 130, 246, 0.1) !important;
          color: #3B82F6 !important;
          font-weight: 600;
        }
        .dark .tree-container-uiverse .is-selected {
          background-color: rgba(59, 130, 246, 0.15) !important;
          color: #60A5FA !important;
        }
        .tree-container-uiverse .icon {
          width: 15px;
          height: 15px;
          color: #71717A;
          flex-shrink: 0;
          transition: transform 0.2s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .dark .tree-container-uiverse .icon {
          color: #A1A1AA;
        }
        .tree-container-uiverse .tree-children-wrapper {
          display: none;
        }
        .tree-container-uiverse .tree-children {
          overflow: visible;
        }
        .tree-container-uiverse .tree-children-wrapper.is-open {
          display: block;
        }
      `,
        }}
      />

      {/* Top Toolbar Actions */}
      <div className="flex items-center justify-between px-2 py-1.5 shrink-0 gap-1 text-xs select-none">
        <div className="flex items-center gap-1">
          <button
            onClick={() => startCreate('file', breadcrumbRoot)}
            className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-transparent hover:bg-black/5 dark:hover:bg-white/[0.06] text-[#52525B] dark:text-[#A1A1AA] hover:text-[#09090B] dark:hover:text-white transition-all font-sans font-semibold text-[13px] border-0"
            title="New File"
          >
            <FilePlus size={15} className="text-[#3B82F6]" />
            <span>File</span>
          </button>
          <button
            onClick={() => startCreate('folder', breadcrumbRoot)}
            className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-transparent hover:bg-black/5 dark:hover:bg-white/[0.06] text-[#52525B] dark:text-[#A1A1AA] hover:text-[#09090B] dark:hover:text-white transition-all font-sans font-semibold text-[13px] border-0"
            title="New Folder"
          >
            <FolderPlus size={15} className="text-[#F59E0B]" />
            <span>Folder</span>
          </button>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={() => setExpandedFolders(new Set())}
            className="p-1.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/[0.06] text-[#71717A] dark:text-[#A1A1AA] hover:text-[#09090B] dark:hover:text-white transition-all border-0"
            title="Collapse All Folders"
          >
            <ChevronsDownUp size={15} />
          </button>
          <button
            onClick={() => onRefreshFiles && onRefreshFiles()}
            className="p-1.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/[0.06] text-[#71717A] dark:text-[#A1A1AA] hover:text-[#09090B] dark:hover:text-white transition-all border-0"
            title="Refresh Filesystem"
          >
            <RefreshCw size={15} />
          </button>
        </div>
      </div>

      {/* Breadcrumbs Bar (when active/expanded path depth > 4) */}
      {breadcrumbRoot && (
        <div className="flex items-center gap-1.5 px-2.5 py-1 mx-1 my-1 bg-transparent border-0 rounded-lg text-[12px] font-mono text-[#71717A] dark:text-[#A1A1AA] shrink-0 overflow-x-auto scrollbar-hide">
          <button
            onClick={() => setBreadcrumbRoot('')}
            className="hover:text-[#09090B] dark:hover:text-white transition-colors flex items-center gap-1 shrink-0 font-bold"
            title="Go to root"
          >
            <Home size={12} />
            <span>root</span>
          </button>
          {breadcrumbRoot.split('/').map((part, idx, arr) => (
            <React.Fragment key={idx}>
              <span className="text-[#A1A1AA] dark:text-[#52525B]">/</span>
              <button
                onClick={() => {
                  if (idx === 0) setBreadcrumbRoot('');
                  else setBreadcrumbRoot(arr.slice(0, idx).join('/'));
                }}
                className="hover:text-[#09090B] dark:hover:text-white transition-colors shrink-0 font-medium truncate max-w-[80px]"
              >
                {part}
              </button>
            </React.Fragment>
          ))}
        </div>
      )}

      {/* Tree Content */}
      <div className="tree-container-uiverse flex-1 min-h-0 overflow-y-auto scrollbar-hide">
        {/* Root level inline creation row */}
        {creatingItem && creatingItem.parentId === breadcrumbRoot && (
          <form onSubmit={handleCreateSubmit} className="flex items-center gap-1.5 px-2 py-1 mb-1">
            {creatingItem.type === 'file' ? (
              <FileCode size={15} className="text-[#3B82F6] shrink-0" />
            ) : (
              <svg
                className="icon shrink-0"
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 2H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z"></path>
              </svg>
            )}
            <input
              type="text"
              autoFocus
              value={createInput}
              onChange={(e) => setCreateInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Escape' && setCreatingItem(null)}
              placeholder={creatingItem.type === 'file' ? 'filename.ts' : 'foldername'}
              className="bg-white dark:bg-[#18181B] border border-[#3B82F6] rounded px-1.5 py-0.5 text-xs font-mono text-[#09090B] dark:text-white outline-none w-full"
            />
            <button
              type="submit"
              className="text-[#10B981] hover:bg-emerald-500/10 p-1 rounded shrink-0"
            >
              <Check size={14} />
            </button>
            <button
              type="button"
              onClick={() => setCreatingItem(null)}
              className="text-[#EF4444] hover:bg-red-500/10 p-1 rounded shrink-0"
            >
              <X size={14} />
            </button>
          </form>
        )}

        {rootNodes.length === 0 && !creatingItem ? (
          <div className="flex flex-col items-center justify-center py-10 gap-3">
            <FolderDashed size={32} className="text-white/20" weight="duotone" />
            <div className="text-[13px] font-sans text-white/50">No files in directory.</div>
            <button
              onClick={() => startCreate('file')}
              className="px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white text-[12px] rounded-lg transition-colors border border-white/10"
            >
              Create File
            </button>
          </div>
        ) : (
          <ul>
            {rootNodes.map((node) => (
              <TreeNodeItem
                key={node.id}
                node={node}
                activeFile={activeFile}
                expandedFolders={expandedFolders}
                onToggleFolder={toggleFolder}
                onSelectFile={onSelectFile}
                startCreate={startCreate}
                creatingItem={creatingItem}
                createInput={createInput}
                setCreateInput={setCreateInput}
                setCreatingItem={setCreatingItem}
                handleCreateSubmit={handleCreateSubmit}
                renamingId={renamingId}
                setRenamingId={setRenamingId}
                renameInput={renameInput}
                setRenameInput={setRenameInput}
                handleRenameSubmit={handleRenameSubmit}
                handleDeleteNode={handleDeleteNode}
                onContextMenu={handleContextMenu}
              />
            ))}
          </ul>
        )}
      </div>

      <AnimatePresence>
        {contextMenu && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.1 }}
            className="fixed z-[100] bg-white dark:bg-[#18181B] border border-[#E4E4E7] dark:border-white/[0.08] rounded-xl shadow-[0_12px_40px_rgba(0,0,0,0.15)] dark:shadow-[0_12px_40px_rgba(0,0,0,0.5)] py-1.5 min-w-[180px] flex flex-col font-sans"
            style={{ top: contextMenu.y, left: contextMenu.x }}
            onClick={(e) => e.stopPropagation()}
            onContextMenu={(e) => e.preventDefault()}
          >
            {contextMenu.isDirectory && (
              <>
                <button
                  className="px-3 py-1.5 text-[12.5px] font-medium text-left text-[#111111] dark:text-white hover:bg-[#F4F4F5] dark:hover:bg-white/[0.05] flex items-center gap-2.5 transition-colors"
                  onClick={() => {
                    setContextMenu(null);
                    startCreate('file', contextMenu.nodeId);
                  }}
                >
                  <FilePlus size={14} className="text-[#A1A1AA]" /> New File
                </button>
                <button
                  className="px-3 py-1.5 text-[12.5px] font-medium text-left text-[#111111] dark:text-white hover:bg-[#F4F4F5] dark:hover:bg-white/[0.05] flex items-center gap-2.5 transition-colors"
                  onClick={() => {
                    setContextMenu(null);
                    startCreate('folder', contextMenu.nodeId);
                  }}
                >
                  <FolderPlus size={14} className="text-[#A1A1AA]" /> New Folder
                </button>
                <div className="h-px bg-[#E4E4E7] dark:bg-white/[0.08] my-1 w-full" />
              </>
            )}
            <button
              className="px-3 py-1.5 text-[12.5px] font-medium text-left text-[#111111] dark:text-white hover:bg-[#F4F4F5] dark:hover:bg-white/[0.05] flex items-center gap-2.5 transition-colors"
              onClick={() => {
                setContextMenu(null);
                setRenamingId(contextMenu.nodeId);
                setRenameInput(contextMenu.nodeId.split(/[/\\]/).pop() || '');
              }}
            >
              <Edit2 size={14} className="text-[#A1A1AA]" /> Rename
            </button>
            <div className="h-px bg-[#E4E4E7] dark:bg-white/[0.08] my-1 w-full" />
            <button
              className="px-3 py-1.5 text-[12.5px] font-medium text-left text-[#EF4444] hover:bg-red-50 dark:hover:bg-red-500/10 flex items-center gap-2.5 transition-colors"
              onClick={() => {
                setContextMenu(null);
                handleDeleteNode(contextMenu.nodeId);
              }}
            >
              <Trash2 size={14} /> Delete
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

interface TreeNodeItemProps {
  node: TreeNode;
  activeFile: string | null;
  expandedFolders: Set<string>;
  onToggleFolder: (id: string) => void;
  onSelectFile: (path: string) => void;
  startCreate: (type: 'file' | 'folder', parentId: string) => void;
  creatingItem: { type: 'file' | 'folder'; parentId: string } | null;
  createInput: string;
  setCreateInput: (val: string) => void;
  setCreatingItem: (item: null) => void;
  handleCreateSubmit: (e?: React.FormEvent) => void;
  renamingId: string | null;
  setRenamingId: (id: string | null) => void;
  renameInput: string;
  setRenameInput: (val: string) => void;
  handleRenameSubmit: (node: TreeNode, e?: React.FormEvent) => void;
  handleDeleteNode: (node: TreeNode) => void;
  onContextMenu: (e: React.MouseEvent, nodeId: string, isDirectory: boolean) => void;
}

function TreeNodeItem({
  node,
  activeFile,
  expandedFolders,
  onToggleFolder,
  onSelectFile,
  startCreate,
  creatingItem,
  createInput,
  setCreateInput,
  setCreatingItem,
  handleCreateSubmit,
  renamingId,
  setRenamingId,
  renameInput,
  setRenameInput,
  handleRenameSubmit,
  handleDeleteNode,
  onContextMenu,
}: TreeNodeItemProps) {
  const isOpen = expandedFolders.has(node.id);
  const isSelected =
    activeFile === node.id || (activeFile && activeFile.replace(/\\/g, '/').endsWith(node.id));
  const isRenaming = renamingId === node.id;

  const renameInputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (isRenaming && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [isRenaming]);

  if (node.isDirectory) {
    return (
      <li className="tree-item">
        <div
          className="tree-label group justify-between pr-1"
          onContextMenu={(e) => onContextMenu(e, node.id, true)}
        >
          <div
            className="flex items-center gap-2 flex-1 min-w-0 overflow-hidden"
            onClick={() => !isRenaming && onToggleFolder(node.id)}
          >
            {!isOpen ? (
              <svg
                className="icon shrink-0"
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 2H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z"></path>
              </svg>
            ) : (
              <svg
                className="icon shrink-0"
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 2H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z"></path>
                <path d="M2 10h20"></path>
              </svg>
            )}

            {isRenaming ? (
              <form
                onSubmit={(e) => handleRenameSubmit(node, e)}
                className="flex items-center gap-1 flex-1 min-w-0"
                onClick={(e) => e.stopPropagation()}
              >
                <input
                  ref={renameInputRef}
                  type="text"
                  value={renameInput}
                  onChange={(e) => setRenameInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Escape' && setRenamingId(null)}
                  className="bg-white dark:bg-[#18181B] border border-[#3B82F6] rounded px-1.5 py-0 text-xs font-mono text-[#09090B] dark:text-white outline-none w-full"
                />
              </form>
            ) : (
              <span className="truncate">{node.name}</span>
            )}
          </div>

          {/* Action Buttons on Hover */}
          {!isRenaming && (
            <div
              className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 ml-1 shrink-0"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                onClick={() => startCreate('file', node.id)}
                className="p-1 rounded hover:bg-[#E4E4E7] dark:hover:bg-[#27272A] text-[#71717A] hover:text-[#09090B] dark:hover:text-white"
                title="Create File in folder"
              >
                <FilePlus size={13} />
              </button>
              <button
                onClick={() => startCreate('folder', node.id)}
                className="p-1 rounded hover:bg-[#E4E4E7] dark:hover:bg-[#27272A] text-[#71717A] hover:text-[#09090B] dark:hover:text-white"
                title="Create Subfolder"
              >
                <FolderPlus size={13} />
              </button>
              <button
                onClick={() => {
                  setRenamingId(node.id);
                  setRenameInput(node.name);
                }}
                className="p-1 rounded hover:bg-[#E4E4E7] dark:hover:bg-[#27272A] text-[#71717A] hover:text-[#09090B] dark:hover:text-white"
                title="Rename Folder"
              >
                <Edit2 size={13} />
              </button>
              <button
                onClick={() => handleDeleteNode(node)}
                className="p-1 rounded hover:bg-red-500/20 text-[#71717A] hover:text-red-500"
                title="Delete Folder"
              >
                <Trash2 size={13} />
              </button>
            </div>
          )}
        </div>

        <AnimatePresence initial={false}>
          {isOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.15, ease: 'easeOut' }}
              className="tree-children-wrapper overflow-hidden"
            >
              <ul className="tree-children">
                {/* Inline creation row inside this specific folder */}
                {creatingItem && creatingItem.parentId === node.id && (
                  <li className="tree-item">
                    <form
                      onSubmit={handleCreateSubmit}
                      className="flex items-center gap-1.5 px-2 py-1"
                    >
                      {creatingItem.type === 'file' ? (
                        <FileCode size={15} className="text-[#3B82F6] shrink-0" />
                      ) : (
                        <svg
                          className="icon shrink-0"
                          xmlns="http://www.w3.org/2000/svg"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                        >
                          <path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 2H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z"></path>
                        </svg>
                      )}
                      <input
                        type="text"
                        autoFocus
                        value={createInput}
                        onChange={(e) => setCreateInput(e.target.value)}
                        onKeyDown={(e) => e.key === 'Escape' && setCreatingItem(null)}
                        placeholder={creatingItem.type === 'file' ? 'filename.ts' : 'foldername'}
                        className="bg-white dark:bg-[#18181B] border border-[#3B82F6] rounded px-1.5 py-0.5 text-xs font-mono text-[#09090B] dark:text-white outline-none w-full"
                      />
                      <button
                        type="submit"
                        className="text-[#10B981] hover:bg-emerald-500/10 p-1 rounded shrink-0"
                      >
                        <Check size={14} />
                      </button>
                      <button
                        type="button"
                        onClick={() => setCreatingItem(null)}
                        className="text-[#EF4444] hover:bg-red-500/10 p-1 rounded shrink-0"
                      >
                        <X size={14} />
                      </button>
                    </form>
                  </li>
                )}

                {node.children.map((child) => (
                  <TreeNodeItem
                    key={child.id}
                    node={child}
                    activeFile={activeFile}
                    expandedFolders={expandedFolders}
                    onToggleFolder={onToggleFolder}
                    onSelectFile={onSelectFile}
                    startCreate={startCreate}
                    creatingItem={creatingItem}
                    createInput={createInput}
                    setCreateInput={setCreateInput}
                    setCreatingItem={setCreatingItem}
                    handleCreateSubmit={handleCreateSubmit}
                    renamingId={renamingId}
                    setRenamingId={setRenamingId}
                    renameInput={renameInput}
                    setRenameInput={setRenameInput}
                    handleRenameSubmit={handleRenameSubmit}
                    handleDeleteNode={handleDeleteNode}
                    onContextMenu={onContextMenu}
                  />
                ))}
              </ul>
            </motion.div>
          )}
        </AnimatePresence>
      </li>
    );
  }

  // File item
  return (
    <li className="tree-item">
      <div
        className={`file-item group justify-between pr-1 ${isSelected ? 'is-selected' : ''}`}
        onClick={() => !isRenaming && onSelectFile(node.id)}
        onContextMenu={(e) => onContextMenu(e, node.id, false)}
      >
        <div className="flex items-center gap-2 flex-1 min-w-0 overflow-hidden">
          {getFileIcon(node.name)}
          {isRenaming ? (
            <form
              onSubmit={(e) => handleRenameSubmit(node, e)}
              className="flex items-center gap-1 flex-1 min-w-0"
              onClick={(e) => e.stopPropagation()}
            >
              <input
                ref={renameInputRef}
                type="text"
                value={renameInput}
                onChange={(e) => setRenameInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Escape' && setRenamingId(null)}
                className="bg-white dark:bg-[#18181B] border border-[#3B82F6] rounded px-1.5 py-0 text-xs font-mono text-[#09090B] dark:text-white outline-none w-full"
              />
            </form>
          ) : (
            <span className="truncate font-mono">{node.name}</span>
          )}
        </div>

        {!isRenaming && (
          <div
            className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 ml-1 shrink-0"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => {
                setRenamingId(node.id);
                setRenameInput(node.name);
              }}
              className="p-1 rounded hover:bg-[#E4E4E7] dark:hover:bg-[#27272A] text-[#71717A] hover:text-[#09090B] dark:hover:text-white"
              title="Rename File"
            >
              <Edit2 size={13} />
            </button>
            <button
              onClick={() => handleDeleteNode(node)}
              className="p-1 rounded hover:bg-red-500/20 text-[#71717A] hover:text-red-500"
              title="Delete File"
            >
              <Trash2 size={13} />
            </button>
          </div>
        )}
      </div>
    </li>
  );
}
