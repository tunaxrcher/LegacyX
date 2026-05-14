import { createServer, type Server } from "node:http";
import { prisma } from "@legacyx/db";
import { logger } from "./logger";

/**
 * Minimal Prometheus text-format metrics collector — zero external deps.
 *
 * Same shape as `apps/api-server/src/shared/metrics.ts`. We deliberately keep
 * a second copy here because both apps run separately and have different
 * metric sets — sharing via a package would just couple their release
 * cadences. When we migrate to OpenTelemetry SDK (Phase 9.1+), both will
 * import from a shared `@legacyx/otel` package.
 */

type Labels = Record<string, string | number | undefined>;
function labelKey(labels: Labels): string {
  const parts: string[] = [];
  for (const k of Object.keys(labels).sort()) {
    const v = labels[k];
    if (v === undefined) continue;
    parts.push(`${k}="${String(v).replace(/"/g, '\\"')}"`);
  }
  return parts.join(",");
}
function fmtLabels(labels: Labels): string {
  const k = labelKey(labels);
  return k ? `{${k}}` : "";
}

class Counter {
  private vals = new Map<string, number>();
  constructor(public name: string, public help: string) {}
  inc(labels: Labels = {}, by = 1) {
    const k = labelKey(labels);
    this.vals.set(k, (this.vals.get(k) ?? 0) + by);
  }
  render(): string {
    const lines = [`# HELP ${this.name} ${this.help}`, `# TYPE ${this.name} counter`];
    if (this.vals.size === 0) lines.push(`${this.name} 0`);
    else
      for (const [k, v] of this.vals) {
        lines.push(`${this.name}${k ? `{${k}}` : ""} ${v}`);
      }
    return lines.join("\n");
  }
}
class Gauge {
  private vals = new Map<string, number>();
  constructor(public name: string, public help: string) {}
  set(value: number, labels: Labels = {}) {
    this.vals.set(labelKey(labels), value);
  }
  render(): string {
    const lines = [`# HELP ${this.name} ${this.help}`, `# TYPE ${this.name} gauge`];
    if (this.vals.size === 0) lines.push(`${this.name} 0`);
    else
      for (const [k, v] of this.vals) {
        lines.push(`${this.name}${k ? `{${k}}` : ""} ${v}`);
      }
    return lines.join("\n");
  }
}
class Histogram {
  private buckets: number[];
  private samples = new Map<
    string,
    { counts: number[]; sum: number; count: number; labels: Labels }
  >();
  constructor(
    public name: string,
    public help: string,
    buckets: number[] = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  ) {
    this.buckets = buckets;
  }
  observe(value: number, labels: Labels = {}) {
    const k = labelKey(labels);
    let s = this.samples.get(k);
    if (!s) {
      s = { counts: new Array(this.buckets.length).fill(0), sum: 0, count: 0, labels };
      this.samples.set(k, s);
    }
    s.sum += value;
    s.count += 1;
    for (let i = 0; i < this.buckets.length; i++) {
      if (value <= this.buckets[i]!) s.counts[i]! += 1;
    }
  }
  render(): string {
    const lines = [`# HELP ${this.name} ${this.help}`, `# TYPE ${this.name} histogram`];
    if (this.samples.size === 0) return lines.concat([`${this.name}_sum 0`, `${this.name}_count 0`]).join("\n");
    for (const s of this.samples.values()) {
      for (let i = 0; i < this.buckets.length; i++) {
        const le = this.buckets[i]!;
        lines.push(`${this.name}_bucket${fmtLabels({ ...s.labels, le: String(le) })} ${s.counts[i]}`);
      }
      lines.push(`${this.name}_bucket${fmtLabels({ ...s.labels, le: "+Inf" })} ${s.count}`);
      lines.push(`${this.name}_sum${fmtLabels(s.labels)} ${s.sum}`);
      lines.push(`${this.name}_count${fmtLabels(s.labels)} ${s.count}`);
    }
    return lines.join("\n");
  }
}

