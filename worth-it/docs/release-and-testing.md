# Worth It: implementation and testing

This work is scoped to Worth It at E:/projects/save vallet/worth-it. Scout was not changed.
All seven phases have code changes. Existing feed, profile, reels, poll results, and notifications remain readable on deployments that do not yet have migrations 0012-0016. New safety, saved-poll, read-state, and processing features still need the database migrations and trusted workers described below; they have not been deployed.

## What changed

| Phase | Code delivered |
| --- | --- |
| 1. Reliable publishing | Per-account durable drafts, restoration, stable post/media identifiers, recovery after uncertain commits, and safe retry. |
| 2. Security and safety | Native SecureStore session storage, optional Turnstile challenge integration, database quotas, reporting, mutual blocking, moderator report review and audit fields, and queued account deletion with a server worker. |
| 3. Feed performance | FlatList feed, cursor pages of 12, bounded account-scoped cache, thumbnail generation and cached image rendering, batched signed media URLs, and data saver. |
| 4. Uploads and media | TUS uploads above 6 MB with byte progress and pause/resume, safe reel retry, private processing jobs, JPEG validation/previews, MP4 validation/720px fast-start output/posters, retry controls, and dry-run orphan inspection. |
| 5. Results and interactions | Full vote/owner aggregates with 20 reasons per page, refresh every 15 seconds only while the poll screen is active, optimistic stars, notification read state, and tracking-parameter removal while preserving variants. |
| 6. Release reliability | Automated SQL permission regression suite, upload/worker/cache tests, CI checks and web build, error boundary, bounded device diagnostics, staging/production build profiles, public-secret guards, and dependency advisory patch. |
| 7. Useful additions and learning | Private saved polls, feedback forms, moderator feedback/usage/media-job dashboard, and persistent data saver settings. These collect feedback; they do not prove demand or retention. |

## Before connected testing

1. Back up the database. Use a separate Supabase staging project with staging-only credentials.
2. To enable all new features, apply any missing migrations in numeric order, including **0012 through 0016**. Do not run the test stubs or SQL test fixtures in a real Supabase project.
3. Restart Expo after dependency/configuration changes. Install with `npm ci`, then `npm start`. New native dependencies require a fresh native build if absent from your current client.
4. Set only public client configuration in the root .env: Supabase URL/anon (or publishable) key, HTTPS web URL, Turnstile site key, support email. See .env.example.
5. In Supabase Auth, enable Turnstile with the matching **secret on the server dashboard**, register your actual web domains in Turnstile, and allow your real web/native authentication redirect URLs. Configure Auth rate limits and email delivery for your expected traffic. Setting a site key in the client alone does not enforce CAPTCHA.
6. Bootstrap a moderator from the trusted SQL editor: `insert into public.moderators(user_id) values ('ACTUAL_AUTH_USER_UUID') on conflict do nothing;`. No client can grant this role.
7. Keep service credentials only in the worker host environment or a protected server/.env. Never place them in an EXPO_PUBLIC_ variable, repository, mobile binary, or web bundle.

## Trusted workers

Use Node 22.13 or newer. Install ffmpeg and ffprobe on the trusted worker host, including libx264 support. Use an isolated, non-root worker process with bounded resources. Workers do not accept arbitrary public URLs or shell command strings.

- Account deletion: `npm run worker:deletion`. Schedule periodically. Deletes nested storage prefixes and the user's votes before deleting the Auth user; other owned rows cascade. Requests stay queued on failure. Monitor the operations dashboard and worker exit status; configure host alerts.
- Media processing: `npm run worker:media`. Run it continuously via a scheduler/process manager; each invocation processes up to 20 jobs, claimed with row locking. It uses private Storage, validates JPEG bytes, creates previews, validates video metadata, generates MP4 playback and JPEG posters, and completes each job. Failed jobs can be retried by the poll owner; investigate recurring failures on the host.
- **Quarantine defaults off for rollout compatibility.** After verifying a worker in staging, enable it from the trusted SQL editor: `update public.media_pipeline_settings set enabled=true where id;`. New uploads then remain unavailable to other viewers until processing succeeds. Existing posts are preserved; this does not retroactively validate them or profile avatars.
- Generated poster/playback files follow the original post's privacy and blocking rules. Original files remain private and available for full-size detail viewing.
- Orphan inspection: `npm run media:cleanup`. This is a dry run. It examines objects older than 48 hours and checks references, including processing jobs. Review the count before using `npm run media:cleanup -- --execute` **during a write-maintenance window after in-flight publishing has drained**. Set MEDIA_CLEANUP_MAINTENANCE=true on the trusted host only for that maintenance window. Reference checks and Storage deletion cannot form one database transaction. Do not schedule destructive cleanup while publishing is allowed.
- Do not change the identity or media of a post after an uncertain publish. Retry that post first. TUS transfers resume from this device; unfinished files older than the cleanup window may need uploading again.

The media worker is not a malware scanner, copyright checker, nudity detector, or adaptive HLS streaming service. MP4 processing and native TUS transfers still need real-device/live-network verification.

## Testing checklist

Run `npm run check`, `npm run export:web`, and `npm audit`. SQL tests run all migrations and policy fixtures in isolated PGlite PostgreSQL; they do not connect to your Supabase project.

1. Draft: create a photo/video poll, wait for draft saving, leave/reopen, and refresh. The text and attachments should return for the same account.
2. Upload: throttle/disconnect the network, publish, pause, reconnect, and retry. Confirm exactly one post. Retry after a lost response. Try changing accounts mid-upload; publication must not cross identities.
3. Feed: follow enough people to exceed 12 posts, scroll, open a poll, and return. Pull to refresh. Turn on data saver and confirm videos require a tap.
4. Results: use a poll with more than 20 reasons. Totals must cover all votes; load additional reasons. Keep the poll open and vote from a second account. Background the app and verify refresh/video playback stops.
5. Privacy: make an account private, test approved/unapproved followers, block/unblock, and confirm all feeds/details/saved views and new media-link requests enforce access. Previously signed links expire within ten minutes.
6. Safety: submit a report. A normal account must not open report data or moderator actions. A trusted moderator can dismiss/remove; check audit fields.
7. Deletion: use a disposable staging account with nested photos/videos, votes, and saved polls. Request deletion, run the worker, and verify Auth/rows/Storage are removed. Never test with your real account.
8. Processing: enable quarantine in staging. New attachments should stay pending for other users, then appear after the worker succeeds. Submit malformed bytes using staging tooling and confirm rejection. Exercise a failed-job retry.
9. Saved/feedback/notifications: save and remove a poll, switch accounts, submit feedback, mark notifications read, then trigger a new notification. Private feedback must stay inaccessible to normal accounts.
10. Accessibility and devices: check keyboard/screen-reader labels, large fonts, slow connections, app background/resume, and at least one physical Android and iOS device.

## Release, recovery, and backup

- Keep staging and production Supabase projects and EAS environments separate. eas.json includes preview and production profiles. EAS project ID, application identifiers, signing credentials, and store records still need the operator's real account configuration.
- Use `npx eas-cli@latest build --profile preview --platform android` for an internal build. Verify it before a production build. Nothing has been published or submitted here.
- The runtime policy follows the app version. Bump the app version after native dependency/configuration changes. OTA updates are not enabled until you deliberately configure expo-updates and your EAS project. Do not assume an OTA rollback is available for this build.
- Keep the previous signed build/web artifact and release commit. For a web failure, restore the previous artifact; for mobile, stop rollout and ship a compatible fix. Once OTA is configured, test Expo's update rollback in staging.
- Database changes are additive. Roll back application code first; do not drop tables/columns containing user data. Use a forward repair migration for database problems.
- Enable your provider's backups/PITR as appropriate. Back up Storage objects separately: a database backup alone does not preserve the photo/video bytes. Rehearse restoration into an isolated project and compare row counts, Storage references, Auth configuration, and private access before claiming disaster recovery works.
- Publish real support/contact and retention terms before public release. Define retention for backups, reports, feedback, account deletions, and usage counters. Prune daily_usage under an operator-approved retention schedule.
- Apply HTTPS and host security headers (HSTS on production, nosniff, appropriate Referrer-Policy and frame-ancestors). Validate a CSP against the exported app and Turnstile before enforcing it; do not paste a policy that breaks authentication.
- Device timings are in-memory and reset at restart; operational counts are server-side daily quotas, not full behavioral analytics. External crash collection, alert delivery, push notifications, translated UX, adaptive streaming, and measured market validation remain separate integrations/product work.

## Evidence and limits

Automated tests cover commit ambiguity, drafts, quotas, private visibility, mutual blocking, role escalation attempts, aggregate result bounds, media quarantine, JPEG decoding, cleanup safeguards, and account-prefix deletion. Lint and type checking passed; all 49 automated tests passed. Web and Android JavaScript/Hermes exports passed. The dependency audit reported zero known vulnerabilities. These exports validate bundling, not a signed native binary or device behavior. Visual UI verification was unavailable because the desktop helper reported a missing native pipe. A new native binary, live Turnstile flow, live TUS endpoint, real video transcode, cloud worker scheduling, and backup restoration must be verified in staging before public release.

Supabase upload design follows https://supabase.com/docs/guides/storage/uploads/resumable-uploads.
Build profiles/runtime guidance follows https://docs.expo.dev/build/eas-json/ and https://docs.expo.dev/eas-update/runtime-versions/.


