import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const STORAGE_PATH = path.resolve(__dirname, '../src/lib/storage.ts');
const CHAT_CONTAINER_PATH = path.resolve(__dirname, '../src/ui/components/ChatContainer.tsx');
const MANIFEST_PATH = path.resolve(__dirname, '../manifest.json');
const SERVICE_WORKER_PATH = path.resolve(__dirname, '../src/background/service-worker.ts');

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

  test.describe('CSP compatibility', () => {
    let manifest: any;

    test.beforeAll(() => {
      manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
    });

    test('CSP does not contain default-src (causes fallback issues in Firefox)', () => {
      const csp = manifest.content_security_policy?.extension_pages ?? '';
      expect(csp).not.toContain('default-src');
    });

    test('CSP includes style-src unsafe-inline', () => {
      const csp = manifest.content_security_policy?.extension_pages ?? '';
      expect(csp).toContain("style-src 'self' 'unsafe-inline'");
    });

    test('CSP includes connect-src for API host', () => {
      const csp = manifest.content_security_policy?.extension_pages ?? '';
      expect(csp).toContain('connect-src');
      expect(csp).toContain('https://allch.at');
      expect(csp).toContain('wss://allch.at');
    });
  });

  test.describe('Manifest Firefox compatibility', () => {
    let manifest: any;

    test.beforeAll(() => {
      manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
    });

    test('browser_specific_settings.gecko exists with proper ID', () => {
      const id = manifest.browser_specific_settings?.gecko?.id;
      expect(id).toBeTruthy();
      expect(id).toMatch(/^[a-z@.]+$|^\{[0-9a-f-]+\}$/);
    });

    test('gecko strict_min_version is at least 115', () => {
      const minVersion = manifest.browser_specific_settings?.gecko?.strict_min_version;
      expect(minVersion).toBeTruthy();
      expect(parseInt(minVersion)).toBeGreaterThanOrEqual(115);
    });

    test('background has scripts array alongside service_worker', () => {
      expect(manifest.background?.scripts).toBeTruthy();
      expect(Array.isArray(manifest.background.scripts)).toBe(true);
      expect(manifest.background.scripts.length).toBeGreaterThan(0);
    });

    test('web_accessible_resources uses MV3 cross-browser format', () => {
      const war = manifest.web_accessible_resources;
      expect(war).toBeTruthy();
      expect(Array.isArray(war)).toBe(true);
      for (const entry of war) {
        expect(entry).toHaveProperty('resources');
        expect(entry).toHaveProperty('matches');
      }
    });
  });

  test.describe('Service worker Firefox compatibility', () => {
    let swSrc: string;

    test.beforeAll(() => {
      swSrc = fs.readFileSync(SERVICE_WORKER_PATH, 'utf8');
    });

    test('fetchStreamerInfo GET does not set Content-Type header', () => {
      // Extract the fetchStreamerInfo function body
      const fnMatch = swSrc.match(
        /async function fetchStreamerInfo[\s\S]*?^}/m
      );
      expect(fnMatch, 'fetchStreamerInfo must exist').toBeTruthy();
      const fnBody = fnMatch![0];
      // GET requests must not set Content-Type — triggers CORS preflight in Firefox
      expect(fnBody).not.toContain("'Content-Type'");
      expect(fnBody).not.toContain('"Content-Type"');
    });

    test('no chrome.identity calls in service worker', () => {
      // chrome.identity is not supported in Firefox
      const withoutComments = swSrc.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
      expect(withoutComments).not.toContain('chrome.identity.');
    });
  });

  test.describe('No chrome.identity in content scripts or UI', () => {
    test('content scripts do not call chrome.identity', () => {
      const dir = path.resolve(__dirname, '../src/content-scripts');
      const files = fs.readdirSync(dir, { recursive: true }) as string[];
      for (const file of files) {
        if (!file.endsWith('.ts') && !file.endsWith('.tsx')) continue;
        const fullPath = path.join(dir, file);
        if (fs.statSync(fullPath).isDirectory()) continue;
        const src = fs.readFileSync(fullPath, 'utf8');
        const withoutComments = src.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
        expect(withoutComments, `${file} must not use chrome.identity`).not.toContain('chrome.identity.');
      }
    });

    test('UI components do not call chrome.identity', () => {
      const dir = path.resolve(__dirname, '../src/ui');
      const files = fs.readdirSync(dir, { recursive: true }) as string[];
      for (const file of files) {
        if (!file.endsWith('.ts') && !file.endsWith('.tsx')) continue;
        const fullPath = path.join(dir, file);
        if (fs.statSync(fullPath).isDirectory()) continue;
        const src = fs.readFileSync(fullPath, 'utf8');
        const withoutComments = src.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
        expect(withoutComments, `${file} must not use chrome.identity`).not.toContain('chrome.identity.');
      }
    });
  });
});
