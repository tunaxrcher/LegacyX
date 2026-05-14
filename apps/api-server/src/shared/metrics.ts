/**
 * Minimal Prometheus text-format metrics collector — zero external deps.
 *
 * Why not `prom-client`? We want the same code to run in api-server (Next.js
 * edge runtime restrictions) and worker-engine (Node) without pulling a heavy
 * SDK. The exposition format is text — we just hand-roll it.
 *
 * Scope of v1:
 *   - Counter (monotonic increment)
 *   - Gauge (set to a value)
 *   - Histogram (buckets + sum + count)
 * Phase 9.1+ can swap to OpenTelemetry SDK with OTLP exporter; the same
 * metric *names* will be preserved.
 */

type Labels = Record<string, string | number | undefined>;

function labelKey(labels: Labels): string {
  const parts: string[] = [];
  const keys = Object.keys(labels).sort();
  for (const k of keys) {
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
  private values = new Map<string, number>();
  constructor(public name: string, public help: string) {}
  inc(labels: Labels = {}, by = 1) {
    const k = labelKey(labels);
    this.values.set(k, (this.values.get(k) ?? 0) + by);
  }
  render(): string {
    const lines: string[] = [`# HELP ${this.name} ${this.help}`, `# TYPE ${this.name} counter`];
    if (this.values.size === 0) lines.push(`${this.name} 0`);
    else
      for (const [k, v] of this.values) {
        lines.push(`${this.name}${k ? `{${k}}` : ""} ${v}`);
      }
    return lines.join("\n");
  }
}

class Gauge {
  private values = new Map<string, number>();
  constructor(public name: string, public help: string) {}
  set(value: number, labels: Labels = {}) {
    this.values.set(labelKey(labels), value);
  }
  inc(labels: Labels = {}, by = 1) {
    const k = labelKey(labels);
    this.values.set(k, (this.values.get(k) ?? 0) + by);
  }
  dec(labels: Labels = {}, by = 1) {
    this.inc(labels, -by);
  }
  render(): string {
    const lines: string[] = [`# HELP ${this.name} ${this.help}`, `# TYPE ${this.name} gauge`];
    if (this.values.size === 0) lines.push(`${this.name} 0`);
    else
      for (const [k, v] of this.values) {
        lines.push(`${this.name}${k ? `{${k}}` : ""} ${v}`);
      }
    return lines.join("\n");
  }
}

class Histogram {
  // Default buckets in seconds — sane for HTTP and worker handler latency.
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
    const lines: string[] = [
      `# HELP ${this.name} ${this.help}`,
      `# TYPE ${this.name} histogram`,
    ];
    if (this.samples.size === 0) {
      for (const b of this.buckets) {
        lines.push(`${this.name}_bucket{le="${b}"} 0`);
      }
      lines.push(`${this.name}_bucket{le="+Inf"} 0`);
      lines.push(`${this.name}_sum 0`);
      lines.push(`${this.name}_count 0`);
      return lines.join("\n");
    }
    for (const s of this.samples.values()) {
      for (let i = 0; i < this.buckets.length; i++) {
        const le = this.buckets[i]!;
        const extra = { ...s.labels, le: String(le) };
        lines.push(`${this.name}_bucket${fmtLabels(extra)} ${s.counts[i]}`);
      }
      lines.push(
        `${this.name}_bucket${fmtLabels({ ...s.labels, le: "+Inf" })} ${s.count}`,
      );
      lines.push(`${this.name}_sum${fmtLabels(s.labels)} ${s.sum}`);
      lines.push(`${this.name}_count${fmtLabels(s.labels)} ${s.count}`);
    }
    return lines.join("\n");
  }
}

// =============================================================================
// Registry + builtin metrics
// =============================================================================

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
    const sections: string[] = [];
    for (const c of this.counters) sections.push(c.render());
    for (const g of this.gauges) sections.push(g.render());
    for (const h of this.histograms) sections.push(h.render());
    sections.push(processMetrics());
    return sections.join("\n") + "\n";
  }
}

function processMetrics(): string {
  const mem = process.memoryUsage();
  const uptime = process.uptime();
  return [
    "# HELP process_uptime_seconds Process uptime in seconds",
    "# TYPE process_uptime_seconds gauge",
    `process_uptime_seconds ${uptime}`,
    "# HELP nodejs_heap_used_bytes Node.js heap used in bytes",
    "# TYPE nodejs_heap_used_bytes gauge",
    `nodejs_heap_used_bytes ${mem.heapUsed}`,
    "# HELP nodejs_heap_total_bytes Node.js heap total in bytes",
    "# TYPE nodejs_heap_total_bytes gauge",
    `nodejs_heap_total_bytes ${mem.heapTotal}`,
    "# HELP nodejs_rss_bytes Node.js RSS in bytes",
    "# TYPE nodejs_rss_bytes gauge",
    `nodejs_rss_bytes ${mem.rss}`,
  ].join("\n");
}

export const registry = new Registry();
