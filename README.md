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

The browser calls the Express API at `http://localhost:3001`. Keep the
Supabase service-role key server-only; never put it in `client/.env`.
