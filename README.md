# The Serpent’s Breath: Escape from Chichén Itzá

A mobile-friendly digital escape room built from the provided Pelican template.

## Core Features

- 30-minute oxygen countdown
- 5-minute cinematic temple backstory
- Torch toggle mechanic
  - Torch off: oxygen drains normally
  - Torch on: oxygen drains faster so hidden carvings can be read
- Wrong checkpoint/path choices add oxygen penalties
- Player notes remain private and autosave locally/remotely
- RSVP, access codes, paid/free event setup, host dashboard, and sponsor popups retained from template
- Clean Render-ready Node/Express package

## Five Difficulty Levels

1. Level 1: Training Archaeologist — guided oxygen escape
2. Level 2: Temple Explorer — basic temple route
3. Level 3: Field Archaeologist — physics pressure run
4. Level 4: Senior Archaeologist — low-hint serpent trial
5. Level 5: Master of the Serpent Temple — master oxygen gauntlet

Each level has its own truth pack, clue wording, level label, wrong-turn oxygen penalty, checkpoint questions, and final escape explanation.

## Run Locally

```bash
npm install
npm start
```

Then open:

- Host: http://localhost:3000/host/
- Player: http://localhost:3000/player/
- Check-in: http://localhost:3000/checkin/

## Deploy on Render

Use the included `render.yaml`, `package.json`, and `server.js`. Do not upload a `node_modules` folder.
