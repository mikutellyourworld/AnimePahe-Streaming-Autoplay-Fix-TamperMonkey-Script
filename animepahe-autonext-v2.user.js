// ==UserScript==
// @name         AnimePahe - Auto-Next & Autoplay Fix v2
// @namespace    https://github.com/mikutellyourworld/AnimePahe-Streaming-Autoplay-Fix-TamperMonkey-Script
// @version      2.0.11
// @description  Restores AnimePahe AutoNext/autoplay while isolating anti-bot verification documents.
// @author       mikutellyourworld
// @match        https://animepahe.pw/*
// @match        https://animepahe.com/*
// @match        https://animepahe.org/*
// @match        https://animepahe.ch/*
// @match        https://kwik.cx/*
// @include      https://kwik.*/*
// @grant        GM_setValue
// @grant        GM_getValue
// @run-at       document-idle
// @homepageURL  https://github.com/mikutellyourworld/AnimePahe-Streaming-Autoplay-Fix-TamperMonkey-Script
// @supportURL   https://github.com/mikutellyourworld/AnimePahe-Streaming-Autoplay-Fix-TamperMonkey-Script/issues
// @downloadURL  https://raw.githubusercontent.com/mikutellyourworld/AnimePahe-Streaming-Autoplay-Fix-TamperMonkey-Script/main/animepahe-autonext-v2.user.js
// @updateURL    https://raw.githubusercontent.com/mikutellyourworld/AnimePahe-Streaming-Autoplay-Fix-TamperMonkey-Script/main/animepahe-autonext-v2.user.js
// ==/UserScript==

