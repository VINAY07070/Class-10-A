/* ============================================================
   AIAPI.JS — one place that talks to the AI provider.

   The chat page and the admin "Test the Brain" button both used to
   build their own request. That meant two copies of the same bugs and
   a generic CORS message shown for every possible failure, which sent
   people looking in the wrong place.

   Two things this fixes:

   1. Base URLs. People paste whatever the provider's docs show —
      including the full ".../chat/completions" path, a missing
      scheme, or a trailing slash. The old code appended
      "/chat/completions" to all of it, producing a URL that cannot
      work. normalizeBaseUrl() reduces any of those to a base.

   2. Errors. A failed fetch says only "Failed to fetch" whether the
      address is wrong, the network is down, or the host really did
      refuse a browser call. friendlyError() separates those cases
      using a list of hosts we have verified allow browser calls, so
      the message points at the actual cause.

   On key safety: the API key is device-local and is only ever sent to
   a host the admin has approved on this device (or to one of the
   known-good providers). The config that syncs between devices carries
   the base URL, so without that check anyone able to write to the
   sync channel could repoint baseUrl at their own server and collect
   keys from every admin device. approveKeyHost() records the host at
   save time; assertHostAllowed() enforces it at call time.
   ============================================================ */
window.AiaApi = (function () {
  'use strict';

  /* Hosts confirmed by a live preflight check to return CORS headers, so a
     browser can call them directly with no server in between. */
  var CORS_OK_HOSTS = [
    'api.openai.com',
    'openrouter.ai',
    'api.groq.com',
    'generativelanguage.googleapis.com'
  ];

  var PRESETS = {
    openai:     { label: 'OpenAI',         base: 'https://api.openai.com/v1',                                    model: 'gpt-4o-mini' },
    openrouter: { label: 'OpenRouter',     base: 'https://openrouter.ai/api/v1',                              model: 'openai/gpt-4o-mini' },
    groq:       { label: 'Groq',           base: 'https://api.groq.com/openai/v1',                             model: 'llama-3.3-70b-versatile' },
    gemini:     { label: 'Google Gemini',  base: 'https://generativelanguage.googleapis.com/v1beta/openai',   model: 'gemini-2.0-flash' },
    custom:     { label: 'Custom endpoint', base: '',                                                          model: '' }
  };

  var HOST_KEY = 'aia_ai_key_host';

  function hostOf(url) {
    try { return new URL(url).hostname.toLowerCase(); } catch (e) { return ''; }
  }

  /* Reduce anything a person might paste into a usable base URL. */
  function normalizeBaseUrl(raw, presetKey) {
    var u = String(raw == null ? '' : raw).trim();
    if (!u && presetKey && PRESETS[presetKey]) u = PRESETS[presetKey].base;
    if (!u) return '';
    u = u.replace(/\/+$/, '');
    /* strip a pasted endpoint path back to the base */
    u = u.replace(/\/chat\/completions$/i, '');
    u = u.replace(/\/completions$/i, '');
    if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
    u = u.replace(/\/v1\/v1$/i, '/v1');
    return u.replace(/\/+$/, '');
  }

  function endpointFor(baseUrl, presetKey) {
    var base = normalizeBaseUrl(baseUrl, presetKey);
    return base ? base + '/chat/completions' : '';
  }

  function isKnownGoodHost(host) {
    for (var i = 0; i < CORS_OK_HOSTS.length; i++) {
      if (host === CORS_OK_HOSTS[i]) return true;
    }
    return false;
  }

  function approvedHost() {
    try { return (localStorage.getItem(HOST_KEY) || '').toLowerCase(); } catch (e) { return ''; }
  }

  /* Called when the admin saves the config: records which host was on screen
     at that moment, so a base URL that changes later is not trusted. */
  function approveKeyHost(baseUrl) {
    var h = hostOf(normalizeBaseUrl(baseUrl));
    try { if (h) localStorage.setItem(HOST_KEY, h); } catch (e) {}
    return h;
  }

  /* Guards the key. A base URL that arrives over sync is not approval, and
     that applies to a shared key too: only the well-known providers are
     accepted there, so tampering with the synced blob cannot redirect a
     shared key to a stranger's server. */
  function assertHostAllowed(url) {
    var h = hostOf(url);
    if (!h) throw new Error('That Base URL is not a valid address.');
    if (isKnownGoodHost(h) || h === approvedHost()) return;
    var err = new Error(
      'Refused to send your API key to "' + h + '". ' +
      'Only the providers listed above, or a host you saved yourself, are allowed. ' +
      'If you meant to use this endpoint, open the Admin Panel and save the AI config again.'
    );
    err.code = 'HOST_NOT_APPROVED';
    throw err;
  }

  /* Pull a useful message out of whatever the provider sent back. */
  function readResponse(r) {
    return r.text().then(function (t) {
      var j = null;
      try { j = t ? JSON.parse(t) : null; } catch (e) {}
      if (r.ok) {
        if (!j) throw new Error('The provider replied with something that was not JSON.');
        return j;
      }
      var msg = (j && ((j.error && j.error.message) || j.message)) || '';
      var e = new Error(msg || ('HTTP ' + r.status));
      e.status = r.status;
      throw e;
    });
  }

  function extractText(data) {
    var c;
    try { c = data.choices[0].message.content; } catch (e) { c = ''; }
    if (Array.isArray(c)) {
      /* some providers return content as parts */
      return c.map(function (p) { return (p && p.text) || ''; }).join('').trim();
    }
    return String(c || '').trim();
  }

  /* Say what actually went wrong instead of blaming CORS every time. */
  function friendlyError(err, url) {
    if (err && err.code === 'HOST_NOT_APPROVED') return err.message;
    var m = String((err && err.message) || err || '');
    var host = hostOf(url);
    var status = err && err.status;

    if (/abort/i.test(m)) {
      return 'The request timed out. The provider did not reply in time — try again.';
    }
    if (/Failed to fetch|NetworkError|Load failed|Network request failed|NetworkError when attempting/i.test(m)) {
      if (isKnownGoodHost(host)) {
        /* we know this host accepts browser calls, so it is not CORS */
        return 'Could not reach ' + host + '. Check your internet connection and try again. ' +
               'If you are online, the key may be wrong or the account out of credit.';
      }
      return 'Could not reach ' + (host || 'that address') + '. Check the Base URL. ' +
             'OpenAI, OpenRouter, Groq and Google Gemini all work directly from this page; ' +
             'any other endpoint has to allow requests from a browser.';
    }
    if (status === 401) return 'The provider rejected the API key (401). Check the key in the Admin Panel.';
    if (status === 403) return 'The provider refused the request (403). The key may not have access to this model.';
    if (status === 404) return 'The provider returned 404. Usually the Base URL or the model name is wrong.';
    if (status === 429) return 'Rate limit or no credit (429). Wait a moment, or check the account balance.';
    if (status === 400) return 'The provider rejected the request (400): ' + m;
    return m || 'The request failed.';
  }

  /* One chat call. Returns a Promise of the reply text. */
  function chat(cfg, message, systemPrompt) {
    /* Every failure below is reported as a rejected promise rather than a
       thrown error. Callers attach .catch() to the returned promise, and a
       synchronous throw would sail straight past them. */
    try {
      return chatRequest(cfg, message, systemPrompt);
    } catch (e) {
      return Promise.reject(e);
    }
  }

  function chatRequest(cfg, message, systemPrompt) {
    var url = endpointFor(cfg && cfg.baseUrl, cfg && cfg.preset);
    if (!url) return Promise.reject(new Error('No Base URL set.'));
    var key = String((cfg && cfg.apiKey) || '').trim();
    if (!key) return Promise.reject(new Error('No API key set.'));

    assertHostAllowed(url);

    var body = {
      model: String((cfg.model || '').trim()) || (PRESETS[cfg.preset] && PRESETS[cfg.preset].model) || '',
      messages: [
        { role: 'system', content: systemPrompt || 'You are Class AI, a friendly study assistant for AIA Class 10-A students.' },
        { role: 'user', content: message }
      ],
      temperature: Number(cfg.temperature) || 0.7
    };

    var ctrl = ('AbortController' in window) ? new AbortController() : null;
    var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, 45000) : 0;

    return fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + key
      },
      body: JSON.stringify(body),
      signal: ctrl ? ctrl.signal : undefined
    })
      .then(readResponse)
      .then(function (d) {
        var t = extractText(d);
        if (!t) throw new Error('The AI replied with an empty message.');
        return t;
      })
      .catch(function (e) { throw new Error(friendlyError(e, url)); })
      .then(function (v) { if (timer) clearTimeout(timer); return v; },
            function (e) { if (timer) clearTimeout(timer); throw e; });
  }

  return {
    PRESETS: PRESETS,
    CORS_OK_HOSTS: CORS_OK_HOSTS,
    normalizeBaseUrl: normalizeBaseUrl,
    endpointFor: endpointFor,
    friendlyError: friendlyError,
    approveKeyHost: approveKeyHost,
    /* Exposed so the admin panel can refuse to share to an odd endpoint. */
    isKnownGoodHost: isKnownGoodHost,
    isKnownGoodHost: isKnownGoodHost,
    chat: chat
  };
})();
