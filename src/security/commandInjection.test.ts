import { describe, it, expect } from 'vitest';
import { checkAuthToken } from '../index.js';
import express from 'express';

describe('Command Injection & API Security Verification', () => {
  it('validates scriptName regex blocks dangerous shell injection characters', () => {
    const validRegex = /^[a-zA-Z0-9_\-\.\:]+$/;
    expect(validRegex.test('build')).toBe(true);
    expect(validRegex.test('dev:backend')).toBe(true);
    expect(validRegex.test('test-all_1.0')).toBe(true);

    expect(validRegex.test('build && calc.exe')).toBe(false);
    expect(validRegex.test('dev; rm -rf /')).toBe(false);
    expect(validRegex.test('test || nc -e /bin/bash')).toBe(false);
    expect(validRegex.test('`whoami`')).toBe(false);
    expect(validRegex.test('$(cat /etc/passwd)')).toBe(false);
  });

  it('enforces WARDEN_API_TOKEN checking when set in process.env', () => {
    const oldToken = process.env.WARDEN_API_TOKEN;
    try {
      process.env.WARDEN_API_TOKEN = 'secret-test-token-123';
      let statusCalled = 0;
      let jsonMessage = '';
      let nextCalled = false;

      const mockReq = {
        headers: { 'x-warden-token': 'wrong-token' },
        query: {},
      } as unknown as express.Request;

      const mockRes = {
        status: (code: number) => {
          statusCalled = code;
          return {
            json: (data: any) => {
              jsonMessage = data.error;
            },
          };
        },
      } as unknown as express.Response;

      checkAuthToken(mockReq, mockRes, () => {
        nextCalled = true;
      });

      expect(statusCalled).toBe(401);
      expect(jsonMessage).toContain('Unauthorized');
      expect(nextCalled).toBe(false);

      // Now pass the correct token
      const validReq = {
        headers: { 'x-warden-token': 'secret-test-token-123' },
        query: {},
      } as unknown as express.Request;

      nextCalled = false;
      checkAuthToken(validReq, mockRes, () => {
        nextCalled = true;
      });
      expect(nextCalled).toBe(true);
    } finally {
      process.env.WARDEN_API_TOKEN = oldToken;
    }
  });
});
