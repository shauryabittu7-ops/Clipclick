# veed-killer-sync

Yjs sync relay on Cloudflare Workers + Durable Objects. Free tier covers
100K requests/day; each Durable Object costs only while alive.

## Deploy

```bash
cd worker
npm i -g wrangler
wrangler deploy
```

Then set in the Next.js app's `.env.local`:

```
NEXT_PUBLIC_YJS_WS_URL=wss://veed-killer-sync.<your-subdomain>.workers.dev
```

Each project becomes a Yjs room named `reel-<projectId>`.

## Notes

- The relay stores only the most recent update blob for late joiners. For
  large docs run a proper merge using `y-protocols` inside the DO.
- Share links (`/share/<projectId>`) join the same room in read-only mode.