class Registry {
  counters: Counter[] = [];
  gauges: Gauge[] = [];
  histograms: Histogram[] = [];
  counter(name: string, help: string) {
    const c = new Counter(name, help);
    this.counters.push(c);
    return c;
  }
  gauge(name: string, help: string) {
    const g = new Gauge(name, help);
    this.gauges.push(g);
    return g;
  }
  histogram(name: string, help: string, buckets?: number[]) {
    const h = new Histogram(name, help, buckets);
    this.histograms.push(h);
    return h;
  }
  render(): string {
    const parts: string[] = [];
    for (const c of this.counters) parts.push(c.render());
    for (const g of this.gauges) parts.push(g.render());
    for (const h of this.histograms) parts.push(h.render());
    parts.push(processMetrics());
    return parts.join("\n") + "\n";
  }
}

function processMetrics(): string {
  const mem = process.memoryUsage();
  return [
    "# HELP process_uptime_seconds Process uptime in seconds",
    "# TYPE process_uptime_seconds gauge",
    `process_uptime_seconds ${process.uptime()}`,
    "# HELP nodejs_heap_used_bytes Node.js heap used in bytes",
    "# TYPE nodejs_heap_used_bytes gauge",
    `nodejs_heap_used_bytes ${mem.heapUsed}`,
    "# HELP nodejs_rss_bytes Node.js RSS in bytes",
    "# TYPE nodejs_rss_bytes gauge",
    `nodejs_rss_bytes ${mem.rss}`,
  ].join("\n");
}

export const registry = new Registry();

// Worker-specific metric families.
export const handlerRuns = registry.counter(
  "legacyx_worker_handler_runs_total",
  "Total handler invocations (by event_name + handler + outcome)",
);
export const handlerDuration = registry.histogram(
  "legacyx_worker_handler_duration_seconds",
  "Handler execution duration in seconds",
);
export const queueDepth = registry.gauge(
  "legacyx_worker_queue_depth",
  "BullMQ events queue depth",
);
export const outboxPending = registry.gauge(
  "legacyx_worker_outbox_pending",
  "Number of PENDING rows in the outbox_events table",
);
export const dlqDepth = registry.gauge(
  "legacyx_worker_dlq_depth",
  "Number of NEW rows in the dead-letter table",
);
export const notificationsSent = registry.counter(
  "legacyx_worker_notifications_sent_total",
  "Notifications dispatched by the notification layer (by channel + status)",
);
export const cronRuns = registry.counter(
  "legacyx_worker_cron_runs_total",
  "CRM cron job runs (by job + outcome)",
);
export const cronEnqueued = registry.counter(
  "legacyx_worker_cron_enqueued_total",
  "Notifications enqueued by CRM cron (by job)",
);

let server: Server | null = null;

/** Start the metrics HTTP server. Listens on `METRICS_PORT` (default 9464). */
export function startMetricsServer() {
  const port = Number(process.env.METRICS_PORT ?? 9464);
  const expected = process.env.METRICS_BEARER_TOKEN;
  server = createServer(async (req, res) => {
    if (req.url === "/healthz") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ status: "ok", uptime: process.uptime() }));
      return;
    }
    if (req.url === "/readyz") {
      // Readiness = "can this worker actually process jobs right now?"
      // We probe the DB; Redis health is implicit because BullMQ disconnect
      // would have already failed previous jobs and incremented dlqDepth.
      try {
        await prisma.$queryRawUnsafe("SELECT 1");
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ status: "ready", db: "ok" }));
      } catch (err) {
        res.writeHead(503, { "content-type": "application/json" });
        res.end(
          JSON.stringify({
            status: "not_ready",
            db: "fail",
            error: err instanceof Error ? err.message : String(err),
          }),
        );
      }
      return;
    }
    if (req.url !== "/metrics") {
      res.writeHead(404);
      res.end("not found");
      return;
    }
    if (expected) {
      const auth = req.headers.authorization ?? "";
      const token = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7) : "";
      if (token !== expected) {
        res.writeHead(403);
        res.end("forbidden");
        return;
      }
    }
    res.writeHead(200, {
      "content-type": "text/plain; version=0.0.4; charset=utf-8",
      "cache-control": "no-store",
    });
    res.end(registry.render());
  });
  server.listen(port, () => {
    logger.info({ port }, "📊 metrics + health server listening");
  });
  return server;
}

export async function stopMetricsServer() {
  if (!server) return;
  await new Promise<void>((resolve) => server!.close(() => resolve()));
  server = null;
}
