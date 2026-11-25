# Forever Meadow

A peaceful, single-file HTML page for people who have lost a dog or cat. Pick a breed, name your pet and color them to look like your own, then spend time with them in a quiet meadow: pet them, give treats, play, brush, cuddle, let them rest, and send notes up to the sky.

Open `index.html` in any browser. No build step, no server.

## Install as an app
On the live site, open Forever Meadow in your phone browser and choose **Install app** / **Add to Home screen**. It then opens full screen and works offline.

## Private stats
`admin.html` is a private dashboard (it needs an admin key that is not in this repo). It reads anonymous counts from a small Cloudflare Worker (`worker/stats-worker.js`). Only anonymous totals are collected: never pet names, photos, notes or dates. Visitors can opt out in the app, and Do Not Track is respected.