## Compatibility fixes for the reported screenshots

- A missing optional RPC (PostgREST PGRST202) no longer breaks existing content. The feed uses the existing authorized own/following loaders and preserves cursor ordering. Profiles and reels use authorized original media when derivative metadata is not deployed. No table grant or Storage policy is bypassed.
- Permission errors, expired sessions, network failures, and broken SQL are not classified as missing features. New write actions never pretend to succeed if their server support is absent.
- Notifications load independently of optional read-state support. Read RPCs use explicit p_mark parameters. The Mark all as read button and unread markers appear only when read-state support is available.
- Account safety tools show an availability message and do not offer deletion while safety support is absent. Technical session metrics are behind a development-only disclosure.
- Poll results fall back to the existing get_poll_view endpoint only when the new paged endpoint is missing. Reel retry lookup uses the existing authorized feed endpoint, avoiding a dependency on new direct-table SELECT grants.
- All six corrupted New poll strings (heading, subtitle, import status, gallery limit, and two placeholders) were replaced with clean UTF-8 text. A source encoding regression test checks the application tree.
- Restart the development server and reload the app after updating. Existing browsing works without the new migrations; enabling the new backend features still requires their setup.

Verification after the screenshot fixes: lint and type checking passed, all 49 tests passed, and the web export passed. The old-schema integration test exercises legacy RPCs and confirms that unapproved viewers still cannot read private polls or Storage objects. Live account/device checks remain operator tests.


## Responsive feed, visual Explore, and inline comments

- The feed uses a shared measured width: nearly full width on phones, capped at 600px beside the desktop rail. Header and post cells use the same width.
- Reels are playable posts in the feed, with author, caption, stars, product link, and a comment-panel button. Only the visible reel auto-plays; playback pauses with comments open or the app in the background. Offscreen players are released.
- Search mixes polls and reels in a three-column media grid. Tiles open their poll or reel. Existing processed posters are preferred. Legacy reels use a paused first-frame preview on web and a bounded thumbnail decoder on mobile; data saver skips these extra video requests.
- Comments on posts and reels open in the shared conversation panel: a bottom sheet on phones and a right-side panel at 900px or wider. The dedicated Reels tab retains full-height snapping and preserves the selected page.
- Comment lists render eight initial rows and virtualize the rest of the loaded comments. The composer stays fixed, with retry, 500-character limits and idempotent submission.
- Video-only polls retain their media in the feed, and video preview paths are signed through existing Storage permissions.
- Run `npm run test:social-ui` for an isolated demo build and headless browser checks at 390px, 414px, and 1024px. Windows uses installed Edge by default; set PLAYWRIGHT_CHANNEL=chrome to use installed Chrome. On other platforms install the matching Playwright Chromium first. This command disables Supabase and external page requests, and does not access live account data.
- Screenshots are saved under .expo/social-ui-shots. The test covers feed widths, thumbnail bounds, in-feed playback, a single playing reel, paused Explore previews, inline comment composers, navigation, and browser errors. Physical native-device behavior and live comments still need a staging check.

UI verification: all 49 automated tests and the isolated 390px/414px/1024px headless browser flows passed. Screenshot inspection confirmed full-width phone posts, actual grid thumbnails, inline videos, and comments beneath the selected content. Search and Reels reset their content state when the account changes.


## Bundled sample catalog

Worth It includes 20 fictional product polls and 10 short, silent MP4 showcases. The original three products and two reels are included in these totals. New artwork is original SVG illustration with bundled PNG versions. Sample products, prices, votes and reviews are demonstrations, not store offers or real shopper feedback.

- Samples appear alongside existing posts in Feed, the Search grid and Reels. Account > Your experience > Show sample content hides them on this device for the current account.
- Existing local installs backfill only missing sample rows. Identity, personal posts, votes and stars are preserved. No live database migration or storage upload is needed.
- Connected sample poll details are read-only; sample reel stars and sample comments stay on the device. Samples never appear as someone's uploaded profile posts.
- Edit src/lib/demoCatalog.json to change the 17 additional products and eight additional reels. Static image/video maps must also be updated for new asset names. Run npm run demo:media to regenerate illustrations and clips using installed Edge and the existing Sharp/Playwright dependencies. PLAYWRIGHT_CHANNEL can select another installed compatible browser.
- Restart the Expo dev server with npm start -- --clear after adding bundled assets. No dependency changes are needed for this catalog.

Verification: lint, TypeScript and all 52 automated tests passed, including catalog/media completeness and an old-catalog upgrade that preserves personal content and votes. Run npm run test:social-ui to verify 30 Search tiles, playable inline reels, inline comments and sample visibility persistence at phone and desktop widths.

Sample-catalog UI verification passed at 390px, 414px and 1024px, including all 30 tiles, inline playback/comments and hiding/restoring samples across reloads. Web and Android JavaScript/Hermes exports also passed. Physical-device playback remains a manual check.


## Full-height Reels viewer

The Reels tab has a separate immersive player rather than feed post cards. Each page equals the measured space above the bottom navigation, with native paging, fast deceleration, interval momentum limits, and mandatory web scroll snapping. Captions and actions overlay the video. One visible reel plays; offscreen players are released, with nearby posters only. Mute, data saver, pause and app-background behavior are preserved.

Comments open in a keyboard-aware bottom sheet on the same route. Opening pauses the current reel and locks paging; closing restores playback and the same scroll position. Long captions, validated product links and reporting are available under More. Feed comments use the same responsive conversation panel. Feed/Search reel links enter discovery browsing; explicit profile links retain their author scope.

Desktop supports arrow/Page Up/Page Down keys and previous/next buttons. Text fields and open sheets do not trigger paging shortcuts. Page size follows layout changes and preserves the current index. Offscreen page controls are hidden from assistive technology. No schema or dependency changes are required.

Automated browser checks cover wheel paging, mobile-web touch swiping, keyboard navigation, distant virtualized pages, viewport resizing, single-video playback, comment submission, pause/resume, and header/sound-control bounds. Physical iOS/Android swipe momentum, software-keyboard behavior and live network playback still need a staging-device check.

