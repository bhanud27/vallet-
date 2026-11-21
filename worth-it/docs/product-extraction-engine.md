# Worth It product extraction engine

Implementation and verification: 21 November 2026. This extends the current Node importer and Expo composer. It does not replace the application, navigation, database, authentication, or media storage architecture.

## A. Diagnosis and root causes

The existing `server/product-import.cjs` already provided public-DNS validation, connection-time IP pinning, redirect checks, robots policy checks, bounded HTML/image downloads, image decoding, a small cache, and the `/api/product-preview` endpoint. ProductEditor already debounced URL imports and protected manually edited fields. Imported photos were delivered as sanitized inline bytes and then uploaded through the existing user media pipeline; they were not unrestricted remote hotlinks. There is no Next.js image-domain configuration in this Expo application.

Confirmed code problems:

* The old `originalImage` constructed presumed larger Myntra, AJIO, Amazon and Flipkart CDN URLs. Those requests could fail independently of the supplied source images. The new transport requests only URLs actually delivered by a source; resolution matching is used for deduplication and choosing among supplied URLs, never manufacturing requests. Signed and transformation queries are preserved.
* Meesho was identified as `other`; snake-case hydration galleries such as `product_images[].image_url` were not recognized. A scoped delivered-state adapter and fixture now cover this format. This is a parser capability, **not confirmation of current live Meesho HTML**.
* Image failures were silently skipped. Each retained image candidate now records validation/delivery state, source URL, failure code, and decoded dimensions when validated.
* Rich variants, ratings, original prices and provenance were lost. They now appear in the additive version-2 response. Retailer ratings remain separate from Worth It votes and Stars.
* Post creation explicitly disabled product fetching. It now reuses the importer and stores its attached URL/details in the existing top-level columns. Posts still need media.

Live evidence from this environment:

| Retailer | Observed policy request | Consequence |
|---|---|---|
| Myntra | `/robots.txt` exceeded the check deadline; a separate diagnostic also timed out after 4 seconds | Product page/gallery could not be examined safely |
| AJIO | `/robots.txt` returned HTTP 403 | Direct extraction stopped; no restriction bypass attempted |
| Meesho | `/robots.txt` returned HTTP 403 | Direct extraction stopped; no restriction bypass attempted |

The supplied AJIO OneLink also failed public resolution. A full AJIO `/p/…` URL remains the appropriate retry input. Tests do **not** establish whether CDN hotlink protection, current gallery markup, expired URLs, or retailer-side changes explain an individual user's original failure. Those remain hypotheses until a permitted live page and image can be retrieved. A blocked policy request is not proof that the product itself is unavailable.

## B. Files changed in this implementation

| File | Purpose |
|---|---|
| `server/product-import.cjs` | Existing endpoint/transport integration, connection pooling, bounded retry/concurrency, richer responses, diagnostics, auth, caches, cancellation |
| `server/product-adapters.cjs` | Host registry, adapter registration, product-scoped safe hydration selection; no private API endpoints |
| `server/product-model.cjs` | Structured data/microdata/metadata normalization, identity, price, variants, ratings, specifications and provenance |
| `server/retailer-images.cjs` | Preserve actual source URLs; discovered-resolution selection; Meesho image keys; retailer detection |
| `server/retailer-policy.cjs` | Preserve policy HTTP failure category for redacted diagnostics |
| `server/product-fallbacks.cjs` | Optional trusted provider contract, priorities/cost tie-breaking, quotas/deadlines and rendering selection |
| `server/product-browser.cjs` | Disabled-by-default permitted rendering through the safe transport |
| `server/product-auth.cjs` | Verify bearer tokens with configured Supabase Auth; hash user identifiers for rate limiting |
| `src/lib/productPreview.ts` | Retain old API compatibility, carry rich preview, send access token, bound frontend cache freshness |
| `src/lib/creationDraft.ts` | Carry rich preview/provenance in existing drafts |
| `src/ui/creation/ProductEditor.tsx` | Shared Poll/Compare/Post auto import, editable fields, notice/retry/remove, imported-image deduplication |
| `src/ui/creation/ProductIntelligenceSummary.tsx` | Theme-aware expandable store facts, original price, discount, variants, rating and source link |
| `src/ui/ContentComposer.tsx` | Save Post product attachment through existing publisher; safe preview of invalid intermediate input |
| `src/ui/CreationBody.tsx` | Display attached Post details using existing summary component |
| `tests/productEngine.test.ts`, `tests/fixtures/products/*.html` | New deterministic normalization/security/cache/provider/auth fixtures and tests |
| `tests/productImport.test.ts` | Replace obsolete guessed-upscaling expectation with source preservation |
| `tests/e2e/creation-flows.cjs` | Rich preview, edit protection, Post attachment and validation checks |
| `scripts/check-product-links.cjs` | Explicit live diagnostics with result/error/image codes |
| `scripts/check-product-renderer.cjs` | Offline real-browser fallback verification including unsafe-request blocking |
| `scripts/benchmark-product-engine.cjs` | Reproducible offline fresh-versus-cached timing |
| `package.json`, `.gitignore`, `server/product-import.env.example` | Load dedicated ignored importer settings; keep admin credentials outside API process |
| `README.md`, this document | Configuration, limitations and deployment instructions |

