import { describe, it, expect } from 'vitest';
import { cleanCodeBlock } from './cleanCode.js';

describe('cleanCodeBlock', () => {
  it('strips markdown code blocks with language tag and newlines', () => {
    const input = '```typescript\nconst x = 42;\nconsole.log(x);\n```';
    expect(cleanCodeBlock(input)).toBe('const x = 42;\nconsole.log(x);');
  });

  it('strips inline code blocks without linebreaks around triple backticks', () => {
    const input = '```const y = 10;```';
    expect(cleanCodeBlock(input)).toBe('const y = 10;');
  });

  it('strips shebang lines (#!) for Unix/Linux scripts on all platforms', () => {
    const input = '#!/usr/bin/env node\nconsole.log("hello world");';
    expect(cleanCodeBlock(input)).toBe('console.log("hello world");');
  });

  it('handles empty or null/undefined strings cleanly without crashing', () => {
    expect(cleanCodeBlock('')).toBe('');
    expect(cleanCodeBlock(null as any)).toBe('');
  });

  it('returns clean content unchanged if no markdown block or shebang exists', () => {
    const input = 'function add(a: number, b: number) { return a + b; }';
    expect(cleanCodeBlock(input)).toBe(input);
  });
});
