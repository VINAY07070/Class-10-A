const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const vm = require('vm');
const root = __dirname;
const port = Number(process.env.PORT || 10000);
const dbFile = path.join(root, 'render-data.json');
const sessions = new Map();
const box = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(root, 'seed.js'), 'utf8'), box);
const seed = box.window.SEED || {};
const keys = ['students','student_profiles','teachers','leadership','homework','announcements','polls','test_scores'];
let state = fs.existsSync(dbFile) ? JSON.parse(fs.readFileSync(dbFile, 'utf8')) : {};
keys.forEach(k => { if (!(k in state)) state[k] = seed[k] || []; });
function save() { fs.writeFileSync(dbFile, JSON.stringify(state, null, 2)); }
function json(res, code, value, headers) { res.writeHead(code, Object.assign({'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}, headers || {})); res.end(JSON.stringify(value)); }
function readBody(req) { return new Promise((resolve,reject) => { let s=''; req.on('data', c => { s += c; if (s.length > 2000000) reject(new Error('large')); }); req.on('end', () => { try { resolve(JSON.parse(s || '{}')); } catch(e) { reject(e); } }); req.on('error', reject); }); }
function user(c) { return { name:c.name, username:c.username, role:['admin_vinay','admin_nitin'].includes(c.username) ? 'admin' : 'student' }; }
function serve(req,res) { let u = decodeURIComponent(new URL(req.url,'http://localhost').pathname); if (u === '/') u='/index.html'; let f=path.normalize(path.join(root,u)); if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) return json(res,404,{error:'Not found'}); let types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.json':'application/json'}; res.writeHead(200,{'Content-Type':(types[path.extname(f)]||'application/octet-stream')+'; charset=utf-8'}); fs.createReadStream(f).pipe(res); }
const server=http.createServer(async (req,res) => {
  if (req.method==='POST' && req.url==='/api/login') { try { let b=await readBody(req), found=null; if(b.username&&b.password) found=seed.credentials.find(c=>String(c.username).toLowerCase()===String(b.username).toLowerCase()&&c.password===b.password); else if(b.pass && b.pass===(seed.admin_passes||{}).full) found={name:'ADMIN',username:'admin',role:'admin'}; if(!found) return json(res,401,{error:'Invalid credentials'}); let u=found.role?found:user(found), token=crypto.randomBytes(32).toString('hex'); sessions.set(token,u); return json(res,200,u,{'Set-Cookie':`aia_session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=86400`}); } catch(e) { return json(res,400,{error:'Invalid request'}); } }
  if (req.url==='/api/state' && req.method==='GET') return json(res,200,state);
  if (req.url==='/api/state' && req.method==='PUT') { try { let b=await readBody(req); state=Object.assign(state,b); save(); return json(res,200,{ok:true}); } catch(e) { return json(res,400,{error:'Invalid state'}); } }
  serve(req,res);
});
server.listen(port,()=>console.log('AIA server listening on '+port));