(function () {
  'use strict';

  /*
    Anti-bot providers may serve verification documents at the normal
    AnimePahe URL, so metadata @exclude rules cannot reliably keep the
    userscript out. Classify the document before main() touches storage,
    patches history, starts timers, adds observers, or injects UI.

    This is detection and isolation only. The script never solves, clicks,
    submits, or attempts to bypass a challenge.
  */
  const antiBotChallenge = detectAntiBotChallengeDocument();
  if (antiBotChallenge.detected) {
    console.info(
      '[AnimePahe AutoNext] Anti-bot verification detected; suspended for this document.' +
      ' provider=' + antiBotChallenge.provider +
      ' reason=' + antiBotChallenge.reason
    );
    return;
  }

  /*
    A provider can change its verification markup without notice. On an
    AnimePahe hostname, absence of a known challenge signature is therefore
    not sufficient proof that the page belongs to AnimePahe. Require a
    positive application marker before starting the parent-page controller.

    This fail-closed gate performs DOM reads only. If ownership is not proven,
    it returns before storage, history, timers, listeners, observers, or UI.
  */
  const animePaheApplication = detectAnimePaheApplicationDocument();
  if (animePaheApplication.required && !animePaheApplication.detected) {
    console.info(
      '[AnimePahe AutoNext] AnimePahe application shell not detected; suspended for this document.'
    );
    return;
  }

  try {
    main();
  } catch (error) {
    reportFatalError(error);
    throw error;
  }

  function detectAntiBotChallengeDocument() {
    const noChallenge = {
      detected: false,
      provider: null,
      reason: null
    };

    const hostname = String(location.hostname || '');
    const isAnimePaheHost = /(?:^|\.)animepahe\.(pw|com|org|ch)$/i.test(hostname);
    const isKwikHost = /(?:^|\.)kwik\.[a-z0-9.-]+$/i.test(hostname);
    if (!isAnimePaheHost && !isKwikHost) {
      return noChallenge;
    }

    const pathname = String(location.pathname || '');
    const pathSignatures = [
      { provider: 'Cloudflare', pattern: /^\/cdn-cgi(?:\/|$)/i },
      { provider: 'Akamai', pattern: /^\/_sec\/cp_challenge(?:\/|$)/i },
      { provider: 'Imperva', pattern: /^\/_Incapsula_Resource(?:\/|$)/i },
      { provider: 'DDoS-Guard', pattern: /^\/(?:\.well-known\/)?ddos-guard(?:\/|$)/i }
    ];

    for (const signature of pathSignatures) {
      if (signature.pattern.test(pathname)) {
        return {
          detected: true,
          provider: signature.provider,
          reason: 'challenge-path'
        };
      }
    }

    const strongShellSignatures = [
      {
        provider: 'Cloudflare',
        selector: '#challenge-running, #challenge-stage, #cf-challenge-running, form#challenge-form, #cf-error-details'
      },
      {
        provider: 'HUMAN/PerimeterX',
        selector: '#px-captcha, .px-captcha-container'
      },
      {
        provider: 'DataDome',
        selector: '#datadome-captcha, [data-cy="captcha-component"]'
      },
      {
        provider: 'Imperva',
        selector: '#incapsula-error-page, .incapsula-error-page'
      },
      {
        provider: 'AWS WAF',
        selector: '#aws-waf-captcha, .awswaf-captcha-container'
      },
      {
        provider: 'DDoS-Guard',
        selector: '#ddg-challenge, .ddos-guard-challenge'
      },
      {
        provider: 'Akamai',
        selector: 'form[action*="/_sec/cp_challenge/"]'
      }
    ];

    try {
      for (const signature of strongShellSignatures) {
        if (document.querySelector(signature.selector)) {
          return {
            detected: true,
            provider: signature.provider,
            reason: 'challenge-shell'
          };
        }
      }
    } catch (_error) {
      // Fall through to title, body-copy, and supporting-asset signals.
    }

    const title = String(document.title || '').trim();
    const hasChallengeTitle =
      /^(just a moment|attention required|access denied|security (?:check|verification)|verify(?:ing)? (?:that )?you are human|are you human|robot check|captcha(?: challenge)?|checking your browser|ddos protection)\b/i.test(title);

    let bodyText = '';
    try {
      // Challenge copy is short and appears near the top. Bound the scan so
      // a large episode listing cannot turn detection into expensive work.
      bodyText = String(document.body && document.body.textContent || '').slice(0, 20000);
    } catch (_error) {
      if (hasChallengeTitle) {
        return {
          detected: true,
          provider: 'Unknown',
          reason: 'challenge-title-body-unreadable'
        };
      }
    }

    const providerCopySignatures = [
      { provider: 'Cloudflare', pattern: /\b(cloudflare|ray id)\b/i },
      { provider: 'DDoS-Guard', pattern: /\bddos-guard\b/i },
      { provider: 'HUMAN/PerimeterX', pattern: /\b(perimeterx|human security|px-captcha)\b/i },
      { provider: 'DataDome', pattern: /\bdatadome\b/i },
      { provider: 'Imperva', pattern: /\b(imperva|incapsula)\b/i },
      { provider: 'AWS WAF', pattern: /\b(aws waf|awswaf)\b/i },
      { provider: 'Akamai', pattern: /\bakamai\b/i },
      { provider: 'hCaptcha', pattern: /\bhcaptcha\b/i },
      { provider: 'Google reCAPTCHA', pattern: /\b(?:google )?recaptcha\b/i },
      { provider: 'Arkose Labs', pattern: /\b(arkose labs|funcaptcha)\b/i }
    ];

    let copyProvider = null;
    for (const signature of providerCopySignatures) {
      if (signature.pattern.test(bodyText)) {
        copyProvider = signature.provider;
        break;
      }
    }

    const hasGenericChallengeCopy =
      /\b(verifying you are human|verify (?:that )?you are human|checking your browser|unusual traffic|automated requests|bot verification|security (?:check|verification)|enable javascript and cookies|complete (?:the )?(?:security check|captcha)|captcha challenge|i(?:\u0027|\u2019)?m not a robot|press and hold)\b/i.test(bodyText);

    if (hasChallengeTitle && copyProvider) {
      return {
        detected: true,
        provider: copyProvider,
        reason: 'challenge-title-and-copy'
      };
    }

    const supportingAssetSignatures = [
      {
        provider: 'Cloudflare',
        selector: 'input[name="cf-turnstile-response"], [id^="cf-chl-widget-"], script[src*="/cdn-cgi/challenge-platform/"]'
      },
      {
        provider: 'HUMAN/PerimeterX',
        selector: 'script[src*="captcha.px-cdn.net"], script[src*="captcha.px-cloud.net"], iframe[src*="captcha.px-cdn.net"], iframe[src*="captcha.px-cloud.net"], script[src*="/px-captcha/"]'
      },
      {
        provider: 'DataDome',
        selector: 'script[src*="captcha-delivery.com"], iframe[src*="captcha-delivery.com"]'
      },
      {
        provider: 'Imperva',
        selector: 'script[src*="_Incapsula_Resource"], iframe[src*="_Incapsula_Resource"]'
      },
      {
        provider: 'AWS WAF',
        selector: 'script[src*="awswaf.com"], script[src*="aws-waf"], script[src$="/challenge.js"], script[src$="/jsapi.js"]'
      },
      {
        provider: 'DDoS-Guard',
        selector: 'script[src*="check.ddos-guard.net"], script[src*="/ddos-guard/"]'
      },
      {
        provider: 'Akamai',
        selector: 'script[src*="/_sec/cp_challenge/"]'
      },
      {
        provider: 'hCaptcha',
        selector: 'script[src*="hcaptcha.com/1/api.js"], iframe[src*="hcaptcha.com/captcha"]'
      },
      {
        provider: 'Google reCAPTCHA',
        selector: 'script[src*="google.com/recaptcha/"], script[src*="recaptcha.net/recaptcha/"], iframe[src*="google.com/recaptcha/"], iframe[src*="recaptcha.net/recaptcha/"]'
      },
      {
        provider: 'Arkose Labs',
        selector: 'script[src*="arkoselabs.com"], iframe[src*="arkoselabs.com"], script[src*="funcaptcha.com"], iframe[src*="funcaptcha.com"]'
      }
    ];

    let assetProvider = null;
    try {
      for (const signature of supportingAssetSignatures) {
        if (document.querySelector(signature.selector)) {
          assetProvider = signature.provider;
          break;
        }
      }
    } catch (_error) {
      if (hasChallengeTitle) {
        return {
          detected: true,
          provider: copyProvider || 'Unknown',
          reason: 'challenge-title-assets-unreadable'
        };
      }
    }

    if (hasChallengeTitle && assetProvider) {
      return {
        detected: true,
        provider: copyProvider || assetProvider,
        reason: 'challenge-title-and-asset'
      };
    }

    if (hasChallengeTitle && hasGenericChallengeCopy) {
      return {
        detected: true,
        provider: 'Unknown',
        reason: 'challenge-title-and-copy'
      };
    }

    if (copyProvider && assetProvider && copyProvider === assetProvider && hasGenericChallengeCopy) {
      return {
        detected: true,
        provider: copyProvider,
        reason: 'provider-copy-and-asset'
      };
    }

    return noChallenge;
  }

  function detectAnimePaheApplicationDocument() {
    const hostname = String(location.hostname || '');
    if (!/(?:^|\.)animepahe\.(pw|com|org|ch)$/i.test(hostname)) {
      return {
        required: false,
        detected: true,
        reason: 'not-animepahe-host'
      };
    }

    /*
      These markers are owned by normal AnimePahe navigation, title, episode,
      or player UI. Challenge pages can reuse the hostname and pathname, but
      should not contain AnimePahe application routes or player controls.
    */
    const applicationSignatures = [
      { reason: 'episode-list', selector: '#scrollArea' },
      { reason: 'next-episode-control', selector: 'a[title="Play Next Episode"]' },
      { reason: 'homepage-search', selector: 'form.nav-search, .nav-search .input-search' },
      { reason: 'player-load-gate', selector: '.click-to-load, [title="Click to load"], [aria-label="Click to load"]' },
      { reason: 'kwik-player-frame', selector: 'iframe[src*="//kwik."]' },
      { reason: 'player-server-control', selector: 'select[name="mirror"], select[name="server"], select[data-mirror]' },
      { reason: 'play-route', selector: 'a[href*="/play/"], [data-href*="/play/"], [data-url*="/play/"]' },
      { reason: 'anime-route', selector: 'a[href*="/anime/"], [data-href*="/anime/"], [data-url*="/anime/"]' },
      { reason: 'series-route', selector: 'a[href*="/series/"], [data-href*="/series/"], [data-url*="/series/"]' },
      { reason: 'episode-route', selector: 'a[href*="-episode-"], [data-href*="-episode-"], [data-url*="-episode-"]' }
    ];

    try {
      for (const signature of applicationSignatures) {
        if (document.querySelector(signature.selector)) {
          return {
            required: true,
            detected: true,
            reason: signature.reason
          };
        }
      }
    } catch (_error) {
      return {
        required: true,
        detected: false,
        reason: 'application-shell-unreadable'
      };
    }

    return {
      required: true,
      detected: false,
      reason: 'application-shell-absent'
    };
  }

  function main() {

  /*
    Runtime model:

    This single userscript runs on two origins:
    1) animepahe.* watch pages (parent page controller)
    2) kwik.* embed pages (video bridge)

    The kwik side emits normalized playback messages to the parent.
    The animepahe side consumes those messages, decides when playback is
    effectively complete, shows a cancelable countdown, then navigates to
    the next episode.
  */

  // Delay before auto-navigation so users can cancel.
  const COUNTDOWN_SEC = 2;
  // Fallback guard: if near-end progress stops arriving, force-check end logic.
  const STALE_MS = 8000;
  // Tampermonkey storage key for global enable/disable state.
  const STORAGE_KEY = 'animepahe_autonext_enabled';
  // Storage key that signals "auto-play the next episode once" after auto-next nav.
  const AUTOPLAY_UNTIL_KEY = 'animepahe_autonext_autoplay_until';
  // How long autoplay intent should survive navigation in milliseconds.
  const AUTOPLAY_TTL_MS = 2 * 60 * 1000;
  // One-shot intent: from show card click, open selected title at episode 1.
  const OPEN_EPISODE_ONE_UNTIL_KEY = 'animepahe_autonext_open_episode_one_until';
  const OPEN_EPISODE_ONE_TARGET_KEY = 'animepahe_autonext_open_episode_one_target';
  const OPEN_EPISODE_ONE_TARGET_SERIES_KEY = 'animepahe_autonext_open_episode_one_target_series';
  const OPEN_EPISODE_ONE_TARGET_SHOW_ID_KEY = 'animepahe_autonext_open_episode_one_target_show_id';
  const OPEN_EPISODE_ONE_TTL_MS = 2 * 60 * 1000;
  // Short lock to prevent post-redirect bounce back to non-episode-1 pages.
  const EPISODE_ONE_LOCK_UNTIL_KEY = 'animepahe_autonext_episode_one_lock_until';
  const EPISODE_ONE_LOCK_SHOW_ID_KEY = 'animepahe_autonext_episode_one_lock_show_id';
  const EPISODE_ONE_LOCK_TARGET_PATH_KEY = 'animepahe_autonext_episode_one_lock_target_path';
  const EPISODE_ONE_LOCK_TTL_MS = 25 * 1000;
  // Remembers whether the viewer prefers audio unmuted after autoplay handoff.
  const AUTOPLAY_PREFER_UNMUTED_KEY = 'animepahe_autonext_prefer_unmuted';
  // Remembers user volume so auto-unmute can restore previous loudness.
  const AUTOPLAY_VOLUME_KEY = 'animepahe_autonext_volume';
  // When true, keep video playing while tab/window is not focused (Discord stream friendly).
  const BACKGROUND_PLAYBACK_GUARD = true;
  // DOM id for the transient countdown toast.
  const TOAST_ID = 'animepahe-autonext-toast';
  // DOM id for the fixed ON/OFF badge.
  const BADGE_ID = 'animepahe-autonext-badge';
  // Message envelope name shared by parent and iframe contexts.
  // Bridge payload schema:
  // {
  //   type: MESSAGE_TYPE,
  //   kind: 'progress' | 'ended',
  //   currentTime?: number,
  //   duration?: number,
  //   percent?: number
  // }
  const MESSAGE_TYPE = 'animepahe-autonext-progress';

  function getNumericStoredValue(key, fallback) {
    const rawValue = readStoredValue(key, fallback);
    const parsedValue = Number(rawValue);
    return Number.isFinite(parsedValue) ? parsedValue : fallback;
  }

  // Marks a short-lived autoplay intent that the next page load can consume.
  function markAutoplayIntent() {
    writeStoredValue(AUTOPLAY_UNTIL_KEY, Date.now() + AUTOPLAY_TTL_MS);
  }

  // Returns true while the autoplay intent TTL is still valid.
  function hasAutoplayIntent() {
    const autoplayUntil = getNumericStoredValue(AUTOPLAY_UNTIL_KEY, 0);
    return autoplayUntil > Date.now();
  }

  // Clears autoplay intent after it has been consumed or expires.
  function clearAutoplayIntent() {
    writeStoredValue(AUTOPLAY_UNTIL_KEY, 0);
  }

  function normalizePath(pathLike) {
    try {
      const parsed = new URL(pathLike, location.origin);
      return parsed.pathname.replace(/\/+$/, '') || '/';
    } catch (_error) {
      const text = String(pathLike || '').split('#')[0].split('?')[0];
      return text.replace(/\/+$/, '') || '/';
    }
  }

  function extractSeriesSlugFromPath(pathLike) {
    const normalized = normalizePath(pathLike);

    const seriesMatch = normalized.match(/^\/series\/([^/]+)$/i);
    if (seriesMatch) {
      return seriesMatch[1].toLowerCase();
    }

    const animeMatch = normalized.match(/^\/anime\/([^/]+)$/i);
    if (animeMatch) {
      return animeMatch[1].toLowerCase();
    }

    const episodeMatch = normalized.match(/^\/([^/]+)-episode-\d+(?:-[^/]+)?$/i);
    if (episodeMatch) {
      return episodeMatch[1].toLowerCase();
    }

    return '';
  }

  function extractShowIdFromPlayPath(pathLike) {
    const normalized = normalizePath(pathLike);
    const playMatch = normalized.match(/^\/play\/([^/]+)\/[^/]+$/i);
    return playMatch ? playMatch[1].toLowerCase() : '';
  }

  function getCurrentSeriesSlug() {
    const fromPath = extractSeriesSlugFromPath(location.pathname);
    if (fromPath) {
      return fromPath;
    }

    const seriesLink = document.querySelector('a[href*="/series/"]');
    if (seriesLink && seriesLink.href) {
      try {
        const parsedUrl = new URL(seriesLink.href, location.origin);
        return extractSeriesSlugFromPath(parsedUrl.pathname);
      } catch (_error) {
        return '';
      }
    }

    return '';
  }

  function markEpisodeOneIntent(targetPath) {
    writeStoredValue(OPEN_EPISODE_ONE_UNTIL_KEY, Date.now() + OPEN_EPISODE_ONE_TTL_MS);
    const normalizedTargetPath = normalizePath(targetPath);
    writeStoredValue(OPEN_EPISODE_ONE_TARGET_KEY, normalizedTargetPath);
    writeStoredValue(OPEN_EPISODE_ONE_TARGET_SERIES_KEY, extractSeriesSlugFromPath(normalizedTargetPath));
    writeStoredValue(OPEN_EPISODE_ONE_TARGET_SHOW_ID_KEY, extractShowIdFromPlayPath(normalizedTargetPath));
  }

  function hasEpisodeOneIntentForCurrentPage() {
    const until = getNumericStoredValue(OPEN_EPISODE_ONE_UNTIL_KEY, 0);
    if (until <= Date.now()) {
      return false;
    }

    const targetPath = normalizePath(readStoredValue(OPEN_EPISODE_ONE_TARGET_KEY, ''));
    const currentPath = normalizePath(location.pathname);
    if (targetPath && targetPath === currentPath) {
      return true;
    }

    const targetSeries = String(readStoredValue(OPEN_EPISODE_ONE_TARGET_SERIES_KEY, '') || '').toLowerCase();
    const currentSeries = getCurrentSeriesSlug();
    if (targetSeries && currentSeries && targetSeries === currentSeries) {
      return true;
    }

    const targetShowId = String(readStoredValue(OPEN_EPISODE_ONE_TARGET_SHOW_ID_KEY, '') || '').toLowerCase();
    const currentShowId = extractShowIdFromPlayPath(currentPath);
    return Boolean(targetShowId && currentShowId && targetShowId === currentShowId);
  }

  function shouldBootstrapEpisodeOneFromHomepageReferral() {
    if (normalizePath(location.pathname) === '/') {
      return false;
    }

    const currentPath = normalizePath(location.pathname);
    const isBootstrapPath =
      /^\/series\/[^/]+$/i.test(currentPath) ||
      /^\/anime\/[^/]+$/i.test(currentPath) ||
      /^\/play\/[^/]+\/[^/]+$/i.test(currentPath);

    if (!isBootstrapPath) {
      return false;
    }

    try {
      const referrerUrl = new URL(document.referrer || '', location.origin);
      return referrerUrl.origin === location.origin && normalizePath(referrerUrl.pathname) === '/';
    } catch (_error) {
      return false;
    }
  }

  function clearEpisodeOneIntent() {
    writeStoredValue(OPEN_EPISODE_ONE_UNTIL_KEY, 0);
    writeStoredValue(OPEN_EPISODE_ONE_TARGET_KEY, '');
    writeStoredValue(OPEN_EPISODE_ONE_TARGET_SERIES_KEY, '');
    writeStoredValue(OPEN_EPISODE_ONE_TARGET_SHOW_ID_KEY, '');
  }

  function markEpisodeOneLock(targetPath) {
    const normalizedTargetPath = normalizePath(targetPath);
    writeStoredValue(EPISODE_ONE_LOCK_UNTIL_KEY, Date.now() + EPISODE_ONE_LOCK_TTL_MS);
    writeStoredValue(EPISODE_ONE_LOCK_TARGET_PATH_KEY, normalizedTargetPath);
    writeStoredValue(EPISODE_ONE_LOCK_SHOW_ID_KEY, extractShowIdFromPlayPath(normalizedTargetPath));
  }

  function clearEpisodeOneLock() {
    writeStoredValue(EPISODE_ONE_LOCK_UNTIL_KEY, 0);
    writeStoredValue(EPISODE_ONE_LOCK_SHOW_ID_KEY, '');
    writeStoredValue(EPISODE_ONE_LOCK_TARGET_PATH_KEY, '');
  }

  function enforceEpisodeOneLockIfNeeded() {
    const lockUntil = getNumericStoredValue(EPISODE_ONE_LOCK_UNTIL_KEY, 0);
    if (lockUntil <= Date.now()) {
      clearEpisodeOneLock();
      return;
    }

    const targetPath = normalizePath(readStoredValue(EPISODE_ONE_LOCK_TARGET_PATH_KEY, ''));
    const targetShowId = String(readStoredValue(EPISODE_ONE_LOCK_SHOW_ID_KEY, '') || '').toLowerCase();
    if (!targetPath || !targetShowId) {
      clearEpisodeOneLock();
      return;
    }

    const currentPath = normalizePath(location.pathname);
    const currentShowId = extractShowIdFromPlayPath(currentPath);
    if (!currentShowId || currentShowId !== targetShowId) {
      return;
    }

    if (currentPath === targetPath) {
      return;
    }

    location.replace(targetPath);
  }

  function isKwikHost(hostname) {
    return /(?:^|\.)kwik\.[a-z0-9.-]+$/i.test(String(hostname || ''));
  }

  // Branch A: if we are in the provider iframe, only run the bridge logic.
  if (isKwikHost(location.hostname)) {
    initKwikBridge();
    return;
  }

  // Branch B: only run parent-page logic on supported AnimePahe domains.
  if (!/animepahe\.(pw|com|org|ch)$/i.test(location.hostname)) {
    return;
  }

  // True after we decide to move to next episode; prevents duplicate triggers.
  let triggered = false;
  // Tracks current URL for SPA-like and history navigation resets.
  let lastUrl = location.href;
  // Last known playback values reported by kwik bridge.
  let lastTime = 0;
  let lastDuration = 0;
  let lastPercent = 0;
  // Timestamp of the most recent progress message (for stale fallback).
  let lastTimeMessageMs = 0;
  // Handles for active timers so we can clear/re-arm safely.
  let staleTimer = null;
  let countdownTimer = null;

  // Auto-selects a video server when autoplay intent is active
  function autoSelectVideoServerForAutoplay() {
    if (!hasAutoplayIntent()) {
      return;
    }

    let attempts = 0;
    const maxAttempts = 20;
    const interval = setInterval(function () {
      attempts += 1;

      if (!hasAutoplayIntent()) {
        clearInterval(interval);
        return;
      }

      // Check if a kwik iframe is already loaded (video server was selected)
      const kwikFrame = document.querySelector('iframe[src*="//kwik."]');
      if (kwikFrame) {
        clearInterval(interval);
        return;
      }

      // Try to find and click on a video server option (usually an option/button)
      const serverDropdown = document.querySelector('select[name="mirror"], select[name="server"], select[data-mirror], select[id*="mirror" i], select[id*="server" i]');
      if (serverDropdown && serverDropdown.options) {
        // Select first available server (usually index 1, as 0 is "Select Video Server")
        if (serverDropdown.options.length > 1) {
          serverDropdown.selectedIndex = 1;
          // Trigger change event
          const changeEvent = new Event('change', { bubbles: true });
          serverDropdown.dispatchEvent(changeEvent);
          clearInterval(interval);
          return;
        }
      }

      // Alternative: look for visible server selection buttons/links
      const serverButtons = Array.from(document.querySelectorAll('button, a, div[role="button"]')).filter(function (el) {
        const text = (el.textContent || '').toLowerCase();
        // Do not use episode-quality keywords (e.g., "720") to avoid clicking episode controls.
        return text.includes('server') || text.includes('mirror');
      });

      if (serverButtons.length > 0) {
        serverButtons[0].click();
        clearInterval(interval);
        return;
      }

      if (attempts >= maxAttempts) {
        clearInterval(interval);
      }
    }, 600);
  }

  // On arrival to the next episode page, try to pass AnimePahe's "Click to load" gate.
  function runAutoplayBootstrapOnAnimePahe() {
    if (!hasAutoplayIntent()) {
      return;
    }

    const clickLoadGate = function () {
      // Prefer known clickable controls first if present.
      const directTarget = document.querySelector(
        '[title="Click to load"], [aria-label="Click to load"], .reload, .play'
      );

      if (directTarget && typeof directTarget.click === 'function') {
        directTarget.click();
        return true;
      }

      // Fallback: match visible text nodes used by the center "Click to load" overlay.
      const candidates = Array.from(document.querySelectorAll('button, a, div, span'));
      const textMatch = candidates.find(function (element) {
        if (!element || element.offsetParent === null) {
          return false;
        }

        const text = (element.textContent || '').trim().toLowerCase();
        return text === 'click to load' || text.includes('click to load');
      });

      if (textMatch && typeof textMatch.click === 'function') {
        textMatch.click();
        return true;
      }

      return false;
    };

    // Re-attempt briefly because AnimePahe mounts player controls asynchronously.
    let attempts = 0;
    const maxAttempts = 16;
    const interval = setInterval(function () {
      attempts += 1;

      if (!hasAutoplayIntent()) {
        clearInterval(interval);
        return;
      }

      // Once iframe is present, kwik-side logic takes over actual playback start.
      const kwikFrame = document.querySelector('iframe[src*="//kwik."]');
      if (kwikFrame) {
        clearInterval(interval);
        return;
      }

      clickLoadGate();

      if (attempts >= maxAttempts) {
        clearInterval(interval);
      }
    }, 900);
  }

  // Captures homepage show-card clicks so selected shows can always open from episode 1.
  function captureEpisodeOneIntentFromHomepageClick() {
    if (normalizePath(location.pathname) !== '/') {
      return;
    }

    document.addEventListener('click', function (event) {
      const source = event.target;
      if (!source || typeof source.closest !== 'function') {
        return;
      }

      const link = source.closest('a[href], [data-href], [data-url]');
      if (!link) {
        return;
      }

      let href = link.getAttribute('href') || link.getAttribute('data-href') || link.getAttribute('data-url') || '';
      if (!href && typeof link.href === 'string') {
        href = link.href;
      }

      let parsedUrl;
      try {
        parsedUrl = new URL(href, location.origin);
      } catch (_error) {
        return;
      }

      if (parsedUrl.origin !== location.origin) {
        return;
      }

      const destinationPath = normalizePath(parsedUrl.pathname);
      const isEpisodeOneBootstrapDestination =
        /^\/series\/[^/]+$/i.test(destinationPath) ||
        /^\/anime\/[^/]+$/i.test(destinationPath) ||
        /^\/play\/[^/]+\/[^/]+$/i.test(destinationPath);

      if (!isEpisodeOneBootstrapDestination) {
        return;
      }

      markEpisodeOneIntent(destinationPath);
    }, true);
  }

  function readEpisodeNumberFromAnchor(anchor) {
    if (!anchor) {
      return null;
    }

    const sources = [
      anchor.getAttribute('data-episode'),
      anchor.dataset ? anchor.dataset.episode : null,
      anchor.getAttribute('title'),
      anchor.textContent,
      anchor.href
    ];

    for (const source of sources) {
      const text = String(source || '').trim();
      if (!text) {
        continue;
      }

      const namedMatch = text.match(/(?:episode|ep)\s*0*(\d+)/i);
      if (namedMatch) {
        return Number(namedMatch[1]);
      }

      const queryMatch = text.match(/[?&](?:ep|episode)=0*(\d+)/i);
      if (queryMatch) {
        return Number(queryMatch[1]);
      }

      if (/^0*\d+$/.test(text)) {
        return Number(text);
      }
    }

    return null;
  }

  function findEpisodeOneLink() {
    const currentSeries = getCurrentSeriesSlug();

    const rawLinks = Array.from(document.querySelectorAll(
      '#scrollArea a.dropdown-item[href], .dropdown-menu a.dropdown-item[href], a.dropdown-item[href], a[href*="/play/"], a[href*="-episode-"]'
    ));

    const candidateLinks = rawLinks.filter(function (link) {
      if (!link || !link.href) {
        return false;
      }

      try {
        const parsedUrl = new URL(link.href, location.origin);
        if (parsedUrl.origin !== location.origin) {
          return false;
        }

        const normalizedPath = normalizePath(parsedUrl.pathname);
        const isSupportedEpisodeLink = /^\/play\//i.test(normalizedPath) || /^\/[^/]+-episode-\d+(?:-[^/]+)?$/i.test(normalizedPath);
        if (!isSupportedEpisodeLink) {
          return false;
        }

        if (!currentSeries) {
          return true;
        }

        const linkSeries = extractSeriesSlugFromPath(normalizedPath);
        return !linkSeries || linkSeries === currentSeries;
      } catch (_error) {
        return false;
      }
    });

    const exactEpisodeOne = candidateLinks.find(function (link) {
      return readEpisodeNumberFromAnchor(link) === 1;
    });

    if (exactEpisodeOne) {
      return exactEpisodeOne;
    }

    let bestLink = null;
    let lowestEpisode = Infinity;
    for (const link of candidateLinks) {
      const episodeNumber = readEpisodeNumberFromAnchor(link);
      if (Number.isFinite(episodeNumber) && episodeNumber > 0 && episodeNumber < lowestEpisode) {
        lowestEpisode = episodeNumber;
        bestLink = link;
      }
    }

    if (bestLink) {
      return bestLink;
    }

    return document.querySelector('#scrollArea a[href*="/play/"], a.btn[href*="/play/"]');
  }

  // On title page with pending intent, jump to episode 1 and pass autoplay intent.
  function runEpisodeOneBootstrapOnAnimePahe() {
    const shouldBootstrapFromReferral = shouldBootstrapEpisodeOneFromHomepageReferral();
    if (!hasEpisodeOneIntentForCurrentPage() && !shouldBootstrapFromReferral) {
      return;
    }

    let attempts = 0;
    const maxAttempts = 20;
    const interval = setInterval(function () {
      attempts += 1;

      if (!hasEpisodeOneIntentForCurrentPage() && !shouldBootstrapFromReferral) {
        clearInterval(interval);
        return;
      }

      const episodeOneLink = findEpisodeOneLink();
      if (episodeOneLink && episodeOneLink.href) {
        const targetUrl = new URL(episodeOneLink.href, location.origin);
        const currentUrl = new URL(location.href);
        const sameEpisode =
          normalizePath(targetUrl.pathname) === normalizePath(currentUrl.pathname) &&
          targetUrl.search === currentUrl.search;

        // If we're already at episode 1, just hand off autoplay and stop.
        if (sameEpisode) {
          markEpisodeOneLock(targetUrl.pathname);
          markAutoplayIntent();
          clearEpisodeOneIntent();
          clearInterval(interval);
          return;
        }

        markEpisodeOneLock(targetUrl.pathname);
        markAutoplayIntent();
        clearEpisodeOneIntent();
        location.href = episodeOneLink.href;
        clearInterval(interval);
        return;
      }

      if (attempts >= maxAttempts) {
        clearEpisodeOneIntent();
        clearEpisodeOneLock();
        clearInterval(interval);
      }
    }, 300);
  }

  function readStoredValue(key, fallback) {
    try {
      if (typeof GM_getValue === 'function') {
        return GM_getValue(key, fallback);
      }
    } catch (_error) {
      // Fall through to localStorage fallback.
    }

    try {
      const rawValue = localStorage.getItem(key);
      if (rawValue === null) {
        return fallback;
      }

      if (rawValue === 'true') {
        return true;
      }

      if (rawValue === 'false') {
        return false;
      }

      return rawValue;
    } catch (_error) {
      return fallback;
    }
  }

  function writeStoredValue(key, value) {
    try {
      if (typeof GM_setValue === 'function') {
        GM_setValue(key, value);
        return;
      }
    } catch (_error) {
      // Fall through to localStorage fallback.
    }

    try {
      localStorage.setItem(key, String(value));
    } catch (_error) {
      // Ignore storage failures; the script can still run for this page load.
    }
  }

  // Reads persisted toggle state (default ON).
  function isEnabled() {
    return readStoredValue(STORAGE_KEY, true);
  }

  // Persists toggle state and refreshes badge color/text immediately.
  function setEnabled(nextValue) {
    writeStoredValue(STORAGE_KEY, nextValue);
    updateBadge(nextValue);
  }

  // Convenience handler for badge click.
  function toggleEnabled() {
    setEnabled(!isEnabled());
  }

  // Clears countdown interval if currently running.
  function clearCountdown() {
    if (countdownTimer) {
      clearInterval(countdownTimer);
      countdownTimer = null;
    }
  }

  // Clears stale fallback timeout if currently armed.
  function clearStaleTimer() {
    if (staleTimer) {
      clearTimeout(staleTimer);
      staleTimer = null;
    }
  }

  // Removes the countdown toast from the page if it exists.
  function removeToast() {
    const existing = document.getElementById(TOAST_ID);
    if (existing) {
      existing.remove();
    }
  }

  // Resets all episode-scoped state whenever episode URL changes.
  function resetEpisodeState() {
    triggered = false;
    lastTime = 0;
    lastDuration = 0;
    lastPercent = 0;
    lastTimeMessageMs = 0;
    clearCountdown();
    clearStaleTimer();
    removeToast();
  }

  // Detects navigation changes and resets state for the new episode.
  function onEpisodeChange() {
    if (location.href === lastUrl) {
      return;
    }

    lastUrl = location.href;
    enforceEpisodeOneLockIfNeeded();
    resetEpisodeState();
    injectBadge();
    runEpisodeOneBootstrapOnAnimePahe();
    autoSelectVideoServerForAutoplay();
    runAutoplayBootstrapOnAnimePahe();
  }

  // Updates the visible ON/OFF badge based on effective enabled state.
  function updateBadge(enabled) {
    const badge = document.getElementById(BADGE_ID);
    if (!badge) {
      return;
    }

    badge.textContent = 'AutoNext ' + (enabled ? 'ON' : 'OFF');
    badge.style.background = enabled ? '#19b56b' : '#666';
  }

  // Injects a floating toggle badge once; subsequent calls are idempotent.
  function injectBadge() {
    if (!document.body || document.getElementById(BADGE_ID)) {
      updateBadge(isEnabled());
      return;
    }

    const badge = document.createElement('div');
    badge.id = BADGE_ID;
    badge.style.cssText = [
      'position:fixed',
      'top:12px',
      'right:12px',
      'z-index:2147483646',
      'background:#19b56b',
      'color:#fff',
      'padding:6px 14px',
      'border-radius:6px',
      'font:bold 12px sans-serif',
      'cursor:pointer',
      'box-shadow:0 2px 8px rgba(0,0,0,.4)',
      'transition:background .2s'
    ].join(';');

    badge.title = 'Toggle Auto-Next';
    badge.addEventListener('click', toggleEnabled);
    document.body.appendChild(badge);
    updateBadge(isEnabled());
  }

  // Arms stale fallback only when we're close enough to the episode end.
  function armStaleTimer() {
    clearStaleTimer();

    if (lastPercent < 90) {
      return;
    }

    staleTimer = setTimeout(function () {
      if (triggered || !isEnabled()) {
        return;
      }

      const silenceMs = Date.now() - lastTimeMessageMs;
      const remaining = lastDuration > 0 ? (lastDuration - lastTime) : Infinity;
      const isEffectivelyEnded = remaining <= 0.25 || lastPercent >= 99.95;
      if (silenceMs >= STALE_MS && isEffectivelyEnded) {
        fireNextEpisode('stale-fallback');
      }
    }, STALE_MS);
  }

  // Primary selector for AnimePahe's explicit next-episode anchor.
  function getNextEpisodeLink() {
    return document.querySelector('a[title="Play Next Episode"]');
  }

  // Navigates to next episode using strongest control first, then fallback.
  function attemptNextEpisode() {
    const nextLink = getNextEpisodeLink();
    if (nextLink && nextLink.href) {
      // Persist one-shot autoplay intent before leaving this episode.
      markAutoplayIntent();
      location.href = nextLink.href;
      return true;
    }

    const activeEpisode = document.querySelector('#scrollArea .dropdown-item.active, .dropdown-item.active');
    const nextEpisodeItem = activeEpisode ? activeEpisode.nextElementSibling : null;
    if (nextEpisodeItem && nextEpisodeItem.tagName === 'A' && nextEpisodeItem.href) {
      // Persist one-shot autoplay intent before fallback navigation too.
      markAutoplayIntent();
      location.href = nextEpisodeItem.href;
      return true;
    }

    return false;
  }

  // Renders a cancelable countdown toast; callback fires on zero.
  function showCountdown(seconds, callback) {
    let remaining = seconds;

    clearCountdown();
    removeToast();

    const toast = document.createElement('div');
    toast.id = TOAST_ID;
    toast.style.cssText = [
      'position:fixed',
      'bottom:80px',
      'right:24px',
      'z-index:2147483647',
      'background:rgba(15,15,25,.95)',
      'color:#fff',
      'padding:14px 20px',
      'border-radius:10px',
      'font:bold 14px sans-serif',
      'box-shadow:0 4px 24px rgba(0,0,0,.6)',
      'display:flex',
      'flex-direction:column',
      'gap:8px',
      'min-width:220px',
      'border:1px solid rgba(0,209,178,.35)'
    ].join(';');

    const label = document.createElement('span');
    label.style.fontSize = '15px';
    label.textContent = 'Next episode in ' + remaining + 's...';
    toast.appendChild(label);

    const cancelButton = document.createElement('button');
    cancelButton.textContent = 'Cancel';
    cancelButton.style.cssText = [
      'background:#d43',
      'color:#fff',
      'border:none',
      'border-radius:5px',
      'padding:5px 14px',
      'cursor:pointer',
      'font-size:13px',
      'font-weight:bold',
      'align-self:flex-end'
    ].join(';');

    cancelButton.addEventListener('click', function () {
      clearCountdown();
      removeToast();
      triggered = false;
      armStaleTimer();
    });

    toast.appendChild(cancelButton);
    document.body.appendChild(toast);

    countdownTimer = setInterval(function () {
      remaining -= 1;
      label.textContent = 'Next episode in ' + remaining + 's...';

      if (remaining <= 0) {
        clearCountdown();
        removeToast();
        callback();
      }
    }, 1000);
  }

  // Central trigger path: guard, log, toast, and navigation attempt.
  function fireNextEpisode(source) {
    if (triggered || !isEnabled()) {
      return;
    }

    triggered = true;
    clearStaleTimer();

    console.log(
      '[AnimePahe AutoNext] Firing: ' + source +
      ' | time=' + lastTime +
      ' | duration=' + lastDuration +
      ' | percent=' + lastPercent
    );

    showCountdown(COUNTDOWN_SEC, function () {
      if (!attemptNextEpisode()) {
        triggered = false;
      }
    });
  }

  // kwik sometimes sends plain ended-style messages to parent; accept those too.
  function isNativeEndedMessage(data) {
    if (data === 'ended') {
      return true;
    }

    if (!data || typeof data !== 'object') {
      return false;
    }

    return data.event === 'ended' || data.type === 'ended' || data.playerState === 0;
  }

  // Consumes progress/ended messages from kwik and evaluates end conditions.
  function handleBridgeMessage(event) {
    if (!isEnabled() || triggered) {
      return;
    }

    // Security gate: only accept provider messages from secure kwik origins.
    let originUrl;
    try {
      originUrl = new URL(event.origin);
    } catch (_error) {
      return;
    }

    if (originUrl.protocol !== 'https:' || !isKwikHost(originUrl.hostname)) {
      return;
    }

    const data = event.data;
    if (isNativeEndedMessage(data)) {
      fireNextEpisode('ended-native');
      return;
    }

    if (!data || data.type !== MESSAGE_TYPE) {
      return;
    }

    if (data.kind === 'progress') {
      if (typeof data.currentTime !== 'number' || typeof data.duration !== 'number') {
        return;
      }

      lastTimeMessageMs = Date.now();
      lastTime = data.currentTime;
      lastDuration = data.duration;
      lastPercent = typeof data.percent === 'number' ? data.percent : 0;

      armStaleTimer();
      return;
    }

    if (data.kind === 'ended') {
      fireNextEpisode('ended-bridge');
    }
  }

  // Listen for bridge traffic from kwik iframe.
  window.addEventListener('message', handleBridgeMessage);

  // Patch history APIs so SPA-like route updates still trigger episode reset.
  const originalPushState = history.pushState;
  history.pushState = function () {
    originalPushState.apply(this, arguments);
    onEpisodeChange();
  };

  const originalReplaceState = history.replaceState;
  history.replaceState = function () {
    originalReplaceState.apply(this, arguments);
    onEpisodeChange();
  };

  window.addEventListener('popstate', onEpisodeChange);

  // Re-inject defensively in case page scripts mutate the DOM late.
  captureEpisodeOneIntentFromHomepageClick();
  injectBadge();
  runEpisodeOneBootstrapOnAnimePahe();
  enforceEpisodeOneLockIfNeeded();
  autoSelectVideoServerForAutoplay();
  runAutoplayBootstrapOnAnimePahe();
  setTimeout(injectBadge, 1000);
  setTimeout(injectBadge, 3000);
  setTimeout(autoSelectVideoServerForAutoplay, 1500);

  // Poll URL changes as an additional fallback for non-standard navigation.
  setInterval(onEpisodeChange, 1000);

  console.log('[AnimePahe AutoNext] Loaded. Waiting for player bridge messages.');

  // kwik-side bridge: capture native video state and post to parent page.
  function initKwikBridge() {
    // Snapshot autoplay intent once at startup. If true, attempt muted autoplay.
    const shouldAutoplay = hasAutoplayIntent();
    // Persisted user preference: after autoplay starts, should we attempt to unmute?
    const preferUnmuted = readStoredValue(AUTOPLAY_PREFER_UNMUTED_KEY, true) !== false;
    const rememberedVolume = Math.max(0, Math.min(1, getNumericStoredValue(AUTOPLAY_VOLUME_KEY, 1)));

    // Sends payload to top frame, falling back to parent frame if needed.
    const sendMessage = function (payload) {
      try {
        window.top.postMessage(payload, '*');
      } catch (_error) {
        window.parent.postMessage(payload, '*');
      }
    };

    // Binds listeners once per video element instance.
    const attachBridge = function (video) {
      if (!video || video.dataset.autonextBridgeAttached === 'true') {
        return;
      }

      video.dataset.autonextBridgeAttached = 'true';
      let userPausedManually = false;
      let internalResumeInProgress = false;

      // Normalized progress payload used by parent threshold logic.
      const sendProgress = function () {
        const duration = Number(video.duration);
        const currentTime = Number(video.currentTime);
        const percent = duration > 0 ? (currentTime / duration) * 100 : 0;

        sendMessage({
          type: MESSAGE_TYPE,
          kind: 'progress',
          currentTime: currentTime,
          duration: duration,
          percent: percent
        });
      };

      // Browser policies generally permit muted autoplay after a prior user play.
      let suppressPreferenceWriteUntil = 0;
      const attemptAutoplay = function () {
        if (!shouldAutoplay || video.dataset.autonextAutoplayAttempted === 'true') {
          return;
        }

        video.dataset.autonextAutoplayAttempted = 'true';
        // Avoid learning a false muted preference from policy-mandated muted start.
        suppressPreferenceWriteUntil = Date.now() + 5000;
        video.muted = true;

        try {
          const playPromise = video.play();
          if (playPromise && typeof playPromise.catch === 'function') {
            playPromise.catch(function (error) {
              console.warn('[AnimePahe AutoNext] Autoplay attempt was blocked.', error);
            });
          }
        } catch (error) {
          console.warn('[AnimePahe AutoNext] Autoplay call threw.', error);
        }
      };

      // Persists current viewer audio preference for future autoplay handoffs.
      const persistAudioPreference = function () {
        const shouldSuppressPersist = shouldAutoplay &&
          video.dataset.autonextAutoplayAttempted === 'true' &&
          Date.now() < suppressPreferenceWriteUntil &&
          video.muted;

        if (shouldSuppressPersist) {
          return;
        }

        const hasAudibleOutput = !video.muted && Number(video.volume) > 0;
        writeStoredValue(AUTOPLAY_PREFER_UNMUTED_KEY, hasAudibleOutput);
        writeStoredValue(AUTOPLAY_VOLUME_KEY, Number(video.volume));
      };

      // After muted autoplay starts, attempt to restore audible playback.
      // Retries are needed because some player layers race to re-apply muted state.
      const restoreAudioAfterAutoplay = function () {
        if (!shouldAutoplay || !preferUnmuted) {
          return;
        }

        let attempts = 0;
        const maxAttempts = 24;
        let timer = null;
        const attemptUnmute = function () {
          attempts += 1;

          video.muted = false;
          if (Number(video.volume) <= 0) {
            video.volume = rememberedVolume > 0 ? rememberedVolume : 1;
          }

          if ((!video.muted && Number(video.volume) > 0) || attempts >= maxAttempts) {
            clearInterval(timer);
            if (!video.muted && Number(video.volume) > 0) {
              persistAudioPreference();
            }
          }
        };

        attemptUnmute();
        timer = setInterval(attemptUnmute, 250);
      };

      // Detailed logging for background keep-alive debugging
      const logBackgroundEvent = function (event, details) {
        if (true) { // Set to false to disable verbose logging
          console.log('[AnimePahe AutoNext Background] ' + event + ' | ' + JSON.stringify(details));
        }
      };

      // Detects if browser/tab is in background or not focused for Discord streaming scenarios.
      const isInBackgroundContext = function () {
        if (typeof document.hidden === 'boolean' && document.hidden) {
          return true;
        }

        if (typeof document.visibilityState === 'string' && document.visibilityState === 'hidden') {
          return true;
        }

        if (typeof document.hasFocus === 'function' && !document.hasFocus()) {
          return true;
        }

        // Additional check: if window is not active or tab is not focused
        if (typeof window.onblur !== 'undefined') {
          try {
            // Some browsers hide this but we can infer from document.activeElement
            if (document.activeElement === document.body) {
              return false; // Likely focused
            }
          } catch (_) {
            // Ignore errors
          }
        }

        return false;
      };

      // Keeps playback alive when visibility/focus transitions pause the player.
      // This is especially important for Discord streaming where tab may be backgrounded/minimized.
      const ensureBackgroundPlayback = function (reason) {
        if (!BACKGROUND_PLAYBACK_GUARD) {
          return;
        }

        if (!video || video.ended || video.readyState < 2 || userPausedManually) {
          return;
        }

        const isBackgroundContext = isInBackgroundContext();
        if (!isBackgroundContext) {
          return;
        }

        // Already playing, no need to resume
        if (!video.paused) {
          return;
        }

        internalResumeInProgress = true;
        try {
          const playPromise = video.play();
          if (playPromise && typeof playPromise.catch === 'function') {
            playPromise.catch(function (error) {
              console.warn('[AnimePahe AutoNext] Background resume blocked (' + reason + ').', error);
            }).finally(function () {
              internalResumeInProgress = false;
            });
          } else {
            internalResumeInProgress = false;
          }
        } catch (error) {
          internalResumeInProgress = false;
          console.warn('[AnimePahe AutoNext] Background resume threw (' + reason + ').', error);
        }
      };

      // Continuous keep-alive using requestAnimationFrame: prevents pause during Discord streaming.
      // Monitors video state every animation frame (~60fps) while in background.
      let backgroundPlaybackLoopActive = false;
      let backgroundPlaybackRafId = null;
      let lastBackgroundResumeAttempt = 0;
      const BACKGROUND_RESUME_THROTTLE_MS = 150; // More aggressive: 150ms instead of 300ms

      const backgroundPlaybackRafLoop = function () {
        if (!backgroundPlaybackLoopActive) {
          return;
        }

        if (!video) {
          backgroundPlaybackLoopActive = false;
          return;
        }

        // Only monitor if actually in background
        if (!isInBackgroundContext()) {
          backgroundPlaybackRafId = requestAnimationFrame(backgroundPlaybackRafLoop);
          return;
        }

        // Check conditions but don't bail - we want to keep checking
        if (!video.ended && video.readyState >= 2 && !userPausedManually) {
          // If paused in background, attempt to resume (throttled)
          if (video.paused) {
            const now = Date.now();
            if (now - lastBackgroundResumeAttempt >= BACKGROUND_RESUME_THROTTLE_MS) {
              lastBackgroundResumeAttempt = now;
              logBackgroundEvent('RAFLoop_RESUME', { currentTime: video.currentTime, duration: video.duration });
              ensureBackgroundPlayback('raf-continuous');
            }
          }
        }

        backgroundPlaybackRafId = requestAnimationFrame(backgroundPlaybackRafLoop);
      };

      const startBackgroundPlaybackLoop = function () {
        if (backgroundPlaybackLoopActive) {
          return;
        }

        logBackgroundEvent('START_LOOP', { });
        backgroundPlaybackLoopActive = true;
        lastBackgroundResumeAttempt = 0;
        
        if (backgroundPlaybackRafId !== null) {
          cancelAnimationFrame(backgroundPlaybackRafId);
        }
        backgroundPlaybackRafId = requestAnimationFrame(backgroundPlaybackRafLoop);
      };

      const stopBackgroundPlaybackLoop = function () {
        if (!backgroundPlaybackLoopActive) {
          return;
        }

        logBackgroundEvent('STOP_LOOP', { });
        backgroundPlaybackLoopActive = false;
        
        if (backgroundPlaybackRafId !== null) {
          cancelAnimationFrame(backgroundPlaybackRafId);
          backgroundPlaybackRafId = null;
        }
      };

      // Playback started successfully: consume the one-shot intent.
      video.addEventListener('playing', function () {
        userPausedManually = false;
        clearAutoplayIntent();
        restoreAudioAfterAutoplay();
      }, { once: true });

      video.addEventListener('play', function () {
        logBackgroundEvent('PLAY_EVENT', { duration: video.duration, currentTime: video.currentTime });
        userPausedManually = false;
        // Stop the loop once playback resumes
        stopBackgroundPlaybackLoop();
      });

      video.addEventListener('pause', function () {
        const isBackgroundContext = isInBackgroundContext();
        logBackgroundEvent('PAUSE_EVENT', { 
          inProgress: internalResumeInProgress, 
          isBackground: isBackgroundContext,
          duration: video.duration,
          currentTime: video.currentTime
        });
        
        if (internalResumeInProgress) {
          logBackgroundEvent('PAUSE_IGNORED_RESUMING', { });
          return;
        }

        userPausedManually = !isBackgroundContext;

        if (isBackgroundContext) {
          logBackgroundEvent('PAUSE_TRIGGERED_RECOVERY', { });
          startBackgroundPlaybackLoop();
          ensureBackgroundPlayback('pause');
        }
      });

      document.addEventListener('visibilitychange', function () {
        const isBackground = isInBackgroundContext();
        logBackgroundEvent('VISIBILITY_CHANGE', { 
          hidden: document.hidden,
          visibilityState: document.visibilityState,
          isBackground: isBackground
        });
        
        if (isBackground) {
          startBackgroundPlaybackLoop();
          ensureBackgroundPlayback('visibilitychange');
        } else {
          stopBackgroundPlaybackLoop();
        }
      }, true);

      window.addEventListener('blur', function () {
        const isBackground = isInBackgroundContext();
        logBackgroundEvent('BLUR_EVENT', { isBackground: isBackground });
        
        if (isBackground) {
          startBackgroundPlaybackLoop();
          ensureBackgroundPlayback('blur-event');
        }
      }, true);

      window.addEventListener('focus', function () {
        logBackgroundEvent('FOCUS_EVENT', { paused: video.paused });
        stopBackgroundPlaybackLoop();
        if (!video.paused) {
          userPausedManually = false;
        }
      }, true);

      video.addEventListener('timeupdate', sendProgress);
      video.addEventListener('durationchange', sendProgress);
      video.addEventListener('loadedmetadata', function () {
        sendProgress();
        // Start background loop as soon as metadata is ready
        if (isInBackgroundContext()) {
          logBackgroundEvent('LOADEDMETADATA_BACKGROUND', { });
          startBackgroundPlaybackLoop();
        }
      });
      video.addEventListener('canplay', attemptAutoplay);
      video.addEventListener('volumechange', persistAudioPreference);
      video.addEventListener('ended', function () {
        sendMessage({
          type: MESSAGE_TYPE,
          kind: 'ended'
        });
      });

      // Capture baseline preference as soon as the element is attached.
      persistAudioPreference();

      // Immediate try covers cases where metadata is already available.
      attemptAutoplay();
      ensureBackgroundPlayback('initial');

      // Start background playback loop if already in background context.
      if (isInBackgroundContext()) {
        logBackgroundEvent('INITIAL_BACKGROUND_DETECTED', { });
        startBackgroundPlaybackLoop();
      }

      logBackgroundEvent('BRIDGE_ATTACHED', { videoId: video.id, hasKwikPlayer: !!document.querySelector('video#kwikPlayer') });
    };

    // kwik currently uses #kwikPlayer, but keep generic video fallback.
    const findVideo = function () {
      return document.querySelector('video#kwikPlayer, video');
    };

    // Tries to attach immediately and whenever DOM changes add/replace video.
    const start = function () {
      const video = findVideo();
      if (video) {
        attachBridge(video);
      }
    };

    start();

    // Required because provider pages may lazily mount player markup.
    const observer = new MutationObserver(start);
    observer.observe(document.documentElement || document.body, {
      childList: true,
      subtree: true
    });
  }

  }

  function reportFatalError(error) {
    try {
      const existing = document.getElementById('animepahe-autonext-fatal');
      if (existing) {
        existing.remove();
      }

      const panel = document.createElement('div');
      panel.id = 'animepahe-autonext-fatal';
      panel.style.cssText = [
        'position:fixed',
        'top:12px',
        'left:12px',
        'z-index:2147483647',
        'max-width:420px',
        'background:#8b0000',
        'color:#fff',
        'padding:12px 14px',
        'border-radius:8px',
        'font:12px/1.4 sans-serif',
        'box-shadow:0 4px 18px rgba(0,0,0,.45)',
        'white-space:pre-wrap'
      ].join(';');

      const message = error && error.message ? error.message : String(error);
      panel.textContent = 'AnimePahe AutoNext failed to load.\n' + message;

      if (document.body) {
        document.body.appendChild(panel);
      } else {
        window.addEventListener('DOMContentLoaded', function onReady() {
          window.removeEventListener('DOMContentLoaded', onReady);
          document.body.appendChild(panel);
        });
      }
    } catch (_error) {
      // Ignore secondary reporting failures.
    }
  }
})();
