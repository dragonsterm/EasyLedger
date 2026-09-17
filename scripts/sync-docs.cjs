// Documentation maintenance only: no application or external model calls.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
process.chdir(root);
const gf = require('@sentropic/graphify');
const check = process.argv.includes('--check');
const state = '.graphify';
const manifestPath = `${state}/sync-manifest.json`;
const canvases = ['docs/EasyLedger-Overview.canvas', 'docs/EasyLedger-Knowledge.canvas'];
const sources = ['AGENTS.md', ...fs.readdirSync('docs').filter(f => /^\d{2}-.+\.md$/.test(f)).sort().map(f => `docs/${f}`)];
const inputs = [...sources, ...fs.readdirSync('scripts').filter(f => f.endsWith('.cjs')).sort().map(f => `scripts/${f}`), 'package.json', 'package-lock.json'];
const read = p => fs.readFileSync(p, 'utf8');
// Git and Windows editors may normalize newlines. Hash textual artifacts by content.
const hash = p => crypto.createHash('sha256').update(read(p).replace(/\r\n/g, '\n')).digest('hex');
const hashes = paths => Object.fromEntries(paths.map(p => [p, hash(p)]));
const put = (p, value) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, typeof value === 'string' ? value : JSON.stringify(value, null, 2) + '\n'); };
const fail = message => { throw new Error(message); };
const docs = sources.map(file => ({ file, text: read(file), title: read(file).match(/^# (.+)$/m)?.[1] || file }));
function resolveLink(raw) {
  let target = raw.split('|')[0].split('#')[0].trim();
  if (!target) return null;
  if (!/\.(md|canvas)$/.test(target)) target += '.md';
  return target;
}
function validateLinks() {
  for (const doc of docs) {
    for (const match of doc.text.matchAll(/\[\[([^\]]+)\]\]/g)) {
      const target = resolveLink(match[1]);
      if (target && !sources.includes(target) && !canvases.includes(target)) fail(`Unresolved canonical link in ${doc.file}: ${match[1]}`);
    }
    for (const match of doc.text.matchAll(/\[[^\]]+\]\((docs\/[^)]+\.md)\)/g)) {
      if (!sources.includes(match[1])) fail(`Broken Markdown link in ${doc.file}: ${match[1]}`);
    }
  }
}
function validateCanvas(file) {
  const canvas = JSON.parse(read(file));
  const ids = new Set();
  for (const n of canvas.nodes) {
    if (ids.has(n.id)) fail(`Duplicate node in ${file}: ${n.id}`);
    ids.add(n.id);
    if (![n.x, n.y, n.width, n.height].every(Number.isFinite) || n.width <= 0 || n.height <= 0) fail(`Invalid geometry in ${file}`);
    if (n.type === 'file' && !sources.includes(n.file)) fail(`Missing canvas note ${n.file}`);
  }
  for (const e of canvas.edges) {
    if (ids.has(e.id)) fail(`Duplicate canvas ID ${e.id}`);
    ids.add(e.id);
    if (!canvas.nodes.some(n => n.id === e.fromNode) || !canvas.nodes.some(n => n.id === e.toNode)) fail(`Dangling canvas edge in ${file}`);
  }
  const cards = canvas.nodes.filter(n => n.type === 'file');
  if (new Set(cards.map(n => n.file)).size !== sources.length) fail(`Canvas does not cover every canonical note: ${file}`);
  for (let i = 0; i < cards.length; i++) for (let j = i + 1; j < cards.length; j++) {
    const a = cards[i], b = cards[j];
    if (a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y) fail(`Overlapping file cards: ${file}`);
  }
}
function listFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? listFiles(`${dir}/${e.name}`) : [`${dir}/${e.name}`]).sort();
}
function cli(args) {
  const result = spawnSync(process.execPath, ['node_modules/@sentropic/graphify/dist/cli.js', ...args], { encoding: 'utf8', cwd: root });
  if (result.status !== 0) fail(result.stderr || result.stdout || `Graphify failed: ${args.join(' ')}`);
  return result.stdout;
}
validateLinks();
if (check) {
  if (!fs.existsSync(manifestPath)) fail('No sync manifest; run npm run docs:sync.');
  const manifest = JSON.parse(read(manifestPath));
  if (JSON.stringify(hashes(inputs)) !== JSON.stringify(manifest.inputs)) fail('Canonical inputs changed; run npm run docs:sync.');
  for (const [file, expected] of Object.entries(manifest.outputs)) {
    if (!fs.existsSync(file) || hash(file) !== expected) fail(`Generated artifact missing or changed: ${file}; run npm run docs:sync.`);
  }
  canvases.forEach(validateCanvas);
  const graph = JSON.parse(read(`${state}/graph.json`));
  const ids = new Set(graph.nodes.map(n => n.id));
  if (!ids.size || graph.links.some(e => !ids.has(e.source) || !ids.has(e.target))) fail('Empty or dangling graph.');
  for (const n of graph.nodes) {
    if (!sources.includes(n.source_file)) fail(`Unknown graph source: ${n.source_file}`);
    for (const c of n.citations || []) if (!read(c.source_file).includes(c.quote)) fail(`Citation not grounded: ${n.id}`);
  }
  console.log(cli(['portable-check', state]).trim());
  console.log(`PASS: ${sources.length} canonical notes; ${graph.nodes.length} nodes, ${graph.links.length} relationships; links, citations, canvases and freshness valid.`);
  process.exit(0);
}

