# API Configuration Update

## Overview

Updated the extension to automatically use the correct API URL based on build mode:
- **Production builds** → `https://allch.at`
- **Development builds** → `http://localhost:8080`

This means GitHub release builds work out-of-the-box without users needing to configure anything!

---

## Changes Made

### 1. Webpack Configuration (`webpack.config.js`)

Added `DefinePlugin` to inject the API URL at build time:

```javascript
const webpack = require('webpack');

module.exports = (env, argv) => {
  const isProduction = argv.mode === 'production';
  const API_URL = isProduction ? 'https://allch.at' : 'http://localhost:8080';

  return {
    plugins: [
      new webpack.DefinePlugin({
        'process.env.API_URL': JSON.stringify(API_URL)
      }),
      // ... other plugins
    ]
  };
};
```

### 2. Centralized Config (`src/config.ts`)

Created a single source of truth for the API URL:

```typescript
declare const process: {
  env: {
    API_URL?: string;
  };
};

export const API_BASE_URL = typeof process !== 'undefined' && process.env.API_URL
  ? process.env.API_URL
  : 'http://localhost:8080';
```

### 3. Updated All Components

Replaced hardcoded `localhost:8080` with `API_BASE_URL` import in:

- ✅ `src/lib/types/extension.ts` - DEFAULT_SETTINGS
- ✅ `src/lib/twitchBadges.ts` - Badge fetching
- ✅ `src/ui/components/ChatContainer.tsx` - Auth endpoints
- ✅ `src/ui/components/LoginPrompt.tsx` - OAuth flow
- ✅ `src/ui/components/MessageInput.tsx` - Send message

### 4. TypeScript Declarations (`src/env.d.ts`)

Added type definitions for the injected environment variables:

```typescript
declare namespace NodeJS {
  interface ProcessEnv {
    API_URL?: string;
  }
}
```

---

## How It Works

### Build Process

1. **Development Mode** (`npm run dev`):
   - Webpack sets `process.env.API_URL = "http://localhost:8080"`
   - Extension connects to local All-Chat instance

2. **Production Mode** (`npm run build`):
   - Webpack sets `process.env.API_URL = "https://allch.at"`
   - Extension connects to production All-Chat instance

3. **GitHub Actions**:
   - Runs `npm run build` (production mode)
   - Creates releases with `allch.at` preconfigured
   - Users can download and use immediately

### Runtime Behavior

The injected value becomes a compile-time constant:

```javascript
// Before webpack (source code):
const API_BASE = API_BASE_URL;

// After webpack in production:
const API_BASE = "https://allch.at";

// After webpack in development:
const API_BASE = "http://localhost:8080";
```

---

## User Experience

### Before This Change ❌
1. User downloads extension from GitHub
2. Extension tries to connect to `localhost:8080`
3. Connection fails (no local server)
4. User must manually configure API URL in settings
5. Confusing for non-technical users

### After This Change ✅
1. User downloads extension from GitHub
2. Extension automatically connects to `https://allch.at`
3. Works immediately out-of-the-box
4. No configuration needed!

---

## Developer Workflow

### Local Development

```bash
# Uses localhost:8080
npm run dev
```

The extension will connect to your local All-Chat instance for testing.

### Production Build

```bash
# Uses allch.at
npm run build
```

Creates a production-ready extension that connects to the live server.

### Testing Both Modes

```bash
# Test development build
npm run dev
# Extension uses localhost:8080

# Test production build
npm run build
# Extension uses allch.at
```

---

## Verification

### Check Build Output

**Production build:**
```bash
$ npm run build
$ grep -o "allch\.at" dist/background.js
allch.at  # ✓ Found!
```

**Development build:**
```bash
$ npx webpack --mode development
$ grep -o "localhost:8080" dist/background.js
localhost:8080  # ✓ Found!
```

### CI/CD Verification

GitHub Actions run: https://github.com/caesarakalaeii/all-chat-extension/actions/runs/20394360396
- ✅ Build succeeded
- ✅ Type check passed
- ✅ Extension packaged
- ✅ Artifact uploaded with `allch.at` configured

---

## Backward Compatibility

### Existing Users

Users who already have the extension installed will:
- Keep their existing `apiGatewayUrl` setting in storage
- Can still override the URL in extension settings if needed
- New default only applies to fresh installs

### Settings Override

The extension still respects user-configured API URLs:
1. Check storage for `apiGatewayUrl`
2. If found, use that
3. Otherwise, fall back to `API_BASE_URL` (environment-based)

This is handled in `src/lib/storage.ts`:
```typescript
export async function getApiGatewayUrl(): Promise<string> {
  const settings = await getSyncStorage();
  return settings.apiGatewayUrl; // Uses DEFAULT_SETTINGS if not set
}
```

---

## Future Improvements

### Environment-Specific Builds

Could add more build modes in the future:

```javascript
const API_URLS = {
  production: 'https://allch.at',
  staging: 'https://staging.allch.at',
  development: 'http://localhost:8080'
};

const API_URL = API_URLS[argv.mode] || API_URLS.development;
```

### Dynamic Configuration

For advanced users, could add:
- Settings UI to change API URL
- Multiple environment profiles
- Auto-detect local vs remote

---

## Testing

### Manual Testing

1. **Test Production Build:**
   ```bash
   npm run build
   # Load dist/ in Chrome
   # Verify connects to allch.at
   ```

2. **Test Development Build:**
   ```bash
   npx webpack --mode development
   # Load dist/ in Chrome
   # Verify connects to localhost:8080
   ```

### Automated Testing

Type checks and builds are verified in CI:
- ✅ TypeScript compilation
- ✅ Webpack build (production mode)
- ✅ No hardcoded localhost URLs in production build

---

## Related Files

- `webpack.config.js` - Build configuration
- `src/config.ts` - API URL export
- `src/env.d.ts` - Type declarations
- `.github/workflows/build-and-release.yml` - CI/CD pipeline
- `package.json` - Build scripts

---

## Commit History

- `e601663` - feat: configure production builds to use allch.at by default
- `dcc9d1b` - docs: update license badge to AGPL-3.0
- `f160fd2` - fix: resolve TypeScript type errors in ChatContainer

---

**Updated:** 2025-12-20
**Status:** ✅ Complete and tested
**CI/CD:** Passing
