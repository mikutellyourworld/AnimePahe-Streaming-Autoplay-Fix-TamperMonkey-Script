# Changelog

All notable changes to this project are documented here.

## [2.0.11] - 2026-07-29

### Fixed

- Added a positive AnimePahe application-shell allowlist before parent-controller initialization. Unknown or changed interstitial markup now fails closed even when no provider signature matches.
- Extended full-page anti-bot detection to matched kwik player hosts instead of treating every kwik document as a normal player page.
- Added zero-side-effect regression coverage for unknown same-origin interstitials with no recognized provider branding.

### Documented

- Recorded the follow-up reproduction where verification remained stalled with the AutoNext badge absent and in a clean browser session without the userscript.
- Split userscript isolation acceptance from Cloudflare challenge completion, which can still fail because of browser configuration, extensions, cookies, JavaScript, network conditions, or provider-side detection.
- Added a Brave-specific recovery sequence based on official Brave and Cloudflare troubleshooting guidance.

## [2.0.10] - 2026-07-28

### Added

- Provider-aware anti-bot detection for Cloudflare, DDoS-Guard, HUMAN/PerimeterX, DataDome, Imperva, AWS WAF, Akamai, hCaptcha, Google reCAPTCHA, Arkose Labs, and unknown full-page verification interstitials.
- Detection reasons and provider labels in the suspension log.
- Regression cases for provider paths, challenge shells, title/copy pairs, provider assets, and false-positive controls.

### Changed

- Renamed the Cloudflare-only classifier and compatibility guide to reflect general anti-bot isolation.
- Require multiple contextual signals for generic CAPTCHA assets so embedded Turnstile/CAPTCHA widgets do not suppress AutoNext by themselves.
- Expanded README and compatibility documentation with the provider matrix and non-bypass contract.

## [2.0.9] - 2026-07-28

### Fixed

- Prevented the AnimePahe controller from initializing inside Cloudflare verification documents served at normal AnimePahe URLs.
- Stopped badge injection, storage access, history patching, listeners, timers, observers, and redirect/autoplay bootstraps during verification.
- Avoided false positives from a generic Turnstile widget unless it is paired with challenge-document signals.

### Added

- A full incident root-cause analysis and Cloudflare compatibility contract.
- Zero-side-effect regression coverage for Cloudflare challenge documents.
- Normal-page and kwik-page negative test cases.
- A dependency-free `npm test` release command.
- GitHub Actions checks for pull requests and pushes.

### Validation

- JavaScript syntax check for the distributed userscript.
- Automated Cloudflare guard tests.
- Manual signature verification against an observed `Just a moment...` AnimePahe challenge.

## [2.0.8]

- Locked homepage bootstrap to episode 1 and prevented bounce-back navigation.

## [2.0.7]

- Restored homepage show-to-episode-one bootstrap for `/play` links and corrected autoplay handoff behavior.
