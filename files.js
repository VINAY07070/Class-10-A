/* AIA Class 10-A Hub — shared file uploads
   ------------------------------------------------------------------
   Serverless uploads: the file bytes go to the same free public
   relay the realtime sync already uses (ntfy attachments), and only
   a small metadata record is stored locally. Because the metadata
   syncs through relay.js, every device sees the file the moment it
   uploads — nothing to deploy, no account, no build step.

   Free-tier realities baked into the UI:
     • ~4 MB per file (we warn at 3.5 MB and refuse over 4 MB)
     • attachments auto-expire after a few hours on the public relay
*/
(function () {
  'use strict';

  var MAX_BYTES = 4 * 1024 * 1024;
  var WARN_BYTES = 3.5 * 1024 * 1024;
  var SERVERS = ['https://ntfy.sh', 'https://ntfy.envs.net', 'https://ntfy.mzte.de'];

  function room() {
    try {
      if (window.AiaRelay && window.AiaRelay.room) return window.AiaRelay.room();
    } catch (e) {}
    try {
      var cfg = JSON.parse(localStorage.getItem('aia_relay_cfg') || '{}');
      if (cfg.room) return cfg.room;
    } catch (e) {}
    return 'aia10a-7f3c9e21b8d4';
  }

  function kindOf(file) {
    var t = (file.type || '').toLowerCase();
    if (t.indexOf('image/') === 0) return 'image';
    if (t === 'application/pdf') return 'pdf';
    if (t.indexOf('audio/') === 0) return 'audio';
    if (t.indexOf('video/') === 0) return 'video';
    if (t.indexOf('text/') === 0) return 'text';
    return 'file';
  }

  function iconFor(kind) {
    if (kind === 'image') return 'fa-file-image';
    if (kind === 'pdf') return 'fa-file-pdf';
    if (kind === 'audio') return 'fa-file-audio';
    if (kind === 'video') return 'fa-file-video';
    if (kind === 'text') return 'fa-file-lines';
    return 'fa-file';
  }

  function pretty(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + ' KB';
    return (bytes / 1024 / 1024).toFixed(1) + ' MB';
  }

  function put(server, r, file, name) {
    return fetch(server + '/' + r, {
      method: 'PUT',
      headers: {
        'Filename': name,
        'Content-Type': file.type || 'application/octet-stream'
      },
      body: file
    });
  }

  /* Upload one file; resolves with a metadata record (never rejects). */
  function upload(file, meta) {
    meta = meta || {};
    if (!file) return Promise.resolve({ ok: false, error: 'No file' });
    if (file.size > MAX_BYTES) {
      return Promise.resolve({ ok: false, error: file.name + ' is ' + pretty(file.size) + ' — the free relay caps files at 4 MB' });
    }
    var r = room();
    var name = (file.name || 'file').replace(/[^\w.\- ()]/g, '_').slice(0, 80);
    var i = 0;
    function attempt() {
      if (i >= SERVERS.length) return Promise.resolve({ ok: false, error: 'Upload failed — relay unreachable' });
      var server = SERVERS[i++];
      return put(server, r, file, name).then(function (res) {
        if (res.status !== 200) return attempt();
        return res.json().then(function (d) {
          var att = d && d.attachment;
          if (!att || !att.url) return attempt();
          return {
            ok: true,
            file: {
              id: 'file_' + (d.id || Date.now()),
              name: att.name || name,
              type: att.type || file.type || 'application/octet-stream',
              size: att.size || file.size,
              url: att.url,
              kind: kindOf(file),
              expires: att.expires || 0,
              by: meta.by || '',
              note: meta.note || '',
              at: new Date().toISOString()
            }
          };
        });
      }).catch(function () { return attempt(); });
    }
    return attempt();
  }

  /* Upload several files, reporting progress as each one lands. */
  function uploadAll(files, meta, onEach) {
    var list = Array.prototype.slice.call(files || []);
    var results = [];
    return list.reduce(function (chain, f) {
      return chain.then(function () {
        return upload(f, meta).then(function (res) {
          results.push(res);
          if (onEach) onEach(res, results.length, list.length);
          return null;
        });
      });
    }, Promise.resolve()).then(function () { return results; });
  }

  /* Persist a successfully uploaded file and let sync broadcast it. */
  function share(record) {
    if (!record || !record.url) return null;
    var saved = window.DataStore && window.DataStore.addFile ? window.DataStore.addFile(record) : record;
    try { document.dispatchEvent(new CustomEvent('aia-local-write', { detail: { key: 'aia_files' } })); } catch (e) {}
    try { window.dispatchEvent(new CustomEvent('aia-files-change')); } catch (e) {}
    return saved;
  }

  window.AiaFiles = {
    MAX_BYTES: MAX_BYTES,
    iconFor: iconFor,
    kindOf: kindOf,
    pretty: pretty,
    upload: upload,
    uploadAll: uploadAll,
    share: share
  };
})();