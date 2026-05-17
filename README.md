# The Serpent’s Breath: Escape from Chichén Itzá

Clean deployment package for the Barfly digital escape room.

## What is included

- `server.js` — Express/WebSocket server
- `database.js` — local JSON/Postgres helper
- `public/player` — player/mobile experience
- `public/host` — host dashboard
- `public/checkin` — check-in/access-code page
- `public/shared` — shared CSS
- `public/assets` — logo and title artwork
- `truth-packs` — five difficulty levels
- `data/sessions.json` — clean empty runtime session store

## What was removed

- old build zips
- debug folders
- preview-only HTML files
- duplicate title test files
- `node_modules`
- old test sessions and RSVP data

## Run locally

```bash
npm install
npm start
```

Then open:

- Player: `http://localhost:3000/player/`
- Host: `http://localhost:3000/host/`
- Check-in: `http://localhost:3000/checkin/`

## Demo flow

There is no separate Demo Play Now button. Use **My RSVP** and enter the demo access code.

Default demo access code:

```text
SERPENT
```

You can override it with the environment variable:

```text
DEMO_ACCESS_CODE=YOURCODE
```

## Deploy on Render

This package includes `render.yaml`. Upload/push the project to GitHub, then create a Render web service from the repo.

Start command:

```bash
npm start
```
