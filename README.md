# Gigi's Food Stall

Separate React + Express migration workspace. The original PHP repository is
not part of this project.

## Run locally

From the project root, start the client with:

```powershell
npm run dev
```

Start the API in a second terminal:

```powershell
npm run dev:server
```

Alternatively, run the commands from each app directory as shown below.

Terminal 1:

```powershell
cd "$HOME\Desktop\gigisfoodstall\server"
Copy-Item .env.example .env
# Edit .env and set SUPABASE_URL and SUPABASE_ANON_KEY.
npm run dev
```

Terminal 2:

```powershell
cd "$HOME\Desktop\gigisfoodstall\client"
Copy-Item .env.example .env
npm run dev
```

Open `http://localhost:5173`.

Locally, the browser calls the Express API at `http://localhost:3001`.
Keep the Supabase service-role key server-only; never put it in `client/.env`.

## Deploy to Vercel

The repository root is configured for Vercel: it builds the client into
`client/dist` and serves `/api/menu` as a serverless function. Import the
repository into Vercel with the project root as the Root Directory, then add
these Environment Variables for the Production (and Preview, if needed)
environments:

- `SUPABASE_URL`: the Supabase project URL.
- `SUPABASE_SERVICE_ROLE_KEY`: the service-role key, stored only in Vercel
  server-side environment variables. The API returns only public menu fields.
  Alternatively, use `SUPABASE_ANON_KEY` if the database grants anonymous
  read access to the menu tables.

Do not set `VITE_API_URL` for the Vercel deployment; the client calls the
same-origin `/api/menu` endpoint. After adding or changing variables, redeploy
the project. The local Express server remains available with `npm run dev:server`.
