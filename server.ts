import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import { PrismaClient } from "@prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Prisma 7 requires an explicit driver adapter. SQLite adapter takes the
// datasource URL directly; matches `datasource.url` in `prisma.config.ts`.
const adapter = new PrismaBetterSqlite3({ url: "file:./dev.db" });
const prisma = new PrismaClient({ adapter });

async function seed() {
  const vendorCount = await prisma.vendor.count();
  if (vendorCount === 0) {
    console.log("Seeding PetroShield SOC Intelligence...");

    // Seed Vendors
    const vendors = [
      { id: "OCEANICA_ENG", name: "Oceânica Engenharia", riskScore: 89.0, riskLevel: "CRITICAL", contractValue: 4200000000, accessLevel: "OT" },
      { id: "SA_EXPLORATION", name: "SA Exploration", riskScore: 95.0, riskLevel: "CRITICAL", contractValue: 150000000, accessLevel: "Data" },
      { id: "VALARIS", name: "Valaris", riskScore: 22.0, riskLevel: "LOW", contractValue: 850000000, accessLevel: "IT" },
    ];

    for (const v of vendors) {
      await prisma.vendor.create({ data: v });
    }

    // Seed XR Devices
    const devices = [
      { deviceType: "HoloLens2", assetTag: "PETRO-XR-2047-047", facilityZone: "FPSO_P93", networkSegment: "OT_Isolated", mdmStatus: "kiosk", lat: -23.5505, lng: -46.6333, vendorId: "OCEANICA_ENG" },
      { deviceType: "RealWear", assetTag: "PETRO-XR-2047-088", facilityZone: "REPLAN", networkSegment: "IT_Corporate", mdmStatus: "enrolled", lat: -22.9068, lng: -43.1729, vendorId: "VALARIS" },
      { deviceType: "MetaQuest3", assetTag: "PETRO-XR-2047-012", facilityZone: "REDUC", networkSegment: "OT_Isolated", mdmStatus: "compromised", lat: -22.7208, lng: -43.2728, vendorId: "SA_EXPLORATION" },
      { deviceType: "MagicLeap2", assetTag: "PETRO-XR-2047-099", facilityZone: "P-93", networkSegment: "OT_Isolated", mdmStatus: "kiosk", lat: -25.2048, lng: 55.2708, vendorId: "OCEANICA_ENG" },
    ];

    for (const d of devices) {
      await prisma.xrDevice.create({ data: d });
    }

    // Seed initial Audit Logs
    const dbDevices = await prisma.xrDevice.findMany();
    for (const device of dbDevices) {
      await prisma.promptAuditLog.create({
        data: {
          deviceId: device.id,
          originalQuery: "IA, me dê a configuração da Plataforma P-93 no Poço alfa-bravo, senha master123",
          sanitizedQuery: "IA, me dê a configuração da [ATIVO_RESTRITO] no [ATIVO_RESTRITO], senha [CREDENCIAL_BLOQUEADA]",
          leakPrevented: true,
          redactionCount: 3,
          threatScore: 0.35,
          action: "allowed"
        }
      });
    }
  }
}

