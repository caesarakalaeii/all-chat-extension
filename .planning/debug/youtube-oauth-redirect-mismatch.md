---
status: resolved
trigger: "YouTube OAuth is broken — Error 400: redirect_uri_mismatch. The extension is using browser.identity / extension redirect URI instead of routing through the backend."
created: 2026-04-07T00:00:00Z
updated: 2026-04-07T00:00:00Z
---

## Current Focus

hypothesis: CONFIRMED - popup.tsx handleSignIn uses START_AUTH → initiateAuth() which swaps in extension redirect URI; Google rejects unregistered URIs
test: N/A - root cause confirmed
expecting: N/A
next_action: DONE — fix applied and build verified clean

## Symptoms

expected: YouTube OAuth should go through the backend server (like other providers), not use browser.identity extension redirect URIs
actual: Extension uses browser.identity with redirect_uri=https://b47e356b1e8f8a32c482c0285d11563a4b47d2b2.extensions.allizom.org/oauth which causes Error 400: redirect_uri_mismatch
errors: Error 400: redirect_uri_mismatch - "Sie können sich nicht in dieser App anmelden, weil sie nicht den Google-Richtlinien für OAuth 2.0 entspricht."
reproduction: Try to log in to YouTube via the extension
started: Current state - the decision was made early to route OAuth through the backend to avoid managing redirect URIs per extension

## Eliminated

- hypothesis: Content scripts (youtube.ts/twitch.ts) are the source of the broken OAuth
  evidence: Content scripts use DO_LOGIN → initiateAuthUrl() which returns backend URL unmodified; this path is correct
  timestamp: 2026-04-07

## Evidence

- timestamp: 2026-04-07
  checked: popup.tsx handleSignIn()
  found: Uses START_AUTH → chrome.identity.launchWebAuthFlow; the START_AUTH handler calls initiateAuth() which calls getExtensionRedirectURI() and substitutes it into the auth URL before returning it
  implication: Google sees the extension redirect URI (*.extensions.allizom.org/oauth) which is not registered in Google Cloud Console → Error 400

- timestamp: 2026-04-07
  checked: service-worker.ts initiateAuth() vs initiateAuthUrl()
  found: initiateAuth() (used by START_AUTH) swaps redirect_uri to extension URI. initiateAuthUrl() (used by DO_LOGIN) returns backend auth_url unmodified
  implication: Only the popup's handleSignIn() uses the broken path. Content scripts use the working DO_LOGIN path.

- timestamp: 2026-04-07
  checked: backend viewer_auth.go + auth-success frontend page
  found: Backend redirects to allch.at/chat/auth-success?token=...; that page posts ALLCHAT_AUTH_SUCCESS to window.opener
  implication: The working pattern (content script flow) opens a popup window that the auth-success page sends the token back to via postMessage

- timestamp: 2026-04-07
  checked: manifest.json permissions
  found: Extension has "tabs" permission and "https://allch.at/*" in host_permissions
  implication: Service worker can monitor chrome.tabs.onUpdated for the allch.at/chat/auth-success URL to extract token without relying on window.opener

## Resolution

root_cause: popup.tsx handleSignIn() used START_AUTH → initiateAuth() which replaced the backend redirect_uri with the extension's chrome.identity redirect URI. Google and other OAuth providers reject unregistered extension URIs. All three providers (Twitch, YouTube, Kick) were affected — Twitch happened to work only because Twitch's OAuth is more permissive with extension URIs.
fix: Removed START_AUTH, EXCHANGE_CODE, initiateAuth(), exchangeCodeForToken(), and getExtensionRedirectURI() entirely. All three providers now use OPEN_AUTH_TAB in popup.tsx, which delegates to the service worker's openAuthTab() function. The service worker opens a tab to the backend auth URL (redirect_uri unchanged), monitors chrome.tabs.onUpdated for allch.at/chat/auth-success?token=..., stores the token, and broadcasts AUTH_COMPLETE.
verification: npm run build — clean compile, no errors.
files_changed:
  - src/background/service-worker.ts
  - src/popup/popup.tsx
  - src/lib/types/extension.ts
