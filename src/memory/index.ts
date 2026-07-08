import { db } from '../db/index.js';
import { memoryEmbeddings } from '../db/schema.js';
import { sql } from 'drizzle-orm';
import fs from 'fs';
import path from 'path';

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const EMBED_MODEL = process.env.EMBED_MODEL || 'nomic-embed-text';

export async function generateEmbedding(text: string): Promise<number[]> {
  try {
    const res = await fetch(`${OLLAMA_URL}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: EMBED_MODEL, prompt: text }),
    });
    const data = await res.json() as { embedding?: number[], error?: string };
    if (data.error) {
      console.error('[Memory] Ollama embedding error:', data.error);
      return [];
    }
    return data.embedding || [];
  } catch (err) {
    console.error('[Memory] Error generating embedding:', err);
    return []; // Return empty or throw
  }
}

export async function storeMemory(taskId: string, summary: string, diff: string) {
  const embedding = await generateEmbedding(summary);
  if (embedding.length > 0) {
    await db.insert(memoryEmbeddings).values({
      taskId,
      summary,
      diff,
      embedding,
    });
    console.log(`[Memory] Stored memory for task ${taskId}`);
  }
}

/**
 * Perform a vector similarity search to find relevant past tasks.
 */
export async function searchMemory(query: string, limit = 3): Promise<any[]> {
  const queryEmbedding = await generateEmbedding(query);
  if (queryEmbedding.length === 0) return [];

  // Cosine distance similarity using pgvector
  const similarityQuery = sql<number>`1 - (${memoryEmbeddings.embedding} <=> ${JSON.stringify(queryEmbedding)})`;
  
  const results = await db.select({
    taskId: memoryEmbeddings.taskId,
    summary: memoryEmbeddings.summary,
    similarity: similarityQuery,
  })
  .from(memoryEmbeddings)
  .orderBy(sql`${memoryEmbeddings.embedding} <=> ${JSON.stringify(queryEmbedding)}`)
  .limit(limit);

  return results;
}

export async function writeTaskDoc(taskId: string, targetRepo: string, summary: string, diff: string, result: string) {
  const logDir = path.join(targetRepo, 'warden-log');
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }

  const docPath = path.join(logDir, `task-${taskId}.md`);
  const content = `# Task: ${taskId}\n\n## Summary\n${summary}\n\n## Result\n${result}\n\n## Diff\n\`\`\`diff\n${diff}\n\`\`\`\n`;
  
  fs.writeFileSync(docPath, content, 'utf-8');
  console.log(`[Docs] Wrote task documentation to ${docPath}`);
}
