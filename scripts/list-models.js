/**
 * parseArgs
 * Parses CLI arguments for formatting options and provider filtering.
 * Supports: --provider <name>, --json, --compact, --proxy-url <url>, --port <p>
 */
function parseArgs(argv) {
  const cfg = {
    provider: null,
    json: false,
    compact: false,
    proxyUrl: 'http://localhost:3402',
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--provider' && argv[i + 1]) cfg.provider = argv[++i];
    else if (a === '--json') cfg.json = true;
    else if (a === '--compact') cfg.compact = true;
    else if (a === '--proxy-url' && argv[i + 1]) cfg.proxyUrl = argv[++i];
    else if (a === '--port' && argv[i + 1]) cfg.proxyUrl = `http://localhost:${Number(argv[++i]) || 3402}`;
  }
  return cfg;
}

/**
 * fetchModels
 * Fetches the model list from the proxy /v1/models endpoint and returns an array.
 */
async function fetchModels(proxyUrl) {
  const res = await fetch(`${proxyUrl}/v1/models`, { method: 'GET' });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`HTTP ${res.status}: ${t}`);
  }
  const json = await res.json();
  const arr = Array.isArray(json?.data) ? json.data : [];
  return arr;
}

/**
 * pad
 * Pads a string to a fixed length for table formatting.
 */
function pad(str, len) {
  const s = String(str ?? '');
  if (s.length >= len) return s.slice(0, len);
  return s + ' '.repeat(len - s.length);
}

/**
 * formatCapabilities
 * Formats an array of capabilities into a short, comma-separated string.
 */
function formatCapabilities(caps) {
  if (!Array.isArray(caps)) return '';
  return caps.join(', ');
}

/**
 * groupByProvider
 * Groups model entries by their owned_by field (provider name).
 */
function groupByProvider(models) {
  const map = new Map();
  for (const m of models) {
    const key = m?.owned_by ?? 'unknown';
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(m);
  }
  return map;
}

/**
 * printTable
 * Prints a formatted table of models with selected columns.
 */
function printTable(models, compact) {
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
    console.log(cols.map((c, i) => pad(c, widths[i])).join('  '));
  }
}

/**
 * printByProvider
 * Prints models grouped by provider with headings.
 */
function printByProvider(grouped, compact) {
  const providers = [...grouped.keys()].sort();
  for (const p of providers) {
    const list = grouped.get(p).sort((a, b) => String(a.name).localeCompare(String(b.name)));
    console.log(`\n# ${p}`);
    printTable(list, compact);
  }
}

/**
 * main
 * Entry point: fetches models, applies filters, and prints either JSON or formatted table.
 */
async function main() {
  const cfg = parseArgs(process.argv.slice(2));
  const models = await fetchModels(cfg.proxyUrl);
  let filtered = models;
  if (cfg.provider) {
    filtered = models.filter(m => (m?.owned_by ?? '') === cfg.provider);
  }
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

// Run main unconditionally for direct execution
main().catch(err => {
  console.error('Error:', err?.message || String(err));
  process.exit(1);
});