fs.mkdirSync(state, { recursive: true });
const extraction = { nodes: [], edges: [], input_tokens: 0, output_tokens: 0 };
const nodeIds = new Set();
const edgeIds = new Set();
const requirementIds = new Map();
const cite = (quote, file, line) => ({ quote, source_file: file, source_location: `line ${line}` });
function addNode(id, label, doc, line, quote, type) {
  if (nodeIds.has(id)) fail(`Duplicate extracted node ${id}`);
  nodeIds.add(id);
  extraction.nodes.push({ id, label, node_type: type, file_type: 'document', source_file: doc.file, source_location: `line ${line}`, confidence: 'EXTRACTED', description: quote, citations: [cite(quote, doc.file, line)] });
}
function edge(source, target, relation, doc, line, quote) {
  if (source === target) return;
  const key = `${source}|${target}|${relation}`;
  if (edgeIds.has(key)) return;
  edgeIds.add(key);
  extraction.edges.push({ source, target, relation, confidence: 'EXTRACTED', source_file: doc.file, source_location: `line ${line}`, evidence_text: quote, citations: [cite(quote, doc.file, line)], weight: relation === 'contains' ? 1 : 2 });
}
for (const doc of docs) {
  const lines = doc.text.split(/\r?\n/);
  const titleIndex = lines.findIndex(l => l.startsWith('# '));
  addNode(doc.file, doc.title, doc, titleIndex + 1, lines[titleIndex], 'Document');
  lines.forEach((line, i) => {
    if (/^## /u.test(line)) {
      const id = `${doc.file}#section-${i + 1}`;
      addNode(id, line.slice(3), doc, i + 1, line, 'Section');
      edge(doc.file, id, 'contains', doc, i + 1, line);
    }
    const row = line.match(/^\| ((?:FR|NFR|ADR|T)-\d{2,3}|P\d)\b([^|]*)\|/);
    // Define identifiers only in their canonical tables; references elsewhere remain edges.
    const canonical = row && ((row[1].startsWith('FR-') || row[1].startsWith('NFR-')) ? doc.file.includes('02-SRS') : row[1].startsWith('ADR-') ? doc.file.includes('04-Decisions') : row[1].startsWith('T-') ? doc.file.includes('09-Verification') : doc.file.includes('10-Delivery'));
    if (canonical) {
      const id = `${doc.file}#${row[1]}`;
      const cells = line.split('|').map(s => s.trim()).filter(Boolean);
      const summary = row[2].trim() || (row[1].startsWith('FR-') ? cells[2] : cells[1]);
      addNode(id, `${row[1]} ${summary}`.slice(0, 160), doc, i + 1, line, 'Requirement');
      requirementIds.set(row[1], id);
      edge(doc.file, id, 'specifies', doc, i + 1, line);
    }
  });
}
const docLinks = [];
for (const doc of docs) doc.text.split(/\r?\n/).forEach((line, i) => {
  for (const match of line.matchAll(/\[\[([^\]]+)\]\]/g)) {
    const target = resolveLink(match[1]);
    if (sources.includes(target)) {
      edge(doc.file, target, 'references', doc, i + 1, line);
      docLinks.push({ source: doc.file, target });
    }
  }
  // AGENTS.md uses ordinary Markdown links for compatibility with code hosts.
  for (const match of line.matchAll(/\[[^\]]+\]\((docs\/[^)]+\.md)\)/g)) {
    if (!sources.includes(match[1])) fail(`Broken Markdown link: ${match[1]}`);
    edge(doc.file, match[1], 'references', doc, i + 1, line);
    docLinks.push({ source: doc.file, target: match[1] });
  }
  const own = line.match(/^\| ((?:FR|NFR|ADR|T)-\d{2,3}|P\d)\b/);
  const ownId = own && requirementIds.get(own[1]);
  const source = ownId?.startsWith(doc.file + '#') ? ownId : doc.file;
  for (const ref of line.matchAll(/\b(?:FR|NFR|ADR|T)-\d{2,3}\b/g)) {
    const target = requirementIds.get(ref[0]);
    if (target) edge(source, target, doc.file.includes('09-Verification') ? 'verifies' : 'references', doc, i + 1, line);
  }
});
const validationErrors = gf.validateExtraction(extraction);
if (validationErrors.length) fail(validationErrors.join('\n'));
const G = gf.buildFromJson(extraction);
if (!G.order) fail('Graph is empty.');
// Seed the community detector so a no-change rebuild does not reshuffle the map.
const originalRandom = Math.random;
let seed = 17092026;
Math.random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
let communities;
try { communities = gf.cluster(G); } finally { Math.random = originalRandom; }
const labels = new Map();
for (const [id, members] of communities) {
  const counts = new Map();
  for (const n of members) { const file = G.getNodeAttribute(n, 'source_file'); counts.set(file, (counts.get(file) || 0) + 1); }
  const leader = [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0];
  const tests = members.filter(n => n.includes('#T-')).map(n => n.split('#')[1]);
  const theme = tests.includes('T-04') ? 'Corrections and undo' : tests.includes('T-03') ? 'Atomic sales and retries' : tests.includes('T-05') ? 'Analytics and missing data' : tests.includes('T-09') ? 'Manual access and accessibility' : tests.includes('T-07') ? 'Authorization and tool safety' : tests.includes('T-08') ? 'Voice session recovery' : tests.includes('T-06') ? 'Dashboard creation and persistence' : tests.length ? 'Verification and release readiness' : docs.find(d => d.file === leader).title.split(' ').slice(0, 5).join(' ');
  labels.set(id, theme);
}
gf.toJson(G, communities, `${state}/graph.json`, labels);
put(`${state}/.graphify_labels.json`, Object.fromEntries(labels));
put(`${state}/.graphify_runtime.json`, { runtime: 'typescript', package: '@sentropic/graphify', version: '0.18.0', extraction: 'deterministic headings, requirement rows and explicit links; no LLM calls' });
const detection = { files: { document: sources, code: [], paper: [] }, total_files: sources.length, total_words: docs.reduce((n, d) => n + d.text.split(/\s+/).length, 0), needs_graph: true, warning: null, skipped_sensitive: [], graphifyignore_patterns: 0 };
const gods = gf.godNodes(G), surprises = gf.surprisingConnections(G, communities);
const report = gf.generateReport(G, communities, gf.scoreAll(G, communities), labels, gods, surprises, detection, { input: 0, output: 0 }, '.', { suggestedQuestions: gf.suggestQuestions(G, communities, labels) });
put(`${state}/GRAPH_REPORT.md`, '# Extraction audit\n\nGenerated from canonical EasyLedger planning notes. EXTRACTED means an explicit heading, requirement row or link, not implemented behavior. No inferred relationships or external LLM calls. Token counts below apply only to this deterministic extraction, not to authoring the notes. Cross-community connections are structural, not novel research findings.\n\n' + report);

