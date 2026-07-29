# Anti-Bot Verification RCA and Compatibility Contract

## Executive summary

AnimePahe AutoNext version 2.0.8 initialized on Cloudflare's verification document because the challenge was served at the same `https://animepahe.pw/` URL covered by the userscript's `@match` rule.

The visible `AutoNext ON` badge on the verification page was direct evidence that the controller reached its normal AnimePahe initialization path. That path patches browser history, installs listeners, starts timers, reads redirect/autoplay state, and mutates the DOM. These actions are appropriate on AnimePahe, but they violate the isolation expected by a Cloudflare challenge and can contribute to a stalled or repeated verification flow.

Version 2.0.11 fixes the defect with two independent gates before `main()` runs:

1. Provider-aware challenge detection on AnimePahe and kwik hosts.
2. Positive AnimePahe application-shell detection before the parent controller can start.

A recognized challenge or an unrecognized same-origin document causes an immediate no-op return. The fix does not automate, solve, click, submit, or bypass verification; it leaves the document under the anti-bot provider's exclusive control.

## Incident evidence

Observed on 2026-07-28:

- URL: `https://animepahe.pw/`
- Browser title: `Just a moment...`
- Visible copy: `Verifying you are human`
- Visible footer attribution: `Performance and Security by Cloudflare`
- Unexpected userscript UI: `AutoNext ON`
- Installed userscript: `AnimePahe - Auto-Next & Autoplay Fix v2`, version 2.0.8

The repository's version 2.0.8 source matched the installed script metadata and initialization behavior.

Follow-up observation on 2026-07-29:

- Cloudflare displayed `Performing security verification`.
- The `AutoNext ON` badge was absent, confirming that the patched controller did not initialize.
- The verification widget still remained at `Verifying...`.
- A clean browser session with no Tampermonkey userscript reached the same stalled Cloudflare document.

This follow-up separates the original userscript isolation defect from challenge completion. The script can guarantee that it stays out of the verification document; it cannot guarantee that Cloudflare accepts a browser or network.

## User impact

Confirmed impact:

- The userscript modified a security verification page that it did not own.
- The AutoNext badge appeared over the verification UI.
- AnimePahe remained at the verification step instead of reaching the site.

Plausible mechanisms for the observed instability:

- persistent DOM mutation through initial and delayed badge injection;
- patched `history.pushState` and `history.replaceState`;
- a permanent one-second URL polling interval;
- autoplay and episode-one bootstrap timers when short-lived state survived a prior page;
- message and navigation listeners attached to the challenge document.

The badge proves controller initialization, but it does not by itself identify which individual side effect caused Cloudflare to remain on the challenge. The root defect is broader and deterministic: none of those side effects should exist on the challenge document.

## Root cause

### Direct cause

Version 2.0.8 routed by hostname only:

1. Tampermonkey matched `https://animepahe.pw/*`.
2. The script rejected non-AnimePahe hosts.
3. Because the Cloudflare page still used `animepahe.pw`, the host check passed.
4. The full AnimePahe controller initialized.

### Why metadata exclusions were insufficient

An `@exclude` rule can filter a distinct URL such as `/cdn-cgi/*`, but Cloudflare can serve the challenge shell at the requested root or episode URL. The security document and the real site can therefore have the same origin, path, and query-independent match pattern.

Document classification is required in addition to URL matching.

### Contributing factors

- The initialization contract assumed every supported AnimePahe hostname represented the AnimePahe application.
- Badge injection was used as a normal availability signal on every matching page.
- Bootstrap logic used persisted one-shot state and could start before page ownership was proven.
- There was no automated test asserting zero side effects on third-party interstitial documents.
- Error reporting itself could inject a fatal panel if initialization failed on an interstitial.

## Five-whys summary