No dependency or SQL migration is required for the default extractor. Historical migrations are unchanged.

## C. Pipeline and API

1. HTTPS URL validation, retailer identification, tracking-only normalization, variant-preserving key.
2. Bounded cache or shared in-flight work. Canonical aliases are same-origin and retain selection queries.
3. Public robots check and DNS-pinned fetch, revalidated at each redirect. The existing HTTPS-only policy is intentionally retained.
4. Parse the delivered document: JSON-LD arrays/graphs/Product/Offer, scoped microdata, OG/Twitter, safe JSON hydration, product-gallery lazy/srcset sources and the existing Amazon/gallery parser.
5. Prefer structured data over embedded data, microdata, OG, and generic fallback. Record competing source categories. Never evaluate scripts in the Node parser.
6. If important data is missing, try an explicitly configured licensed provider. If still needed and explicitly permitted, try rendering. A denied policy/page is never retried through a browser as a bypass. A licensed provider may supply data under its separate authorization.
7. Normalize identity, current/original prices, valid discounts, specifications/features, variants, explicit availability and retailer ratings. Missing fields stay null/unknown; no currency, rating, stock or specification is invented.
8. Validate source images using the safe transport, real MIME signature and Sharp decoding. Reject small/unsupported/malicious files and inputs over 12 megapixels; strip metadata and re-encode; retain gallery order and identify a validated primary. Manual photos remain available.
9. Return the old flat fields plus `schema_version: 2`, `status`, `code`, `source`, `product`, and `extraction`. Older clients still receive `name`, `price`, `currency`, `description`, `brand`, `category`, `productUrl`, `platform`, and inline `images`.

Success/partial responses use HTTP 200. Failures retain existing HTTP error behavior and add `failed`, `restricted` or `unsupported` status and a public code. Examples: `INVALID_URL`, `ACCESS_RESTRICTED`, `PRODUCT_NOT_FOUND`, `EXTRACTION_TIMEOUT`, `METADATA_NOT_FOUND`, `UNSUPPORTED_URL`, `AUTH_REQUIRED`, `RATE_LIMITED`. Raw network exceptions/credentials are not returned. Images can report `IMAGE_ACCESS_DENIED`, `IMAGE_COPY_NOT_AUTHORIZED`, `IMAGE_UNSUPPORTED_OR_TOO_SMALL`, or a bounded request failure.

`extraction.coverage` is the count of nine available core fields; it is **not a statistical confidence score or accuracy guarantee**. Field provenance marks `missing`, `extracted_unverified`, `conflicting`, or `stale`. Successfully decoded image files are `validated`; that does not authenticate a retailer's claims. Retailer data should be verified before buying.

Price/availability cache lifetime defaults to 5 minutes; identity/images may survive up to 1 hour. A transient refresh failure can return stale identity/images with **all current/original/discount prices, offer prices, variant prices and availability removed**. Its warning and cache state remain stale. Restrictions and not-found responses do not fall back to stale data. Explicit refresh bypasses stale fallback. Cache is bounded to 24 entries/48 MiB; process restart clears it. Negative caching defaults to 30 seconds. Four imports total and two per retailer can execute concurrently, with three image requests per batch. Authenticated users are limited to 12 importer requests/minute; production pre-authentication traffic is additionally capped at 120/IP/minute to accommodate shared proxies. Development anonymous traffic remains 12/IP/minute.

An interrupted HTTP caller stops waiting. Shared work may continue for other callers/cache, always within its bounded metadata/gallery deadlines. No background job queue was added because the current importer is request/response based.

### Adding an adapter or provider

Add exact domains to `product-adapters.cjs`; register an `extract({scripts,url})` adapter returning the selected delivered product state. Exclude recommendation trees, retain separate variants, and add synthetic/saved **permitted** fixtures plus explicit live evidence before changing the compatibility matrix. Never add guessed/private endpoints.