const groups = [
  { title: '01 · PURPOSE & SCOPE', color: '4', files: ['docs/00-Home.md', 'docs/01-Product-Brief.md', 'docs/02-SRS.md', 'docs/15-Use-Cases.md', 'docs/14-Glossary.md'] },
  { title: '02 · SYSTEM & AGENT', color: '5', files: ['docs/03-Architecture.md', 'docs/04-Decisions.md', 'docs/05-Data-Model.md', 'docs/06-Agent-and-API.md'] },
  { title: '03 · EXPERIENCE & TRUST', color: '6', files: ['docs/07-Dashboard-and-UX.md', 'docs/08-Security-and-Operations.md', 'docs/09-Verification.md', 'docs/12-Knowledge-System.md'] },
  { title: '04 · DELIVERY & EVIDENCE', color: '3', files: ['docs/10-Delivery-Plan.md', 'docs/11-Hackathon-and-License.md', 'docs/16-Implementation-Handoff.md', 'docs/13-Sources.md', 'AGENTS.md'] }
];
for (const group of groups) group.files = group.files.filter(f => sources.includes(f));
const placed = new Set(groups.flatMap(g => g.files));
groups[3].files.push(...sources.filter(f => !placed.has(f)));
function canvas(allLinks) {
  const nodes = [{ id: 'intro', type: 'text', x: 0, y: -230, width: 1830, height: 155, text: '# EasyLedger · ' + (allLinks ? 'Knowledge map' : 'Project overview') + '\nVoice → validated tools → trustworthy ledger → interactive dashboards\n\n**Planning only. Backend and working journeys first; theme undecided.** Open a file card to read the live note. Columns group responsibilities; arrows show ' + (allLinks ? 'explicit document references.' : 'the suggested reading and implementation flow.') }];
  const ids = new Map();
  groups.forEach((group, col) => {
    const x = col * 480;
    nodes.push({ id: `group-${col}`, type: 'group', x, y: 0, width: 440, height: 70 + group.files.length * 320, label: group.title, color: group.color });
    group.files.forEach((file, row) => {
      const id = `note-${col}-${row}`;
      ids.set(file, id);
      nodes.push({ id, type: 'file', file, x: x + 25, y: 55 + row * 320, width: 390, height: 270, color: group.color });
    });
  });
  const pairs = allLinks ? docLinks : [
    ['docs/01-Product-Brief.md','docs/02-SRS.md'], ['docs/02-SRS.md','docs/03-Architecture.md'],
    ['docs/03-Architecture.md','docs/04-Decisions.md'], ['docs/04-Decisions.md','docs/05-Data-Model.md'],
    ['docs/05-Data-Model.md','docs/06-Agent-and-API.md'], ['docs/06-Agent-and-API.md','docs/07-Dashboard-and-UX.md'],
    ['docs/07-Dashboard-and-UX.md','docs/08-Security-and-Operations.md'], ['docs/08-Security-and-Operations.md','docs/09-Verification.md'],
    ['docs/09-Verification.md','docs/10-Delivery-Plan.md'], ['docs/10-Delivery-Plan.md','docs/11-Hackathon-and-License.md']
  ].map(([source,target]) => ({source,target}));
  const edges = [], seen = new Set();
  for (const p of pairs) {
    if (p.source === p.target || !ids.has(p.source) || !ids.has(p.target)) continue;
    const key = `${p.source}|${p.target}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const a = nodes.find(n => n.id === ids.get(p.source)), b = nodes.find(n => n.id === ids.get(p.target));
    const vertical = a.x === b.x;
    edges.push({ id: `edge-${edges.length}`, fromNode: a.id, toNode: b.id, fromSide: vertical ? 'bottom' : 'right', toSide: vertical ? 'top' : 'left', toEnd: 'arrow', ...(allLinks ? {} : { label: 'continue' }) });
  }
  return { nodes, edges };
}
put(canvases[0], canvas(false)); put(canvases[1], canvas(true));
canvases.forEach(validateCanvas);
// Cite before studio export. Existing verbatim citations are preserved by Graphify.
console.log(cli(['cite', '.', '--only-missing']).trim());
console.log(cli(['studio', 'export', `${state}/studio`, '--no-single-file', '--include-sources']).trim());
put(`${state}/studio/GRAPHIFY-LICENSE.txt`, read('node_modules/@sentropic/graphify/LICENSE'));
console.log(cli(['portable-check', state]).trim());
const artifacts = [`${state}/graph.json`, `${state}/GRAPH_REPORT.md`, `${state}/.graphify_labels.json`, `${state}/.graphify_runtime.json`, ...canvases, ...listFiles(`${state}/studio`)];
if (fs.existsSync(`${state}/citations.json`)) artifacts.push(`${state}/citations.json`);
put(manifestPath, { schema: 1, generator: 'scripts/sync-docs.cjs', inputs: hashes(inputs), outputs: hashes(artifacts), counts: { notes: docs.length, nodes: G.order, edges: G.size, communities: communities.size }, total_words: detection.total_words });
console.log(`Synced ${docs.length} notes → ${G.order} nodes / ${G.size} relationships / ${communities.size} communities, two canvases and Graphify studio.`);
if (detection.total_words > 5000) gf.printBenchmark(gf.runBenchmark(`${state}/graph.json`, { corpusWords: detection.total_words }));
