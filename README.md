# NZ Pipe Band Championships 2027 – Live companion

A static web app (HTML/CSS/JS, no build step). It works on phones, tablets and laptops, and can be installed to the home screen.

## Pages
- `#/live` – Circle One / Circle Two: who's playing now, their PM/L-D and tunes, who's next, progress through the draw, two YouTube streams, countdown, latest result, scrolling ticker
- `#/draws` – every competition with judges, playing order, times, PM, Drum Sergeant and tunes. Filter by grade, and search by band, person or tune
- `#/bands` and `#/band/<id>` – band profiles
- `#/feed` – announcements, filterable by type. The latest also appear in the right-hand Live Feed column on laptops
- `#/pick` – Pick 'em: drag bands into order, submit by email or form, share to Facebook/X/WhatsApp or by link. Friends who open a shared link see your podium and can start from it
- `#/mine` – followed bands (★): personal running order, a pop-up when they're on next, calendar (.ics) export
- `#/admin` – steward console (not linked in the menu). Pick the event, press "Next band ▶", add results and ticker messages, then download live.json

## Hosting
Upload the folder to any static host (Netlify, Cloudflare Pages, GitHub Pages, or S3). Preview it locally with `python3 -m http.server`, because the app won't run from file://.

## Before the event – edit `data/config.json`
- `streams[].youtubeId` – the part after `v=` in each YouTube live URL. Create the scheduled live streams in advance so the IDs are fixed
- `pickEmail` – where emailed picks go
- `pickFormEndpoint` – optional. A Formspree, Getform or Google Apps Script URL collects picks without opening the user's mail app (recommended)
- `siteUrl` – the public address, used in share links
- `start` – used for the countdown

## Updating entries and draws
1. Open `data_template.xlsx` (it already holds the current entries). Paste a fresh export into the Entries, Events and Tunes sheets.
2. Fill in **Personnel** (PM, Drum Sergeant, Drum Major), **Draws** (Event, Order, Band, Circle, Time) and **EventInfo** (Day, Circle, Start, judges). Event names must match those listed in EventInfo.
3. Run `python3 tools/build_data.py data_template.xlsx`, then upload the `data/` folder.
Until a competition has rows in Draws, it shows as "Provisional" in alphabetical order. Contact, email and payment columns are never published.

## On the day
Clients reload `data/live.json` every 20 seconds. The simplest workflow is for a steward to use `#/admin` on a laptop, download live.json and upload it over the old file. For one-click publishing, add `"adminSaveUrl"` to config.json, pointing at a small endpoint (for example a Cloudflare Worker or Netlify Function) that checks the `X-Admin-Key` header and writes the JSON. `liveUrl` can also point to that JSON elsewhere.


## Announcements
Edit the `<section id="announcements">` block near the top of `index.html` and upload the file. Add each new `<article>` at the top:

```html
<article data-time="2027-03-05 10:42" data-type="schedule" data-circle="1" data-title="Circle One running 10 minutes late">
  Grade 4B Medley is about 10 minutes behind the published times.
</article>
```

- `data-type`: important (red), update (blue), schedule (green) or info (grey)
- `data-circle`: optional, 1 or 2
- `data-time`: NZ time. Announcements with a future time stay hidden until then, so you can schedule them ahead
Open pages check for new announcements every 20 seconds and pop up a notice when one arrives. If daylight saving has ended, set `"tzOffset": "+12:00"` in config.json.
