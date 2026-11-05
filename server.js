// B.U.G 분실물 보관소 서버. 외부 npm 패키지 없이 Node.js(18 이상)만으로 동작해요.
//
// 저장 방식 (환경변수로 자동 선택)
//  - SUPABASE_URL, SUPABASE_KEY 가 있으면: Supabase 데이터베이스에 저장 (인터넷 배포용, 꺼져도 글이 남아요)
//  - 없으면: data 폴더에 파일로 저장 (노트북에서 테스트할 때)
// 관리자
//  - ADMIN_PIN 을 정하면, 화면 맨 아래 "관리자"에서 그 비밀번호를 넣어 삭제할 수 있어요.
//  - 서버를 켠 컴퓨터에서 localhost 로 접속해도 관리자예요. (인터넷 배포 환경에서는 적용되지 않아요)
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const PORT = Number(process.env.PORT) || 3000;
const SB_URL = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const SB_KEY = process.env.SUPABASE_KEY || '';
const USE_DB = !!(SB_URL && SB_KEY);
const ADMIN_PIN = process.env.ADMIN_PIN || '';
const PUBLIC = path.join(__dirname, 'public');
const MAX_ITEMS = 2000;
const MAX_PHOTO = 200 * 1024;
const POSTS_PER_MIN = 8;

/* ---------------- 공통 도구 ---------------- */
const clip = (s, n) => String(s == null ? '' : s).trim().slice(0, n);
const ID_RE = /^[0-9a-f-]{36}$/;
function json(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(obj));
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', d => {
      size += d.length;
      if (size > 600000) { reject(new Error('too big')); req.destroy(); } else chunks.push(d);
    });
    req.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); } catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}
function clientIp(req) {
  const xf = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return xf || req.socket.remoteAddress || 'unknown';
}
function safeEqual(a, b) {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}
function isAdmin(req) {
  const a = req.socket.remoteAddress || '';
  const local = (a === '127.0.0.1' || a === '::1' || a === '::ffff:127.0.0.1') && !req.headers['x-forwarded-for'];
  if (local) return true;
  const pin = req.headers['x-admin-pin'];
  return !!(ADMIN_PIN && pin && safeEqual(pin, ADMIN_PIN));
}
const hits = new Map(); // ip -> 최근 등록 시각들 (도배 방지)
function tooMany(ip) {
  const now = Date.now(), arr = (hits.get(ip) || []).filter(t => now - t < 60000);
  if (arr.length >= POSTS_PER_MIN) { hits.set(ip, arr); return true; }
  arr.push(now); hits.set(ip, arr); return false;
}
setInterval(() => { const now = Date.now(); hits.forEach((v, k) => { if (!v.some(t => now - t < 60000)) hits.delete(k); }); }, 300000).unref();

function newItem(b) {
  const type = b.type === 'found' ? 'found' : 'lost';
  const name = clip(b.name, 40);
  if (!name) return null;
  let photo = null;
  const m = /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/.exec(String(b.photo || ''));
  if (m) { const buf = Buffer.from(m[1], 'base64'); if (buf.length > 0 && buf.length <= MAX_PHOTO) photo = buf; }
  return {
    item: {
      id: crypto.randomUUID(), type, name,
      cat: clip(b.cat, 20), place: clip(b.place, 20), when: clip(b.when, 5),
      desc: clip(b.desc, 200), contact: clip(b.contact, 60),
      hasPhoto: !!photo, done: false, created: Date.now()
    },
    photo
  };
}

