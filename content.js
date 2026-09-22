// Stop YouTube Auto-Dubbing - v1.1.5
(function () {
  'use strict';

  if (window.__stopYTAutoDubbing) return;
  window.__stopYTAutoDubbing = true;

  const DEBUG = false;
  function log() {
    if (DEBUG) console.log.apply(console, ['[Stop YT Auto-Dubbing]'].concat([].slice.call(arguments)));
  }

  // ---------------------------------------------------------------------------
  // Language tables (lowercase; CJK is unaffected by toLowerCase)
  // ---------------------------------------------------------------------------
  const AUDIO_TRACK_LABELS = [
    'audio track',      // English
    '音轨',              // Chinese Simplified
    '音軌',              // Chinese Traditional
    '音声トラック',       // Japanese
    '오디오'              // Korean
  ];

  const ORIGINAL_LABELS = [
    'original',         // English
    '原始',              // Chinese Simplified
    '原声',              // Chinese Simplified
    '原文',              // Chinese Traditional
    '原聲',              // Chinese Traditional
    'オリジナル',         // Japanese
    '원본'                // Korean
  ];

  const TITLE_SELECTORS = [
    'ytd-watch-metadata #title h1 yt-formatted-string',
    'h1.ytd-watch-metadata yt-formatted-string',
    'h1.ytd-video-primary-info-renderer yt-formatted-string',
    'ytd-reel-video-renderer[is-active] yt-shorts-video-title-view-model h2 span'
  ];

  const DESC_SELECTORS = [
    '#description-inline-expander #attributed-snippet-text .yt-core-attributed-string',
    '#description-inline-expander #expanded yt-attributed-string .yt-core-attributed-string'
  ];

  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------
  let isEnabled = true;
  let gen = 0;                 // bumped on every SPA navigation / disable
  let cookieSet = false;

  let audioDone = false;       // original audio confirmed for this video
  let audioRunning = false;    // menu automation in flight
  let audioAttempts = 0;

  let currentVideoId = null;
  let originalTitle = null;
  let originalDescription = null;
  let metaObserver = null;
  let applying = false;
  let reapplyQueued = false;

  const timers = new Set();
  function later(fn, ms) {
    const id = setTimeout(function () { timers.delete(id); fn(); }, ms);
    timers.add(id);
    return id;
  }
  function clearTimers() {
    timers.forEach(clearTimeout);
    timers.clear();
  }
  function sleep(ms) {
    // plain setTimeout: an in-flight automation must always resume so it can
    // see the generation change and unwind its own state in `finally`.
    return new Promise(function (r) { setTimeout(r, ms); });
  }

  function textMatches(text, list) {
    const t = (text || '').toLowerCase();
    if (!t) return false;
    for (let i = 0; i < list.length; i++) {
      if (t.indexOf(list[i]) !== -1) return true;
    }
    return false;
  }

  function isVideoPage() {
    return location.pathname === '/watch' || location.pathname.indexOf('/shorts/') === 0;
  }

  function getVideoId() {
    const v = new URLSearchParams(location.search).get('v');
    if (v) return v;
    const m = location.pathname.match(/\/shorts\/([^/?]+)/);
    return m ? m[1] : null;
  }

  // ---------------------------------------------------------------------------
  // PREF cookie
  // ---------------------------------------------------------------------------
  function setPreferenceCookie() {
    if (cookieSet) return;
    cookieSet = true;

    try {
      const row = document.cookie.split('; ').find(function (r) { return r.indexOf('PREF=') === 0; });
      const parts = row ? row.substring(5).split('&') : [];

      // Preserve every existing preference (including hl/gl, which control the
      // interface language - the old version silently wiped them) and merge the
      // no-auto-dub bit into any existing f6 bitmask instead of overwriting it.
      let f6 = 0;
      const kept = [];
      parts.forEach(function (p) {
        if (p.indexOf('f6=') === 0) {
          const parsed = parseInt(p.substring(3), 16);
          if (!isNaN(parsed)) f6 = parsed;
        } else if (p) {
          kept.push(p);
        }
      });

      f6 = f6 | 0x400;
      kept.push('f6=' + f6.toString(16));

      document.cookie = 'PREF=' + kept.join('&') + '; domain=.youtube.com; path=/; max-age=31536000';
    } catch (e) {
      log('cookie error', e.message);
    }
  }

  // ---------------------------------------------------------------------------
  // Audio track switching
  // ---------------------------------------------------------------------------
  const HIDE_CLASS = 'syad-menu-hidden';

  function injectStyle() {
    if (document.getElementById('syad-style')) return;
    const s = document.createElement('style');
    s.id = 'syad-style';
    // Keep the settings menu invisible while we drive it, so the user never
    // sees the panel flash open and closed.
    s.textContent =
      '.' + HIDE_CLASS + ' .ytp-popup.ytp-settings-menu{opacity:0!important;' +
      'transition:none!important;pointer-events:none!important;}';
    (document.head || document.documentElement).appendChild(s);
  }

  function getPlayer() {
    return document.querySelector('#movie_player') ||
           document.querySelector('.html5-video-player');
  }

  function settingsMenuOpen(player) {
    const root = player || document;
    const btn = root.querySelector('.ytp-settings-button');
    if (btn && btn.hasAttribute('aria-expanded')) {
      return btn.getAttribute('aria-expanded') === 'true';
    }
    const menu = root.querySelector('.ytp-popup.ytp-settings-menu');
    if (!menu) return false;
    return menu.style.display !== 'none' && getComputedStyle(menu).display !== 'none';
  }

  function menuItemLabel(item) {
    const label = item.querySelector('.ytp-menuitem-label');
    return (label ? label.textContent : item.textContent) || '';
  }

  function menuItemValue(item) {
    const content = item.querySelector('.ytp-menuitem-content');
    return content ? (content.textContent || '') : '';
  }

  function menuItemChecked(item) {
    return item.getAttribute('aria-checked') === 'true' ||
           item.classList.contains('ytp-menuitem-selected') ||
           item.classList.contains('ytp-menuitem-checked');
  }

  function visibleMenuItems(player) {
    // Prefer the panel that is actually on screen, but fall back gracefully if
    // YouTube changes how it marks hidden panels.
    let items = player.querySelectorAll(
      '.ytp-settings-menu .ytp-panel:not([aria-hidden="true"]) .ytp-menuitem'
    );
    if (!items.length) items = player.querySelectorAll('.ytp-settings-menu .ytp-menuitem');
    if (!items.length) items = player.querySelectorAll('.ytp-menuitem');
    return items;
  }

  async function closeSettingsMenu(player) {
    if (!settingsMenuOpen(player)) return;
    const btn = player.querySelector('.ytp-settings-button');
    if (btn) {
      btn.click();
      await sleep(120);
    }
    // Last resort if the toggle did not take.
    if (settingsMenuOpen(player)) {
      player.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true }));
      await sleep(80);
    }
  }

  function scheduleAudioAttempt(myGen, delay) {
    if (audioDone || !isEnabled) return;
    if (audioAttempts >= 12) return;
    audioAttempts++;
    later(function () {
      if (myGen !== gen) return;
      switchToOriginalAudio(myGen);
    }, delay);
  }

  async function switchToOriginalAudio(myGen) {
    if (!isEnabled || audioDone || audioRunning || myGen !== gen) return;
    if (!isVideoPage()) return;

    const player = getPlayer();
    const video = player ? player.querySelector('video') : null;

    // Player not ready yet - retry instead of giving up forever.
    if (!player || !video || video.readyState < 1) {
      scheduleAudioAttempt(myGen, 1000);
      return;
    }

    // The user is browsing the settings menu themselves: never fight them.
    if (settingsMenuOpen(player)) {
      scheduleAudioAttempt(myGen, 2000);
      return;
    }

    audioRunning = true;
    const prevFocus = document.activeElement;
    injectStyle();
    player.classList.add(HIDE_CLASS);

    try {
      const settingsButton = player.querySelector('.ytp-settings-button');
      if (!settingsButton) {
        scheduleAudioAttempt(myGen, 1000);
        return;
      }

      settingsButton.click();
      await sleep(300);
      if (myGen !== gen) return;

      let audioRow = null;
      const rows = visibleMenuItems(player);
      for (let i = 0; i < rows.length; i++) {
        if (textMatches(menuItemLabel(rows[i]), AUDIO_TRACK_LABELS)) {
          audioRow = rows[i];
          break;
        }
      }

      // No audio-track row means the video has a single track: nothing to do.
      if (!audioRow) {
        audioDone = true;
        log('no audio track menu - single track video');
        return;
      }

      // The row already displays the current track. If it is the original one,
      // stop here: opening the submenu and re-selecting the active track is
      // what made already-undubbed videos re-buffer/restart.
      if (textMatches(menuItemValue(audioRow), ORIGINAL_LABELS)) {
        audioDone = true;
        log('original track already active');
        return;
      }

      audioRow.click();
      await sleep(300);
      if (myGen !== gen) return;

      const items = visibleMenuItems(player);
      let target = null;
      for (let i = 0; i < items.length; i++) {
        if (textMatches(menuItemLabel(items[i]), ORIGINAL_LABELS)) {
          target = items[i];
          break;
        }
      }

      if (target && !menuItemChecked(target)) {
        target.click();
        log('switched to original audio');
        await sleep(200);
      }
      audioDone = true;
    } catch (e) {
      log('audio switch error', e.message);
      audioDone = true;
    } finally {
      try {
        await closeSettingsMenu(player);
      } catch (e) { /* ignore */ }
      player.classList.remove(HIDE_CLASS);

      // Give focus back to whatever the user was using (search box, etc.)
      // instead of leaving it parked on the player's gear button.
      try {
        const btn = player.querySelector('.ytp-settings-button');
        if (btn) btn.blur();
        if (prevFocus && prevFocus !== document.body && document.contains(prevFocus)) {
          prevFocus.focus({ preventScroll: true });
        }
      } catch (e) { /* ignore */ }

      audioRunning = false;
    }
  }

  // ---------------------------------------------------------------------------
  // Title / description restoration
  // ---------------------------------------------------------------------------
  function getSchemaMetadata() {
    try {
      const titleMeta = document.querySelector('meta[itemprop="name"]');
      const descMeta = document.querySelector('meta[itemprop="description"]');
      if (titleMeta || descMeta) {
        return {
          title: titleMeta ? titleMeta.content : null,
          description: descMeta ? descMeta.content : null
        };
      }
    } catch (e) {
      log('schema read error', e.message);
    }
    return null;
  }

  async function fetchOriginalMetadata(videoId) {
    try {
      const html = document.documentElement.innerHTML;
      const keyMatch = html.match(/"INNERTUBE_API_KEY":"([^"]+)"/);
      const versionMatch = html.match(/"INNERTUBE_CLIENT_VERSION":"([^"]+)"/);
      if (!keyMatch) return null;

      const response = await fetch(
        'https://www.youtube.com/youtubei/v1/player?key=' + keyMatch[1],
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            videoId: videoId,
            context: {
              client: {
                clientName: 'WEB',
                clientVersion: versionMatch ? versionMatch[1] : '2.20240208.00.00'
              }
            }
          })
        }
      );

      if (!response.ok) return null;
      const data = await response.json();
      if (data && data.videoDetails) {
        return {
          title: data.videoDetails.title || null,
          description: data.videoDetails.shortDescription || null
        };
      }
    } catch (e) {
      log('metadata fetch error', e.message);
    }
    return null;
  }

  function writeText(el, text) {
    if (!el || !text) return;
    // YouTube marks a not-yet-populated node with is-empty, which hides it
    // via CSS even after we put text in.
    if (el.hasAttribute('is-empty')) el.removeAttribute('is-empty');
    const current = el.textContent || '';
    if (current.trim() === '' || current !== text) el.textContent = text;
  }

  // Returns true once the title node exists, so the caller can stop retrying.
  function applyNow() {
    if (!isEnabled) return false;
    if (!originalTitle && !originalDescription) return false;

    let titleFound = false;
    applying = true;
    try {
      if (originalTitle) {
        TITLE_SELECTORS.forEach(function (sel) {
          document.querySelectorAll(sel).forEach(function (el) {
            titleFound = true;
            writeText(el, originalTitle);
          });
        });
        if (document.title !== originalTitle + ' - YouTube' &&
            / - YouTube$/.test(document.title)) {
          document.title = originalTitle + ' - YouTube';
        }
      }

      if (originalDescription) {
        DESC_SELECTORS.forEach(function (sel) {
          document.querySelectorAll(sel).forEach(function (el) {
            writeText(el, originalDescription);
          });
        });
      }
    } catch (e) {
      log('apply error', e.message);
    } finally {
      // Observer callbacks are microtasks, so they run before this timeout and
      // correctly see `applying === true`, which stops us re-entering on our
      // own writes.
      setTimeout(function () { applying = false; }, 0);
    }
    return titleFound;
  }

  // The title node is often stamped late, and YouTube can blank it again while
  // the page settles, so keep re-applying until it sticks.
  function applyWithRetry(myGen, attempt) {
    attempt = attempt || 0;
    if (myGen !== gen || !isEnabled) return;

    const titleFound = applyNow();
    if (titleFound) startMetaObserver();

    if (attempt < 15) {
      later(function () { applyWithRetry(myGen, attempt + 1); }, 200);
    }
  }

  function scheduleReapply() {
    if (applying || reapplyQueued) return;
    reapplyQueued = true;
    setTimeout(function () {
      reapplyQueued = false;
      applyNow();
    }, 100);
  }

  function startMetaObserver() {
    if (metaObserver) return;
    if (!originalTitle && !originalDescription) return;

    const target =
      document.querySelector('#above-the-fold') ||
      document.querySelector('ytd-watch-metadata') ||
      document.querySelector('ytd-watch-flexy');
    if (!target) return;

    metaObserver = new MutationObserver(function () {
      if (applying) return;
      scheduleReapply();
    });
    metaObserver.observe(target, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['is-empty']
    });
  }

  function stopMetaObserver() {
    if (metaObserver) {
      metaObserver.disconnect();
      metaObserver = null;
    }
  }

  async function fixMetadata(myGen) {
    const videoId = getVideoId();
    if (!videoId || !isVideoPage()) return;
    if (videoId === currentVideoId) return;
    currentVideoId = videoId;

    const original = await fetchOriginalMetadata(videoId);
    if (myGen !== gen) return;

    let title = original ? original.title : null;
    let description = original ? original.description : null;

    // Schema.org tags are a fallback only: they are truncated, and the API is
    // the authoritative source.
    if (!title || !description) {
      const schema = getSchemaMetadata();
      if (schema) {
        if (!title) title = schema.title;
        if (!description) description = schema.description;
      }
    }

    if (!title && !description) return;
    if (title) originalTitle = title;
    if (description) originalDescription = description;

    applyWithRetry(myGen, 0);
    log('restored original metadata');
  }

  function startMetadata(myGen, attempts) {
    attempts = attempts || 0;
    if (myGen !== gen || !isEnabled || !isVideoPage()) return;
    if (attempts >= 15) return;

    // Wait for the URL to carry a video id and for the page to settle after
    // an SPA navigation before reading anything.
    if (!getVideoId() || attempts < 2) {
      later(function () { startMetadata(myGen, attempts + 1); }, 300);
      return;
    }

    fixMetadata(myGen);
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------
  function resetForNavigation() {
    gen++;
    clearTimers();
    stopMetaObserver();
    audioDone = false;
    audioRunning = false;
    audioAttempts = 0;
    currentVideoId = null;
    originalTitle = null;
    originalDescription = null;
    applying = false;
    const player = getPlayer();
    if (player) player.classList.remove(HIDE_CLASS);
  }

  function run() {
    if (!isEnabled || !isVideoPage()) return;
    const myGen = gen;
    setPreferenceCookie();
    scheduleAudioAttempt(myGen, 2500);
    startMetadata(myGen, 0);
  }

  function setupNavigationListener() {
    // Note: there is deliberately no `yt-popup-opened` listener. That event
    // fires for every Polymer popup (account menu, share sheet, playlist
    // dialogs) and the old handler clicked player menu items underneath them,
    // which dismissed whatever the user had just opened.
    document.addEventListener('yt-navigate-finish', function () {
      resetForNavigation();
      run();
    });
  }

  function init() {
    chrome.storage.sync.get(['enabled'], function (result) {
      isEnabled = result.enabled !== false;
      setupNavigationListener();
      if (isEnabled) run();
    });

    chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) {
      if (request && request.action === 'toggleEnabled') {
        isEnabled = !!request.enabled;
        resetForNavigation();
        if (isEnabled) {
          run();
        }
        sendResponse({ success: true, reloadNeeded: false });
      }
      return true;
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