1. Why did AutoNext appear on Cloudflare? The full controller ran on the verification document.
2. Why did the controller run? The document hostname matched a supported AnimePahe domain.
3. Why was hostname matching insufficient? Cloudflare served the challenge at the requested AnimePahe URL.
4. Why did the script not distinguish the documents? Version 2.0.8 had no pre-initialization document classifier.
5. Why was this not caught earlier? Tests covered playback and redirect behavior, but not interstitial ownership and zero-side-effect behavior.

## Corrective action in version 2.0.11

The userscript now calls `detectAntiBotChallengeDocument()` before entering the `try` block and before calling `main()`.

The provider-aware classifier is restricted to supported AnimePahe hosts and evaluates signals in this order:

1. Provider-owned challenge paths.
2. Strong provider-specific challenge-shell markers.
3. Challenge title plus challenge or provider copy.
4. Challenge title plus a supporting provider asset.
5. Matching provider copy, provider asset, and generic challenge copy.

Generic CAPTCHA or Turnstile markup alone does not suppress AutoNext. This prevents false positives on a legitimate AnimePahe page that embeds a normal verification widget.

After the provider classifier passes, `detectAnimePaheApplicationDocument()` requires at least one normal application-owned marker before the AnimePahe parent controller starts:

- homepage search, episode list, or next-episode control;
- player load gate, kwik player iframe, or player-server control;
- AnimePahe `/play/`, `/anime/`, `/series/`, or legacy `-episode-` navigation.

The positive gate is deliberately fail-closed. A provider can change its branding, copy, assets, and shell markup, but an unrecognized document still cannot reach storage, history, timer, listener, observer, redirect, autoplay, or UI code.

### Provider coverage

| Provider | Signals considered |
| --- | --- |
| Cloudflare | `/cdn-cgi`, challenge shell IDs/forms, Ray ID or Cloudflare copy, Turnstile/challenge-platform assets |
| DDoS-Guard | DDoS-Guard path, shell marker, branded copy, or check script |
| HUMAN/PerimeterX | `px-captcha` shell, branded copy, or captcha asset |
| DataDome | CAPTCHA shell marker, branded copy, or captcha-delivery asset |
| Imperva | Incapsula resource path or error shell, branded copy, or resource asset |
| AWS WAF | AWS WAF CAPTCHA shell, branded copy, or WAF asset |
| Akamai | challenge path/form, branded copy, or challenge asset |
| hCaptcha | branded copy or hCaptcha asset paired with full-page challenge context |
| Google reCAPTCHA | branded copy or reCAPTCHA asset paired with full-page challenge context |
| Arkose Labs | Arkose/FunCaptcha copy or asset paired with challenge context |
| Unknown | full-page challenge title paired with generic verification copy |

## No-op guarantee

When a challenge is detected, or AnimePahe application ownership is not positively established, version 2.0.11 returns before:

- `GM_getValue` or `GM_setValue`;
- local storage fallback access;
- DOM creation, mutation, or badge injection;
- fatal-error panel installation;
- history API patching;
- page, message, or navigation listeners;
- timeout or interval creation;
- `MutationObserver` creation;
- autoplay, server-selection, episode-one, or next-episode logic; and
- kwik bridge initialization.

After verification succeeds, the provider loads the real AnimePahe document. Tampermonkey evaluates the userscript again for that document, the classifier returns false, and normal initialization proceeds.

## Verification

Run the release checks:

```powershell
npm test
```

The regression suite verifies:

- provider path detection;
- provider-specific strong challenge-shell detection;
- challenge-title plus challenge-copy detection;
- challenge-title plus provider-asset detection;
- matching provider-copy plus provider-asset detection;
- a normal AnimePahe page is not classified as a challenge;
- normal pages with only CAPTCHA assets are not classified as challenges;
- full-page challenges on kwik hosts are also isolated;
- normal AnimePahe application markers pass the positive ownership gate;
- an unknown same-origin interstitial fails the ownership gate;
- the guard call remains before `main()`; and
- end-to-end recognized and unknown interstitial execution performs none of the forbidden side effects.

CI runs the same command on every pull request and push.

## Manual acceptance criteria

