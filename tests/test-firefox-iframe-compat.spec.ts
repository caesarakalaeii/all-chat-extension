import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const STORAGE_PATH = path.resolve(__dirname, '../src/lib/storage.ts');
const CHAT_CONTAINER_PATH = path.resolve(__dirname, '../src/ui/components/ChatContainer.tsx');

test.describe('Firefox iframe compatibility — Issue #35', () => {

  test.describe('Bug 1: storage timeout + lastError guard', () => {
    let storageSrc: string;

    test.beforeAll(() => {
      storageSrc = fs.readFileSync(STORAGE_PATH, 'utf8');
    });

    test('getLocalStorage has a setTimeout fallback', () => {
      // Extract the getLocalStorage function body
      const fnMatch = storageSrc.match(
        /export async function getLocalStorage[\s\S]*?^}/m
      );
      expect(fnMatch, 'getLocalStorage function must exist').toBeTruthy();
      const fnBody = fnMatch![0];
      expect(fnBody).toContain('setTimeout');
      expect(fnBody).toContain('clearTimeout');
    });

    test('getLocalStorage checks chrome.runtime.lastError', () => {
      const fnMatch = storageSrc.match(
        /export async function getLocalStorage[\s\S]*?^}/m
      );
      const fnBody = fnMatch![0];
      expect(fnBody).toContain('chrome.runtime.lastError');
    });

    test('getLocalStorage resolves empty on timeout (not reject)', () => {
      const fnMatch = storageSrc.match(
        /export async function getLocalStorage[\s\S]*?^}/m
      );
      const fnBody = fnMatch![0];
      // Should resolve with empty object, not reject
      expect(fnBody).toContain('resolve({} as LocalStorage)');
      expect(fnBody).not.toContain('reject');
    });

    test('getSyncStorage has a setTimeout fallback', () => {
      const fnMatch = storageSrc.match(
        /export async function getSyncStorage[\s\S]*?^}/m
      );
      expect(fnMatch, 'getSyncStorage function must exist').toBeTruthy();
      const fnBody = fnMatch![0];
      expect(fnBody).toContain('setTimeout');
      expect(fnBody).toContain('clearTimeout');
    });

    test('getSyncStorage checks chrome.runtime.lastError', () => {
      const fnMatch = storageSrc.match(
        /export async function getSyncStorage[\s\S]*?^}/m
      );
      const fnBody = fnMatch![0];
      expect(fnBody).toContain('chrome.runtime.lastError');
    });

    test('getSyncStorage resolves defaults on timeout (not reject)', () => {
      const fnMatch = storageSrc.match(
        /export async function getSyncStorage[\s\S]*?^}/m
      );
      const fnBody = fnMatch![0];
      // Should resolve with defaults, not reject
      expect(fnBody).toContain('DEFAULT_SETTINGS');
      expect(fnBody).not.toContain('reject');
    });

    test('timeout is 5000ms for both storage functions', () => {
      // Both timeouts should be 5000ms — the arrow function spans multiple lines,
      // so match setTimeout(..., NNNN) with dotAll
      const timeoutMatches = storageSrc.match(/setTimeout\([\s\S]*?,\s*(\d+)\s*\)/g);
      expect(timeoutMatches, 'should have setTimeout calls').toBeTruthy();
      expect(timeoutMatches!.length).toBeGreaterThanOrEqual(2);
      for (const match of timeoutMatches!) {
        const ms = match.match(/,\s*(\d+)\s*\)$/);
        expect(ms).toBeTruthy();
        expect(Number(ms![1])).toBe(5000);
      }
    });
  });

  test.describe('Bug 2: postMessage source check replaces origin check', () => {
    let containerSrc: string;

    test.beforeAll(() => {
      containerSrc = fs.readFileSync(CHAT_CONTAINER_PATH, 'utf8');
    });

    test('message handler uses event.source === window.parent', () => {
      expect(containerSrc).toContain('event.source !== window.parent');
    });

    test('message handler does NOT use origin-based check for incoming messages', () => {
      // The in-page iframe message handler should not compare event.origin
      // (origin checks fail in Firefox because content scripts report page origin)
      // Note: only check the messageHandler section, not the entire file
      const handlerMatch = containerSrc.match(
        /const messageHandler = \(event: MessageEvent\)[\s\S]*?window\.addEventListener\('message', messageHandler\)/
      );
      expect(handlerMatch, 'messageHandler must exist').toBeTruthy();
      const handlerBody = handlerMatch![0];
      expect(handlerBody).not.toContain('event.origin');
    });

    test('extensionOrigin variable is not used in iframe message handler', () => {
      // The extensionOrigin variable should not be computed in the in-page branch
      const inPageBranch = containerSrc.match(
        /} else \{\s*\/\/ In-page iframe mode[\s\S]*?return \(\) => window\.removeEventListener/
      );
      expect(inPageBranch, 'in-page iframe branch must exist').toBeTruthy();
      expect(inPageBranch![0]).not.toContain('extensionOrigin');
    });
  });
});