Reels verification completed: lint, TypeScript, all 52 automated tests, and isolated browser flows at 390px, 414px and 1024px passed. The 390px flow includes a touch drag and paging through eight reels. Web and Android JavaScript/Hermes exports passed. Screenshots are in .expo/social-ui-shots/*-reels-pager.png and *-reel-comments.png.


## Social-style comment panels

Post, poll-detail, feed-reel and Reels comments share one conversation UI. Phone sheets open at 74% height, expand to 92% through the handle, and support downward handle-drag dismissal. At 900px and wider the same conversation becomes a 400px right-side panel; the Reels player shifts left so it stays visible. Close, outside press, Escape on web and hardware Back on native preserve the underlying route and scroll position.

The header/count and composer stay fixed while a virtualized avatar-led conversation scrolls independently. Newest/Oldest sorts retain the draft; long comments expand; emoji shortcuts insert text into the composer. New comments scroll into view according to the chosen date sort. Posting keeps the existing idempotency key for retries, disables duplicate sends and blocks refresh while submitting. API privacy and access checks are unchanged.

The existing server/device API returns up to 50 recent comments. Sorting applies to that loaded window and the UI explains the limit at 50. Avatars use name initials when no photo is provided by the existing comment API. Sample comments remain device-only. This change adds no schema or dependency requirements.

Comment-panel verification completed: lint, TypeScript, all 53 tests, and isolated browser checks at 390px, 414px and 1024px passed. Coverage includes post/reel panels, fixed composition during scrolling, draft retention while sorting, emoji insertion, expanding long comments, new-comment visibility in both sort orders, handle expansion/drag dismissal, Escape dismissal, playback pause/resume and preserved reel position. Web and Android JavaScript/Hermes exports passed. Physical-device keyboard avoidance and gesture feel remain manual staging checks.


## Light and dark appearance

Open Profile > Settings > Appearance and toggle Dark mode. Off selects Light mode. The selection is saved under worthit:color-mode:v1 on this device and remains in effect through refresh, navigation and sign-out. On first use without a saved choice, the app starts with the device appearance.

Theme context supplies immutable light/dark palettes, semantic foreground/background pairs and typography. Theme-aware style factories cache by palette; switching appearance updates mounted components rather than replacing navigation or losing field state. All screen/shared-UI consumers use the theme hook, including forms, cards, votes, badges, error states, profiles, navigation and comment portals. Video/image viewers retain their dark media surfaces for contrast.

Native Appearance, status bars, root backgrounds and navigation colors follow the selected mode. Verification pages receive the same appearance; refreshing a web verification frame clears its previous token. API permissions and validation are unchanged. Text contrast tests cover content, muted text, placeholders, actions and semantic status pairs in both themes.

expo-system-ui is installed at the SDK-compatible version and userInterfaceStyle is automatic, with the config plugin enabled. Restart Expo with npm start -- --clear. A custom native development/release binary needs rebuilding to include the added native module/configuration. Native system dialogs and keyboard appearance should be checked on an actual device.

Appearance verification completed: lint, TypeScript, all 57 tests, and isolated 390px/414px/1024px browser flows passed. Checks include both palettes, text contrast, mode persistence, unchanged mounted controls, themed comment portals, focused input colors, readable price tags and saved drafts across mode changes. Web, Android and iOS JavaScript/Hermes exports passed. Expo dependency compatibility and automatic native appearance configuration were verified. Screenshots are under .expo/social-ui-shots/*-dark-*.png. Native dialogs/keyboard appearance still need a rebuilt-device check.

Dark appearance now uses a true black (#000000) base, neutral charcoal surfaces/inputs, and white/gray primary controls. Purple-tinted dark UI and media overlays were neutralized, including the verification page. Semantic status colors retain meaning. Lint, TypeScript, all 57 tests, and 390px/414px/1024px browser flows passed; refreshed screenshots confirmed the black palette in Feed, Settings, forms and comments. This palette adjustment needs an app refresh, with no additional dependency or native configuration changes.


## Profile poll and reel collections

Profile media defaults to a three-column visual grid, with square poll images and taller 3:4 reel previews. Separate Polls/Reels tabs include loaded-item counts; Grid/List controls switch to detailed rows with titles, prices, votes/stars and dates. Single-photo tiles stay clean, while multi-photo and video/reel content has a media badge.

Own and member profiles share a virtualized collection rather than a mapped list inside a ScrollView. Rows are grouped into one FlatList column so changing presentation does not remount the profile header or discard editor input. Collection controls remain sticky while browsing; reel previews stay paused and existing visibility/data-saver limits govern thumbnail decoding.

Polls open their detail page. Own reels open the author-scoped viewer with mine=1; member reels retain their author scope. Private member content is requested only when canView is granted, and hidden during refresh/loading. Screen state is keyed by viewer/profile identity to avoid reusing a previous user's media. No new API, permissions or migrations are required.

The isolated browser fixtures exercise seven owned polls and six owned reels, three-column sizing, square/tall aspect ratios, real image loading, grid/list switching, unsaved editor retention, scoped navigation and the black theme. These fixtures are confined to the temporary local browser context and do not add posts to live accounts.

Profile-collection verification completed: lint, TypeScript, all 57 tests, and isolated browser flows at 390px, 414px and 1024px passed. Browser checks cover owned-media thumbnails in both themes, three-column sizing, poll/reel aspect ratios, paused previews, grid/list toggles, unsaved editor retention and author-scoped navigation. Existing SQL visibility regressions passed. Web, Android and iOS JavaScript/Hermes exports passed. Profile screenshots are under .expo/social-ui-shots/*-profile-*.png; native-device layout and live-account media remain staging checks.


## Post management and retailer image imports (migration 0017)

Owners can open the three-dot control on a profile poll/reel, Manage poll in poll details, or More > Manage reel in the reel viewer. Poll editing changes item name, asking price, question and product link. Reel editing changes caption and product link. Published photos/videos stay attached; votes, likes, comments and purchase updates are preserved. Edited polls display an Edited label.

Archive removes a post from active profile lists, search/discovery, product history and feed/reel candidates before pagination. Nonowners cannot read archived details, comments, original media or processing derivatives. Profile > Archive provides private Polls/Reels grids, editing, restore and permanent deletion, with cursor pagination for older entries. Restoring retains the original publish date and engagement. Existing issued signed media URLs expire after their original ten-minute lifetime; archival prevents issuing new URLs to other viewers.

Deletion requires an explicit second confirmation. The database checks authenticated ownership and cascades votes, likes, comments, saves, purchase updates and media jobs. Uploaded file paths are captured in a private durable cleanup queue before those jobs disappear. Tombstones prevent publish retries from resurrecting a deleted ID and prevent new posts from reusing retired paths during cleanup. The cleanup worker checks remaining references before removing a file, so a file still used by another post is preserved. Local mode persists the equivalent actions and removes device media and saved/comment references.

### Enable connected accounts
1. Apply any pending migrations in numeric order through **supabase/migrations/0017_post_management.sql** in your Supabase SQL Editor, or use your already configured Supabase migration workflow. This file depends on migrations 0001-0016. Do not apply test fixtures to the live project.
2. On your trusted server, configure SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in server/.env (the existing server/.env.example documents these). Keep the service role key out of EXPO_PUBLIC variables and the mobile/browser bundle.
3. Schedule **npm run worker:post-cleanup** every five minutes. Each invocation handles at most 100 paths; run more frequently for a larger queue. Files become eligible ten minutes after deletion to let in-flight media processing finish. Failed work remains queued, with leased retries. Existing media and account deletion workers remain applicable.
4. Restart Expo and the standalone product import server if used. Refresh the app.

Migration 0017 and the cleanup worker have been validated locally; they have **not been applied or deployed to the connected Supabase project** because no database admin connection is available in this workspace. Browsing existing posts remains compatible during rollout. Owner actions show a friendly unavailable message when the new RPC has not been installed.

### Retailer images
The importer prefers original/larger images on Amazon, Flipkart, Myntra and AJIO CDNs, deduplicates size variants, validates image dimensions, skips tiny/unsupported images, and retains supplied-image fallback when an upgraded URL is rejected. Public product state in Myntra __myx, plain JSON application state, and Next.js JSON is parsed without executing scripts. Myntra /mailers/ share URLs are normalized. AJIO share redirects are resolved using the retailer's explicit deep_link_value/af_web_dp product target. Redirects and upgraded image requests still pass public-HTTPS, DNS/IP, byte, concurrency and timeout protections.

The supplied Amazon shopping link was verified live: images improved from **38 x 50 to 387 x 500 pixels**. Actual resolution is limited by what the store serves. Flipkart CDN transformations and Myntra/AJIO embedded state have fixture coverage. The supplied Myntra URL timed out, and AJIO refused the resolved public product request from this environment. Those two exact live imports remain unverified; the UI offers manual original-photo upload instead of claiming success.

Verification: lint (no warnings), TypeScript, 65 automated tests including isolated PostgreSQL policy tests, and 390px/414px/1024px local-browser flows passed. Browser tests exercise edit, archive, restore, delete/cancel, both content types and dark appearance using disposable local fixtures. Web and Android/iOS JavaScript/Hermes exports passed. Actual-device and migrated connected-account checks remain staging steps.


Migration troubleshooting: an error that worthit_product_key(text) does not exist means the helper from 0016_operations.sql is absent. Apply any missing earlier migrations through 0016 before rerunning all of 0017. The 0017 preflight now names missing prerequisites before changing tables; its explicit transaction prevents a failed full-file run from committing partial changes. If 0016 itself reports existing columns/triggers, stop and inspect migration state instead of rerunning fragments or dropping objects.


If 0016 reports that public.content_reports does not exist, the safety schema from 0012 is missing or incomplete. Run supabase/check_migrations.sql in SQL Editor first; it is read-only and reports schema checkpoints for 0010-0017. These markers do not replace a migration-history ledger or prove that fragments of a migration were fully applied. Apply complete missing files in ascending order (0012, 0013, 0014, 0015, 0016, 0017), including earlier missing prerequisites when reported. Do not create content_reports alone: 0012 also installs its access policies, quotas and related tables. The 0016 prerequisite guard now reports missing safety/results/media migrations before modifying tables.


For the verified manual-dashboard state where checkpoint 0010 is Present and every checkpoint 0011-0017 is Missing, supabase/upgrade_0011_to_0017.sql combines the seven canonical migrations in one transaction. Run the entire file once. Its preflight rejects databases that already contain later features, and a failure rolls back the complete upgrade. Re-run check_migrations.sql after success. Do not also run the individual 0011-0017 files afterward. This manual bundle does not write the Supabase CLI migration ledger; CLI-managed deployments must continue using canonical migrations. Rebuild it with node scripts/build-manual-upgrade.cjs if canonical files change; tests enforce source parity and verify rollback and all SQL permission fixtures.


## Automated database updates

Worth It now has local deployment commands using the pinned Supabase CLI 3.2.0. For authorized feature work, the coding agent can create a migration, test it, preview it and apply it to the configured project in the same task. No dashboard SQL copying is required after the one-time connection and history sync.

Commands:
- npm run db:status: inspect official remote migration history and show pending files. Read-only.
- npm run db:baseline: verify the existing schema checkpoints and mark the already-applied 0001-0017 files as applied using the official migration repair command. This changes history only; it never replays the old SQL or sample seed.
- npm run db:new -- add_feature_name: create a new UTC timestamped migration file.
- npm run db:plan: preview pending migrations with the CLI dry-run flag.
- npm run db:deploy: require a completed baseline, run npm run check, preview the pending files, push them with the CLI and read history again to verify success.

One-time credentials belong in ignored server/.env:
SUPABASE_ACCESS_TOKEN=your_personal_access_token
SUPABASE_DB_PASSWORD=your_project_database_password

Keep the existing SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY settings. The personal access token comes from https://supabase.com/dashboard/account/tokens; it is different from the server API key used by the cleanup worker. The database password is the project's PostgreSQL password, not an app-user password. Do not paste these values into chat or use EXPO_PUBLIC prefixes. Use a token scoped to the intended project where available. The token needs Database Read for inspection and the CLI's project/connection metadata permissions; CLI help reports the required scopes. The password authorizes direct PostgreSQL migration commands.

After the credentials are saved, the agent can run npm run db:status, npm run db:baseline once, and npm run db:plan. Existing manual migrations must be registered before any ordinary deploy; an incomplete checkpoint check aborts baseline registration. An unrelated remote migration or an unexpected project stops the workflow rather than silently repairing or replaying schema changes.

The nonsecret target is pinned in supabase/deployment.json and checked against the server/app URLs before connecting. Existing migration checksums in supabase/migration-baseline.json prevent edits to historical SQL. Add new timestamped correction migrations instead. Local deployments use an exclusive lock; unknown arguments, seed/reset operations and arbitrary SQL execution are not exposed by these commands. CLI execution uses argument arrays without a shell, credentials stay in the environment and output is redacted. Verification subprocesses receive no admin Supabase environment variables. The deployment CLI is a development dependency and is not imported by the app.

The initial credential-free verification covers project mismatch, missing credentials, old-migration replay prevention, incomplete setup, one-time history registration, pending-only deployment, failed-check blocking, unknown versions, read-only inspection, credential redaction, concurrent deployment locking and UTC file creation. Live baseline/deployment remains pending until the private credentials are configured. No remote reset or live user-data deletion was performed to set up this automation.

For a future CI deployment, run the same commands from the worth-it working directory and supply the private credentials through encrypted CI secrets. Current automation is invoked by the coding agent after tests; saving a half-written file or starting the app does not deploy database changes.


Native profile collection fix: Android enables removeClippedSubviews by default. The profile list now disables native clipping for its asynchronously growing header/sticky media controls and retains explicit native wrapper views. FlatList render-window virtualization remains enabled. Grid rows start with a window-width fallback until onLayout supplies the actual collection width, and external render state is explicitly passed as extraData. This addresses the case where profile counts and footer loaded but Polls/Reels controls and media were blank in Expo Go. The same collection component is used by own profiles, member profiles and Archive. This is a UI change; it requires no SQL migration. The user confirmed that the Polls/Reels tabs and posts are now visible on the physical Android phone after reloading Expo Go. Lint, TypeScript, all 78 automated tests, 390px/414px/1024px browser flows, and Android/iOS JavaScript/Hermes exports passed.

Post management now dismisses back to the existing Profile/Archive route after a successful action. Repeated edits no longer stack extra hidden profile screens; the existing screen reloads on focus and keeps its selected collection tab.


Branding update: the supplied Lime Green W! App Icon.png is copied unchanged to assets/brand-logo.png. The primary app icon, Android launcher icon and web favicon reference this asset. The previous template adaptive background/monochrome references were removed. The complete supplied artwork is used through Expo's regular icon pipeline, which scales the full image without treating the opaque rounded tile as a transparent adaptive foreground. The same bundled image replaces the question-mark logo in feed navigation and authentication, and appears during app startup. No database change is required. App content updates after reload; installed launcher icons require rebuilding/installing the native app. Expo Go keeps its own host-app launcher icon.

Branding verification completed: the copied PNG matches the supplied file byte-for-byte; light/dark 390px and light 1024px feed/authentication previews load the logo, with no browser errors. Web and Android/iOS JavaScript/Hermes exports passed. The native launcher icon itself is configured for the next installed build, not replaced on the Expo Go host application.


## W! navigation and fashion posts (Phase 1 and Phase 2)

The visible navigation is Feed / Spot / Add / Checks / Profile. Existing `/search`, `/reels`, `/new`, `/new-reel`, and `/p/[id]` routes remain valid. Feed owns the only notification bell. Profile has a Settings gear; Archive and connected-account Follow Requests are in Settings. Accepted follower/following lists are accessible from both profile views.

Add opens Poll or Post. Both use `ContentComposer`, device/imported media, separate account-scoped drafts, stable publishing identifiers, thumbnails, and the existing retry-safe publisher. Polls default to Fashion and keep their price, product links, voting and purchase outcomes. Regular posts use a caption and required photo/video, with no asking price or voting. They share Stars, comments, privacy, archive/restore/delete and owner editing with existing content.

Apply `supabase/migrations/20261120215850_fashion_posts_and_interactions.sql` after 0017, using `npm run db:status`, `npm run db:plan`, and `npm run db:deploy` once the one-time private admin setup above is complete. This additive migration gives existing rows the `poll` type, permits null prices only for regular posts, forbids post votes and purchase outcomes, returns authoritative Check Star totals and exposes private, paginated connection lists. Never replay or edit the frozen 0001-0017 migrations. A local test pass does not mean the connected database was deployed.

Single media/grid taps wait 280 ms to distinguish double taps. Double taps add a Star, never toggle it off; the explicit Star button still toggles. Writes coalesce per account/content and use existing unique constraints. The subtle animation respects reduced-motion preferences. Movement and unmount cancel pending navigation. The primary accent is #CEFF66; readable foreground tokens preserve contrast in both themes.

Verification: `npm run check`, `npm run test:social-ui`, and Expo Android/iOS exports. Browser checks use isolated local data at 390, 414 and 1024 px, including profile grids, settings, comments, Check paging, duplicate Stars, Add choices, post validation and photo publishing. On a real phone, reload Expo Go and check Profile, the new Add chooser, photo/video posts and double taps; native bundle exports cannot substitute for device interaction testing.

Main modified areas: app navigation/headers, Profile and Settings, `ContentComposer` and its route wrappers, feed/Spot/profile media presentation, `ContentTap` / `ContentStarButton` / `useContentStar`, local and connected repositories, publishing/drafts/validation, theme tokens, the new migration, and interaction/publishing/SQL/browser regressions.


## Phase 3: product-link metadata and Poll autofill

The existing `/api/product-preview` endpoint now normalizes product name, original store price/currency, plain-text description, store category, brand, verified product images, final product URL and platform. It reads accessible JSON-LD, Open Graph metadata and embedded public storefront data. It does not execute retailer scripts, call restricted private APIs, solve challenges, impersonate a browser, use credentials or fabricate missing fields. Myntra mailer links and AJIO website deep links use their public product-page forms; a share link that cannot resolve publicly requires the full website URL.

Poll creation imports after a 650 ms pause, shows loading, and preserves typed field edits and deliberate clears when a response arrives. Every fetched field is editable; images use the existing gallery/remove/reorder/manual-upload controls. Optional product details survive drafts, publishing, reloads and owner edits. Store currency is separate from the existing INR asking price; no currency conversion occurs. Missing details, blocked stores and broken images leave manual entry and publishing available. Publishing cancels an unfinished preview so it cannot mutate an upload in progress.

The service validates HTTPS URLs, credentials/ports, all DNS results, redirects and retailer boundaries, pins the checked IP for TLS requests, and checks public robots policy before each requested redirect/image URL. Pages, compressed responses, decoded pixels, image bytes, request bodies, response caching and concurrent work are bounded. Images are decoded and re-encoded to JPEG with metadata removed, not exposed as unverified hotlinks. Known CDN size variants are attempted once and fall back to the supplied accessible image. Successes cache for five minutes, failures for 30 seconds, identical in-flight imports coalesce; a deliberate Retry may refresh them. The frontend keeps only two image-bearing previews. Robots policy uses a bounded one-hour cache; a denied or unreachable policy stops automatic retrieval.

Setup:
1. Apply the prior Phase 1/2 migration and `supabase/migrations/20261121061446_product_link_details.sql` through the documented `db:status` / `db:plan` / `db:deploy` flow. Admin credentials are required only for deployment, never for the app or importer.
2. Restart Expo. Development Metro already mounts the endpoint. Native Expo uses the LAN host automatically, including development configurations pointing the importer at localhost.
3. Run `npm run import:server` behind HTTPS. Set `EXPO_PUBLIC_IMPORTER_URL` to the origin serving `/api/product-preview`, including when the web app proxies that endpoint. Set `PRODUCT_IMPORT_ORIGIN` on the importer if the web app uses a separate origin. The importer URL is a public build variable.
4. Explicit live verification: `npm run test:product-live -- "https://www.myntra.com/.../buy" "https://www.ajio.com/.../p/..."`. The command reports field values/presence and image counts without logging image bytes or credentials. Offline tests never contact retailers.

Live verification from this environment on 21 November 2026:
- Supplied Myntra product (42841923): its access-policy request timed out; a separate nine-second diagnostic also timed out. No live product fields or images were verified.
- AJIO full product (700704207_white): its access-policy request returned HTTP 403. The importer stopped; no private API or bypass was attempted. No live product fields or images were verified.
- Supplied AJIO OneLink share URL: could not resolve through accessible public metadata; use the full AJIO product URL or manual entry.
- Deterministic public-page fixtures verify extraction of every requested field for Myntra/AJIO formats, quality-image handling and missing-data behavior. These fixture results are not claims that those fields are currently accessible on the live stores.

Retailer references: [Myntra robots policy](https://www.myntra.com/robots.txt), [AJIO robots policy](https://www.ajio.com/robots.txt). Live outputs are retained locally in `.expo/phase3-live.jsonl` and `.expo/phase3-retailer-policy-live.jsonl` for this run. Availability can vary by URL, region and retailer policy. Reliable access to blocked fields requires retailer-authorized access rather than changing the request identity.

Files changed for this phase:
- Backend: `server/product-import.cjs`, `server/retailer-images.cjs`, new `server/retailer-policy.cjs`.
- Client import: `src/lib/productPreview.ts`, new `src/lib/productPreviewOrigin.ts`, new `src/lib/productDetails.ts`.
- UI: `src/ui/ContentComposer.tsx`, new `src/ui/ProductDetailsFields.tsx`, new `src/ui/ProductDetailsSummary.tsx`, `src/app/p/[id].tsx`, `src/app/manage-post.tsx`.
- Existing model/persistence: `src/lib/types.ts`, `src/lib/validation.ts`, `src/lib/draftStore.ts`, `src/lib/publishPoll.ts`, `src/lib/localRepo.ts`, `src/lib/supabaseRepo.ts`, `src/lib/feed.ts`, `src/lib/postEdits.ts`.
- Database: new `supabase/migrations/20261121061446_product_link_details.sql`, new `supabase/tests/95_product_link_details_test.sql`.
- Verification/tooling: `tests/productImport.test.ts`, new `tests/productLinkIntegration.test.ts`, new `tests/productPreviewOrigin.test.ts`, `tests/publishing.test.ts`, `tests/e2e/social-layout.cjs`, new `scripts/check-product-links.cjs`, `package.json`, this release guide.

Phase 3 verification completed: `npm run check` passed with 104 tests and no lint/type errors. Isolated browser flows passed at 390, 414 and 1024 px, including automatic field/image previews, protected user edits, explicit clears, unknown/foreign currency handling, blocked stores, invalid URLs, cancelled old responses and publishing while a preview is pending. Android and iOS Hermes exports passed. These exports do not replace physical-device interaction testing.

Live deployment remains pending: `npm run db:status` reported that SUPABASE_ACCESS_TOKEN and SUPABASE_DB_PASSWORD are not configured in the ignored server/.env file. No remote database update was performed. Apply the two new feature migrations in order through the documented admin setup/deploy workflow before testing connected product metadata persistence.


## Settings: account, privacy, activity and support

Implemented the three Settings phases. That release kept Normal theme only; the subsequent content-creation redesign below adds the optional Liquid Glass appearance requested in the newer brief. The existing palettes and #CEFF66 accent remain; Appearance offers Light, Dark and System with device persistence and live updates. Settings has grouped rows and separate pages. The Notifications bell remains on Feed only.

Personal Information edits display name, unique username and bio through the existing profile repository. Registered accounts can request verified email changes. Password changes, authenticator management and signing out other sessions reuse Supabase Auth and require password verification, plus an authenticator code when enabled. Password reset uses the provider's PKCE/recovery flow; callback processing distinguishes a verified recovery from an ordinary login. Unsupported phone/DOB fields and device lists are not fabricated. English is the only supported language.

Privacy reuses public/private accounts, approved follows, follow requests and mutual blocks. Added per-account comment/mention audiences, hidden words and mutes. Backend triggers enforce interaction controls for new comments and mentions; comment reads apply the owner's hidden words. Muting excludes accounts from recommendations and in-app notifications without changing follower relationships. In-app notification preferences filter actual notifications from existing relationships and interactions. Push delivery is not configured, so there is no fake push permission toggle; provider security and verification emails remain separate.

Saved Content includes existing saved Polls/products/Posts and new saved Checks. Stars and created/participated Polls derive from existing records. Own comments can be opened or deleted with ownership checks. Connected activity pages use a 30-entry timestamp/ID cursor with indexes and access checks. Archive still uses the existing archive/restore screens. New local comments record their author; older device comments without author IDs cannot be safely attributed. Older Stars have no recorded Star time and use the original content date, clearly disclosed in the Stars screen. Category, brand and style preferences rank matching Spot/Check content. Autoplay and Data Saver affect playback; prior device Data Saver choices and sample-content controls are preserved.

Help includes FAQs, the existing feedback flow and private problem reports with optional image-picker screenshots. Screenshots use existing JPEG preparation and private Storage, are accessible only to their owner/authorized moderators, are retained by media-reference checks, and are included in account-upload cleanup. Reports appear in the existing moderator operations view. Retry IDs deduplicate an unchanged report; editing a failed report creates a new ID. Local demo reports stay on that device and are explicitly identified as unsent; screenshot files are not persisted in local reports.

About reads the app version from Expo configuration. Community guidance is available in-app. Terms and Privacy are clearly marked **drafts awaiting approved legal/operator details**. No real support address has been invented. Set EXPO_PUBLIC_SUPPORT_EMAIL, EXPO_PUBLIC_TERMS_URL, EXPO_PUBLIC_PRIVACY_URL and optionally EXPO_PUBLIC_GUIDELINES_URL when approved content is available; document URLs must be HTTPS.

Logout uses Supabase sign-out and clears active session-related caches. Temporary deactivation preserves posts and relationships while hiding content and profiles, and blocks normal account operations until reactivation. Registered account deactivation/reactivation and permanent deletion requests require recent provider-authenticated proof, enforced in SQL using trusted AMR claims; anonymous guests retain their existing device-bound identity and receive an explicit recovery warning. Deletion queues the existing trusted deletion worker, which removes uploads, votes and the Auth user, cascading associated records. Logout/deactivation are not presented as deletion. No real user's account was deactivated or deleted during verification.

MFA enrollment uses the provider's authenticator/TOTP flow with manual setup; no external QR service receives its secret. AAL1 sessions cannot access private tables, Storage or existing user-callable SECURITY DEFINER RPCs after a factor is verified. New restrictive RLS policies supplement existing ownership policies. Callable RPCs receive equivalent guards because SECURITY DEFINER bypasses RLS. Account-state/reauthentication bootstrap endpoints are deliberate exceptions with their own checks. Keep the guard rule in AGENTS.md when adding future RPCs.

### Deployment and external setup

1. Configure the existing database deployment workflow with SUPABASE_ACCESS_TOKEN and SUPABASE_DB_PASSWORD in ignored server/.env. Do not paste credentials into chat or put admin keys into Expo variables. Run npm run db:status and the documented baseline process if historical migrations were applied manually, then npm run db:plan and npm run db:deploy. All migrations must run in order, including any pending earlier fashion/product-details migrations.
2. New Settings migrations: `20261121070932_settings_privacy_and_activity.sql` and `20261121072448_account_lifecycle_and_support.sql`. Historical 0001–0017 files remain immutable. Do not paste test stubs or fixtures into a live database. New controls clearly report that they await deployment on older databases, while existing privacy/account features remain available.
3. Allow the actual auth callback URLs in Supabase Auth: the published web origin plus /auth-confirm, the built app's worthit://auth-confirm, and the exact development Expo Go callback URL when testing that client. Native PKCE flows return to the originating app rather than a different web client. Open recovery links on the app/browser that requested them. Configure email confirmation, secure email changes, email delivery and provider TOTP support. Live email delivery and authenticator enrollment require a configured provider and must be smoke-tested on a disposable account.
4. Run/schedule `npm run worker:deletion` on the trusted host with server-only SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY, alongside the existing media and post-cleanup workers. A successful deletion request stays pending until this worker runs. The operator must publish approved retention/backups/legal information before public release.
5. No push-delivery service or additional translations have been added. These require separate infrastructure/content. Optional support contact/legal URLs can be configured later without replacing the Settings architecture.

The latest db:status check still reports that admin deployment credentials are missing. **No remote database update was performed for these Settings migrations.** No provider email, live MFA enrollment, or real account deletion was triggered.

### Modified files

- Routes: `src/app/account.tsx`, `src/app/settings/[section].tsx`, `src/app/account-lock.tsx`, `src/app/password-reset.tsx`, `src/app/auth-confirm.tsx`, `src/app/_layout.tsx`, `src/app/profile.tsx`, `src/app/saved.tsx`, `src/app/search.tsx`, `src/app/notifications.tsx`, `src/app/moderation.tsx`.
- Shared UI: `src/ui/settings/{PersonalSettings,SecuritySettings,MfaSettings,PrivacySettings,PreferenceSettings,ActivitySettings,SaveCheckButton,AccountActions,InfoSettings,ReportSettings,LocalTools}.tsx`, `src/ui/AppearanceSettings.tsx`, `src/ui/AppThemeProvider.tsx`, `src/ui/AppContext.tsx`, `src/ui/useAccountGuard.ts`, `src/ui/AccountAuth.tsx`, `src/ui/ReelSheet.tsx`, `src/ui/ReelVideo.tsx`.
- Services: `src/lib/settingsCatalog.ts`, `src/lib/accountSecurity.ts`, `src/lib/accountLifecycle.ts`, `src/lib/preferenceValues.ts`, `src/lib/accountPreferences.ts`, `src/lib/preferences.ts`, `src/lib/activity.ts`, `src/lib/support.ts`, `src/lib/auth.ts`, `src/lib/supabase.ts`, `src/lib/socialRepo.ts`, `src/lib/comments.ts`, `src/lib/notificationsData.ts`.
- Database/tests/config: the two new Settings migrations, `supabase/tests/100_settings_test.sql`, `supabase/tests/101_account_lifecycle_test.sql`, isolated Auth test stubs, `tests/accountSecurity.test.ts`, `tests/settings.test.ts`, `tests/e2e/social-layout.cjs`, `.env.example`, `AGENTS.md`, and this guide.

Verification uses lint/type checks and 113 automated tests, including canonical and manual-upgrade PostgreSQL runs, comment/mention restrictions, hidden words, notification suppression, mutes, Star activity, 30-entry pagination without duplicates, comment ownership, stale-auth denial, deactivation/hidden profiles, AAL1/AAL2 restrictions, report deduplication, private screenshots and cleanup references. Isolated browser checks exercise Settings at 390, 414 and 1024 px along with existing Feed/Spot/Checks/Profile/creation/comment/Star/archive flows. Android/iOS Hermes exports check native bundling. These checks do not replace real-device interaction or live-provider testing.

Implementation references: [Supabase TOTP](https://supabase.com/docs/guides/auth/auth-mfa/totp), [Supabase PKCE](https://supabase.com/docs/guides/auth/sessions/pkce-flow), [Expo 58 Linking](https://docs.expo.dev/versions/v58.0.0/sdk/linking/), [Expo 58 ImagePicker](https://docs.expo.dev/versions/v58.0.0/sdk/imagepicker/).


## Professional content creation redesign

The Add page has two spacious, fully clickable choices: Poll ("Get opinions or compare products.") and Post ("Share your style and fashion finds."). Existing fashion artwork supplies decorative previews; it is never presented as imported retailer data. Feed | Spot | Add | Checks | Profile and the existing authentication/navigation routes remain in place.

Poll now follows **Add product → Poll or Compare → Complete content → Preview → Publish**. The first step supports the existing product-link importer and media picker. Product name is editable, prices/currency remain optional, and extra details are collapsed. Failed/blocked imports allow manual entry without invented product information. Imports remain asynchronous, debounced, cancellable and cached by the existing service. Manual edits and explicit clears are retained when an import completes late. Each product owns its metadata, URL, media IDs and import state.

Opinion polls default to “Is this worth buying?” with Worth it / Not worth it / Wait for sale. Users can edit the question and 2–4 unique, nonempty option labels. Comparisons default to “Which one should I buy?” and support 2–4 independent products, shown in a responsive two-column layout. Product choices replace generic opinion choices; results show vote percentages and leading products, including ties. Products can be edited, replaced or removed while drafting. Category, use case, priorities and budget remain in More Options and are shown through the existing shopping context component.

Posts follow **Photos → Caption → Preview → Publish**. Existing multi-photo/video picking, removal and ordering are retained. Caption/hashtags are optional, with category, location and an optional product link under More Options. Regular Posts do not require product details or voting choices.

Preview and published Feed/detail screens share the creation content renderer. Preview interactions are explicitly inactive until publication. Stars, comments, saving, sharing, archive and deletion continue to use existing services. New Feed cards expose the existing Save action; saved-state reads coalesce in a bounded viewer-scoped cache and are invalidated on changes/sign-out. The existing publishing pipeline retains stable request/media IDs, upload progress, pause/retry and recovery after uncertain commits. Drafts preserve products, options, creation step and media references across back navigation, theme changes and reopening. Existing drafts are adapted into the new editor, including their stored shopping context.

### Appearance and platform behavior

Settings → Appearance now offers **Normal | Liquid Glass**, independently of Light / Dark / System. Normal remains the default. Appearance is saved on the device and restored before the app renders; changing it does not reset drafts. Normal palettes and unrelated screens retain their existing appearance.

Creation surfaces and headers use native Liquid Glass where the iOS API and compiled app support it. Other supported iOS/web environments use subtle Expo blur. Android uses one background-only BlurTargetView per creation screen and SDK-31+ blur on surrounding panels; older Android versions use the lightweight translucent fallback. Headers outside that target also use the fallback. Product photos are not blurred. Large media containers stay sharp, effects are limited, and reduced transparency/motion uses solid surfaces. Expo-compatible `expo-blur` and `expo-glass-effect` were installed. Existing standalone/development binaries need rebuilding to include newly added native modules; use a compatible Expo Go client for its bundled modules.

### Database and compatibility

Additive migration: `supabase/migrations/20261121083604_creation_flow_and_comparison.sql`. Run it after the earlier product-details and Settings/security migrations, using the existing db:status / db:plan / db:deploy workflow. A prerequisite check prevents applying this feature without those security dependencies. Historical migrations were not edited.

The existing polls/votes tables now carry a bounded, validated `creation_spec` and an optional `option_id`. New dynamic votes use option IDs; old Buy/Wait/Skip votes and old Poll/Post records keep their original behavior. The existing unique poll/voter constraint prevents duplicate votes. New RPCs enforce sessions/MFA, ownership, privacy and archived-content access. Generic legacy choices cannot be submitted to a new comparison. Product/options setup becomes fixed after publishing to protect vote meaning; owners can still edit questions/captions and use existing archive/delete controls. Question and short-description mentions use existing recipient privacy checks.

Connected publishing is explicitly disabled with an explanatory message when the creation migration is absent; drafts and previews remain available. The latest db:status check reported missing SUPABASE_ACCESS_TOKEN and SUPABASE_DB_PASSWORD in ignored server/.env, so **this migration has not been deployed to the live database**. Keep admin/worker credentials out of Expo and chat. Existing media/deletion/cleanup workers remain responsible for their normal processing; no new worker is required for comparisons.

Retailer restrictions are unchanged. Browser import checks use deterministic Myntra/AJIO-shaped fixtures, including a restricted-store failure; they do not prove current live-store access. Actual retail links may still require manual details/photos. Physical-device interactions and native Liquid Glass appearance have not been verified on a real device.

### Files and verification

- Creation UI: `src/app/add.tsx`, `src/ui/ContentComposer.tsx`, new `src/ui/creation/ProductEditor.tsx` and `Surface.tsx`, new `src/ui/CreationBody.tsx` and `CreationVoting.tsx`.
- Presentation/actions: `src/app/index.tsx`, `src/app/p/[id].tsx`, `src/app/manage-post.tsx`, `src/ui/PostPresentation.tsx`, `src/ui/ProductDetailsFields.tsx`, `src/ui/SavePoll.tsx`, `src/ui/kit.tsx`.
- Theme/session: `src/ui/AppThemeProvider.tsx`, `src/ui/AppearanceSettings.tsx`, `src/ui/AppContext.tsx`.
- Data/persistence: new `src/lib/creationSpec.ts` and `creationDraft.ts`, `src/lib/types.ts`, `validation.ts`, `draftStore.ts`, `localRepo.ts`, `supabaseRepo.ts`, `publishPoll.ts`, `feed.ts`, `postEdits.ts`, `engagement.ts`.
- Database/tests/config: the new migration, `supabase/tests/110_creation_flow_test.sql`, `tests/creationFlow.test.ts`, `tests/sourceEncoding.test.ts`, `tests/e2e/social-layout.cjs`, new `tests/e2e/creation-flows.cjs`, `package.json`, `package-lock.json`, and this guide.

`npm run check` passed with 116 tests and no lint/type errors. SQL regressions include publishing with optional prices, valid product choices, invalid/generic votes, duplicate/author votes, correct totals, private-result access and AAL1 denial. Full isolated browser regressions passed at 390, 414 and 1024 px, covering existing social flows plus the staged creator, independent imports, late-response edits, comparison publication/voting, opinion validation and Post/theme persistence. Android/iOS Hermes exports passed. Final focused creator checks and images are stored under .expo (ignored by Git).

Implementation references: [Expo 58 GlassEffect](https://docs.expo.dev/versions/v58.0.0/sdk/glass-effect/), [Expo 58 BlurView](https://docs.expo.dev/versions/v58.0.0/sdk/blur-view/), [Expo 58 ImagePicker](https://docs.expo.dev/versions/v58.0.0/sdk/imagepicker/), [React Native AccessibilityInfo](https://reactnative.dev/docs/accessibilityinfo).


## Checking a connected database

Run the entire `supabase/check_database_health.sql` file in the correct project's Supabase SQL Editor. It uses a read-only transaction and returns schema/security metadata, without changing or returning user data. PASS means only that the specific catalog check passed; FAIL needs investigation, REVIEW needs assessment, and INFO describes coverage limits. Run it again after migration work. Checkpoints are not proof of complete migration application or official migration history: do not replay a migration just because one marker is missing.

The query includes existing legacy/feature checkpoints, required app tables, RLS and restrictive session gates, RPC guard/search-path markers, worker RPC grants, protected writes, media buckets, invalid indexes and unvalidated constraints. It is a diagnostic, not a comprehensive security audit or data-integrity scan. Update its expected objects/checkpoints when adding migrations. The local SQL test runner verifies it against an isolated PostgreSQL database and verifies that disabled RLS is detected. Never paste `supabase/tests` fixtures or auth stubs into a live project.

Also review Supabase's Health, Security and Performance Advisors: https://supabase.com/docs/guides/observability/advisors . Review findings against the intended access model rather than applying all suggested changes blindly.

Use two disposable test accounts in the app to verify real permissions: create a Poll, comparison, Post and Check; vote/star/save/comment and confirm totals after refresh; verify another account cannot edit or access private/archived content; approve a follow request and verify expected access; archive/restore your own content; upload a photo/video and confirm processing completes; change Settings and confirm they persist. Test MFA/deactivation using test accounts when configured. Test deletion only on disposable accounts with the deletion/cleanup workers configured. SQL Editor/admin success does not prove authenticated RLS access works. Check worker logs, Supabase errors and query performance separately. `npm.cmd run check` runs local regressions, not a health check of the connected project.


## App-wide glass appearance fix

The appearance preference previously reached only creation surfaces; the main app used the Normal palette. Glass now participates in the shared theme, independently of Light/Dark/System mode. Feed Poll/Check cards, Profile, Settings groups, creation panels and navigation use shared surface styling. Spot and other shared controls inherit the glass palette. Media is kept crisp; immersive Check playback retains its black video background. Normal mode restores the existing colors. The Appearance page includes an immediate preview and explains platform/accessibility fallbacks.

New shared `ThemeSurface`, `ThemeBackdrop` and `useReducedEffects` replace the creation-only effect implementation. Android uses one decorative, background-only BlurTargetView; it never captures its own blur layers, photos, or playing videos. Navigation/selected panels use the supported blur method, while scrolling cards use tint and highlights without one blur renderer per card. iOS native GlassView is used only when both availability checks pass; otherwise existing Expo BlurView provides frosting. Older Android devices fall back to tint. Native iOS Liquid Glass is not available on Android. Reduced motion/transparency disables effects app-wide while keeping the selected preference. No new package or database migration is needed.

Verification: `npm.cmd run check`; isolated browser theme tests via `$env:APPEARANCE_UI_ONLY='1'; npm.cmd run test:social-ui` (clear that variable to run the full suite). Tests cover immediate changes across Feed/Profile/Settings/navigation, both color modes, preference persistence after reload, crisp photos, reduced effects, restoring Normal, and small/desktop layouts. Native export validates bundle compatibility but does not prove physical-device blur quality; reload the updated app on Android/iOS for final visual verification.

Final verification for the app-wide appearance fix: lint and TypeScript passed; all 117 local tests passed; the full isolated social/creation/browser suite passed at 390, 414 and 1024 px. A fresh focused appearance build also passed at all three sizes after the sticky Profile tab adjustment. Android and iOS Hermes exports passed for the final source. Logs: `.expo/appearance-final-check.log`, `.expo/appearance-full-ui.log`, `.expo/appearance-final-ui.log`, `.expo/appearance-native.log`. Glass light/dark Feed and Profile screenshots are in `.expo/social-ui-shots`. Physical-device rendering still needs checking on the user's phone.

Files changed for this fix: shared `src/ui/theme.ts`, `AppThemeProvider.tsx`, new `ThemeBackdrop.tsx`, `ThemeSurface.tsx`, `useReducedEffects.ts`; `AppearanceSettings.tsx`, `AppTabs.tsx`, `FeedReelPost.tsx`, `ProfileMediaCollection.tsx`, `kit.tsx`, `creation/Surface.tsx`; `src/app/_layout.tsx`, `index.tsx`, `profile.tsx`, `search.tsx`, `account.tsx`; `tests/theme.test.ts`, new `tests/e2e/appearance-flows.cjs`, `tests/e2e/social-layout.cjs`; this guide.

## Neutral glass surfaces and mobile double-tap fix

Glass now uses a white canvas in Light mode and a black canvas in Dark mode, with neutral grey/white frosting, borders and highlights. Green surface tints, glass tint colors and decorative backdrop colors were removed. Lime branding remains on action controls. Reduced-effects Glass mode keeps the same neutral palette with solid surfaces.

Double-tap recognition now reserves the first tap as soon as the second press begins, so its timer cannot open content while the second finger press is still down. The default window is 350 ms, with touch slop for normal finger placement. Native move/release coordinates are read from touch arrays when present; missing coordinates no longer become a false jump to (0,0). Scroll cancellation and long press cancel pending taps. Repeated double taps still request the existing idempotent Star add, using the shared account-scoped state and unchanged backend APIs. Read-only previews/sample products show an explanation rather than silently ignoring the double tap. Modern Post photos now open the content on single tap. Comparison videos use their own shared tap controller rather than a nested play control swallowing double taps.

Validation: lint and TypeScript passed; all 120 local tests passed. The focused appearance/gesture browser suite passed at 390, 414 and 1024 px. Phone-sized contexts use Chrome DevTools touchStart/touchEnd events, including a second press released after the original single-tap deadline; desktop uses mouse events. Coverage includes Normal, Light Glass, Dark Glass, gallery photos, Checks, modern Posts, comparison videos, repeated add coalescing, visible selected Star state, storage persistence, single-tap opening and continued Check playback. Neutral Feed screenshots were visually inspected. Android/iOS Hermes exports passed. This verifies isolated app behavior and bundle compatibility; the user's physical Android phone still needs a reload and final interaction check. No database migration or live user-data changes were made.

Files: `src/lib/contentTaps.ts`, `src/ui/ContentTap.tsx`, `src/ui/CreationBody.tsx`, `src/ui/theme.ts`, `src/ui/ThemeSurface.tsx`, `src/ui/ThemeBackdrop.tsx`; `tests/contentInteractions.test.ts`, `tests/theme.test.ts`, `tests/e2e/appearance-flows.cjs`, new `tests/e2e/touch-star-flows.cjs`, `tests/e2e/social-layout.cjs`; this guide. Logs: `.expo/neutral-taps-final-check.log`, `.expo/neutral-taps-final-ui.log`, `.expo/neutral-taps-native.log`.


## Floating top and bottom navigation

The reference-inspired bottom navigation is one rounded capsule, with five equally spaced Feed / Spot / Add / Checks / Profile items. Existing routes and actions are retained. Home, rounded-square Add and horizontal Checks outline variants extend the existing drawn icon component; no icon/font dependency was added. Capsules follow the selected color mode: white with readable dark glyphs in Light mode, black with soft-grey glyphs in Dark mode. The active state uses the existing contrast-safe accent ink plus a small lime highlight and indicator. Header surfaces remain lighter and follow the page's color mode. Page backgrounds retain the neutral white/black Glass palette.

`FloatingSurface` reuses ThemeSurface/Expo blur/glass support for both the top and bottom capsules. Normal mode is solid with a subtle border/shadow; Glass mode adds frosting, thin highlights and inner edge reflections. Reduced effects uses solid material and zero-duration selection changes. The existing Android background-only blur target is reused; no extra blur layer is created per tab button. Unsupported blur falls back to the tinted surface. No large glows or gradients were added.

The existing bottom sibling layout now reserves the full 70px capsule, two 8px floating gaps, and bottom safe-area inset. This keeps the bar fixed at the viewport bottom while the list scrolls, without covering the last item or system gesture area. Shared capsules have 12px minimum side margins and a 600px responsive width cap. Desktop Feed uses the same horizontal capsule instead of a separate rail. Feed and Spot have compact in-flow floating headers; Profile and other Stack screens reuse a custom Stack header that preserves existing back/title/right actions. Checks keeps its full-height snap pager and a floating overlay header above video. Full-screen creation and modal media/comment experiences keep their existing navigation visibility behavior.

Feed alone shows Notifications; Profile keeps Settings. Poll/Post creation headers retain Appearance and use the existing Continue / Preview / Publish handlers. Check creation also exposes its existing publish handler in the header. Body publishing controls, drafts, routes, authentication and database behavior are preserved.

Files: new `src/lib/floatingNavigation.ts`, `src/ui/FloatingSurface.tsx`, `src/ui/FloatingHeader.tsx`; `src/ui/ThemeSurface.tsx`, `AppTabs.tsx`, `SocialIcon.tsx`, `ContentComposer.tsx`; `src/app/_layout.tsx`, `index.tsx`, `search.tsx`, `reels.tsx`, `new-reel.tsx`; new `tests/floatingNavigation.test.ts`, `tests/e2e/navigation-flows.cjs`; updated `tests/e2e/social-layout.cjs`, `appearance-flows.cjs`, `creation-flows.cjs`; this guide. No package or database migration was added.

Verification commands: `npm.cmd run check`; `$env:NAV_UI_ONLY='1'; npm.cmd run test:social-ui` for the focused capsule/theme/route checks (clear NAV_UI_ONLY before running the full suite). Browser checks include capsule bounds, equal item widths, >=44px touch targets, lime active state, normal/glass/light/dark switching, matching header/footer alignment, exclusive Feed notifications, Profile Settings, Checks playback viewport, creation header actions and content clearance. A pure layout regression checks gesture-inset reservation. Physical iOS/Android safe-area and glass rendering still require checking on a device; native export validates bundle compatibility only.

Final navigation verification: lint and TypeScript passed; all 122 local tests passed. The full isolated social/creation/video/gesture/appearance/navigation browser suite passed at 390, 414 and 1024 px. The final focused navigation build also passed at all three sizes after the side-safe-area and short-fade adjustments. Android/iOS Hermes exports passed. Logs: `.expo/floating-navigation-final-check.log`, `.expo/floating-navigation-full-ui.log`, `.expo/floating-navigation-final-ui.log`, `.expo/floating-navigation-native.log`. Normal/Glass Light/Dark capsule screenshots are in `.expo/social-ui-shots/*-floating-*.png`; these were visually reviewed against the reference. Final physical-device glass rendering and system safe areas still need an Expo Go check.

Main routes use a short fade rather than sliding the capsule sideways, with animation disabled for reduced effects. Side-safe-area handling also updates `src/app/profile.tsx`: pages that already inset their root do not double-count landscape cutouts; Profile applies its side insets in the dock. `tests/e2e/touch-star-flows.cjs` now chooses an actual demo video for playback assertions, avoiding poster-only management fixtures. Creation regressions publish a Post using the header action as well as exercising existing body actions. No live database, user records or credentials were changed.


## Theme-aware navigation overlays follow-up

Removed the forced dark bottom material in Light mode. The same component now follows Light/Dark in Normal and Glass appearances, including the Checks header. Light mode uses white surfaces and dark icons/labels; the selected state retains lime in its small highlight/indicator while using dark green ink for readable contrast on white. Dark mode keeps black surfaces and lime selected ink.

Replaced the reserved full-width footer slot with an absolutely positioned, transparent overlay dock. Its surrounding space passes touches through to the page. Feed/Spot headers are also overlays; Profile uses a transparent Stack header. Header/container backgrounds are transparent so only the capsule paints a surface. Scroll content now extends behind the bars, with first/last-item padding to keep actions reachable. Checks captions/actions sit above the bottom capsule while its video pager uses the available viewport.

Profile uses the measured Stack header height for initial padding and sticky controls. A small `ProfileStickyHeader` uses ScrollView's public StickyHeaderComponent API on native; scoped `ProfileStickyStyles.web.tsx` offsets React Native Web's CSS sticky wrapper. This preserves normal item layout and editing hit targets without negative margins. Native automatic content insets are disabled where manual overlay clearance is supplied. No extra navigation dependency or database change was added.

Files: `src/ui/AppTabs.tsx`, `FloatingHeader.tsx`, `FloatingSurface.tsx`, `ProfileMediaCollection.tsx`, new `ProfileStickyHeader.tsx`, `ProfileStickyStyles.tsx`, `ProfileStickyStyles.web.tsx`, `ReelPage.tsx`; `src/app/_layout.tsx`, `index.tsx`, `search.tsx`, `profile.tsx`, `reels.tsx`; `src/lib/floatingNavigation.ts`; `tests/e2e/navigation-flows.cjs`, `appearance-flows.cjs`; this guide. This section supersedes the earlier dark-in-both-modes and in-flow-footer descriptions.

Overlay follow-up validation: lint, TypeScript and all 122 local tests passed. The full isolated social/video/creation/gesture/appearance/navigation suite passed at 390, 414 and 1024 px. Fresh-build overlay scrolling checks also passed at all three widths: capsules follow color mode, dock backgrounds are transparent, side gaps hit the page underneath, Profile editing works, sticky tabs sit below the header, and the last tile scrolls clear of the bottom capsule. Android/iOS Hermes exports passed. Logs: `.expo/floating-overlay-final-check.log`, `.expo/floating-overlay-full-ui.log`, `.expo/floating-overlay-final-scroll.log`, `.expo/floating-overlay-native.log`. Physical-device blur and safe-area behavior still need the user's Expo Go verification. No live user data or database schema was changed.


### 22 November 2026: Settings editing, activity grids, Checks playback and prices

- Settings text inputs start read-only and expose an inline Edit/Done control. Existing Save, password verification, MFA and destructive-action confirmations remain the persistence/security boundary.
- Your Stars, Poll Activity and Your Comments use responsive two/three-column grids. Open-content actions, comment deletion, pagination and saved-content actions are preserved. Grid tiles use content-type icons; no new thumbnail-fetch requests were added.
- Checks keeps the active player and one upcoming player prepared, pauses inactive players and avoids generating background video thumbnails for offscreen pages. Buffers are bounded; data saver/autoplay preferences and app-background pausing remain enforced. Paging switches active video at half visibility, with a settled-page fallback. Playback errors expose Retry. Physical device smoothness requires Expo Go/device verification.
- Product metadata and prices load before gallery downloads, with shared page extraction and a bounded photo budget. Poll/product/comparison covers show source-currency prices at the lower-left; decimal prices are preserved and missing currencies stay explicit.
- No Supabase migration or bucket changes. Restart the import server and Expo to test staged responses. Existing API clients remain supported.

Verification logs: .expo/settings-checks-price-check.log, .expo/settings-checks-price-ui.log, .expo/settings-checks-price-native.log. Focused Settings grids can be checked with SETTINGS_UI_ONLY=1 using the existing social-layout browser runner. All browser fixtures and exports disable connected Supabase accounts.

Verification completed: npm run check passed with 140 tests; the complete browser suite passed at 390/414/1024px. The focused SETTINGS_UI_ONLY=1 CREATION_UI_ONLY=1 run passed all three sizes, including locked/editable Settings fields, activity-grid alignment, and visible source price before a deliberately gated gallery response. Android/iOS/web exports passed. Mobile grid and comparison-price screenshots were inspected. Physical Android swipe latency and retailer network latency remain device/network dependent.


## Glossy Dark appearance

Glossy Dark is a third choice under Settings → Appearance. It applies its dark palette immediately and persists on the device. Normal and Liquid Glass continue to use the saved Light, Dark, or System mode when selected. The same screens, routes, and interaction state serve all three appearances.

| Element | Normal | Glossy Dark |
|---|---|---|
| Background and typography | Existing light and dark palettes | #101011 canvas, #FAFAFA primary text, #A1A1AA supporting text |
| Cards and dividers | Existing solid surfaces and borders | #242426 graphite, #2C2C30 elevated surfaces, and thin translucent silver borders |
| Fields | Existing input surface and brand focus ring | #1B1B1E fields and a silver focus ring |
| Floating navigation | Existing capsules and active states | #1D1D20 capsule base, brighter graphite selections, silver reflection, and restrained shadow |
| Actions and branding | Existing lime-accented actions | Silver buttons and engagement states. The official logo, lime price tags, and the existing lime Create shortcut retain their brand treatment. |

### Shared implementation and changed files

| Area | Files |
|---|---|
| Palette and preference | [colorTheme.ts](../src/lib/colorTheme.ts), [theme.ts](../src/ui/theme.ts), [AppThemeProvider.tsx](../src/ui/AppThemeProvider.tsx), [AppearanceSettings.tsx](../src/ui/AppearanceSettings.tsx) |
| Materials and controls | [ThemeSurface.tsx](../src/ui/ThemeSurface.tsx), [ThemeBackdrop.tsx](../src/ui/ThemeBackdrop.tsx), [FloatingSurface.tsx](../src/ui/FloatingSurface.tsx), [AppTabs.tsx](../src/ui/AppTabs.tsx), [kit.tsx](../src/ui/kit.tsx) |
| Shopping, discovery and notifications | [index.tsx](../src/app/index.tsx), [discover.tsx](../src/app/discover.tsx), [notifications.tsx](../src/app/notifications.tsx), [poll and post details](../src/app/p/%5Bid%5D.tsx), [CreationBody.tsx](../src/ui/CreationBody.tsx) |
| Creation and product preview | [ContentComposer.tsx](../src/ui/ContentComposer.tsx), [ProductEditor.tsx](../src/ui/creation/ProductEditor.tsx), [ProductPreviewCard.tsx](../src/ui/creation/ProductPreviewCard.tsx), [ProductEditSheet.tsx](../src/ui/creation/ProductEditSheet.tsx) |
| Checks, media and overlays | [reels.tsx](../src/app/reels.tsx), [ReelPage.tsx](../src/ui/ReelPage.tsx), [FeedReelPost.tsx](../src/ui/FeedReelPost.tsx), [GalleryMedia.tsx](../src/ui/GalleryMedia.tsx), [ConversationPanel.tsx](../src/ui/ConversationPanel.tsx), [SharePanel.tsx](../src/ui/SharePanel.tsx), [ContentTap.tsx](../src/ui/ContentTap.tsx), [StarButton.tsx](../src/ui/StarButton.tsx) |
| Verification | [theme.test.ts](../tests/theme.test.ts), [glossy-flows.cjs](../tests/e2e/glossy-flows.cjs), [social-layout.cjs](../tests/e2e/social-layout.cjs) |

Feed cards, Settings groups, profile panels, and the creator reuse ThemeSurface. Its static reflection sits behind content. The same reflection is used on existing pressable cards and animated sheets. Shared fields style search and forms, and shared buttons handle primary, secondary, disabled, and loading states.

On Android API 31 and newer, eligible floating bars can use the existing Expo Blur target. The bars share one decorative backdrop target, keeping per-card blur out of product media and scrolling cards. Android modal sheets and older Android versions use the graphite fallback. Reduced-effects preferences keep static outlines and solid fills. Reflections use React Native background gradients and require no additional package. Physical Android blur and performance still require a device run. [React Native view style props](https://reactnative.dev/docs/view-style-props)

### Screenshots

The screenshots show the isolated local demo and mocked product imports. The reference image was absent from the attachment, so the visual review used the written dimensions, materials, and colors.

| Screen | Captures |
|---|---|
| Shopping feed | [390 px](screenshots/glossy-dark/390-01-shopping-feed.png), [414 px](screenshots/glossy-dark/414-01-shopping-feed.png) |
| Floating navigation | [Dock detail](screenshots/glossy-dark/390-02-floating-navigation.png) |
| Product import | [Link preview](screenshots/glossy-dark/390-03-product-import.png), [edit sheet](screenshots/glossy-dark/390-09-product-edit-sheet.png) |
| Creators | [Poll](screenshots/glossy-dark/390-04-poll.png), [Compare](screenshots/glossy-dark/390-05-compare.png), [Post](screenshots/glossy-dark/390-06-post.png) |
| Other surfaces | [Comments](screenshots/glossy-dark/390-07-comments-sheet.png), [Appearance settings](screenshots/glossy-dark/390-08-appearance-settings.png) |

### Verification

Lint, TypeScript, and 142 automated tests passed. Expo exported web, Android, and iOS bundles. The Glossy Dark browser suite verifies selection and persistence, reduced effects, sharp product images, price-tag colors, navigation, drafts, commenting, and local publishing at widths from 320 to 1024 pixels. The full social regression suite passed at 390, 414, and 1024 pixels.
