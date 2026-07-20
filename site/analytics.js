(function () {
  const SESSION_KEY = 'vtv_session_id';
  const ENDPOINT = '/.netlify/functions/track';

  function getSessionId() {
    try {
      let id = localStorage.getItem(SESSION_KEY);
      if (!id) {
        id = (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);
        localStorage.setItem(SESSION_KEY, id);
      }
      return id;
    } catch {
      return 'no-storage';
    }
  }

  function send(eventType, label) {
    const payload = {
      sessionId: getSessionId(),
      eventType,
      page: location.pathname.replace(/^\//, '') || 'index.html',
      label: label || null,
      referrer: document.referrer || null,
    };

    const body = JSON.stringify(payload);
    if (navigator.sendBeacon) {
      navigator.sendBeacon(ENDPOINT, new Blob([body], { type: 'application/json' }));
    } else {
      fetch(ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true }).catch(() => {});
    }
  }

  window.vtvTrack = function (label) {
    send('click', label);
  };

  send('pageview');

  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('[data-track]').forEach(el => {
      el.addEventListener('click', () => send('click', el.getAttribute('data-track')));
    });
  });
})();