async function startServer() {
  await seed();
  const app = express();
  const PORT = Number(process.env.PORT) || 3002;

  app.use(express.json());

  // API routes
  app.get("/api/health", async (_req, res) => {
    // CORS: the hub at :3000 fetches this endpoint cross-origin to drive
    // the live status dot on the Relic Shields landing page.
    res.setHeader("Access-Control-Allow-Origin", "*");
    try {
      const [vendors, devices, logs] = await Promise.all([
        prisma.vendor.count(),
        prisma.xrDevice.count(),
        prisma.promptAuditLog.count(),
      ]);
      res.json({
        status: "ok",
        db: "ok",
        counts: { vendors, devices, logs },
        uptime: process.uptime(),
      });
    } catch (e) {
      res.status(503).json({ status: "error", db: "down", error: String(e) });
    }
  });

  app.get("/api/stats", async (req, res) => {
    const leaksPrevented = await prisma.promptAuditLog.count({ where: { leakPrevented: true } });
    const criticalThreats = await prisma.promptAuditLog.count({ where: { threatScore: { gt: 0.8 } } });
    
    res.json({
      threatsBlocked: 1248 + criticalThreats,
      dataSaves: `${(4.2 + (leaksPrevented * 0.1)).toFixed(1)} TB`,
      profitSaved: `$${(12.5 + (leaksPrevented * 0.2)).toFixed(1)}M`,
      activeAgents: 8,
      systemHealth: 99.2,
      dlpPrevention: 99.98
    });
  });

  app.get("/api/threats", async (req, res) => {
    const logs = await prisma.promptAuditLog.findMany({
      include: { device: true },
      orderBy: { timestamp: 'desc' },
      take: 20
    });
    
    res.json(logs.map(l => ({
      id: l.id,
      timestamp: l.timestamp,
      type: l.leakPrevented ? "DLP Breach Attempt" : "System Query",
      severity: l.threatScore > 0.8 ? "critical" : l.threatScore > 0.5 ? "warn" : "info",
      status: l.action === "blocked" ? "Blocked" : "Sanitized",
      location: l.device.facilityZone,
      lat: l.device.lat,
      lng: l.device.lng,
      query: l.sanitizedQuery
    })));
  });

  app.get("/api/vendors", async (req, res) => {
    const vendors = await prisma.vendor.findMany({
      include: { xrDevices: true }
    });
    res.json(vendors);
  });

  app.post("/api/threats/simulate", async (req, res) => {
    const devices = await prisma.xrDevice.findMany();
    const randomDevice = devices[Math.floor(Math.random() * devices.length)];
    
    const queries = [
      { q: "Execute Modbus FC16 no controlador da bomba B-101", s: "Execute [COMANDO_OT_BLOQUEADO] no controlador da bomba B-101", leak: true, score: 0.98, action: "escalated", tech: "T0831" },
      { q: "Qual a produção do Poço Tupi-10 hoje?", s: "Qual a produção do [ATIVO_RESTRITO] hoje?", leak: true, score: 0.45, action: "allowed", tech: "T1213" },
      { q: "Acesso ao servidor master com login admin", s: "Acesso ao servidor master com login [CREDENCIAL_BLOQUEADA]", leak: true, score: 0.88, action: "blocked", tech: "T1078" },
      { q: "Status da rede OT na FPSO P-93", s: "Status da rede OT na [ATIVO_RESTRITO]", leak: true, score: 0.3, action: "allowed", tech: null }
    ];

    const randomQuery = queries[Math.floor(Math.random() * queries.length)];

    const newLog = await prisma.promptAuditLog.create({
      data: {
        deviceId: randomDevice.id,
        originalQuery: randomQuery.q,
        sanitizedQuery: randomQuery.s,
        leakPrevented: randomQuery.leak,
        redactionCount: 1,
        threatScore: randomQuery.score,
        action: randomQuery.action,
        mitreTechnique: randomQuery.tech
      },
      include: { device: true }
    });

    res.json(newLog);
  });

  app.get("/api/agents/:id/logs", async (req, res) => {
    const { id } = req.params;
    const logs = [
      { timestamp: new Date().toISOString(), action: "Scanning network segment", status: "Success", details: `Agent ${id} completed segment scan.` },
      { timestamp: new Date(Date.now() - 1000 * 60 * 5).toISOString(), action: "Analyzing packet headers", status: "Success", details: "No anomalies detected." },
      { timestamp: new Date(Date.now() - 1000 * 60 * 15).toISOString(), action: "Updating threat signatures", status: "Success", details: "Signatures synchronized with global DB." },
      { timestamp: new Date(Date.now() - 1000 * 60 * 60).toISOString(), action: "Self-diagnostic check", status: "Success", details: "All systems operational." },
    ];
    res.json(logs);
  });

  app.get("/api/charts/scada-health", (req, res) => {
    const assets = ["FPSO_P93", "REPLAN", "REDUC", "P-93"];
    const hours = Array.from({ length: 24 }, (_, i) => {
      const hour = (new Date().getHours() - (23 - i) + 24) % 24;
      return `${hour.toString().padStart(2, '0')}:00`;
    });

    const data = hours.map(time => {
      const entry: any = { name: time };
      assets.forEach(asset => {
        // Generate a health score between 95 and 100, with occasional dips
        let score = 98 + Math.random() * 2;
        if (Math.random() > 0.9) score -= 5 + Math.random() * 10;
        entry[asset] = Number(score.toFixed(1));
      });
      return entry;
    });

    res.json(data);
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`PetroShield SOC Server running on http://localhost:${PORT}`);
  });
}

startServer().catch(console.error);
