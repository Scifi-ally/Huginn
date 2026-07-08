import fs from 'fs/promises';
import path from 'path';

export interface SwarmMemory {
  projectArchitecture: string;
  fileRegistry: Record<string, string>; // e.g. { "src/App.tsx": "Main dashboard UI" }
  activeContracts: Record<string, string>; // e.g. { "FileEditorProps": "{ filePath, onClose }" }
  knownIssues: string[];
  lastUpdatedBy: string;
}

const MEMORY_FILE_NAME = '.warden_swarm_memory.json';

export async function getSwarmMemory(contextDir: string): Promise<SwarmMemory> {
  const memPath = path.join(contextDir, MEMORY_FILE_NAME);
  try {
    const data = await fs.readFile(memPath, 'utf-8');
    return JSON.parse(data);
  } catch {
    return {
      projectArchitecture: 'Not yet defined by Architecture Specialist.',
      fileRegistry: {},
      activeContracts: {},
      knownIssues: [],
      lastUpdatedBy: 'System'
    };
  }
}

export async function updateSwarmMemory(
  contextDir: string, 
  updates: Partial<SwarmMemory>, 
  agentName: string = 'Specialist Agent'
): Promise<SwarmMemory> {
  const current = await getSwarmMemory(contextDir);
  const updated: SwarmMemory = {
    projectArchitecture: updates.projectArchitecture || current.projectArchitecture,
    fileRegistry: { ...current.fileRegistry, ...(updates.fileRegistry || {}) },
    activeContracts: { ...current.activeContracts, ...(updates.activeContracts || {}) },
    knownIssues: updates.knownIssues !== undefined ? updates.knownIssues : current.knownIssues,
    lastUpdatedBy: agentName
  };
  
  const memPath = path.join(contextDir, MEMORY_FILE_NAME);
  await fs.writeFile(memPath, JSON.stringify(updated, null, 2), 'utf-8');
  return updated;
}

export async function formatSwarmMemoryForPrompt(contextDir: string): Promise<string> {
  const mem = await getSwarmMemory(contextDir);
  const fileEntries = Object.entries(mem.fileRegistry);
  const contractEntries = Object.entries(mem.activeContracts);
  
  if (fileEntries.length === 0 && contractEntries.length === 0 && mem.projectArchitecture.startsWith('Not yet')) {
    return 'No previous swarm memory recorded.';
  }
  
  let formatted = `### 🧠 SWARM SHARED BLACKBOARD MEMORY (Last updated by ${mem.lastUpdatedBy}):\n`;
  formatted += `**Project Architecture**: ${mem.projectArchitecture}\n\n`;
  
  if (fileEntries.length > 0) {
    formatted += `**File Registry (${fileEntries.length} files)**:\n`;
    for (const [file, desc] of fileEntries) {
      formatted += `- \`${file}\`: ${desc}\n`;
    }
    formatted += '\n';
  }
  
  if (contractEntries.length > 0) {
    formatted += `**Active Component Contracts / Interfaces**:\n`;
    for (const [name, def] of contractEntries) {
      formatted += `- \`${name}\`: \`${def}\`\n`;
    }
    formatted += '\n';
  }
  
  if (mem.knownIssues.length > 0) {
    formatted += `**Known Issues / TODOs for Next Specialist**:\n`;
    for (const issue of mem.knownIssues) {
      formatted += `- ⚠️ ${issue}\n`;
    }
  }
  
  return formatted;
}
