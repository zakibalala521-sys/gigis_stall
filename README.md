# Gigi's Food Stall

Separate React + Express migration workspace. The original PHP repository is
not part of this project.

## Run locally

First, create the server's local environment file:

```powershell
Copy-Item .\server\.env.example .\server\.env
Copy-Item .\client\.env.example .\client\.env
```

Set the project URL and anon key in `client/.env`. In `server/.env`, set the
project URL, anon key, service-role key, and a private `SESSION_SECRET` of at
least 32 characters. Keep these files local; they are ignored by Git. Never put
the service-role key in the client environment.

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
- `SUPABASE_ANON_KEY`: the Supabase anon/publishable key used by the API to
  validate Supabase Auth access tokens.
- `SUPABASE_SERVICE_ROLE_KEY`: the service-role key, stored only in Vercel
  server-side environment variables. Server-side profile linking and database
  operations require this key; never expose it in the client.
- `VITE_SUPABASE_URL`: the same Supabase project URL, exposed to the client.
- `VITE_SUPABASE_ANON_KEY`: the anon/publishable key, exposed to the client.
  Never use the service-role key for a `VITE_` variable.
- `SUPABASE_STORAGE_BUCKET`: optional Supabase Storage bucket name for menu
  images; defaults to `menu-images`.
- `SESSION_SECRET`, `APP_BASE_URL`, `REQUIRE_EMAIL_VERIFICATION`,
  `RESEND_API_KEY`, and `EMAIL_FROM` are only used by the legacy cookie-auth
  endpoints; the React application now uses Supabase Auth.

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
project. Configure Supabase Auth email templates to send the six-digit
`{{ .Token }}` code for both signup confirmation and password recovery, and
configure the project's custom SMTP provider in Supabase Auth. Enable the
Email provider's **Confirm email** setting so signup requires OTP verification.
The client
supports signup OTP, resend countdown, and password login. Signed-in users can
change their password by confirming their current password; this does not send
a recovery email. Forgotten passwords must be reset by an administrator
through Supabase Auth.
Guest carts stay in browser storage and are available after sign-in.

The server links a confirmed Supabase Auth user to an existing `public.users`
profile by verified email, preserving the existing role (including owner).
Otherwise it creates an active customer profile. Create/confirm the owner's
Supabase Auth account with the same email as the existing owner profile. Roles
are never accepted from client metadata.

### Orders

Apply `supabase_order_workflow_migration.sql` once in the Supabase SQL Editor
before deploying the ordering workflow. It maps legacy order statuses to
`pending`, `ready to pick up`, `picked up`, and `canceled`, and creates a
finalized-order history snapshot table. Do not rerun the base schema on an
existing database. Guests can build a browser-local cart; signing in returns
them to that cart. Customers can review their chronologically sorted orders
and cancel only pending orders. Owners can create, view, update status, and
delete orders; finalized history remains available after order deletion.

Apply `supabase_order_ui_migration.sql` once after the order workflow migration
to add the sole payment method (`Cash on Pick-up`) and the transactional
customer pending-order edit function. It also makes Take-out the only order
type. The dashboard and customer active-order views show only pending or
ready-to-pick-up orders; finalized orders have separate history views and
refresh through Supabase Realtime with a 10-second polling fallback.

After both order migrations, apply `supabase_auth_realtime_migration.sql` once.
It adds the Auth UUID mapping to customer profiles, permits null legacy
password hashes for newly provisioned Supabase Auth customers, and enables
authorized order reads and Realtime publication. Do not rerun the base schema
on an existing database because it drops and recreates application tables.

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
