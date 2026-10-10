# TraceWatch

Zero-persistence breach and account exposure console built on Next.js 15 (App Router), TypeScript and Tailwind 4.

## Scanners

| Tab | What it does | Source |
| --- | --- | --- |
| Email | Breaches, pastes and infostealer infections for an address, merged and de-duplicated across sources, with an exposure score | XposedOrNot, LeakCheck (public), Hudson Rock Cavalier (keyless); Have I Been Pwned when `HIBP_API_KEY` is set; thin records enriched from the HIBP catalogue |
| Username | Which of 42 sites (social, developer, gaming, creative, community) have a public profile with a username; each detector is verified against known-real and known-missing names, and blocked or ambiguous answers are reported as unknown, never as found | Direct public profile checks |
| Password | Checks a password against breach corpora using k-anonymity; only a 5-character SHA-1 prefix leaves the browser | Pwned Passwords |
| Phone | Validity, region, line type and formats | libphonenumber (offline) |
| Discord | Account age, username, display name, avatar, banner, badges, server tag and avatar decoration | Discord API when `DISCORD_BOT_TOKEN` is set, otherwise the public japi.rest mirror |
| Breach feed | Searchable, sortable catalogue of every known breach | Have I Been Pwned (keyless) |

## Dashboard

`/dashboard` needs no login. It shows catalogue KPIs, breaches added per month and by incident year, the most exposed
data types, the largest and most recent breaches, live health of every upstream source, and the scans run in the
current tab. Session activity lives in React state only, shows masked targets, and is gone on reload.

## Run

```bash
npm run dev
```

Both keys in `.env.local` are optional.

## Persistence model

Leave the page and nothing remains. Verified against a production build (`next build && next start`):

- **No cookies.** No response sets one. (`next dev` sets its own `__next_hmr_refresh_hash__` cookie for hot reload; production does not.)
- **No browser storage.** No localStorage, sessionStorage, IndexedDB, Cache Storage or service worker.
- **No browser caching of results.** Pages and every API response are sent `Cache-Control: no-store`. Discord avatars and banners
  are streamed through `/api/discord/media` with `no-store`, so the image cache never records which profiles were viewed.
- **No back/forward restore.** If the browser restores a page from its back/forward cache, it reloads empty.
- **No form history.** Every input has `autocomplete="off"`, and searched values never appear in the URL.
- **No server logs or storage.** Queried values are not logged. The only server memory is a per-client rate-limit
  counter and a one-hour cache of the public breach catalogue.
- **Session activity** on the dashboard is React state only (masked targets) and is gone on reload.

What TraceWatch cannot control: to check a value, it has to send it to the relevant upstream source (XposedOrNot,
LeakCheck, Hudson Rock, Have I Been Pwned, japi.rest, Discord, or the 42 profile sites for a username search). Only a 5-character hash prefix is sent for passwords.
Those services run under their own privacy policies.

Only look up accounts you own or are authorised to assess.

## Credits

Hero hands in `public/hands/` are adapted from Michelangelo's *The Creation of Adam* (public domain, via Wikimedia Commons).
