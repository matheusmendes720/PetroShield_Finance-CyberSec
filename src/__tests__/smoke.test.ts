import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * PetroShield Finance-CyberSec — smoke test.
 *
 * Verifies the Express server is wired up to the right port, the Prisma 7
 * driver adapter is in place, and the hub-facing /api/health route is
 * present. Runs in CI on every PR.
 */

describe('Finance server.ts', () => {
  const serverPath = resolve(process.cwd(), 'server.ts')
  const src = readFileSync(serverPath, 'utf-8')

  it('reads PORT from process.env with 3002 default', () => {
    expect(src).toMatch(/process\.env\.PORT/)
    expect(src).toMatch(/Number\(process\.env\.PORT\)\s*\|\|\s*3002/)
  })

  it('uses the Prisma 7 driver adapter (not the legacy engine)', () => {
    expect(src).toMatch(/import\s+\{[^}]*PrismaBetterSqlite3[^}]*\}\s+from\s+['"]@prisma\/adapter-better-sqlite3['"]/)
    expect(src).toMatch(/new PrismaClient\(\s*\{\s*adapter/)
  })

  it('exposes /api/health with CORS for the hub', () => {
    expect(src).toMatch(/app\.get\(['"]\/api\/health['"]/)
    expect(src).toMatch(/Access-Control-Allow-Origin/)
  })

  it('binds on 0.0.0.0 so the hub iframe can reach it', () => {
    expect(src).toMatch(/app\.listen\([^,]+,\s*['"]0\.0\.0\.0['"]/)
  })
})
