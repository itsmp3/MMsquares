# March Madness Squares

A web app for running a 10×10 March Madness squares pool. It replaces the inputs, public and history Google Sheets.

**Public page** (no login): the grid, live results, the winnings leaderboard and box history. Anyone can request open boxes; they show as *pending* until an admin approves them. No payment details are ever shown publicly.

**Admin page** (`/admin`, Cloudflare Access login for the organizers only):
- **Boxes:** approve or reject requests, mark boxes paid (method and who collected), edit names, rename a person across all their boxes, and draw the numbers.
- **Scores:** pulled from ESPN every 10 minutes during the tournament. You can edit any game by hand, which locks it from automatic updates, or mark it a no-contest and move its payout (by default to the championship game).
- **Payouts:** every win, who pays it (defaults to whoever collected that box's buy-in), and whether it's been paid.
- **Settle up:** money collected vs. payouts owed for each organizer, and the transfer one of you needs to send the other.
- **Setup:** create next year's pool (or a second pool in the same year, like a $25 grid), set payouts, and see the activity log.

## How the grid works

- Boxes are numbered 1–100, left to right and top to bottom.
- Rows (down the left side) are the **winning** team's last digit and columns (across the top) are the **losing** team's.
- Every game from the Round of 64 to the title game pays the box at (losing digit, winning digit). The First Four doesn't count.
- A game's score is shown as the last digit of each team's points, **winner first, with a dash**: a 73-71 win is **3-1**. This keeps it separate from box numbers (Box 01–Box 100), which only say where a square sits on the grid.
- History counts how often each score has hit. 2018–2026 is imported from the old spreadsheet, and later years build themselves from the scores.

## Built with

Cloudflare **Workers** (app and API), **D1** (database), **Cron Triggers** (score updates) and **Access** (admin login), all on the free plan. The frontend is React + Vite; the API is Hono.

## First-time setup

You need Node 20+ and a Cloudflare account.

```bash
npm install
npx wrangler login
```

1. **Create the database**, then paste the `database_id` it prints into both `wrangler.jsonc` and `wrangler.deploy.jsonc`:
   ```bash
   npx wrangler d1 create mmsquares
   ```
2. **Create the tables and load the 2018–2026 history:**
   ```bash
   npm run db:migrate:remote
   npm run db:seed-history:remote
   ```
3. **Deploy:**
   ```bash
   npm run deploy
   ```
   This builds the site and bundles the page files into the Worker (`wrangler.deploy.jsonc`), so a deploy only needs an API token with Workers Scripts and D1 edit access.
   Then give the Worker a custom domain on a zone you own: Workers & Pages → mmsquares → Settings → Domains & Routes, for example `squares.yourdomain.com`.
4. **Protect the admin pages with Cloudflare Access** (Zero Trust dashboard → Access → Applications → Add → Self-hosted):
   - Add two paths on your domain: `squares.yourdomain.com/admin` and `squares.yourdomain.com/api/admin`.
   - Add a policy: **Allow**, *Emails*, then your email and your co-organizer's.
   - For login, choose Google or the one-time PIN by email.
   - After saving, copy the application's **Audience (AUD) tag**. Your **team name** is the `<team>` in `<team>.cloudflareaccess.com` (Settings → Custom Pages).
5. **Set the secrets.** Each command prompts for a value:
   ```bash
   npx wrangler secret put ACCESS_TEAM
   ```
   ```bash
   npx wrangler secret put ACCESS_AUD
   ```
   ```bash
   npx wrangler secret put ADMINS
   ```
   For `ADMINS`, enter JSON mapping each admin's email to the label used for who collected money, e.g. `{"me@example.com":"MP","friend@example.com":"ATM"}`.

The app checks the Access login token itself and only accepts emails listed in `ADMINS`, so a misconfigured Access policy can't let anyone else in.

## Each year

1. Admin → Setup → **Start a new pool** (it copies last year's buy-in and payouts).
2. Share the link. People pick boxes and enter a name, and you approve them as payments arrive.
3. When the grid is full, Admin → Boxes → **Draw numbers**.
4. Scores update automatically from mid-March to April 10. **Scores → Update now** forces an update; **Reload whole tournament** refetches every day.
5. Use **Payouts** and **Settle up** as games finish.

## Local development

```bash
cp .dev.vars.example .dev.vars
```
```bash
npm run db:migrate:local
```
```bash
npm run db:seed-history:local
```
```bash
npm run dev
```

`DEV_ADMIN_EMAIL` in `.dev.vars` signs you in as an admin on localhost only.

```bash
npm test
```
```bash
npm run typecheck
```

The tests check ESPN parsing against the full 2026 tournament and confirm the box codes match the history sheet. If `seed/private/2026.json` exists, they also reproduce the 2026 Winnings tab person by person. That file has people's names, so it's kept out of git.