`PRODUCT_PROVIDER_MODULE` is an absolute path to a **reviewed local server module** exporting provider definitions:

```js
module.exports = [{
  name: 'your-approved-connector', priority: 1, cost: 0,
  requestsPerMinute: 6, timeout: 5000,
  supports: (retailer, url) => /* verified contractual coverage */ false,
  extract: async ({url, retailer, signal}) => {
    // Call your vendor's documented, licensed API with server-only secrets.
    // Map verified response data into a Product JSON-LD document.
    // No HTML/script execution, invented fields, secret-bearing image URLs or raw vendor errors.
    return {url, html: '<script type="application/ld+json">…</script>'};
  },
}];
```

The URL must exactly match the requested product. Size, deadline and per-provider rate limits apply. No vendor/account, API endpoint, credential or paid plan is configured by this change. Test connectors in unit tests are synthetic. Paid access requires operator configuration and a license check; lower-priority providers are not called after useful data is returned.

## D. Retailer compatibility matrix

“Verified With Fixtures” means deterministic **synthetic** document parsing, not current live storefront compatibility. “Restricted” here includes an uncheckable access policy. No retailer received a Verified Live metadata/image result in this run.

| Retailer | Method available | Metadata | Images | Variants | Verification / limitation |
|---|---|---|---|---|---|
| Myntra | Structured + `__myx`/JSON state + gallery | Verified With Fixtures | Verified With Fixtures | Size variants: fixtures | **Restricted live**: policy timeout; no live gallery validated |
| AJIO | Structured + productDetails/Next state + gallery | Verified With Fixtures | Verified With Fixtures, largest supplied URL | Generic variant parser; live not tested | **Restricted live**: policy 403; OneLink resolution failed |
| Meesho | Structured + product-scoped Next state | Verified With Fixtures | Verified With Fixtures, snake-case galleries | Generic variant parser; retailer variants not tested | **Restricted live**: policy 403; current hydration format unverified |
| Amazon India | Structured + existing explicit Amazon gallery | Verified With Fixtures | Verified With Fixtures: supplied hiRes/dynamic images | Generic parser; live not tested | Partial; no live test in this run |
| Flipkart | Structured/OG + delivered state/gallery | Verified With Fixtures (generic shape) | Source preservation/generic fixture | Generic parser; live not tested | Partial; current retailer markup not verified |
| Nykaa | Generic structured/OG/hydration | Generic fixture | URL extraction fixture only | Generic capability, not retailer verified | Partial / Not Tested live |
| Tata CLiQ | Generic structured/OG/hydration | Generic fixture | URL extraction fixture only | Generic capability, not retailer verified | Partial / Not Tested live |
| Croma | Generic structured/OG/hydration | Generic fixture | URL extraction fixture only | Generic capability, not retailer verified | Partial / Not Tested live |
| Reliance Digital | Generic structured/OG/hydration | Generic fixture | URL extraction fixture only | Generic capability, not retailer verified | Partial / Not Tested live |
| H&M | Generic structured/OG/hydration | Generic fixture | URL extraction fixture only | Generic capability, not retailer verified | Partial / Not Tested live |
| Zara | Generic structured/OG/hydration | Generic fixture | URL extraction fixture only | Generic capability, not retailer verified | Partial / Not Tested live |
| Decathlon | Generic structured/OG/hydration | Generic fixture | URL extraction fixture only | Generic capability, not retailer verified | Partial / Not Tested live |
| Snapdeal | Generic structured/OG/hydration | Generic fixture | URL extraction fixture only | Generic capability, not retailer verified | Partial / Not Tested live |
| Shopify | Delivered Product JSON + structured/OG | Basic storefront fixture | Supplied product/media sources: fixture | Structured variant parser; ambiguous minor-unit prices not guessed | Partial / Not Tested live |
| WooCommerce | Structured/microdata + scoped gallery | Generic/microdata fixture | Explicit zoom/lazy/srcset: fixture | Structured variants only | Partial / Not Tested live |
| Other public stores | Structured/microdata/OG + safe delivered JSON | Verified With Fixtures | Validated mocked bytes; generic URL parsing | Structured Product.hasVariant fixtures | Partial; accessible product-scoped data required |

## E. Verification and measurements

Commands run with database/admin credentials stripped from verification subprocess environments:

