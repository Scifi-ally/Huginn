import { broadcastEvent } from '../ws/server.js';
import * as http from 'http';
import * as https from 'https';

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';

export class ModelManager {
  private currentlyLoadedModel: string | null = null;
  private readonly tiers: Record<number, string> = {
    1: 'qwen2.5-coder:1.5b', // Tier 1 (small)
    2: 'qwen2.5-coder:7b',   // Tier 2 (medium)
    3: 'qwen2.5-coder:14b',  // Tier 3 (large)
  };

  private readonly specialists: Record<string, string> = {
    'ui': 'qwen2.5-coder:7b',
    'frontend': 'qwen2.5-coder:7b',
    'terminal': 'qwen2.5-coder:7b',
    'automation': 'qwen2.5-coder:7b',
    'coding': 'qwen2.5-coder:14b',
    'reasoning': 'qwen2.5:7b',
    'default': 'qwen2.5-coder:7b'
  };

  constructor() {}

  public getModelForTask(taskDescription: string): string {
    const lower = (taskDescription || '').toLowerCase();
    if (lower.includes('ui') || lower.includes('frontend') || lower.includes('react') || lower.includes('web') || lower.includes('css') || lower.includes('html')) {
      return this.specialists['ui'] || 'qwen2.5-coder:7b';
    }
    if (lower.includes('terminal') || lower.includes('command') || lower.includes('shell') || lower.includes('bash') || lower.includes('powershell') || lower.includes('script') || lower.includes('devops')) {
      return this.specialists['terminal'] || 'qwen2.5-coder:7b';
    }
    if (lower.includes('reason') || lower.includes('why') || lower.includes('what') || lower.includes('how') || lower.includes('explain') || lower.includes('answer')) {
      return this.specialists['reasoning'] || 'qwen2.5:7b';
    }
    return this.specialists['coding'] || 'qwen2.5-coder:7b';
  }

  public async ensureSpecialistModelsSetup(onProgress?: (msg: string) => void): Promise<string[]> {
    const modelsToPull = [...new Set(Object.values(this.specialists))];
    const results: string[] = [];
    for (const modelId of modelsToPull) {
      if (onProgress) onProgress(`Checking specialist model: ${modelId}...`);
      try {
        await this.ensureLoaded(modelId);
        results.push(`✅ Setup & Verified: ${modelId}`);
      } catch (err: any) {
        results.push(`⚠️ Could not pull ${modelId}: ${err.message}`);
      }
    }
    return results;
  }

  public getLoadedModel(): string | null {
    return this.currentlyLoadedModel;
  }

  public getModelForTier(tier: number): string {
    return this.tiers[tier] || this.tiers[1];
  }

  public async ensureLoaded(modelId: string): Promise<void> {
    if (this.currentlyLoadedModel === modelId) {
      return; 
    }

    console.log(`[ModelManager] Swapping models: ${this.currentlyLoadedModel} -> ${modelId}`);
    
    if (this.currentlyLoadedModel) {
      broadcastEvent('model_unloading', { model: this.currentlyLoadedModel });
      await this.unloadModel(this.currentlyLoadedModel);
    }

    broadcastEvent('model_loading', { model: modelId });
    try {
      await this.loadModel(modelId);
    } catch (err: any) {
      const errMsg = err.cause?.code === 'ECONNREFUSED' || err.message?.includes('ECONNREFUSED')
        ? `Cannot connect to Ollama at ${OLLAMA_URL}. Is Ollama running?`
        : `Failed to load model ${modelId}: ${err.message}`;
      broadcastEvent('model_error', { message: errMsg });
      throw err;
    }
    
    this.currentlyLoadedModel = modelId;
    broadcastEvent('model_loaded', { model: modelId });
    
    console.log(`[ModelManager] Successfully loaded model: ${modelId}`);
  }

  private async unloadModel(modelId: string): Promise<void> {
    try {
      await fetch(`${OLLAMA_URL}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: modelId, keep_alive: 0 }),
      });
    } catch (err) {
      console.error(`[ModelManager] Failed to unload model ${modelId}:`, err);
    }
  }

  private async loadModel(modelId: string): Promise<void> {
    let res: globalThis.Response;
    try {
      res = await fetch(`${OLLAMA_URL}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: modelId, prompt: '', keep_alive: '1h' }),
      });
    } catch (err: any) {
      const errMsg = err.cause?.code === 'ECONNREFUSED'
        ? `Cannot connect to Ollama at ${OLLAMA_URL}. Is Ollama running?`
        : `Ollama connection failed: ${err.message}`;
      console.error(`[ModelManager] ${errMsg}`);
      broadcastEvent('model_error', { message: errMsg });
      throw new Error(errMsg);
    }

    try {
      // Ollama returns 404 with error message if model is not found
      if (res.status === 404) {
        console.log(`[ModelManager] Model ${modelId} not found locally. Initiating download...`);
        broadcastEvent('model_download_progress', { model: modelId, percent: 0, status: `Model ${modelId} not found locally. Starting download...` });
        await this.pullModel(modelId);
        
        // Try loading again after pull
        const retryRes = await fetch(`${OLLAMA_URL}/api/generate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: modelId, prompt: '', keep_alive: '1h' }),
        });
        if (!retryRes.ok) {
          throw new Error(`Failed to load model after pulling: ${retryRes.statusText}`);
        }
      } else if (!res.ok) {
        throw new Error(`Ollama API error: ${res.statusText}`);
      }
    } catch (err) {
      console.error(`[ModelManager] Failed to load model ${modelId}:`, err);
      throw err;
    }
  }

  private async pullModel(modelId: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const url = new URL(`${OLLAMA_URL}/api/pull`);
      const req = (url.protocol === 'https:' ? https : http).request(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      }, (res) => {
        if (res.statusCode !== 200) {
          reject(new Error(`Failed to pull model: HTTP ${res.statusCode}`));
          return;
        }

        res.on('data', (chunk) => {
          const lines = chunk.toString().split('\n').filter((l: string) => l.trim() !== '');
          for (const line of lines) {
            try {
              const data = JSON.parse(line);
              if (data.total && data.completed) {
                const percent = Math.round((data.completed / data.total) * 100);
                broadcastEvent('model_download_progress', { model: modelId, percent, status: data.status });
              } else {
                broadcastEvent('model_download_progress', { model: modelId, percent: 0, status: data.status });
              }
              if (data.status === 'success') {
                resolve();
              }
            } catch (e) {
              // Ignore parse errors for partial chunks
            }
          }
        });

        res.on('end', () => {
          resolve();
        });
      });

      req.on('error', (err) => {
        reject(err);
      });

      req.write(JSON.stringify({ model: modelId, stream: true }));
      req.end();
    });
  }
}

export const modelManager = new ModelManager();
