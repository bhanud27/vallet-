# Worth It product extraction engine

The app endpoint uses the richer importer for HTTPS product links. It validates a cover and uses configured providers to fill gaps in direct extraction. The existing HTTP parser, native WebView, and manual entry remain available. Current deployment commands are in the [README](../README.md).

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

The returned URL binds the document to the requested retailer, product, market, and variant. A connector that observes a merchant offer can return its ISO timestamp as `offerObservedAt`. The importer uses that timestamp to expire the price. Size, deadline and per-provider rate limits apply. Paid access requires operator configuration and authorization.

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
| Existing `PRODUCT_IMPORT_ORIGIN`, `EXPO_PUBLIC_IMPORTER_URL`, `PORT` | Keep existing deployment origin/API URL/port behavior |

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
5. Restart Expo/Metro to load the updated frontend. Existing logged-in sessions send bearer tokens automatically. For hosted builds, retain `EXPO_PUBLIC_IMPORTER_URL` pointing to the importer.
6. Test Add → Poll with a permitted product link, edit a field while loading, inspect store facts/photos, and finish Opinion/Compare. Test Add → Post with a product link, inspect/import images or upload your own, edit details and publish. Try a blocked/invalid link and confirm manual completion still works. Verify both themes and existing floating navigation.
7. Run the checks above. To test live links explicitly, use `npm.cmd run test:product-live -- "https://retailer.example/product"`. A restriction is an honest fallback result, not a reason to change TLS or bypass retailer controls.
8. Monitor redacted JSON extraction logs for retailer, method, result/code, duration, cache state, missing fields, image counts, provider/browser usage and HTTP category. No product URL, bearer token, cookies, user profile, credential or vendor raw response is logged by the importer.


## 22 November 2026: progressive product fetching

The creation UI now sends a details-only request first, displays available title/price immediately, then requests validated photos. The second stage reuses a bounded metadata cache (16 entries, at most 512KiB each) and in-flight page parsing instead of fetching the store page again. Old clients still receive the full response by default. Refresh invalidates both frontend stages; price expiry remains tied to the original observation time. Gallery downloading has an eight-second budget; metadata retains its configured twenty-second maximum. Available details survive photo failures. The debounce is now 400ms.

Poll/product image covers show the available store price at the lower-left, including decimals and explicit currency. Unknown currencies are labeled rather than assumed to be INR. No database migration is required.

## Link-first creation flow

The Create entry point at /add opens the same composer used by the existing /new and /new-post routes. Paste an HTTPS link or upload a photo. A preview with a title or photo enables the Poll, Compare, and Post cards. A pencil opens the product editor. The comparison composer keeps both products in the same draft, and the Post composer keeps its extra attachments separate from the shared product photos.

The client debounces URL changes, coalesces concurrent requests for the same URL and stage, and cancels stale requests. The importer shares the document cache across stages. Its rich response validates one cover image and returns the available identity fields. The optional details stage reuses the same retailer adapters and approved fallbacks, then fills gaps without overwriting manual edits. The original validated link supplies the View product destination, including variant parameters. If the importer cannot supply a usable preview, retry, manual entry, and photo upload remain available.

The composer requests a preview from `/api/product-preview` with `mode: "full"`. For HTTPS links the endpoint fills gaps in the direct result and validates one cover. The endpoint also accepts explicit rich and details-only requests.

The existing URL and redirect policy, retailer access checks, image validation, rate limits, local draft store, upload pipeline, and publisher are reused. The link-preview Posts migration extends the existing Posts constraint to accept a validated product link as the attachment when a photo is missing. It uses the same publishing permissions and content checks as media-backed Posts.

### Architecture and changed files

| Area | Files |
|---|---|
| Create and published views | [add.tsx](../src/app/add.tsx), [route configuration](../src/app/_layout.tsx), [ContentComposer.tsx](../src/ui/ContentComposer.tsx), [CreationBody.tsx](../src/ui/CreationBody.tsx) |
| Preview, editor and media | [ProductEditor.tsx](../src/ui/creation/ProductEditor.tsx), [ProductPreviewCard.tsx](../src/ui/creation/ProductPreviewCard.tsx), [ProductEditSheet.tsx](../src/ui/creation/ProductEditSheet.tsx), [productMedia.ts](../src/ui/creation/productMedia.ts), [CreationIconButton.tsx](../src/ui/creation/CreationIconButton.tsx) |
| Navigation and appearance | [AppTabs.tsx](../src/ui/AppTabs.tsx), [FloatingHeader.tsx](../src/ui/FloatingHeader.tsx), [FloatingSurface.tsx](../src/ui/FloatingSurface.tsx), [SocialIcon.tsx](../src/ui/SocialIcon.tsx), [ThemeSurface.tsx](../src/ui/ThemeSurface.tsx), [theme.ts](../src/ui/theme.ts) |
| Preview client and draft | [productPreview.ts](../src/lib/productPreview.ts), [creationDraft.ts](../src/lib/creationDraft.ts), [validation.ts](../src/lib/validation.ts) |
| Importer and database | [product-import.cjs](../server/product-import.cjs), [product-model.cjs](../server/product-model.cjs), [link-only post migration](../supabase/migrations/20261122053448_link_preview_posts.sql) |
| Verification | [Live diagnostics](../scripts/check-product-links.cjs), [extractor tests](../tests/productEngine.test.ts), [SQL tests](../supabase/tests/110_creation_flow_test.sql), [creation browser tests](../tests/e2e/creation-flows.cjs), [navigation browser tests](../tests/e2e/navigation-flows.cjs), [appearance browser tests](../tests/e2e/appearance-flows.cjs), [social browser suite](../tests/e2e/social-layout.cjs), [encoding test](../tests/sourceEncoding.test.ts) |

