# ConstructOS — Mobile (Expo / React Native)

A thin client over the same `/api/v1/*` FastAPI backend used by the web app.  
Works on **Android** and **iOS** from a single codebase.

> This folder is **not** run in the Emergent preview. Build & run it locally.

---

## What's inside

```
app/
  _layout.jsx            Root Stack + AuthProvider + route guard
  login.jsx              Email + OTP login (with 4 demo one-click buttons)
  (tabs)/
    _layout.jsx          Bottom tabs
    index.jsx            Projects list (pull to refresh)
    notifications.jsx    Notification inbox
    profile.jsx          Account, current org, sign out
  projects/
    [id].jsx             Project detail with Tasks / Logs / Issues tabs
    [id]/new-log.jsx     Daily log form: camera + gallery, offline draft
    [id]/new-issue.jsx   Raise Issue form: camera, category, priority
src/
  api/client.js          Axios wrapper + AsyncStorage token persistence
  api/offlineDrafts.js   AsyncStorage-backed offline draft store for logs
  context/AuthContext.jsx
  components/Chip.jsx    Native chip mirroring the web design system
  theme.js               Shared color palette + labels
assets/                  App icon / splash / adaptive-icon / favicon
```

## Requirements

- **Node 20+** and **npm 10+**
- **Expo Go** app on your phone (from the App Store / Play Store) — **SDK 54**
- No Android Studio or Xcode needed for day-to-day development — we run inside Expo Go

## Local development

1. **Install deps** (npm — no yarn required):
   ```bash
   cd /app/mobile
   npm install
   ```
2. **Point the app at your backend** — create `.env`:
   ```
   EXPO_PUBLIC_API_URL=https://<your-backend-host>
   ```
   For a **local** backend, use your machine's LAN IP so the phone can reach it
   (e.g. `http://192.168.1.100:8001`). `localhost` will not work from a device.
3. **Start the dev server:**
   ```bash
   npm start
   ```
   Then scan the QR code with **Expo Go** on your phone.

   Convenience shortcuts (all use Expo Go — no native toolchain required):
   ```bash
   npm run android   # opens the dev server and launches on an Android device/emulator via Expo Go
   npm run ios       # same for iOS simulator (macOS) or physical device via Expo Go
   npm run web       # opens the app in a browser
   ```

   > If you plan to run on an Android **emulator**, launch it first from Android Studio
   > (or with `emulator -avd <name>`). If you plan to run on an iOS **simulator**,
   > Xcode is required and only works on macOS. For a real device, just Expo Go is enough.

## Building installable binaries with EAS

Native builds are done in the cloud with EAS — you do **not** need Android Studio or Xcode.

1. **Install EAS CLI** and **log in** (creates an Expo account if you don't have one):
   ```bash
   npm i -g eas-cli
   eas login
   ```
2. **Link this app to an EAS project:**
   ```bash
   eas init
   ```
   Copy the printed `projectId` into `app.json → expo.extra.eas.projectId`.
3. **Preview APK** (install directly on Android device):
   ```bash
   npm run build:preview
   ```
4. **Production Android AAB** (for Play Store):
   ```bash
   npm run build:android
   ```
5. **iOS build** (requires an Apple Developer account — $99/yr):
   ```bash
   npm run build:ios
   ```
   EAS handles provisioning profiles + signing.

## Push notifications (optional, next iteration)

`expo-notifications` is already declared as a dependency. To enable:

1. `eas credentials` → configure FCM (Android) and APNs (iOS).
2. Add a device-token registration screen and POST it to a new
   `POST /api/v1/notifications/devices` backend endpoint (to be added).
3. Have the backend fire push messages alongside the in-app notifications
   it already writes.

## Deep-linking

The app registers the `constructos://` scheme in `app.json`. A push
notification payload containing `{ url: "constructos:///projects/<id>" }`
will open the app directly to that project.

## Environment variables

All prefixed with `EXPO_PUBLIC_` so Expo bundles them into the client.  
**Never** put secrets in this file — the mobile app is a public client.

| Var                | Purpose                                       |
|--------------------|-----------------------------------------------|
| EXPO_PUBLIC_API_URL | Backend host (no trailing slash, no `/api/v1`) |

## Demo credentials

Same as the web app — pre-seeded users in the "Demo Constructions Pvt Ltd" org:

- admin@demo.com (Admin)
- pm@demo.com (Project Manager)
- engineer@demo.com (Site Engineer)
- viewer@demo.com (Viewer)

The login screen has one-tap demo buttons for each role.

## Assets

Simple placeholder icons live in `assets/` (`icon.png`, `adaptive-icon.png`,
`splash.png`, `favicon.png`). Replace them with your production artwork
before store submission.

## Known limitations (v1)

- Offline: only **daily-log drafts** are stored offline. Tasks/issues require network.
- Push notifications: dependencies wired, but the token-registration endpoint and
  server-side push send are not yet implemented (see roadmap above).

## Troubleshooting

- **"Project is incompatible with this version of Expo Go"** — your Expo Go is on a
  newer SDK than the project. Update the project with `npx expo install expo@latest --fix`
  (this project targets **SDK 54**).
- **`spawn adb ENOENT`** — you ran `expo run:android`, which needs a full Android SDK.
  Use `npm run android` instead (it uses Expo Go, no local SDK required).
- **`iOS apps can only be built on macOS devices`** — `expo run:ios` requires macOS + Xcode.
  Use `npm run ios` (Expo Go) or `npm run build:ios` (EAS cloud build).
- **`Unable to resolve asset "./assets/icon.png"`** — make sure the `assets/` folder
  is present with the four placeholder PNGs (bundled in this repo).
