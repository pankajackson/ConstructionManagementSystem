# ConstructOS — Web Frontend (React + Tailwind)

React (CRA) SPA. Brutalist industrial theme — Barlow Condensed + IBM Plex, hard-shadow cards, safety-yellow accents, sunlight-legible chips. Consumes the FastAPI backend at `/api/v1`.

---

## Run

### With Docker (from repo root)

```bash
docker compose up -d frontend
docker compose logs -f frontend
```

App: http://localhost:3000

### Manually (Node 20+)

```bash
cd frontend
yarn install
cp .env.example .env      # confirm REACT_APP_BACKEND_URL points at your backend
yarn start
```

Hot reload runs on `http://localhost:3000`. All API calls go to `REACT_APP_BACKEND_URL/api/v1`.

---

## Env vars

```
REACT_APP_BACKEND_URL=http://localhost:8001   # or your public preview URL
```

Any variable prefixed `REACT_APP_` is baked into the client bundle at build time. **Never** put secrets here — the bundle is public.

---

## File layout

```
frontend/
├── src/
│   ├── index.js              React root + Toaster + AuthProvider
│   ├── index.css             Tailwind base + brutalist utility classes
│   ├── App.js                Routes + route guards
│   ├── api/
│   │   └── client.js         Axios wrapper, auth headers, refresh interceptor
│   ├── context/
│   │   └── AuthContext.jsx   user / orgs / orgId state + bootstrap on mount
│   ├── lib/
│   │   └── labels.js         Labels + chip color maps (single source of truth)
│   ├── components/
│   │   ├── AppShell.jsx      TopBar + Sidebar layout
│   │   ├── Chip.jsx          StatusChip — kind × value chip mapping
│   │   ├── Avatar.jsx        Initials avatar
│   │   ├── Modal.jsx         Modal + ConfirmDialog
│   │   ├── State.jsx         Loader / Empty / ErrorState / Skeleton
│   │   └── KanbanBoard.jsx   Drag-and-drop 3-column board
│   └── pages/
│       ├── Login.jsx         Email + OTP + one-tap demo signins
│       ├── OrgSetup.jsx      First-time org creation
│       ├── OrgSwitcher.jsx   Choose active org
│       ├── Projects.jsx      Project cards + search + filters
│       ├── ProjectDetail.jsx Tabs (Overview / Tasks / Logs / Issues)
│       ├── TaskDetail.jsx    History + comments + attachments
│       ├── LogDetail.jsx     Photos lightbox + admin unlock
│       ├── IssueDetail.jsx   Transitions with resolution/reopen prompts
│       ├── Team.jsx          Invite + role management (Admin)
│       └── Notifications.jsx Inbox
├── public/
│   └── index.html            Fonts + root div
├── tailwind.config.js
├── postcss.config.js
├── package.json
└── .env / .env.example
```

---

## Design system quick reference

| Token           | Value                        | Where                                    |
|-----------------|------------------------------|------------------------------------------|
| `--ink`         | `#09090B` (near-black)       | Borders, text, dark surfaces             |
| `--paper`       | `#FFFFFF`                    | Cards                                    |
| `--muted`       | `#F4F4F5`                    | Page background                          |
| `--safety`      | `#FBBF24` (construction yellow) | Primary CTA, focus rings, unread badges |
| `--signal`      | `#DC2626` (safety red)       | Critical priority, errors                |
| Heading font    | Barlow Condensed 500/700/800 | `.heading` class                         |
| Body font       | IBM Plex Sans 400–700        | default                                  |
| Mono            | IBM Plex Mono                | numbers, OTP, dates                      |
| Shadow          | `4px 4px 0 0 #09090b`        | `card-brut` / `btn-brut`                 |
| Border radius   | 0 (sharp corners everywhere) |                                          |

Chip color maps live in **one place** — `src/lib/labels.js`. To add/change a chip color for a status, edit only that file.

Every interactive element has a `data-testid` for automated testing. Grep the source for `data-testid=` to see the naming.

---

## API client

```javascript
import { API, errMsg } from "./api/client";

// The axios instance already carries Authorization + X-Org-Id headers
// (set by AuthContext on login and refreshed via the built-in refresh
// interceptor).
const { data } = await API.get("/projects");
```

The interceptor auto-refreshes on `401` using the stored refresh token and replays the original request.

---

## Testing

CRA ships with Jest. For manual E2E testing this project uses `data-testid`s (see any component) and Playwright locators in the testing subagent.

```bash
yarn test               # jest watch mode
```

---

## Common tasks

**Add a new page**

1. Create `src/pages/MyPage.jsx`
2. Register a `<Route>` in `src/App.js` (inside the `AppShell` `<Route>` if it should have the topbar/sidebar; outside if it's a full-screen page like Login)
3. Add a nav item in `src/components/AppShell.jsx` if it belongs in the sidebar

**Add a new chip variant**

1. Add the value to the relevant `..._CHIP` map in `src/lib/labels.js` (color) and `..._LABEL` map (human label)
2. It automatically becomes available via `<StatusChip kind="task" value="new_value" />`

**Change branding**

- Colors: `tailwind.config.js` → `theme.extend.colors`, and CSS variables in `src/index.css`
- Fonts: `public/index.html` Google Fonts link + `tailwind.config.js` → `fontFamily`
- Logo/wordmark: `AppShell.jsx` (TopBar) + `Login.jsx` (hero)

---

## Production build

```bash
yarn build
# Outputs a static bundle under /frontend/build — serve behind any CDN / Nginx.
```

CRA fingerprints filenames so long-cache is safe. Set `REACT_APP_BACKEND_URL` to your production API URL **before** building.
