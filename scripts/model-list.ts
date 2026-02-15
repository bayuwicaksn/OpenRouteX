/**
 * parseArgs
 * Parses CLI flags for provider filtering, output format, and proxy targeting.
 * Supports: --provider <name>, --json, --compact, --proxy-url <url>, --port <p>, --include-alias
 */
function parseArgs(argv: string[]) {
  const cfg = {
    provider: null as string | null,
    json: false,
    compact: false,
    proxyUrl: 'http://localhost:3402',
    includeAlias: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--provider' && argv[i + 1]) cfg.provider = argv[++i];
    else if (a === '--json') cfg.json = true;
    else if (a === '--compact') cfg.compact = true;
    else if (a === '--proxy-url' && argv[i + 1]) cfg.proxyUrl = argv[++i];
    else if (a === '--port' && argv[i + 1]) cfg.proxyUrl = `http://localhost:${Number(argv[++i]) || 3402}`;
    else if (a === '--include-alias') cfg.includeAlias = true;
  }
  return cfg;
}

/**
 * ProxyModel
 * Represents a model entry returned by /v1/models.
 */
type ProxyModel = {
  id: string;
  object?: string;
  created?: number;
  owned_by: string;
  name: string;
  capabilities?: string[];
  free?: boolean;
  context_window?: number;
  pricing?: { input?: number; output?: number };
};

/**
 * fetchModels
 * Fetches models from the proxy and returns them as a list.
 */
async function fetchModels(proxyUrl: string): Promise<ProxyModel[]> {
  const res = await fetch(`${proxyUrl}/v1/models`, { method: 'GET' });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`HTTP ${res.status}: ${t}`);
  }
  const json = await res.json();
  const arr = Array.isArray(json?.data) ? (json.data as ProxyModel[]) : [];
  return arr;
}

/**
 * isAliasModel
 * Determines whether an entry is an alias, based on its name.
 * Aliases are labeled using the suffix "(Alias)" by the aggregator.
 */
function isAliasModel(m: ProxyModel): boolean {
  const nm = String(m?.name ?? '');
  return nm.includes('(Alias)');
}

/**
 * uniqueByName
 * Deduplicates a list of models by their display name, preserving first occurrence.
 */
function uniqueByName(list: ProxyModel[]): ProxyModel[] {
  const seen = new Set<string>();
  const out: ProxyModel[] = [];
  for (const m of list) {
    const nm = String(m?.name ?? '');
    if (seen.has(nm)) continue;
    seen.add(nm);
    out.push(m);
  }
  return out;
}

/**
 * pad
 * Pads strings to a fixed width for table alignment.
 */
function pad(str: string, len: number): string {
  const s = String(str ?? '');
  if (s.length >= len) return s.slice(0, len);
  return s + ' '.repeat(len - s.length);
}

/**
 * formatCapabilities
 * Formats capability list as a short comma-separated string.
 */
function formatCapabilities(caps?: string[]): string {
  if (!Array.isArray(caps)) return '';
  return caps.join(', ');
}

/**
 * groupByProvider
 * Groups models by provider (owned_by).
 */
function groupByProvider(models: ProxyModel[]): Map<string, ProxyModel[]> {
  const map = new Map<string, ProxyModel[]>();
  for (const m of models) {
    const key = String(m?.owned_by ?? 'unknown');
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(m);
  }
  return map;
}

/**
 * printTable
 * Renders a formatted table with selected columns; supports compact mode.
 */
function printTable(models: ProxyModel[], compact: boolean) {
  const header = compact
    ? ['Provider', 'Name', 'ID']
    : ['Provider', 'Name', 'ID', 'Capabilities', 'Ctx', 'Pricing'];
  const widths = compact ? [16, 28, 34] : [16, 28, 34, 24, 8, 16];
  const line = header.map((h, i) => pad(h, widths[i])).join('  ');
  console.log(line);
  console.log('-'.repeat(line.length));
  for (const m of models) {
    const provider = m?.owned_by ?? '';
    const name = m?.name ?? '';
    const id = m?.id ?? '';
    const caps = formatCapabilities(m?.capabilities);
    const ctx = m?.context_window ?? '';
    const pricingIn = m?.pricing?.input;
    const pricingOut = m?.pricing?.output;
    const priceStr = pricingIn != null && pricingOut != null ? `$${pricingIn}/$${pricingOut}` : '';
    const cols = compact
      ? [provider, name, id]
      : [provider, name, id, caps, ctx, priceStr];
    console.log(cols.map((c, i) => pad(String(c), widths[i])).join('  '));
  }
}

/**
 * printByProvider
 * Prints grouped models with a heading per provider and a formatted table.
 */
function printByProvider(grouped: Map<string, ProxyModel[]>, compact: boolean) {
  const providers = [...grouped.keys()].sort();
  for (const p of providers) {
    const list = (grouped.get(p) ?? []).sort((a, b) => String(a.name).localeCompare(String(b.name)));
    console.log(`\n# ${p}`);
    printTable(list, compact);
  }
}

/**
 * main
 * Orchestrates parsing, fetching, filtering (alias + unique-by-name), and output.
 */
async function main() {
  const cfg = parseArgs(process.argv.slice(2));
  const models = await fetchModels(cfg.proxyUrl);

  let filtered = cfg.provider
    ? models.filter(m => String(m?.owned_by ?? '') === cfg.provider)
    : models.slice();

  if (!cfg.includeAlias) {
    filtered = filtered.filter(m => !isAliasModel(m));
  }

  filtered = uniqueByName(filtered);

  filtered.sort((a, b) => {
    const ap = String(a?.owned_by ?? '');
    const bp = String(b?.owned_by ?? '');
    const an = String(a?.name ?? '');
    const bn = String(b?.name ?? '');
    return ap === bp ? an.localeCompare(bn) : ap.localeCompare(bp);
  });

  if (cfg.json) {
    console.log(JSON.stringify(filtered, null, 2));
    return;
  }

  const grouped = groupByProvider(filtered);
  printByProvider(grouped, cfg.compact);
}

/**
 * run
 * Entrypoint wrapper to execute main and report errors cleanly.
 */
function run() {
  main().catch(err => {
    console.error('Error:', err?.message || String(err));
    process.exit(1);
  });
}

run();