* `npm.cmd run check`: lint + TypeScript + **138 tests passed**, including isolated SQL regressions. No live account writes.
* `node --import tsx --test tests/productEngine.test.ts tests/productImport.test.ts tests/productLinkIntegration.test.ts`: **39 passed** in the initial targeted run; the additional currency-consistency regression is included in the final 138-test run.
* `CREATION_UI_ONLY=1 node tests/e2e/social-layout.cjs`: **390, 414, 1024px passed**. Exercises rich store facts, delayed edit protection, comparison creation/voting, automatic Post product attachment, invalid manual price correction, persistence, manual fallback and Normal/Liquid Glass appearance.
* `node scripts/check-product-renderer.cjs`: passed using installed Edge, **offline synthetic HTML**; only one approved request was fulfilled. Attempts toward localhost/cross-origin destinations were blocked. Run time including browser lifecycle was about 8.15 seconds. This proves the renderer path, not retailer permission or compatibility.
* `node scripts/benchmark-product-engine.cjs`: 12 local synthetic samples. Fresh pipeline p50 **12.03ms**, p95 **54.60ms**; cached p50 **0.06ms**, p95 **0.12ms**. Includes decoding sanitized mock images, excludes retailer latency and Auth verification. Not a production SLA.
* `node scripts/check-product-links.cjs <public URLs>`: live attempts described above; final attempt times approximately **3015ms Myntra, 107ms AJIO, 68ms Meesho**, all stopped at policy access. Cached/blocked timing is not successful extraction latency.
* Expo export `--platform all --output-dir .expo/product-engine-native`: Android Hermes, iOS Hermes and web passed. Physical Android/iOS image rendering was not tested on a device in this run.

Full browser suite and final checks: see local `.expo/product-engine-full-ui.log`, `.expo/product-engine-check.log`, `.expo/product-engine-ui.log`, `.expo/product-engine-native.log`. Screenshots use the existing `.expo/social-ui-shots` folder. Full suite passed at **390px, 414px and 1024px**, including feed, Checks playback/paging, comments, Stars, profile, themes and floating navigation. The final creation-only run also passed at all three widths with side-by-side retailer facts.

Targets to monitor after rollout: cache-hit server processing below 100ms, initial loading feedback after the 400ms edit debounce, and a metadata deadline of 20 seconds and a separate gallery deadline of 8 seconds. Real retailer p50/p95, Auth/network latency, concurrent-load throughput and browser container usage must be measured in the deployment environment before promising end-user latency.

## F. Configuration

Copy the new `server/product-import.env.example` to ignored `server/product-import.env` **only if configuring the importer**. Do not load `server/.env` into the API: it contains separate database administration/worker credentials.

| Setting | Default / purpose |
|---|---|
| `NODE_ENV=production` | Production deployment requires a verified bearer token regardless of the optional auth flag |
| `PRODUCT_AUTH_SUPABASE_URL`, `PRODUCT_AUTH_ANON_KEY` | Public Auth project settings; falls back to existing EXPO_PUBLIC settings; hosted `*.supabase.co` Auth supported |
| `PRODUCT_IMPORT_REQUIRE_AUTH` | Optional true for authenticated development; production always requires it |
| `PRODUCT_EXTRACT_TIMEOUT_MS` | 20000; capped at 20000 |
| `PRODUCT_PRICE_TTL_MS` | 300000; capped at one hour |
| `PRODUCT_IDENTITY_TTL_MS` | 3600000; capped at one day and never shorter than price TTL |
| `PRODUCT_NEGATIVE_TTL_MS` | 30000; capped at five minutes |
| `PRODUCT_IMAGE_COPY_HOSTS` | Exact comma-separated CDN hostnames whose image downloading/copying/storage you are authorized to use. Required for downloaded images in production. Blank in production means manual photo upload; no arbitrary copying/proxy |
| `PRODUCT_PROVIDER_MODULE` | Empty: no provider. Absolute path to reviewed connector module; vendor secrets stay in trusted server environment |
| `PRODUCT_BROWSER_HOSTS` | Empty: disabled. Exact explicitly authorized retailer hosts only; never use to evade a denied page/policy |
| `PRODUCT_BROWSER_CHANNEL` | Optional `chrome` or `msedge`; otherwise an installed Playwright Chromium binary is needed |
| Existing `PRODUCT_IMPORT_ORIGIN`, `EXPO_PUBLIC_PRODUCT_IMPORT_URL`, `PORT` | Keep existing deployment origin/API URL/port behavior |

No API keys are needed for default public metadata extraction. Browser rendering uses existing Playwright tooling when available. A production image with dev dependencies omitted must install a reviewed runtime Playwright package/browser before explicitly enabling rendering; otherwise it remains unavailable and manual entry works. Deploy an unprivileged sandboxed browser container with an enforced memory/CPU limit (for example 512MiB/one CPU) before enabling it. The code limits renderer JS heap, sessions, request count/bytes and wall time; those are **not OS-enforced memory/CPU quotas**.

