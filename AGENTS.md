# AGENTS.md

Server-side SOC Intelligence product for **PetroShield / AxeGuard** — finance × cyber analytics, backed by **Express + Prisma + SQLite** with a Vite-served React 19 frontend. The single dev command boots both halves from `server.ts`. This fork lives in the parent `central/` workspace and is committed to its own git repo.

## Setup commands

- Install deps: `npm install`  *(ships its own `package-lock.json`)*
- Set Gemini key (used by client): `GEMINI_API_KEY` in `.env.local`
- Prisma: the SQLite DB is local at `dev.db`. **No `DATABASE_URL` env var is required** — the datasource URL is hardcoded as `file:./dev.db` in `prisma.config.ts:12`. After pulling schema changes:
  ```
  npx prisma generate
  npx prisma migrate dev
  ```
  > `npm install` does **not** trigger `prisma generate`. Because `/src/generated/prisma` is gitignored, a fresh checkout must run `npx prisma generate` manually before `tsx server.ts` will start. Optional workaround: add `"postinstall": "prisma generate"` to `package.json` — **out of scope for this audit, document-only here**.
- Start dev (boots Express + Vite middleware on the same port 3000):
  ```
  npm run dev     # runs `tsx server.ts`
  ```
- Build: `npm run build`  *(Vite only — server runs from TS in dev)*
- Preview: `npm run preview`
- Clean: `npm run clean`  *(runs `rm -rf dist` — POSIX syntax; on PowerShell use `Remove-Item -Recurse -Force dist`, on cmd.exe use `rd /s /q dist`)*
- Lint / typecheck: `npm run lint`  *(alias for `tsc --noEmit`)*
- Test: none configured

## Project layout

```
PetroShield_Finance-CyberSec/
├── prisma.config.ts        # Prisma 7.x config — hardcodes datasource URL, loads dotenv
├── prisma/
│   ├── schema.prisma       # 5 models (see Data model below)
│   └── migrations/         # ⚠️ migration drift — see warning in Data model
├── server.ts               # Express + Prisma + Vite middleware (the dev entry point)
├── src/
│   ├── main.tsx            # React 19 entry point
│   ├── App.tsx             # top-level shell + view switcher
│   ├── components/         # DashboardCharts, ThreatMap, Radar, Terminal, AgentDetailModal
│   └── generated/prisma/   # gitignored — produced by `npx prisma generate`
├── dev.db                  # Local SQLite (gitignored — regenerate via prisma migrate)
├── index.html              # Vite root HTML
├── vite.config.ts          # Vite + @tailwindcss/vite plugin
└── tsconfig.json           # No `"strict": true`; uses Vite template defaults
```

## API surface (defined in `server.ts`)

- `GET  /api/stats` — aggregate counters (threats blocked, profit saved, system health)
- `GET  /api/threats` — recent 20 prompt-audit logs joined with their XR device
- `GET  /api/vendors` — vendor list (with XR devices)
- `POST /api/threats/simulate` — generates a synthetic audit log and persists it
- `GET  /api/agents/:id/logs` — mock agent activity stream
- `GET  /api/charts/scada-health` — 24h health series per facility zone (FPSO_P93, REPLAN, REDUC, P-93)

`POST /api/threats/simulate` is the primary way the UI "lives" — wire it to a button or interval to keep the threat feed refreshing.

## Data model (Prisma)

Five entities defined in `prisma/schema.prisma:14-76`:

- **`XrDevice`** — XR hardware inventory (HoloLens2 / RealWear / MetaQuest3), with facility zone, MDM status, lat/lng.
- **`Vendor`** — Petrobras contractors (Oceânica Engenharia, SA Exploration, Valaris), with risk score & access level.
- **`PromptAuditLog`** — DLP events (original vs sanitized query, redaction count, MITRE technique). The three entities above are seeded on first boot from `server.ts:seed()`.
- **`AuthSession`** — OAuth/biometric auth flow state. **Schema-only** — no seed data, no UI consumer wired yet.
- **`AgentLog`** — agent-runtime eval telemetry. **Schema-only** — no seed data, no UI consumer wired yet. (The current `/api/agents/:id/logs` endpoint returns a synthetic stream, not `AgentLog` rows.)