### Mobile screenshots

The browser screenshots use fixture responses for predictable visual coverage. The supplied attachment contained the written brief. The visual review used its stated layout, dimensions, and colors.

| Screen | Captures |
|---|---|
| Normal | [Dark, 390 px](screenshots/creation/03-preview-dark-normal.png), [Dark, 414 px](screenshots/creation/11-preview-414px-dark-normal.png), [Light](screenshots/creation/08-preview-light-normal.png) |
| Liquid Glass | [Dark](screenshots/creation/10-preview-dark-glass.png), [Light](screenshots/creation/09-preview-light-glass.png) |
| Composers | [Poll](screenshots/creation/04-poll-dark-normal.png), [Compare](screenshots/creation/05-compare-dark-normal.png), [Post](screenshots/creation/06-post-dark-normal.png) |
| Preview states | [Empty](screenshots/creation/01-empty-dark-normal.png), [Loading](screenshots/creation/02-loading-dark-normal.png), [Title with no image or price](screenshots/creation/07-partial-dark-normal.png) |

### Automated verification

Lint and TypeScript checks passed. All 141 automated tests passed, including isolated PostgreSQL checks for link-only Posts and fixture checks for shared extraction and partial previews. Expo exported web, Android, and iOS bundles. The focused creation browser suite passed at 320, 390, 414, and 1024 pixels with mocked importer responses and real local publishing. The full social browser suite also passed at 390, 414, and 1024 pixels.

### Live retailer verification

The importer ran with its normal access policy against public links on 22 November 2026. These outcomes apply to the tested URLs under the local importer configuration. Production image-copy settings apply when deployed.

