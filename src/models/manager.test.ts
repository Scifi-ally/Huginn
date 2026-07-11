import { describe, it, expect } from 'vitest';
import { ModelManager } from './manager.js';

describe('ModelManager routing', () => {
  const manager = new ModelManager();

  it('routes UI and frontend tasks to the ui specialist model', () => {
    expect(manager.getModelForTask('Create a React frontend navbar component')).toBe(
      'qwen2.5-coder:7b',
    );
    expect(manager.getModelForTask('Fix CSS styling for buttons')).toBe('qwen2.5-coder:7b');
  });

  it('routes terminal and bash command tasks to the terminal specialist model', () => {
    expect(manager.getModelForTask('Execute terminal script to clean logs')).toBe(
      'qwen2.5-coder:7b',
    );
    expect(manager.getModelForTask('Run command to check docker status')).toBe('qwen2.5-coder:7b');
  });

  it('routes conceptual questions to the reasoning model when not coding', () => {
    expect(manager.getModelForTask('Why is recursion useful in computer science?')).toBe(
      'qwen2.5:7b',
    );
    expect(manager.getModelForTask('Explain the difference between TCP and UDP')).toBe(
      'qwen2.5:7b',
    );
  });

  it('does not misroute conceptual questions when coding keywords are present', () => {
    expect(
      manager.getModelForTask('Explain how to fix this bug in the user authentication class'),
    ).toBe('qwen2.5-coder:14b');
  });

  it('defaults to coding specialist model for standard code generation requests', () => {
    expect(manager.getModelForTask('Implement binary search in TypeScript')).toBe(
      'qwen2.5-coder:14b',
    );
    expect(manager.getModelForTask('Refactor the database queries')).toBe('qwen2.5-coder:14b');
  });
});