## G. Remaining limitations

* This is an extensible extractor, **not universal live retailer support**. Restrictions are not bypassed. Myntra/AJIO/Meesho live images are unverified until permitted access or a licensed connector is available.
* Anonymous public metadata alone cannot guarantee authoritative price, stock, delivery dates, review authenticity or selected-variant completeness. No PIN code is collected. Coupons/review distributions/highlights/exchange terms may remain null when not represented in supported delivered fields. Unsupported script-only app state is not evaluated by the Node parser.
* The richer snapshot lives in the API and existing drafts. Published Poll/Compare/Post storage retains its existing supported name, URL, editable price/currency/brand/category/description and media. Full variant/provenance/rating/specification snapshots are **not persisted into a new catalog table**; this deliberately avoids an incompatible database change. They are not silently presented as durable/live product records. A future durable catalog requires an additive reviewed migration and retention policy.
* The cache/rate limits/provider counters are per process, not a distributed Redis/database cache. Multiple replicas need a shared gateway user/IP rate limiter and shared caching before scaling. No cross-restart cache is claimed.
* Browser fallback is optional and permission-bound; only same-origin resources are fulfilled. Shops needing cross-origin script/data dependencies may remain partial. This intentionally restricts compatibility to reduce exposure. Browser process/container capacity must be validated before production enablement.
* No third-party provider has been purchased or configured. Connector contracts must be implemented against a real vendor's documentation and verified account permissions.
* Automatic copying is enabled in local development for the existing preview workflow; the operator must authorize CDN copying before enabling it in production. Rights to display/copy retailer media are separate from robots permission. Manual user uploads remain available. No unrestricted proxy or new public storage bucket was added.
* Image MIME support remains JPEG/PNG/WebP; unsupported/tiny files are skipped with a reason. No fabricated high-resolution replacement is attempted. Invalid URLs and obvious placeholders are discarded during discovery; retained candidate failures are diagnosed individually.
* Test fixtures are synthetic; live variants, multi-category catalogs, successful production CDN access, self-hosted/custom Auth domains, physical devices, provider credentials/costs, and production load are not verified.

## H. Deployment and testing

1. No SQL migration, database reset, historical migration replay, or Supabase dashboard change is needed.
2. Keep your existing environment files. Optionally configure **only importer settings** in `server/product-import.env` from its example. Never copy database admin/service-role keys there.
3. For production set `NODE_ENV=production`, configure public Supabase Auth settings and API origin, and allow only CDN hosts you are authorized to copy/store. Leave paid providers and browser rendering empty unless separately approved/configured.
4. From the Worth It directory run `npm.cmd run import:server` (now reads `.env` plus optional `server/product-import.env`). The server listens on the existing port 8787 unless `PORT` is set. Put production behind HTTPS; do not expose Metro as the production API.
5. Restart Expo/Metro to load the updated frontend. Existing logged-in sessions send bearer tokens automatically. For hosted builds, retain `EXPO_PUBLIC_PRODUCT_IMPORT_URL` pointing to the importer.
6. Test Add → Poll with a permitted product link, edit a field while loading, inspect store facts/photos, and finish Opinion/Compare. Test Add → Post with a product link, inspect/import images or upload your own, edit details and publish. Try a blocked/invalid link and confirm manual completion still works. Verify both themes and existing floating navigation.
7. Run the checks above. To test live links explicitly, use `npm.cmd run test:product-live -- "https://retailer.example/product"`. A restriction is an honest fallback result, not a reason to change TLS or bypass retailer controls.
8. Monitor redacted JSON extraction logs for retailer, method, result/code, duration, cache state, missing fields, image counts, provider/browser usage and HTTP category. No product URL, bearer token, cookies, user profile, credential or vendor raw response is logged by the importer.


## 22 November 2026: progressive product fetching

The creation UI now sends a details-only request first, displays available title/price immediately, then requests validated photos. The second stage reuses a bounded metadata cache (16 entries, at most 512KiB each) and in-flight page parsing instead of fetching the store page again. Old clients still receive the full response by default. Refresh invalidates both frontend stages; price expiry remains tied to the original observation time. Gallery downloading has an eight-second budget; metadata retains its configured twenty-second maximum. Available details survive photo failures. The debounce is now 400ms.

Poll/product image covers show the available store price at the lower-left, including decimals and explicit currency. Unknown currencies are labeled rather than assumed to be INR. No database migration is required.