| Source | Live rich preview result |
|---|---|
| [Amazon India](https://www.amazon.in/iPhone-16-128-GB-Control/dp/B0DGJHBX5Y) | Product title and a validated 1500 × 1500 image. Price unavailable. |
| [Books to Scrape](https://books.toscrape.com/catalogue/a-light-in-the-attic_1000/index.html) | Book title and a validated image. Price unavailable. |
| [AMP product example](https://amp.dev/documentation/examples/e-commerce/product_page/) | Title, validated image and USD price. The slashless URL also resolved to the product page. |
| Flipkart | Description only. The flow offered manual entry. |
| Myntra | The access-policy check timed out. |
| AJIO, Meesho, H&M, Zara | The access-policy request returned HTTP 403. |

The local browser publishing checks use the application's device repository. The pinned Supabase project has no recorded migration history. The baseline command reached PostgreSQL, which rejected the configured password, so the link-only Posts migration remains pending.

## Universal resolver verification on 22 November 2026

Pasted links and Android shares enter the same editor and product-preview API. The resolver checks the in-process cache, then the existing retailer adapters and public metadata parser. The first preview prioritizes the title and one decoded cover. The existing enrichment request fills missing fields and can supply another approved cover candidate. Downstream Poll, Compare and Post use the existing preview and manual editing flow.

The identity index uses only an observed product URL with a title and a validated image. Normalized URLs and recognized retailer product IDs can share a cached result when the origin, region and selection parameters agree. An HTML canonical declaration cannot create a cache alias. Exact structured variants use their own images. Price freshness is tracked from metadata extraction. On a transient refresh failure, the resolver can return saved identity and strip expired prices, offers and availability.

The former three-second robots deadline in `server/retailer-policy.cjs` and its shared error classification caused policy timeouts and access denials to look identical. The policy check now defaults to 5 seconds and reports its own stage and reason. A policy or product-page HTTP 403 remains a denial. Resets, timeouts, 429s, missing metadata and invalid URLs have different codes. An unavailable policy still prevents the direct request. Image redirects also check the exact production copy allowlist at each hop.

### Live results from the Worth It server

The direct checks below ran from this workspace with external providers disabled. Every sample was identified as the stated retailer. Elapsed times are for one rich-preview request. Title and price reflect the metadata returned during that run. Android Share delivery and rendering on a physical phone remain pending.

| Product URL | Live result | Title, cover and price | Time |
| --- | --- | --- | ---: |
| [Myntra share path](https://www.myntra.com/mailers/shirts/allensolly/allen-solly-relaxed-fit-printed-pure-cotton-casual-shirt/34912279/buy?utm_source=share) | `POLICY_TIMEOUT`, robots deadline | Product page not reached. The user previously observed a reset on a separate request. Reset classification was verified using a fixture. | 5,028 ms |
| [AJIO Rush](https://rush.ajio.com/nike-jordan-franchise-sandals/p/469848114_black) and [AJIO](https://www.ajio.com/nike-jordan-franchise-sandals/p/469848114_black) | `ACCESS_RESTRICTED`, robots HTTP 403 | Product pages not reached. | 117 / 120 ms |
| [Meesho](https://www.meesho.com/womens-printed-cotton-kurti/p/34q2z) | `ACCESS_RESTRICTED`, robots HTTP 403 | Product page not reached on this network. The user previously observed robots HTTP 200 followed by product-page HTTP 403. The page-stage denial was verified using a fixture. | 86 ms |
| [H&M India](https://www2.hm.com/en_in/productpage.1134781001.html) | `ACCESS_RESTRICTED`, robots HTTP 403 | Product page not reached. | 120 ms |
| [Zara India](https://www.zara.com/in/en/slim-fit-cotton-shirt-p08822051.html) | `ACCESS_RESTRICTED`, robots HTTP 403 | Product page not reached. | 76 ms |
| [Amazon India](https://www.amazon.in/iPhone-16-128-GB-Control/dp/B0DGJHBX5Y) | Partial, ASIN B0DGJHBX5Y | iPhone 16 128GB 5G Mobile Phone. Worth It web rendered the 1500 x 1500 cover. Price unavailable. | 3,248 ms |
| [Flipkart](https://www.flipkart.com/apple-iphone-16-black-128-gb/p/itmb07d67f995271?BU=Mixed&param=16475) | Partial, listing itmb07d67f995271 | Apple iPhone 16 (Black, 128 GB), INR 69,900. The image CDN robots endpoints returned HTTP 406 on follow-up, so Worth It web showed the title and manual photo flow. | 2,355 ms |
| [AMP e-commerce sample](https://amp.dev/documentation/examples/e-commerce/product_page/) | Partial, generic product page | Apple, USD 1.99. Worth It web rendered the 1024 x 682 cover. | 2,249 ms |

The web rendering check sent product API requests directly to the local product-preview middleware. Poll, Compare and Post were available in each of those three previews. The separate fixture-driven browser suite tested creation and publishing actions at 320, 390, 414 and 1024 px. Public desktop product URLs were used where an app-generated share URL was unavailable. Nykaa was not part of the live run.

### Android preview APK setup

1. Run `npm run import:server` as a Node service behind HTTPS with `NODE_ENV=production`. Set `PRODUCT_AUTH_SUPABASE_URL` and `PRODUCT_AUTH_ANON_KEY` to the same Supabase project used by the app.
2. Set `EXPO_PUBLIC_IMPORTER_URL` to that service's HTTPS origin and set `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` in the Expo **preview** environment. Rebuild the APK, sign in on the phone, and import an accessible product page to verify the connection.
3. For restricted retailers, configure an approved catalog connector with `PRODUCT_PROVIDER_MODULE`. Verify the exact product and variant, the current price and currency, and permission to display or copy the image. Verify real examples for each retailer before treating it as supported.

### Approved providers and local commands

The optional SerpApi connector queries by retailer and product ID. It uses merchant links from organic results and product offers to match retailer, product ID, market, and variant. Exact matches can supply titles and thumbnails on approved hosts. Google search does not expose the merchant offer observation time required for current prices. [SerpApi organic results](https://serpapi.com/organic-results) · [SerpApi product results](https://serpapi.com/product-result)

DataForSEO's Google Shopping search uses Google product IDs and documents deprecated seller product-page URL fields in its product search results. Those search results alone cannot establish an exact retailer variant. A DataForSEO connector was not enabled. [DataForSEO product search fields](https://docs.dataforseo.com/v3/merchant-google-products-task_get-advanced/) and [Merchant API overview](https://docs.dataforseo.com/v3/merchant-google-overview/)

Run from the `worth-it` directory in PowerShell.

```powershell
npm.cmd run check
$env:CREATION_UI_ONLY = '1'
npm.cmd run test:social-ui
$env:PRODUCT_SERPAPI_ENABLED = 'false'
Remove-Item Env:PRODUCT_PROVIDER_MODULE,Env:PRODUCT_BROWSER_HOSTS -ErrorAction SilentlyContinue
npm.cmd run test:product-live -- --rich 'https://www.amazon.in/dp/B0DGJHBX5Y'
npm.cmd run test:product-live -- --provider 'https://www.amazon.in/dp/B0DGJHBX5Y'
```

For an approved SerpApi trial, set `PRODUCT_SERPAPI_ENABLED=true`, `SERPAPI_API_KEY` and the market in `PRODUCT_SERPAPI_COUNTRY` in a private server environment. Set `PRODUCT_IMAGE_COPY_HOSTS` to exact CDN hostnames only after confirming usage rights. Then run the last command in that environment to check for an exact match and inspect its fields. Run the rich resolver with the same configuration to test image access and decoding. The sample importer settings also document the TTLs, policy deadline, and custom provider hook.
