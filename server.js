/* AIA Class 10-A Hub — optional tiny server (Render / Node).
   The site is 100% serverless-capable; this only adds an optional
   merge hub at /api/state. Accepts BOTH short keys (students, …)
   and aia_* keys, and MERGES chat/comments by id (never wipes). */
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const vm = require('vm');
const root = __dirname;
const port = Number(process.env.PORT || 10000);
const dbFile = path.join(root, 'render-data.json');
const sessions = new Map();
const typingClients = new Set();
const box = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(root, 'seed.js'), 'utf8'), box);
const seed = box.window.SEED || {};
const keys = ['students','student_profiles','teachers','leadership','homework','announcements','polls','test_scores','class_chat','comments','poll_votes','subject_content','subject_photos','ai_config','theme','activity_log'];
const SEEDMAP = { students:'students', student_profiles:'student_profiles', teachers:'teachers', leadership:'leadership', homework:'homework', announcements:'announcements', polls:'polls', test_scores:'test_scores' };
let state = {};
try { if (fs.existsSync(dbFile)) state = JSON.parse(fs.readFileSync(dbFile, 'utf8')); } catch (e) { state = {}; }
keys.forEach(k => { if (!(k in state)) state[k] = SEEDMAP[k] ? (seed[SEEDMAP[k]] || []) : (k === 'comments' || k === 'subject_content' || k === 'subject_photos' || k === 'poll_votes' ? {} : []); });
function save() { try { fs.writeFileSync(dbFile, JSON.stringify(state, null, 2)); } catch (e) {} }
function itemId(it, i) {
  if (it && typeof it === 'object') {
    if (it.id) return 'id:' + it.id;
    if (it.question) return 'poll:' + it.question;
    if (it.title && it.body) return 'ann:' + it.title;
    if (it.subject && it.task) return 'hw:' + it.subject;
    if (it.name && it.username && it.content) return 'chat:' + it.username + '|' + it.at;
    if (it.author && it.text) return 'cm:' + it.author + '|' + it.at;
  }
  return 'i:' + i + ':' + JSON.stringify(it).slice(0, 50);
}
function unionArr(a, b, cap) {
  a = Array.isArray(a) ? a : []; b = Array.isArray(b) ? b : [];
  const seen = new Set(), out = [];
  a.concat(b).forEach((it, i) => { const id = itemId(it, i); if (!seen.has(id)) { seen.add(id); out.push(it); } });
  return cap && out.length > cap ? out.slice(-cap) : out;
}
function mergeMaps(a, b) {
  a = (a && typeof a === 'object') ? a : {}; b = (b && typeof b === 'object') ? b : {};
  const out = Object.assign({}, a);
  Object.keys(b).forEach(k => {
    if (Array.isArray(b[k])) out[k] = unionArr(out[k], b[k], 200);
    else if (out[k] === undefined) out[k] = b[k];
  });
  return out;
}
const SHORT = k => k.replace(/^aia_/, '').replace(/^test_scores$/, 'test_scores');
function normalize(body) {
  const out = {};
  Object.keys(body || {}).forEach(k => {
    let sk = k;
    if (k.indexOf('aia_') === 0) {
      sk = SHORT(k);
      if (sk === 'student_profiles') sk = 'student_profiles';
    }
    if (keys.includes(sk)) out[sk] = body[k];
  });
  return out;
}
function mergeState(body) {
  const inc = normalize(body);
  Object.keys(inc).forEach(k => {
    if (k === 'class_chat') state[k] = unionArr(state[k], inc[k], 500);
    else if (k === 'activity_log') state[k] = unionArr(state[k], inc[k], 400);
    else if (k === 'comments' || k === 'poll_votes' || k === 'subject_content' || k === 'subject_photos') state[k] = mergeMaps(state[k], inc[k]);
    else if (Array.isArray(inc[k])) state[k] = unionArr(state[k], inc[k], 600);
    else state[k] = inc[k];
  });
  save();
}
function json(res, code, value, headers) { res.writeHead(code, Object.assign({'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}, headers || {})); res.end(JSON.stringify(value)); }
function readBody(req) { return new Promise((resolve,reject) => { let s=''; req.on('data', c => { s += c; if (s.length > 8000000) reject(new Error('large')); }); req.on('end', () => { try { resolve(JSON.parse(s || '{}')); } catch(e) { reject(e); } }); req.on('error', reject); }); }
function user(c) { return { name:c.name, username:c.username, role:['admin_vinay','admin_nitin'].includes(c.username) ? 'admin' : 'student' }; }
function serve(req,res) { let u = decodeURIComponent(new URL(req.url,'http://localhost').pathname); if (u === '/') u='/index.html'; let f=path.normalize(path.join(root,u)); if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) return json(res,404,{error:'Not found'}); let types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.json':'application/json'}; res.writeHead(200,{'Content-Type':(types[path.extname(f)]||'application/octet-stream')+'; charset=utf-8'}); fs.createReadStream(f).pipe(res); }
const server=http.createServer(async (req,res) => {
  if (req.method==='POST' && req.url==='/api/login') { try { let b=await readBody(req), found=null; if(b.username&&b.password) found=(seed.credentials||[]).find(c=>String(c.username).toLowerCase()===String(b.username).toLowerCase()&&c.password===b.password); else if(b.pass && b.pass===(seed.admin_passes||{}).full) found={name:'ADMIN',username:'admin',role:'admin'}; if(!found) return json(res,401,{error:'Invalid credentials'}); let u=found.role?found:user(found), token=crypto.randomBytes(32).toString('hex'); sessions.set(token,u); return json(res,200,u,{'Set-Cookie':`aia_session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=86400`}); } catch(e) { return json(res,400,{error:'Invalid request'}); } }
  if (req.url==='/api/state' && req.method==='GET') return json(res,200,state);
  if (req.url==='/api/state' && req.method==='PUT') { try { let b=await readBody(req); mergeState(b); return json(res,200,{ok:true}); } catch(e) { return json(res,400,{error:'Invalid state'}); } }
  serve(req,res);
});
server.listen(port,()=>console.log('AIA server listening on '+port));
