# Contributing to alphana

Thank you for your interest in contributing to the `alphana-sdk` SDK! This document covers everything you need to get started.

---

## Package structure

```
packages/tracker/
├── src/
│   ├── index.ts            # Public exports
│   ├── tracker.ts          # UserTracker class
│   ├── heatmap-renderer.ts # renderHeatmap utility
│   ├── core/
│   │   ├── heatmap.ts      # HeatmapPlugin
│   │   ├── logger.ts       # LogCapture
│   │   ├── navigation.ts   # NavigationPlugin
│   │   ├── snapshot.ts     # SnapshotPlugin
│   │   └── time.ts         # TimePlugin
│   ├── react/
│   │   ├── context.tsx     # TrackerContext
│   │   ├── provider.tsx    # UserTrackerProvider
│   │   ├── hooks.ts        # useTracker, usePageView, etc.
│   │   └── index.ts        # React entry exports
│   ├── types/
│   │   └── index.ts        # TrackerConfig, TrackerEvent, etc.
│   └── utils/
│       ├── geo.ts
│       ├── session.ts
│       └── throttle.ts
├── tsup.config.ts          # Build config (dual ESM + CJS)
└── package.json
```

---

## Prerequisites

| Tool | Minimum version |
| ---- | --------------- |
| Node | 18+             |
| pnpm | 9+              |

---

## Local setup

```bash
# 1. Clone the monorepo
git clone https://github.com/teokamalipour/alphana-sdk.git
cd alphana-sdk

# 2. Install all workspace dependencies
pnpm install

# 3. Start the SDK in watch mode
pnpm --filter tracker dev
```

To test against a real backend, also start the backend:

```bash
# requires Docker
docker compose up -d mongo backend
```

---

## Building

```bash
# Build only the SDK
pnpm --filter tracker build

# Build everything
pnpm build
```

The build uses [tsup](https://tsup.egoist.dev) and outputs both ESM and CJS to `dist/`, along with `.d.ts` type declarations.

---

## Code style

- **TypeScript** everywhere — no `any` unless unavoidable.
- **ESLint** + **Prettier** enforced at the workspace root:
  ```bash
  pnpm lint
  pnpm format
  ```
- Keep the bundle small — check `dist/` sizes after building.
- Commits should follow [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `docs:`, `chore:`, etc.).

---

## Submitting a pull request

1. **Fork** the repository and create a branch from `main`:
   ```bash
   git checkout -b feat/your-feature-name
   ```
2. Make your changes inside `packages/tracker/src/`.
3. Verify the build passes: `pnpm --filter tracker build`.
4. Open a PR against `main` with a clear description of what changed and why.
5. Link related issues in the PR description (`Closes #123`).

---

## Reporting bugs

Please [open an issue](https://github.com/teokamalipour/alphana-sdk/issues) and include:

- A minimal reproduction (code snippet or repo link).
- Expected vs. actual behaviour.
- Browser / Node version and OS.

---

## Security vulnerabilities

Do **not** open a public issue for security vulnerabilities. Contact the maintainers directly at the email listed on the GitHub profile.
