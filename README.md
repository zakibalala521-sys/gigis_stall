# Gigi's Food Stall

Separate React + Express migration workspace. The original PHP repository is
not part of this project.

## Run locally

First, create the server's local environment file:

```powershell
Copy-Item .\server\.env.example .\server\.env
```

Edit `server/.env` and set your Supabase project URL, service-role key, and a
private `SESSION_SECRET` of at least 32 characters. Keep this file local; it is
ignored by Git. Never put the service-role key in the client environment.

Then start the API and client together from the project root:

```powershell
npm run dev
```

Open `http://localhost:5173`. Vite proxies local `/api` requests to the Express
API on port 3001.

Alternatively, run `npm run dev:server` and `npm run dev:client` in separate
terminals.

## Deploy to Vercel

The repository root is configured for Vercel: it builds the client into
`client/dist` and serves the API routes in `api/` as serverless functions. Import the
repository into Vercel with the project root as the Root Directory, then add
these Environment Variables for the Production (and Preview, if needed)
environments:

- `SUPABASE_URL`: the Supabase project URL.
- `SUPABASE_SERVICE_ROLE_KEY`: the service-role key, stored only in Vercel
  server-side environment variables. The API returns only public menu fields.
  Alternatively, use `SUPABASE_ANON_KEY` if the database grants anonymous
  read access to the menu tables.
- `SUPABASE_STORAGE_BUCKET`: optional Supabase Storage bucket name for menu
  images; defaults to `menu-images`.
- `SESSION_SECRET`: a private random secret of at least 32 characters, used to
  sign HTTP-only login session cookies. Generate one locally, for example with
  `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`,
  and enter it directly in Vercel.
- `APP_BASE_URL`: the app's public URL, such as `https://gigisfoodstall.vercel.app`.
- `REQUIRE_EMAIL_VERIFICATION`: defaults to `true`. Set it to `false` only for
  a school/demo deployment that should create customer accounts immediately
  without sending email. This does not verify that a customer owns the email
  address.
- `RESEND_API_KEY`: a server-only API key from Resend for verification emails.
- `EMAIL_FROM`: a sender address on a domain verified with Resend, for example
  `Gigi's Food House <verify@example.com>`.

After an owner account signs in, the app opens an owner-only dashboard with
sales totals and order management. Dashboard data is served by
`/api/admin/dashboard` and requires an active owner account.

The owner-only **Menu manager** supports adding, editing, removing, restoring,
and marking dishes available or sold out. To upload images, create a public
bucket named `menu-images` in **Supabase → Storage** (or set
`SUPABASE_STORAGE_BUCKET` to your chosen bucket in Vercel), then redeploy.
Uploaded JPEG, PNG, and WebP files may be up to 2 MB. Product records with
order history are archived rather than deleted, preserving existing orders.
The public menu shows sold-out items without an add button. Owners do not see
the tray or ordering controls.

Do not set `VITE_API_URL` for the Vercel deployment; the client calls the
same-origin API routes. After adding or changing variables, redeploy the
project. Sign-in reads the existing `users`, `account_verifications`,
`pending_accounts`, and `auth_attempts` tables in Supabase; it does not use
Supabase Auth.

Customers can create accounts from the sign-in form using their full name,
email, and password. Sign-up uses the existing pending-account tables and
requires email verification before sign-in. Configure and verify a sender
domain with Resend, then set the three email environment variables above in
Vercel before enabling sign-up. The app expects the existing
`pending_accounts`, `pending_account_tokens`, and `account_verifications`
tables from `GIGIS-FOOD-STALL/supabase_schema.sql`; do not rerun that script on
an existing database because it drops and recreates application tables.

### Orders

Apply `supabase_order_workflow_migration.sql` once in the Supabase SQL Editor
before deploying the ordering workflow. It maps legacy order statuses to
`pending`, `ready to pick up`, `picked up`, and `canceled`, and creates a
finalized-order history snapshot table. Do not rerun the base schema on an
existing database. Guests can build a browser-local cart; signing in returns
them to that cart. Customers can review their chronologically sorted orders
and cancel only pending orders. Owners can create, view, update status, and
delete orders; finalized history remains available after order deletion.

### Temporary password reset

The temporary `POST /api/auth/reset-password` endpoint is disabled unless both
`TEMP_PASSWORD_RESET_EMAIL` and `TEMP_PASSWORD_RESET_TOKEN` are configured.
Set the email to the exact account being reset and set a random token of at
least 32 characters. Keep both values server-side; never add a `VITE_` prefix.

Send a JSON POST request with a `Bearer` token and a `newPassword` (at least 12
characters and at most 72 UTF-8 bytes). After it succeeds, remove both
environment variables from Vercel and redeploy immediately; locally, remove
them from `server/.env` and restart the API. To remove the temporary feature
from the code as well, delete `api/auth/reset-password.js` and remove its
registration from `server/index.js`.
