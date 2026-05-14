import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { createHash } from "node:crypto";
import { z } from "zod";
import pino from "pino";
import { prisma } from "@legacyx/db";
import {
  generateIntakeSummary,
  generateVoiceNote,
  analyzeVision,
  aiProviderName,
} from "./providers";

const log = pino({
  level: process.env.LOG_LEVEL ?? "info",
  base: { service: "ai-service" },
  transport:
    process.env.NODE_ENV === "production"
      ? undefined
      : { target: "pino-pretty", options: { colorize: true, translateTime: "HH:MM:ss" } },
});

const PORT = Number(process.env.AI_SERVICE_PORT ?? 3002);

const BaseHeaders = z.object({
  "x-tenant-id": z.string().min(1),
  "x-branch-id": z.string().optional(),
});

const IntakeBody = z.object({
  ref_id: z.string().optional(),
  symptoms: z.string().min(1),
  history: z.string().optional(),
});

const VoiceBody = z.object({
  ref_id: z.string().optional(),
  transcript: z.string().min(1),
  locale: z.string().optional(),
});

const VisionBody = z.object({
  ref_id: z.string().optional(),
  // The image bytes — base64 (no `data:` prefix) — and its mime type.
  image_base64: z.string().min(64),
  mime_type: z.enum(["image/jpeg", "image/png", "image/webp"]),
  context: z.string().optional(),
  kind: z.enum(["BEFORE", "AFTER", "OTHER"]).optional(),
});

async function readJson(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"));
      } catch (e) {
        reject(e);
      }
    });
    req.on("error", reject);
  });
}

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,POST,OPTIONS",
  "access-control-allow-headers": "content-type,x-tenant-id,x-branch-id",
};

function json(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    ...CORS,
  });
  res.end(JSON.stringify(body));
}

function hashInput(obj: unknown): string {
  return createHash("sha256").update(JSON.stringify(obj)).digest("hex");
}

function parseHeaders(req: IncomingMessage) {
  return BaseHeaders.parse({
    "x-tenant-id": req.headers["x-tenant-id"],
    "x-branch-id": req.headers["x-branch-id"],
  });
}

const server = createServer(async (req, res) => {
  if (req.method === "OPTIONS") {
    res.writeHead(204, CORS);
    res.end();
    return;
  }
  const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
  const route = `${req.method} ${url.pathname}`;
  try {
    if (route === "GET /health") {
      return json(res, 200, { status: "ok", provider: aiProviderName() });
    }

    if (route === "POST /ai/intake/summary") {
      const headers = parseHeaders(req);
      const body = IntakeBody.parse(await readJson(req));
      const draft = await generateIntakeSummary(body);
      const provider = aiProviderName();
      const row = await prisma.aIDraft.create({
        data: {
          tenantId: headers["x-tenant-id"],
          branchId: headers["x-branch-id"] ?? null,
          type: "INTAKE_SUMMARY",
          refType: body.ref_id ? "VISIT" : null,
          refId: body.ref_id ?? null,
          inputHash: hashInput(body),
          modelName: provider === "gemini" ? "gemini-1.5-flash" : "heuristic-intake",
          modelVersion: provider === "gemini" ? "v1" : "0.0.1",
          draft,
          status: "PENDING",
        },
      });
      log.info({ id: row.id, type: row.type, provider }, "intake draft");
      return json(res, 201, { data: row, provider });
    }

    if (route === "POST /ai/voice/note") {
      const headers = parseHeaders(req);
      const body = VoiceBody.parse(await readJson(req));
      const draft = await generateVoiceNote(body);
      const provider = aiProviderName();
      const row = await prisma.aIDraft.create({
        data: {
          tenantId: headers["x-tenant-id"],
          branchId: headers["x-branch-id"] ?? null,
          type: "VOICE_TO_NOTE",
          refType: body.ref_id ? "EMR" : null,
          refId: body.ref_id ?? null,
          inputHash: hashInput(body),
          modelName: provider === "gemini" ? "gemini-1.5-flash" : "heuristic-voice",
          modelVersion: provider === "gemini" ? "v1" : "0.0.1",
          draft,
          status: "PENDING",
        },
      });
      log.info({ id: row.id, type: row.type, provider }, "voice draft");
      return json(res, 201, { data: row, provider });
    }

    if (route === "POST /ai/vision/analyze") {
      const headers = parseHeaders(req);
      const body = VisionBody.parse(await readJson(req));
      const draft = await analyzeVision(body);
      const provider = aiProviderName();
      // Don't store the base64 in the inputHash payload — too large + irrelevant
      // to idempotency. Hash on (ref_id, kind, context) + sha-of-image instead.
      const imgHash = createHash("sha256").update(body.image_base64).digest("hex");
      const row = await prisma.aIDraft.create({
        data: {
          tenantId: headers["x-tenant-id"],
          branchId: headers["x-branch-id"] ?? null,
          type: "VISION_REPORT",
          refType: body.ref_id ? "PATIENT_PHOTO" : null,
          refId: body.ref_id ?? null,
          inputHash: hashInput({
            ref_id: body.ref_id,
            kind: body.kind,
            context: body.context,
            img: imgHash,
          }),
          modelName: provider === "gemini" ? "gemini-1.5-flash-vision" : "heuristic-vision",
          modelVersion: provider === "gemini" ? "v1" : "0.0.1",
          draft,
          status: "PENDING",
        },
      });
      log.info({ id: row.id, kind: body.kind, provider }, "vision draft");
      return json(res, 201, { data: row, provider });
    }

    return json(res, 404, { error: "not found" });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return json(res, 422, { error: "validation", details: err.flatten() });
    }
    log.error({ err }, "request failed");
    return json(res, 500, { error: "internal" });
  }
});

server.listen(PORT, () => {
  log.info({ port: PORT }, "🤖 AI service listening");
});

const shutdown = () => {
  log.info("shutting down");
  server.close(() => process.exit(0));
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