When editing the seed:

- The redaction enum values (`[ATIVO_RESTRITO]`, `[COMANDO_OT_BLOQUEADO]`, `[CREDENCIAL_BLOQUEADA]`) and MITRE technique IDs (T0831, T1213, T1078) are visible in the dashboard copy — keep them consistent with the strategy docs in `PetroShield-GranPrix_Nacional_2026/`.

### Migration drift warning

The committed migration at `prisma/migrations/20260415203300_init/migration.sql` was authored against an **earlier** schema (only `Asset`, `ThreatEvent`, `AgentLog`) and does **not** match the current `schema.prisma`. On the next `npx prisma migrate dev`, Prisma will offer to reset the DB — accept the reset to regenerate `dev.db` against the current five-model schema. Do **not** delete the stale migration without a co-developer sign-off; it remains the historical record of the earlier model. Regenerating the migration is intentionally **not** part of this audit.

## Env loading

`server.ts` does **not** call `dotenv.config()` directly. The only `dotenv` loader is `import "dotenv/config"` at the top of `prisma.config.ts`, which auto-runs when Prisma loads at server startup. `dotenv` is listed as a direct `dependencies` entry in `package.json` so the import in `prisma.config.ts` resolves even when no transitive consumer pulls it in. If you add new env-driven config (e.g. feature flags), put the loader in `prisma.config.ts` or call `dotenv.config()` explicitly at the top of `server.ts` — do not rely on side-effect imports from other packages.

## Code style

- See the parent workspace `AGENTS.md` for the canonical Node/TypeScript/Tailwind/React style guide (TypeScript strict defaults, Tailwind v4 via `@tailwindcss/vite`, React 19 + functional components + hooks, no ESLint/Prettier — lint is `tsc --noEmit`).
- This sub-repo's deltas vs. the parent guide:
  - `tsconfig.json` does **not** enable `"strict": true` (the Vite template defaults; nothing in this repo adds it back). Write explicit null/undefined checks.
  - **Recharts** drives **all** chart types (bar, area, scatter, line, radial) — see `src/components/DashboardCharts.tsx`.
  - **D3** is used **only** for the geo world-map in `src/components/ThreatMap.tsx` (Mercator projection + GeoJSON graticule). It is **not** used for any non-geo chart.
  - Express handlers are async and return JSON.
  - `npm run lint` is `tsc --noEmit`.

## Security

- `GEMINI_API_KEY` in `.env.local` only — never commit `.env`.
- `dev.db` and `dev.db-journal` are gitignored; do not commit real seed data containing real CPF / asset tags.
- The synthetic `PromptAuditLog.originalQuery` strings contain mock credentials (`senha master123`) by intent, to demonstrate the DLP redaction. Do not replace them with real-looking secrets.
- `@google/genai` is declared in `package.json` and `GEMINI_API_KEY` is wired into `.env.example`, but **no `src/` file imports `@google/genai`** — the dependency and key wiring are reserved for the upcoming agentic-shell integration. Do not add new `@google/genai` calls without updating this note first.

## Branching & commits

- Has its own `.git/` — branch and commit inside this sub-repo.
- Conventional commits where it makes sense (`feat:` / `fix:` / `docs:` / `refactor:`).

## Sub-repo entry point

- `README.md` is the **stock AI Studio scaffold** (hero image + "Run Locally" instructions pointing at `ai.studio/apps/198b7b17-…`). It does not document the Express/Prisma dev server, the SQLite location, the seed step, or the migration drift. **Treat this `AGENTS.md` as the canonical entry point** until `README.md` is rewritten.

## Related sub-projects (sibling, not imported)

- `../AXE-Guard_Muilti_Agents-Shell/` — the Gemini-powered shell half of AxeGuard.
- `../SOC-sys_Dashboard/` — the simulation-only SOC dashboard (no backend, no Gemini).
- `../../PetroShield-GranPrix_Nacional_2026/` — the competition strategy dossier this product is being pitched against.