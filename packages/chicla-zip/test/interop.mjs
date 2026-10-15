// C3.1: independent readers for the writer's output (ROADMAP §5, "Tudo o que escreve é lido pelo leitor do Chicla e pelas ferramentas
// independentes"). `checkZip(path, expected)` runs every reader that exists on this machine and returns what each one said; a tool that
// is not installed is reported as `ran: false`, never as a pass. `expected` maps entry name -> Buffer | string (folders end in «/»).
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { listZip, readZipFile, testZip } from '../src/zipkit.mjs';
import { lossy, lossyNames, lossyDiag } from './fsprobe.mjs';

const sha = (b) => createHash('sha256').update(b).digest('hex');
const want = (expected) => Object.fromEntries(Object.entries(expected).map(([k, v]) => [k, k.endsWith('/') ? null : sha(Buffer.from(v))]));
const RUN_TIMEOUT = 120000; // round 146: a reader that stands still is a failure that names the tool, not a CI job that hangs
const run = (cmd, args) => {
  const r = spawnSync(cmd, args, { encoding: 'utf8', maxBuffer: 1 << 28, timeout: RUN_TIMEOUT, env: { ...process.env, PYTHONUTF8: '1' } });
  if (r.error?.code === 'ETIMEDOUT') return { status: null, stdout: '', stderr: `timed out after ${RUN_TIMEOUT} ms: ${cmd} ${args.map((a) => String(a).slice(0, 40)).join(' ')}` };
  return r.error ? null : r;
};
const tail = (r) => String(r.stdout + r.stderr).trim().split('\n').pop().slice(0, 160);
const diff = (got, exp) => { // got, exp: name -> sha256 | null
  const out = [];
  for (const k of Object.keys(exp)) if (!(k in got)) out.push(`missing «${k}»`); else if (got[k] !== exp[k]) out.push(`content of «${k}» differs`);
  for (const k of Object.keys(got)) if (!(k in exp)) out.push(`unexpected «${k}»`);
  return out;
};

const PY = `
import sys, json, zipfile, hashlib
z = zipfile.ZipFile(sys.argv[1])
bad = z.testzip()
out = {"testzip": bad, "files": {}}
for i in z.infolist():
    out["files"][i.filename] = None if i.filename.endswith("/") else hashlib.sha256(z.read(i)).hexdigest()
print(json.dumps(out))
`;

export const readers = {
  unzip: (p) => { // Info-ZIP exits 1 for warnings (on Windows it cannot represent non-ASCII names) and still says «No errors detected»: that is a pass only where names are lossy
    const r = run('unzip', ['-t', p]); if (!r) return null;
    const why = `(lossyNames=${lossyNames}; probe ${lossyDiag})`, tested = /No errors detected/.test(r.stdout), ok = tested && (r.status === 0 || (r.status === 1 && lossyNames));
    return { ok, problems: ok ? [] : [`unzip -t exited ${r.status}: ${tail(r)}`, why] };
  },
  zipinfo: (p, exp) => {
    const r = run('zipinfo', ['-1', p]); if (!r) return null;
    if (r.status !== 0) return { ok: false, problems: [`zipinfo exited ${r.status}`] };
    const m = lossyNames ? lossy : (n) => n; // Apple's zipinfo cannot print non-ASCII names: there it only confirms the names up to those characters
    const names = r.stdout.split('\n').filter(Boolean), problems = diff(Object.fromEntries(names.map((n) => [m(n), null])), Object.fromEntries(Object.keys(exp).map((n) => [m(n), null])));
    return { ok: !problems.length, problems: problems.length ? [...problems, `(lossyNames=${lossyNames}; probe ${lossyDiag})`] : problems };
  },
  python: (p, exp) => {
    const r = run('python3', ['-c', PY, p]); if (!r) return null;
    if (r.status !== 0) return { ok: false, problems: [`python zipfile: ${r.stderr.trim().split('\n').pop()}`] };
    const j = JSON.parse(r.stdout), problems = [...(j.testzip ? [`testzip: bad CRC in «${j.testzip}»`] : []), ...diff(j.files, want(exp))];
    return { ok: !problems.length, problems };
  },
  '7z': (p) => { const bin = ['7z', '7za', '7zr'].find((b) => run(b, ['--help'])); if (!bin) return null; const r = run(bin, ['t', p]); return { ok: r.status === 0, problems: r.status === 0 ? [] : [`${bin} t exited ${r.status}`] }; },
  chicla: async (p, exp) => {
    try {
      await testZip(p); const { entries } = listZip(p), got = {};
      for (const e of entries) got[e.name] = e.isDir ? null : sha(readZipFile(p, e.name));
      const problems = diff(got, want(exp)); return { ok: !problems.length, problems };
    } catch (err) { return { ok: false, problems: [`chicla reader: ${err.message}`] }; }
  },
};

export const checkZip = async (zipPath, expected) => {
  const result = {};
  for (const [tool, fn] of Object.entries(readers)) { const r = await fn(zipPath, expected); result[tool] = r ? { ran: true, ...r } : { ran: false, ok: null, problems: [] }; }
  const ran = Object.keys(result).filter((t) => result[t].ran);
  return { result, ran, skipped: Object.keys(result).filter((t) => !result[t].ran), problems: ran.flatMap((t) => result[t].problems.map((x) => `${t}: ${x}`)) };
};
