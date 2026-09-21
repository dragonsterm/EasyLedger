# EasyLedger Web Frontend (`apps/web`)

Vite + React + TypeScript single-page application (SPA) for EasyLedger.

## Architecture & Location
- **Location**: `apps/web`
- **Framework**: React 18 + TypeScript + Vite
- **Target Deployment**: Render Static Site (`apps/web` root directory, publish directory `dist`, rewrite rule `/* -> /index.html`)
- **Backend API**: Proxies `/api` to Fastify backend (`apps/api` on port 3000) during local development.

## Getting Started

```bash
# Navigate to web application directory
cd apps/web

# Install dependencies
npm install

# Start local development server (port 5173)
npm run dev

# Typecheck and build production bundle (output: dist/)
npm run build

# Preview production build locally
npm run preview
```

## Structure
- `index.html`: Entry HTML with responsive viewport.
- `src/main.tsx`: React application entry point.
- `src/App.tsx`: Base application shell containing Ledger, Dashboard, and Catalog navigation plus Voice Agent status.
- `src/index.css`: Baseline clean, neutral layout supporting mobile (390px) to desktop (1280px).
- `vite.config.ts`: Vite build configuration and local `/api` proxy.