/* ---------------- 저장소 1: 파일 (테스트용) ---------------- */
function fileStore() {
  const DATA_DIR = path.join(__dirname, 'data');
  const PHOTO_DIR = path.join(DATA_DIR, 'photos');
  const FILE = path.join(DATA_DIR, 'items.json');
  fs.mkdirSync(PHOTO_DIR, { recursive: true });
  let items = [];
  try { items = JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch (e) { items = []; }
  const persist = () => { fs.writeFileSync(FILE + '.tmp', JSON.stringify(items)); fs.renameSync(FILE + '.tmp', FILE); };
  return {
    name: '파일(data 폴더)',
    async list() { return items.slice().sort((a, b) => b.created - a.created); },
    async add(it, photo) {
      if (items.length >= MAX_ITEMS) throw Object.assign(new Error('full'), { code: 507 });
      if (photo) fs.writeFileSync(path.join(PHOTO_DIR, it.id + '.jpg'), photo);
      items.push(it); persist();
    },
    async setDone(id, done) { const it = items.find(x => x.id === id); if (!it) return false; it.done = done; persist(); return true; },
    async remove(id) {
      const i = items.findIndex(x => x.id === id); if (i < 0) return false;
      items.splice(i, 1); persist(); fs.rm(path.join(PHOTO_DIR, id + '.jpg'), { force: true }, () => {}); return true;
    },
    async photo(id) { try { return fs.readFileSync(path.join(PHOTO_DIR, id + '.jpg')); } catch (e) { return null; } }
  };
}

/* ---------------- 저장소 2: Supabase (배포용) ---------------- */
function supabaseStore() {
  const headers = () => {
    const h = { apikey: SB_KEY, 'Content-Type': 'application/json' };
    if (SB_KEY.startsWith('eyJ')) h.Authorization = 'Bearer ' + SB_KEY; // 예전 방식(JWT) 키일 때만
    return h;
  };
  async function sb(method, pathQuery, body, extra) {
    const r = await fetch(SB_URL + '/rest/v1/' + pathQuery, {
      method, headers: Object.assign(headers(), extra || {}),
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(8000)
    });
    if (!r.ok) { const t = await r.text().catch(() => ''); throw new Error('supabase ' + r.status + ' ' + t.slice(0, 200)); }
    const t = await r.text();
    return t ? JSON.parse(t) : null;
  }
  const COLS = 'id,type,name,cat,place,at_time,descr,contact,has_photo,done,created';
  const fromRow = r => ({
    id: r.id, type: r.type, name: r.name, cat: r.cat, place: r.place, when: r.at_time || '',
    desc: r.descr || '', contact: r.contact || '', hasPhoto: !!r.has_photo, done: !!r.done, created: Number(r.created)
  });
  let cache = null, cacheAt = 0;
  const bust = () => { cache = null; };
  return {
    name: 'Supabase',
    async list() {
      if (cache && Date.now() - cacheAt < 2500) return cache; // 여러 명이 동시에 봐도 DB는 2.5초에 한 번만
      const rows = await sb('GET', 'items?select=' + COLS + '&order=created.desc&limit=' + MAX_ITEMS);
      cache = rows.map(fromRow); cacheAt = Date.now(); return cache;
    },
    async add(it, photo) {
      await sb('POST', 'items', {
        id: it.id, type: it.type, name: it.name, cat: it.cat, place: it.place, at_time: it.when,
        descr: it.desc, contact: it.contact, has_photo: !!photo,
        photo: photo ? photo.toString('base64') : null, done: false, created: it.created
      }, { Prefer: 'return=minimal' });
      bust();
    },
    async setDone(id, done) {
      const rows = await sb('PATCH', 'items?id=eq.' + id, { done }, { Prefer: 'return=representation' });
      bust(); return !!(rows && rows.length);
    },
    async remove(id) {
      const rows = await sb('DELETE', 'items?id=eq.' + id, undefined, { Prefer: 'return=representation' });
      bust(); return !!(rows && rows.length);
    },
    async photo(id) {
      const rows = await sb('GET', 'items?id=eq.' + id + '&select=photo');
      return rows && rows[0] && rows[0].photo ? Buffer.from(rows[0].photo, 'base64') : null;
    }
  };
}

const store = USE_DB ? supabaseStore() : fileStore();

/* ---------------- 서버 ---------------- */
const server = http.createServer(async (req, res) => {
  const p = new URL(req.url, 'http://x').pathname;
  try {
    if (req.method === 'GET' && p === '/api/items') {
      return json(res, 200, { items: await store.list(), admin: isAdmin(req) });
    }
    if (req.method === 'POST' && p === '/api/items') {
      if (tooMany(clientIp(req))) return json(res, 429, { error: 'slow down' });
      const made = newItem(await readBody(req));
      if (!made) return json(res, 400, { error: 'name required' });
      if ((await store.list()).length >= MAX_ITEMS) return json(res, 507, { error: 'full' });
      await store.add(made.item, made.photo);
      return json(res, 201, made.item);
    }
    let m = /^\/api\/items\/([0-9a-f-]{36})\/done$/.exec(p);
    if (req.method === 'POST' && m) {
      const b = await readBody(req);
      return (await store.setDone(m[1], !!b.done)) ? json(res, 200, { ok: true }) : json(res, 404, { error: 'not found' });
    }
    m = /^\/api\/items\/([0-9a-f-]{36})$/.exec(p);
    if (req.method === 'DELETE' && m) {
      if (!isAdmin(req)) return json(res, 403, { error: 'admin only' });
      return (await store.remove(m[1])) ? json(res, 200, { ok: true }) : json(res, 404, { error: 'not found' });
    }
    m = /^\/photos\/([0-9a-f-]{36})\.jpg$/.exec(p);
    if (req.method === 'GET' && m && ID_RE.test(m[1])) {
      const buf = await store.photo(m[1]);
      if (!buf) { res.writeHead(404); return res.end(); }
      res.writeHead(200, { 'Content-Type': 'image/jpeg', 'Cache-Control': 'public, max-age=86400' });
      return res.end(buf);
    }
    if (req.method === 'GET' && (p === '/' || p === '/index.html')) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      return fs.createReadStream(path.join(PUBLIC, 'index.html')).pipe(res);
    }
    if (req.method === 'GET' && p === '/healthz') { res.writeHead(200, { 'Content-Type': 'text/plain' }); return res.end('ok'); }
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not found');
  } catch (e) {
    console.error(new Date().toISOString(), req.method, p, e && e.message);
    json(res, e && e.code === 507 ? 507 : 502, { error: 'server error' });
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log('\nB.U.G 분실물 보관소 서버가 켜졌어요. (저장 방식: ' + store.name + ')\n');
  console.log('  이 컴퓨터에서:  http://localhost:' + PORT);
  const nets = os.networkInterfaces();
  Object.keys(nets).forEach(k => (nets[k] || []).forEach(n => {
    if (n.family === 'IPv4' && !n.internal) console.log('  같은 와이파이:  http://' + n.address + ':' + PORT);
  }));
  if (USE_DB && !ADMIN_PIN) console.log('\n  주의: ADMIN_PIN 이 없어서 아무도 글을 삭제할 수 없어요. 환경변수로 비밀번호를 정해 주세요.');
  console.log('');
});
