This is an Expo/React Native mobile application. Prioritize mobile-first patterns, performance, and cross-platform compatibility.

## Expo has changed — do not trust your training data

Expo ships breaking changes every SDK release. APIs you remember are likely renamed, moved, or removed. Before writing any code that touches an Expo, EAS, or React Native API:

1. Read the major version of the `expo` package in `package.json`.
2. Fetch the matching versioned docs: `https://docs.expo.dev/versions/v<major>.0.0/`
3. For anything else, fetch https://docs.expo.dev/llms.txt — an index of all Expo docs with corrections to common LLM misconceptions. Follow its links to the specific page you need; never answer from memory.

## Commands

Use `bunx` instead of `npx` if the project uses bun (`bun.lock` present).

```bash
npx expo install <package>  # ALWAYS use instead of npm/yarn/pnpm/bun add — resolves SDK-compatible versions
npx expo start              # start the dev server
npx expo lint               # lint
npx tsc --noEmit            # typecheck
npx expo-doctor             # diagnose dependency and config issues
npx expo install --fix      # fix incompatible package versions
```

Run lint and typecheck before declaring any task done.

## Navigation & Routing

- Use **Expo Router** for all navigation. Routes live in `src/app/` — every file there is a screen, `_layout.tsx` files define navigators. Keep non-route code (components, hooks, utils) outside `src/app/`.
- Import `Link`, `router`, and `useLocalSearchParams` from `expo-router`.
- Docs: https://docs.expo.dev/router/introduction.md

## Building with EAS

Use EAS to build, sign, and submit the app in the cloud (`eas build`, `eas submit`) and to ship over-the-air updates (`eas update`) — no local Xcode or Android Studio required. Run EAS CLI as `bunx eas-cli <command>` in Bun projects, or `npx eas-cli@latest <command>` otherwise; substitute that for bare `eas` in docs examples.
Docs: https://docs.expo.dev/eas/index.md

## Rules

- If `ios/` and `android/` directories do not exist, they are generated (Continuous Native Generation). Never create or edit them by hand — configure native behavior in `app.json` and config plugins.
- Expo Go only includes its bundled native modules. After adding a library with native code, the app needs a development build: `npx expo run:ios|android` locally, or `eas build --profile development`.
- Prefer recommended Expo modules over third-party libraries, and check your available skills before adding dependencies. Docs: https://docs.expo.dev/versions/latest/index.md


## Worth It database changes
Keep applied migrations immutable. The existing 0001-0017 files are frozen by supabase/migration-baseline.json; add new timestamped files with npm run db:new -- change_name instead of editing historical SQL.
Use npm run db:status to inspect history, npm run db:plan to preview pending changes, and npm run db:deploy to run checks and apply pending migrations to the pinned Worth It project. The user has requested that routine database deployments accompany authorized feature work once admin access is configured. Verify the target and report deployment results; never claim a remote update from local tests alone.
The one-time npm run db:baseline command checks existing schema checkpoints and records manually applied 0001-0017 in official Supabase migration history without replaying them. Never use a reset, delete user data, mark unknown migrations reverted, or blindly repair an incomplete database.
Admin credentials belong only in ignored server/.env or the trusted process environment. Never print that file, keys, access tokens, database passwords or credentialed connection strings. The app and ordinary verification subprocesses must not receive admin deployment credentials.

Settings security: New or replaced user-callable SECURITY DEFINER RPCs must call public.worthit_require_session() before accessing private data or mutating state. Keep restrictive session RLS policies. The account-state and reactivation bootstrap RPCs are deliberate exceptions; reactivation enforces worthit_recent_auth(). Test AAL1/AAL2 and deactivated accounts with each new endpoint. Never enable MFA enrollment against a database without these guards.
