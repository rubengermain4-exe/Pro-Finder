// Vérifications statiques : syntaxe JS, imports/exports, fichiers requis, sécurité, SQL.
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, dirname, resolve, relative } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
let failures = 0;
const fail = (m) => { failures += 1; console.error(`  ✗ ${m}`); };
const ok = (m) => console.log(`  ✓ ${m}`);

function walk(dir, exts, out = []) {
  for (const name of readdirSync(dir)) {
    if (['node_modules', 'dist', '.git'].includes(name)) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, exts, out);
    else if (exts.some((e) => name.endsWith(e))) out.push(p);
  }
  return out;
}

console.log('1. Fichiers requis');
['package.json', 'index.html', 'vite.config.js', '.env.example', 'README.md', 'public/_redirects', 'public/_headers',
  'public/assets/mascot.svg', 'src/main.js', 'src/routes.js', 'workers/payments/index.js', 'docs/SUPABASE.md', 'docs/DEPLOIEMENT.md']
  .forEach((f) => (existsSync(join(root, f)) ? ok(f) : fail(`manquant : ${f}`)));

console.log('2. Syntaxe JavaScript (node --check)');
const jsFiles = walk(root, ['.js', '.mjs']);
for (const f of jsFiles) {
  const r = spawnSync(process.execPath, ['--check', f], { encoding: 'utf8' });
  if (r.status !== 0) fail(`${relative(root, f)}\n${r.stderr}`);
}
if (!failures) ok(`${jsFiles.length} fichiers valides`);

console.log('3. Imports relatifs et exports nommés');
const srcFiles = walk(join(root, 'src'), ['.js']);
const exportsOf = (code) => {
  const names = new Set();
  for (const m of code.matchAll(/export\s+(?:async\s+)?(?:function\*?|const|let|class)\s+([A-Za-z0-9_$]+)/g)) names.add(m[1]);
  for (const m of code.matchAll(/export\s*\{([^}]+)\}/g)) m[1].split(',').forEach((n) => names.add(n.trim().split(/\s+as\s+/).pop()));
  if (/export\s+default/.test(code)) names.add('default');
  return names;
};
let importErrors = 0;
for (const f of srcFiles) {
  const code = readFileSync(f, 'utf8');
  const re = /import\s+(?:([^'";]*?)\s+from\s+)?['"](\.{1,2}\/[^'"]+)['"]/g;
  for (const m of code.matchAll(re)) {
    const target = resolve(dirname(f), m[2]);
    if (m[2].endsWith('.css')) { if (!existsSync(target)) { fail(`${relative(root, f)} : CSS introuvable ${m[2]}`); importErrors += 1; } continue; }
    if (!existsSync(target)) { fail(`${relative(root, f)} : import introuvable ${m[2]}`); importErrors += 1; continue; }
    const clause = m[1];
    if (!clause) continue;
    const exp = exportsOf(readFileSync(target, 'utf8'));
    const named = clause.match(/\{([\s\S]*)\}/);
    if (named) for (const n of named[1].split(',').map((s) => s.trim().split(/\s+as\s+/)[0]).filter(Boolean)) if (!exp.has(n)) { fail(`${relative(root, f)} : « ${n} » n'est pas exporté par ${m[2]}`); importErrors += 1; }
    if (/^\*\s+as/.test(clause.trim())) continue;
  }
  for (const m of code.matchAll(/import\(['"](\.{1,2}\/[^'"]+)['"]\)/g)) {
    if (!existsSync(resolve(dirname(f), m[1]))) { fail(`${relative(root, f)} : import dynamique introuvable ${m[1]}`); importErrors += 1; }
  }
}
if (!importErrors) ok(`${srcFiles.length} modules cohérents`);

console.log('4. Pages routées : export render()');
const routesCode = readFileSync(join(root, 'src/routes.js'), 'utf8');
for (const m of routesCode.matchAll(/import\('\.\/(pages\/[^']+)'\)/g)) {
  const code = readFileSync(join(root, 'src', m[1]), 'utf8');
  if (!/export\s+(async\s+)?function\s+render\b/.test(code)) fail(`${m[1]} n'exporte pas render()`);
}
ok('routes vérifiées');

console.log('5. Sécurité');
const bad = [/service_role/i, /SERVICE_ROLE/, /eval\(/, /document\.write\(/, /localStorage\.setItem\(['"](?:token|password)/i];
for (const f of srcFiles) {
  const code = readFileSync(f, 'utf8');
  bad.forEach((re) => { if (re.test(code)) fail(`${relative(root, f)} : motif interdit ${re}`); });
}
const envEx = readFileSync(join(root, '.env.example'), 'utf8');
if (/service_role|eyJ[A-Za-z0-9_-]{20,}/.test(envEx.replace(/jamais la clé service_role/i, ''))) fail('.env.example contient une clé');
ok('aucune clé service_role dans src/, pas de eval/document.write');

console.log('6. SQL (équilibrage)');
const sqlFiles = walk(join(root, 'supabase'), ['.sql']).sort();
for (const f of sqlFiles) {
  const code = readFileSync(f, 'utf8').replace(/--.*$/gm, '');
  const dollars = (code.match(/\$\$/g) || []).length;
  const noStr = code.replace(/'(?:[^']|'')*'/g, "''");
  const open = (noStr.match(/\(/g) || []).length; const close = (noStr.match(/\)/g) || []).length;
  if (dollars % 2) fail(`${relative(root, f)} : $$ non appariés`);
  if (open !== close) fail(`${relative(root, f)} : parenthèses ${open}/${close}`);
}
const allSql = sqlFiles.map((f) => readFileSync(f, 'utf8')).join('\n');
const tables = ['profiles', 'businesses', 'categories', 'services', 'locations', 'subscriptions', 'payments', 'conversations', 'conversation_participants', 'messages', 'reviews', 'favorites', 'portfolio_images', 'advertisements', 'reports', 'notifications', 'admin_logs'];
for (const t of tables) {
  if (!new RegExp(`create table public\\.${t}\\b`).test(allSql)) fail(`table manquante : ${t}`);
  if (!new RegExp(`alter table public\\.${t}\\s+enable row level security`).test(allSql)) fail(`RLS non activée : ${t}`);
}
ok(`${sqlFiles.length} migrations, ${tables.length} tables obligatoires avec RLS`);

console.log('7. Appels RPC du frontend déclarés en SQL');
const rpcs = new Set();
for (const f of srcFiles) for (const m of readFileSync(f, 'utf8').matchAll(/rpc\('([a-z_]+)'/g)) rpcs.add(m[1]);
for (const r of rpcs) if (!new RegExp(`function public\\.${r}\\b`).test(allSql)) fail(`RPC absente du SQL : ${r}`);
ok(`${rpcs.size} fonctions RPC présentes`);

console.log(failures ? `\n${failures} problème(s) détecté(s).` : '\nToutes les vérifications sont passées.');
process.exit(failures ? 1 : 0);