1. Install or update to version 2.0.11.
2. Open AnimePahe and allow any normal verification page to appear.
3. Confirm the `AutoNext ON` badge is absent during verification.
4. If verification remains stalled while the badge is absent, treat it as a separate browser, network, or Cloudflare issue and follow the recovery sequence below.
5. Confirm the badge appears after the real AnimePahe page loads.
6. Open an episode and confirm the kwik player bridge still loads.
7. Confirm AutoNext navigation, one-time autoplay, and audio restoration still behave normally.

## Rollout

1. Merge version 2.0.11 to the canonical `main` branch.
2. Confirm the raw userscript URL returns metadata version 2.0.11.
3. In Tampermonkey, run the script's update check or reinstall from the raw URL.
4. Perform the manual acceptance checks above.

## Rollback

If version 2.0.11 fails to recognize a legitimate AnimePahe document:

1. Disable AutoNext temporarily for that tab.
2. Capture the page title, URL path, and which challenge marker matched.
3. Narrow the classifier and add the captured case to the regression suite.
4. Publish a patch release.

Do not roll back to version 2.0.8 as a normal remedy because it restores the known interstitial-isolation defect.

## Cloudflare completion troubleshooting

The isolation contract ends when the userscript has returned without side effects. If the badge is absent but Cloudflare remains at `Verifying...`, use this order:

1. In Brave, use the address-bar Shields panel to turn Shields down only for `animepahe.pw`, then reload.
2. Confirm JavaScript and cookies are allowed for the site.
3. Temporarily disable other content-filtering or privacy extensions for this site.
4. Retry without a VPN or proxy and, if practical, on a stable alternate network.
5. Clear only the site's stored data, reopen it, and retain the Ray ID if escalation to the site operator is required.
6. Restore privacy controls one at a time after the site succeeds.

Brave explicitly documents that strict JavaScript or cookie blocking can break sites and supports per-site Shields overrides. Cloudflare documents network issues, browser settings or extensions, unsupported browsers, disabled JavaScript, and detection errors as challenge-loop causes.

## Residual risk

Anti-bot providers may change their markup or wording. The classifier therefore uses multiple independent signals and a title/body fallback. Future changes should preserve two invariants:

- strong provider-owned challenge shells fail closed; and
- generic CAPTCHA assets embedded in a normal AnimePahe page do not disable the script by themselves.

The positive application gate is the final backstop when provider detection misses new markup. Its tradeoff is intentional: after a major AnimePahe redesign, AutoNext may remain inactive until a new application-owned marker is added. Failing inactive is safer than initializing on a security interstitial.

## Vendor references

The asset and false-positive contracts were checked against current vendor documentation:

- [Cloudflare Turnstile versus Challenge Pages](https://developers.cloudflare.com/cloudflare-challenges/challenge-types/turnstile/)
- [Cloudflare Turnstile client-side rendering](https://developers.cloudflare.com/turnstile/get-started/client-side-rendering/)
- [hCaptcha developer guide](https://docs.hcaptcha.com/)
- [Google reCAPTCHA v2 display guide](https://developers.google.com/recaptcha/docs/display)
- [Google reCAPTCHA alternate-domain guidance](https://developers.google.com/recaptcha/docs/faq)
- [Arkose Labs Client API](https://developer.arkoselabs.com/docs/client-api)
- [AWS WAF JavaScript integrations](https://docs.aws.amazon.com/waf/latest/developerguide/waf-javascript-api.html)
- [DataDome JavaScript Tag integration](https://docs.datadome.co/docs/javascript-tag)
- [HUMAN Enforcer hostnames](https://docs.humansecurity.com/applications/about-enforcers)
- [Brave site-specific Shields settings](https://support.brave.com/hc/en-us/articles/360023646212-How-do-I-configure-global-and-site-specific-Shields-settings)
- [Cloudflare challenge solve issues](https://developers.cloudflare.com/cloudflare-challenges/troubleshooting/challenge-solve-issues/)
