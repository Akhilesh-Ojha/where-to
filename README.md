# Where To

A Next.js starter for a group meetup app that helps friends find fair meeting spots fast.

## Included

- Landing page with strong product framing
- Demo plan screen with waiting-room and ranked results layout
- Tailwind CSS v4 setup
- TypeScript + App Router structure

## Next steps

1. Install Node.js 20+ on this machine.
2. Create a Supabase project.
3. Run [supabase/schema.sql](/Users/harshitasingh/where-to/supabase/schema.sql) in the Supabase SQL editor.
4. Copy `.env.example` to `.env.local`.
5. Set `LOCATIONIQ_API_KEY`, `SUPABASE_URL`, and `SUPABASE_SERVICE_ROLE_KEY` in `.env.local`.
6. From this folder, run `npm install`.
7. Start the app with `npm run dev`.

## LocationIQ wiring

- Manual location search now calls LocationIQ autocomplete through `/api/places/autocomplete`.
- Manual selections already include exact latitude and longitude, so no extra place-details step is needed.
- Meetup venue suggestions can be fetched through `/api/places/nearby`.
- The API key stays server-side inside the Next.js routes.

## Supabase wiring

- Plans, participants, and saved destinations now live in Supabase instead of the local filesystem.
- The app uses `SUPABASE_SERVICE_ROLE_KEY` only on the server through `src/lib/supabase-server.ts`.
- Do not expose the service role key in the browser.
- This makes the app compatible with Vercel deployment once your env vars are added there too.
- Plans currently expire after 24 hours and are cleaned up automatically on server activity.

## Suggested MVP additions

- Create-plan form
- Join-plan flow with location capture
- Realtime participant updates
- LocationIQ meetup suggestion ranking
