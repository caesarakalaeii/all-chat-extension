# Technology Stack

**Analysis Date:** 2026-03-12

## Languages

**Primary:**
- TypeScript 5.3.3 - Source code, components, and configuration
- JSX/TSX 18.3.0 - React component syntax

**Secondary:**
- JavaScript (ES2020 target) - Compiled output
- CSS 3 - Styling with PostCSS processing
- JSON - Configuration and manifest files

## Runtime

**Environment:**
- Chrome Browser (Manifest V3)
- Firefox (via Manifest V3 compatibility)
- Node.js 18+ (development only)

**Platform:**
- Browser Extension (WebExtension API)
- DOM API (content script injection)
- WebSocket API (real-time chat connection)

## Frameworks

**Core:**
- React 18.3.0 - UI component framework for chat interface
- TypeScript 5.3.3 - Type-safe development

**Build/Dev:**
- Webpack 5.89.0 - Module bundler
- ts-loader 9.5.0 - TypeScript compilation in webpack
- PostCSS 8.4.33 - CSS processing pipeline
- Autoprefixer 10.4.17 - CSS vendor prefix generation
- Tailwind CSS 3.4.1 - Utility-first CSS framework
- tailwind-merge 2.2.0 - Tailwind class deduplication

**Testing:**
- Playwright 1.57.0 - Browser testing framework (@playwright/test)

**Development Tools:**
- ESLint 9.39.2 - Code linting
- @typescript-eslint/eslint-plugin 8.50.0 - TypeScript ESLint rules
- @typescript-eslint/parser 8.50.0 - TypeScript parsing for ESLint

## Key Dependencies

**Critical:**
- react 18.3.0 - UI rendering
- react-dom 18.3.0 - DOM rendering for React
- clsx 2.1.0 - Conditional CSS class utilities

**Infrastructure:**
- @types/chrome 0.0.254 - Chrome API TypeScript definitions
- @types/react 18.3.0 - React TypeScript definitions
- @types/react-dom 18.3.0 - React DOM TypeScript definitions
- @types/node 25.0.3 - Node.js TypeScript definitions
- copy-webpack-plugin 11.0.0 - Asset copying in webpack
- html-webpack-plugin 5.5.3 - HTML generation for bundled assets
- style-loader 3.3.3 - CSS injection into DOM
- css-loader 6.8.1 - CSS module loading
- postcss-loader 7.3.3 - PostCSS compilation in webpack
- webpack-cli 5.1.4 - Webpack command-line interface

## Configuration

**Environment:**
- API_URL injected via webpack DefinePlugin at build time
- Production default: `https://allch.at`
- Development default: `http://localhost:8080`
- Configuration: `src/config.ts`

**Build:**
- Webpack config: `webpack.config.js`
- TypeScript config: `tsconfig.json`
  - Target: ES2020
  - Module: ESNext
  - JSX: react-jsx
  - Path alias: `@/*` → `src/*`
  - Strict mode enabled

**Storage:**
- Chrome Storage API (sync and local)
- No external database required

## Platform Requirements

**Development:**
- Node.js 18+ (npm)
- npm 8+ (package manager)
- Git for version control
- Modern browser with extension development tools (Chrome DevTools, Firefox about:debugging)

**Production:**
- Chrome browser or Firefox
- Manifest V3 compatible browser
- Internet connection for API communication

**Scripts:**
```bash
npm run build        # Production webpack build
npm run dev          # Development webpack watch mode
npm run type-check   # TypeScript no-emit check
npm run lint         # ESLint validation
npm run package      # Build + create distribution zip
```

---

*Stack analysis: 2026-03-12*
