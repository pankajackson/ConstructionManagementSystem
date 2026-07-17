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
```

## Local development

1. **Install Node 20+** and **Yarn** (or npm).
2. **Install Expo CLI + EAS CLI** globally:
   ```bash
   npm i -g expo-cli eas-cli
   ```
3. **Install deps:**
   ```bash
   cd /app/mobile
   yarn install
   ```
4. **Point the app at your backend:**
   Edit `/app/mobile/.env`:
   ```
   EXPO_PUBLIC_API_URL=https://<your-backend-host>
   ```
   For local backend, use your machine's LAN IP so the phone can reach it
   (e.g. `http://192.168.1.100:8001`) — `localhost` won't work from a device.
5. **Run in development:**
   ```bash
   yarn start
   # scan the QR code with Expo Go on your phone
   # OR
   yarn ios       # requires macOS + Xcode simulator
   yarn android   # requires Android Studio + emulator
   ```

## Building installable binaries with EAS

1. **Log in** (creates an Expo account if you don't have one):
   ```bash
   eas login
   ```
2. **Link this app to an EAS project:**
   ```bash
   eas init
   ```
   Copy the printed `projectId` into `app.json → expo.extra.eas.projectId`.
3. **Preview APK** (install directly on Android device):
   ```bash
   yarn build:preview
   ```
4. **Production Android AAB** (for Play Store):
   ```bash
   yarn build:android
   ```
5. **iOS build** (requires an Apple Developer account — $99/yr):
   ```bash
   yarn build:ios
   ```
   EAS will handle provisioning profiles + signing.

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

## Known limitations (v1)

- Offline: only **daily-log drafts** are stored offline. Tasks/issues require network.
- Push notifications: dependencies wired, but the token-registration endpoint and
  server-side push send are not yet implemented (see roadmap above).
- No native Splash/Icon assets shipped — replace `assets/*.png` before store submission.
