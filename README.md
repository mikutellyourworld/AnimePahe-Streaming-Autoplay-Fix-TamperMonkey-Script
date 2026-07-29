# AnimePahe Streaming Autoplay Fix Tampermonkey Script

A production-ready Tampermonkey userscript that restores reliable AutoNext and AutoPlay behavior on AnimePahe + kwik player pages, including automatic audio restoration after the next episode starts.

[![Userscript checks](https://github.com/mikutellyourworld/AnimePahe-Streaming-Autoplay-Fix-TamperMonkey-Script/actions/workflows/userscript-checks.yml/badge.svg)](https://github.com/mikutellyourworld/AnimePahe-Streaming-Autoplay-Fix-TamperMonkey-Script/actions/workflows/userscript-checks.yml)

Current release: **2.0.11**. See [CHANGELOG.md](CHANGELOG.md) for release history.

## Repository Naming Scheme

This project follows the same naming pattern style as the reference 9Anime project:

- Repository: AnimePahe-Streaming-Autoplay-Fix-TamperMonkey-Script
- Main userscript: animepahe-autonext-v2.user.js
- Product label in script metadata: AnimePahe - Auto-Next & Autoplay Fix v2

## GitHub About (recommended)

Use this exact content in your GitHub repository About panel.

- Description:
  Restores AnimePahe episode AutoNext + AutoPlay with kwik bridge telemetry, one-time autoplay handoff, and automatic post-handoff audio restore.
- Website:
  https://raw.githubusercontent.com/mikutellyourworld/AnimePahe-Streaming-Autoplay-Fix-TamperMonkey-Script/main/animepahe-autonext-v2.user.js
- Topics:
  tampermonkey, userscript, animepahe, kwik, autoplay, autonext, javascript, browser-automation, media-playback

## Quick Summary

- Script file: animepahe-autonext-v2.user.js
- Current script version: 2.0.11
- Runs on:
  - https://animepahe.pw/*
  - https://animepahe.com/*
  - https://animepahe.org/*
  - https://animepahe.ch/*
   - https://kwik.cx/*
   - https://kwik.*/* (provider mirror domains)
- Core features:
  - Reliable end-of-episode detection from kwik video telemetry.
  - AutoNext with cancelable countdown.
  - One-time autoplay handoff when navigating to next episode.
   - Homepage show click can start selected title from episode 1 automatically.
   - Homepage-referrer fallback now only applies on title pages (/series/*, /anime/*), never direct episode/play URLs.
   - Background playback guard for Discord streaming (auto-resume on focus/visibility pause).
  - Auto-unmute and volume restoration after autoplay starts.
  - Persistent ON/OFF toggle state.
  - Cloudflare and other anti-bot verification documents are detected before initialization and left completely untouched.
  - AnimePahe parent logic starts only after a normal application shell is positively identified.

## Anti-Bot Verification Compatibility (v2.0.11)

Anti-bot services can serve verification UI at the normal AnimePahe URL. Because the URL still matches the userscript metadata, an `@exclude` rule alone cannot prevent execution.

Version 2.0.11 includes provider-aware detection for Cloudflare, DDoS-Guard, HUMAN/PerimeterX, DataDome, Imperva, AWS WAF, Akamai, hCaptcha, Google reCAPTCHA, Arkose Labs, and unknown full-page verification interstitials. Detection combines path, strong challenge-shell, title, body-copy, and supporting-asset signals on AnimePahe and kwik hosts.

When a challenge is detected, the script exits before it reads or writes userscript state, injects UI, patches browser history, registers listeners, or starts timers and observers. AnimePahe documents must also contain a positive application marker such as an episode list, a player/server control, or an AnimePahe navigation route. An unknown same-origin document therefore fails closed even if its anti-bot provider changed every known signature. A generic embedded CAPTCHA or Turnstile widget is not enough by itself to suppress AutoNext on a positively identified application page.

The guard does not solve, automate, click, submit, or bypass challenges. It keeps AutoNext inactive while the verification provider performs its own work.

See [ANTIBOT_COMPATIBILITY.md](ANTIBOT_COMPATIBILITY.md) for the complete root-cause analysis, provider matrix, detection contract, rollout, rollback, and residual-risk assessment.

## Development and Release Checks

The repository has no runtime dependencies. Node.js is used only for syntax and regression checks:

```powershell
npm test
```

The command validates userscript syntax and runs the anti-bot and application-ownership zero-side-effect regression suite. GitHub Actions runs the same check for pushes and pull requests.

## Long-Series Redirect Fix (v2.0.6)

### Finding

On some long-running shows (for example, One Piece), entering from homepage-linked play URLs could briefly route through episode 1 and then return to a later episode. This looked like a double-redirect/bounce behavior in browsing history.

### Root cause

The homepage-referrer and click-capture bootstrap rules were broad enough to include non-title entry links, which could force an episode-1 resolution before the site restored the selected episode.

### Fix

Homepage bootstrap is now restricted to title pages only (`/series/*`, `/anime/*`). Direct episode and play deep-links are no longer overridden by episode-1 bootstrap logic.

### Result

Long-series and deep-link entry flows remain stable while preserving intended episode-1 bootstrap behavior for title-page entry.

## What Problem This Solves

AnimePahe episode playback often goes through kwik iframe/video flows. Native site controls may auto-next but not reliably auto-start playback on the next episode, or playback may begin muted depending on autoplay policies. This script solves both:

1. Detects genuine playback completion using kwik video events and progress thresholds.
2. Navigates to the next episode safely and predictably.
3. Automatically starts the next video.
4. Restores audio state so playback does not stay muted after the handoff.

## Detailed Runtime Architecture

### Controller side (AnimePahe page)

The script on AnimePahe pages:

1. Shows AutoNext ON/OFF badge.
2. Captures homepage show-card clicks and stores one-shot episode-1 intent.
3. On selected title page, resolves episode 1 and redirects there.
4. Listens for bridge messages from kwik.
5. Tracks playback position, duration, and percent.
6. Triggers a 2-second cancelable countdown near end-of-episode.
7. Stores a short-lived one-time autoplay intent before navigating.
8. On next page load, clicks Click to load gate until kwik iframe appears.

## Homepage Click -> Episode 1 Behavior

When you click a show card from the AnimePahe homepage:

1. Script stores a short-lived intent for that title path.
2. Intent now supports modern AnimePahe routes, including:
   - Series pages (`/series/<slug>/`)
   - Episode article pages (`/<slug>-episode-<n>-.../`)
   - Legacy anime pages (`/anime/<slug>/`)
3. Once a matching page for that series loads, script resolves the first available episode link (prefer explicit Episode 1).
4. If a homepage click is not captured directly, the page can still bootstrap from same-origin homepage referrer.
5. Script marks autoplay intent and navigates directly to that episode link.
6. Existing autoplay + audio restore logic then starts playback and restores sound preference.

### 2026-05-10 reliability fix

This update specifically fixes the scenario where homepage cards point to an episode article URL (for example, `.../needy-girl-overdose-episode-6-english-subbed/`) and should still redirect to Episode 1 of that same series.

Behavioral changes:

1. Homepage click capture now records intent for series pages and episode-article pages, not only legacy `/anime/` routes.
2. Episode-1 intent matching now works by either exact path match or series slug match.
3. Episode-1 link discovery now scans both `/play/` links and `-episode-` links, and filters candidates to the active series when detectable.
4. Homepage-referrer bootstrap now runs on series-like paths and episode article paths.

### Bridge side (kwik page)

The script on kwik mirror pages:

1. Locates the actual HTML5 video element.
2. Emits normalized progress payloads to parent page via postMessage.
3. Emits ended payload when video finishes.
4. If autoplay intent exists, starts playback muted (policy-friendly).
5. Immediately tries to restore audio based on remembered preference and volume.
6. Persists volume/mute preference continuously via volumechange.

## End Detection Rules

AutoNext is triggered when any of these conditions is true:

1. Native video ended event was received.
2. kwik/native ended-style postMessage was received.
3. Fallback stale timer detects silence only when playback is effectively ended.

Countdown behavior: the 2-second cancelable countdown now starts at the actual end signal, not a few seconds before completion.

## Audio Restoration Logic (Muted Start Fix)

To satisfy browser autoplay policies, autoplay starts muted first. Then:

1. Script checks persisted preference key animepahe_autonext_prefer_unmuted.
2. If user preference is unmuted, script attempts to unmute on playing.
3. If volume is 0, script restores remembered value from animepahe_autonext_volume (fallback 1.0).
4. During the forced-muted autoplay handoff window, muted-state writes are ignored so preference memory is not accidentally flipped to muted.
5. It retries unmute for a longer window because some player layers re-apply muted state several seconds after playback starts.

Result: autoplay succeeds while still restoring audible playback whenever policy and player state allow.

## Background Playback Guard (Discord Streaming)

When streaming AnimePahe in Discord, browser focus changes can pause embedded players.

This script now adds a kwik-side background playback guard that:

1. Detects visibility/focus transitions (`visibilitychange`, `blur`).
2. Detects pause events that happen while tab/window is in background.
3. Attempts to resume playback automatically in those background-only pause cases.
4. Preserves manual pause intent: if you pause while focused, it does not force resume.

Practical note:

- If the browser fully suspends/discards the tab process, no userscript can keep playback alive until the tab is active again. This guard handles normal background throttling/focus pauses, which is the common Discord streaming case.

## Storage Keys and Purpose

- animepahe_autonext_enabled:
  Global ON/OFF toggle state.
- animepahe_autonext_autoplay_until:
  Expiration timestamp for one-time autoplay handoff.
- animepahe_autonext_open_episode_one_until:
   Expiration timestamp for one-shot "go to episode 1" intent.
- animepahe_autonext_open_episode_one_target:
   Path of the clicked destination that created the episode-1 intent.
- animepahe_autonext_open_episode_one_target_series:
   Normalized series slug used to match episode/series pages from homepage clicks.
- animepahe_autonext_prefer_unmuted:
  Persisted preference inferred from user volume/mute actions.
- animepahe_autonext_volume:
  Last known user volume used during audio restore.

## Human Installation Instructions

### Option A: Install from local file

1. Install Tampermonkey in Brave/Chrome/Edge.
2. Open Tampermonkey dashboard.
3. Click Create a new script.
4. Clear template content.
5. Paste full contents of animepahe-autonext-v2.user.js.
6. Save with Ctrl+S.
7. Open or refresh an AnimePahe play page.

### Option B: Install from raw URL

1. Open this URL:
   https://raw.githubusercontent.com/mikutellyourworld/AnimePahe-Streaming-Autoplay-Fix-TamperMonkey-Script/main/animepahe-autonext-v2.user.js
2. Tampermonkey install prompt should appear.
3. Click Install.

### Post-install checks

1. If an anti-bot verification page appears, confirm the AutoNext badge is absent until verification finishes.
2. Visit an AnimePahe episode page.
3. Confirm the top-right badge shows AutoNext ON.
4. Play the episode and wait for the end.
5. Confirm the countdown toast appears.
6. Confirm navigation to the next episode occurs.
7. Confirm the next episode starts and audio is restored.

## LLM / Automation Installation Instructions

Use this section when another assistant, automation runner, or CI doc-bot needs deterministic install steps.

### Inputs required

- Browser with Tampermonkey extension installed.
- Script source from animepahe-autonext-v2.user.js.

### Deterministic procedure

1. Open Tampermonkey dashboard URL.
2. Start New Script action.
3. Replace entire editor content with animepahe-autonext-v2.user.js source.
4. Save script.
5. Ensure script enabled toggle is true.
6. Navigate to an AnimePahe episode URL.
7. Verify UI badge text contains AutoNext ON.
8. Drive playback to completion state.
9. Assert URL changes to next episode.
10. Assert HTML5 video on kwik is not muted after playing settles.

### Validation points for automated agents

- Presence of badge element id animepahe-autonext-badge.
- Presence of countdown toast id animepahe-autonext-toast near end.
- postMessage payload type animepahe-autonext-progress.
- Storage key animepahe_autonext_autoplay_until set before navigation.
- muted flag transitions to false after autoplay handoff when preference allows.

## Source Code Walkthrough (Major Blocks)

1. Metadata Header:
   Defines @match domains, grants, support URLs, and update URLs.
2. Constants:
   Central tuning for thresholds, timers, key names, and message protocol.
3. Storage Helpers:
   Safe GM storage with localStorage fallback.
4. Context Routing:
   AnimePahe controller mode vs kwik bridge mode.
5. UI Layer:
   Toggle badge + countdown toast.
6. End Detection:
   Progress and ended signal handling with stale fallback timer.
7. Navigation Layer:
   Next episode selection and guarded redirect.
8. Autoplay Bootstrap:
   Click to load gate bypass on next episode load.
9. Autoplay Engine:
   Muted autoplay start + one-time intent consumption.
10. Audio Restore:
   Preference-aware unmute and volume recovery retries.
11. Error Reporting:
   Fatal overlay for easier troubleshooting.

## Troubleshooting

### Next episode starts but remains muted

1. Ensure only one AnimePahe userscript is enabled.
2. Refresh once to reload updated script logic.
3. Check browser autoplay and site sound permissions.
4. Interact with player volume once so preference keys are set.

### AutoNext does not trigger

1. Confirm provider URL starts with https://kwik.
2. Verify next episode actually exists.
3. Check if AnimePahe changed selectors.

### Badge missing

1. Confirm URL matches supported domains.
2. Confirm the installed script metadata reports version 2.0.11 or newer. The
   green Tampermonkey enabled switch does not display or prove the installed
   version.
3. Disable duplicate test scripts.
4. If an anti-bot or unknown interstitial is visible, a missing badge is
   expected on the current release. On version 2.0.8, however,
   `document-idle` can remain pending while a challenge never finishes loading,
   so the missing badge alone does not prove that the fix is installed.

### Anti-bot verification loops or shows the AutoNext badge

1. Open the canonical raw userscript and accept Tampermonkey's explicit
   **Update/Reinstall** action.
2. Confirm the installed script metadata reports version 2.0.11 or newer.
3. In Brave, click the Shields lion for `animepahe.pw` and turn Shields down
   for that site. Cloudflare does not support browser modifications to
   fingerprinting APIs such as Canvas or WebGL, and Brave notes that its
   fingerprinting protection can break some sites.
4. Reload once and wait. Repeated refreshes restart verification and create a
   new challenge session.
5. If the loop persists, clear only `animepahe.pw` site data, reopen the site,
   and allow a fresh clearance cookie.
6. Test a clean current browser on the same network. If it succeeds, the
   remaining fault is the original browser profile—not AnimePahe, DNS, the
   network, or AutoNext. Use the successful browser or continue isolating the
   failed profile; do not add simulated input or challenge automation to the
   userscript.
7. If every supported browser fails on multiple stable networks, retain the
   displayed Cloudflare Ray ID for the site operator.
8. Never copy clearance cookies, automate verification, replay challenge
   tokens, or use headless bypass tools.

In the documented 2026-07-29 incident, the installed version was updated to
2.0.11, Brave Shields was disabled only for AnimePahe, the site's five cookies
and site data were deleted, and one fresh verification was allowed to run for
45 seconds. Brave still looped, while Edge InPrivate reached AnimePahe on the
same machine and network. That result isolates the remaining fault to Brave's
profile or Cloudflare's classification of that browser, outside this
userscript. Challenge completion cannot be guaranteed by client-side code.

Official troubleshooting references:

- [Brave site-specific Shields settings](https://support.brave.com/hc/en-us/articles/360023646212-How-do-I-configure-global-and-site-specific-Shields-settings)
- [Cloudflare supported browsers and extension limitations](https://developers.cloudflare.com/cloudflare-challenges/reference/supported-browsers/)
- [Cloudflare challenge solve issues](https://developers.cloudflare.com/cloudflare-challenges/troubleshooting/challenge-solve-issues/)

## Tested Flow Example

- Episode 3:
  https://animepahe.pw/play/97343d0b-f33d-a7d0-3b63-98e0c3a69737/500086499aa279e5d267cb0bf40cdc93fd373a29c18a0d8bbcaff6963573ba9d
- Episode 4:
  https://animepahe.pw/play/97343d0b-f33d-a7d0-3b63-98e0c3a69737/667252b6b34afa1436f5f11b8d5c8d3b0077908977dd25ebf65474a6b8eb2387

## License

MIT License (see LICENSE).
