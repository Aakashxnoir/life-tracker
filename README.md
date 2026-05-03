<div align="center">

# Life Tracker

**A personal command center for habits, focus, and progress — styled like a sorcerer’s status screen.**

React · Vite · Tailwind · Firebase

</div>

---

## Overview

Life Tracker is a single-page app that turns daily routines into an RPG-style loop: **HP**, **cursed energy (CE)**, **XP**, **gold**, **streaks**, and **grades** that evolve as you complete tasks. It syncs to **Firebase** so your data follows you across devices after you sign in with **Google**.

---

## Features

| Area | What it does |
|------|----------------|
| **Dashboard** | Player stats, habits, dailies, todos, binding vows, boss encounter, and task rewards tied to your bars. |
| **Workout Plan** | Weekly split with day tabs to track training. |
| **Domain Expansion** | Pomodoro-style focus session with a cinematic “domain” backdrop. |
| **Six Eyes** | Deeper analytics: personal-brand counters, reflection notes, and energy split across zones. |
| **Armory Shop** | Spend gold on techniques and gear; equip items on your profile. |
| **Profile** | Display name, avatar (Storage), grade styling, and account controls. |

---

## Stack

| Layer | Tech |
|--------|------|
| UI | React 19, Tailwind CSS 4 |
| Build | Vite 8 |
| Auth | Firebase Auth (Google) |
| Data | Cloud Firestore |
| Media | Firebase Storage (avatars) |

---

## Prerequisites

- **Node.js** 18+ (20+ recommended)
- A **Firebase** project with **Authentication** (Google), **Firestore**, and **Storage** enabled, and rules deployed to match your security model.

---

## Local development

```bash
npm install
npm run dev
```

Open the URL Vite prints (usually `http://localhost:5173`).

### Firebase configuration

Client config lives in `src/firebase.js`. If you fork this repo or use your own project, replace the `firebaseConfig` object with values from the Firebase console (**Project settings → Your apps → SDK setup**).

---

## Build

```bash
npm run build
npm run preview   # optional: test the production build locally
```

Static output is written to `dist/`, suitable for Firebase Hosting, Vercel, Netlify, or any static host.

---

## Deploy (quick pointer)

1. Run `npm run build`.
2. Point your host at the `dist` folder.
3. For **Firebase Hosting**, add a `hosting` entry in `firebase.json` (public: `dist`, SPA rewrites) and run `firebase deploy --only hosting` from a logged-in CLI.

---

## Project layout

```
src/
  App.jsx      # Main UI, pages, and Firestore wiring
  firebase.js  # Firebase init, defaults, helpers
  main.jsx     # Entry
```

Media assets referenced by the app (e.g. focus backdrop) live at the repo root; keep paths in sync with imports in `App.jsx`.

---

## License

Private project — not licensed for redistribution unless you add your own terms.
