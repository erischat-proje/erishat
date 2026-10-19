(() => {
  'use strict';

  const API = () => (
    window.ERIS_API ||
    window.ERISCHAT_API ||
    'https://erischat-api-production.up.railway.app/v1'
  ).replace(/\/$/, '');

  const TOKEN_KEYS = [
    'erischat_access_token',
    'erischat.accessToken.v1',
    'token',
    'eris_token'
  ];

  let running = false;
  let lastState = '';
  let retryTimer = null;

  function getToken() {
    for (const key of TOKEN_KEYS) {
      const value = localStorage.getItem(key);
      if (value) return value;
    }

    return window.ErisAuth?.getToken?.() || '';
  }

  function syncToken(token) {
    if (!token) return;

    for (const key of TOKEN_KEYS) {
      try {
        localStorage.setItem(key, token);
      } catch (_) {}
    }
  }

  function syncUser(user) {
    if (!user) return;

    window.ErisAuth = window.ErisAuth || {};
    window.ErisAuth.user = user;

    try {
      localStorage.setItem('erischat.remoteUser.v1', JSON.stringify(user));
      localStorage.setItem('erischat.user', JSON.stringify(user));
    } catch (_) {}
  }

  async function getFreshUser() {
    const token = getToken();
    if (!token) return null;

    syncToken(token);

    const response = await fetch(`${API()}/me`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      cache: 'no-store'
    });

    if (!response.ok) {
      throw new Error(`ME_HTTP_${response.status}`);
    }

    const user = await response.json();

    syncUser(user);

    return user;
  }

  function scheduleRetry() {
    clearTimeout(retryTimer);

    retryTimer = setTimeout(() => {
      continueFlow('retry');
    }, 300);
  }

  async function continueFlow(reason) {
    if (running) return;

    const token = getToken();
    if (!token) return;

    running = true;

    try {
      const user = await getFreshUser();

      if (!user) return;

      const state = [
        user.id || user.public_id || '',
        user.profile_completed ? 'profile-done' : 'profile-needed',
        user.welcome_gift_claimed ? 'gift-done' : 'gift-needed'
      ].join(':');

      if (user.profile_completed === false) {
        if (window.ErisOnboarding?.show) {
          if (lastState !== state) {
            lastState = state;
            window.ErisOnboarding.show(user);
          }
        } else {
          scheduleRetry();
        }

        return;
      }

      if (user.profile_completed === true && user.welcome_gift_claimed === false) {
        if (window.ErisWelcome?.show) {
          if (lastState !== state) {
            lastState = state;
            window.ErisWelcome.show(user);
          }
        } else {
          scheduleRetry();
        }

        return;
      }

      lastState = state;

      if (reason === 'auth' || reason === 'retry') {
        console.log('[ErisChat] Google flow complete:', state);
      }
    } catch (error) {
      console.warn('[ErisChat] Google flow check failed:', error);

      if (reason === 'auth' || reason === 'retry') {
        scheduleRetry();
      }
    } finally {
      running = false;
    }
  }

  window.addEventListener('erischat:auth', event => {
    const detail = event.detail || {};

    if (detail.state === 'logged_out') {
      lastState = '';
      return;
    }

    if (detail.state === 'ready') {
      if (detail.user) syncUser(detail.user);

      setTimeout(() => {
        continueFlow('auth');
      }, 50);
    }
  });

  window.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
      continueFlow('boot');
    }, 250);
  });

  if (window.ErisAuth?.user) {
    setTimeout(() => {
      continueFlow('boot');
    }, 250);
  }

  window.ErisGoogleFlowFix = {
    run: () => continueFlow('manual'),
    getToken,
    getFreshUser
  };
})();
