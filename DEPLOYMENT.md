# Deploying to AWS EC2

This app ships with a GitHub Actions pipeline ([.github/workflows/deploy.yaml](.github/workflows/deploy.yaml))
that SSHes into an EC2 box on every push to `main`, pulls the new code, rebuilds,
runs migrations, and reloads the app under PM2. This guide covers the one-time
server setup the pipeline assumes is already in place.

Stack used below: Ubuntu EC2 instance, local PostgreSQL on that same instance,
PM2 as the process manager, Nginx as a reverse proxy with a Let's Encrypt
certificate for HTTPS.

## 1. Launch the EC2 instance

- Ubuntu 22.04 or 24.04 LTS, at least `t3.small` (1 vCPU / 2GB is tight once
  Postgres + Node are both running — `t3.small` or bigger is safer).
- Security group inbound rules:
  - `22` (SSH) — restrict to your IP if possible
  - `80` (HTTP) — `0.0.0.0/0`
  - `443` (HTTPS) — `0.0.0.0/0`
  - Do **not** open `3001` publicly — Nginx proxies to it over localhost only.
- Point your API subdomain (e.g. `api.yourdomain.com`) at the instance's
  Elastic IP before the Certbot step.

## 2. One-time server bootstrap

SSH in as `ubuntu` and run:

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y git curl nginx postgresql postgresql-contrib

# Node.js (LTS), installed system-wide via NodeSource rather than nvm.
# This matters for the pipeline specifically: GitHub Actions' SSH step runs a
# non-interactive shell that does NOT source ~/.bashrc, so an nvm-installed
# node would be invisible to `npm ci` / `pm2` during automated deploys even
# though it works fine when you SSH in by hand. A system install under
# /usr/bin sidesteps that entirely.
curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
sudo apt install -y nodejs

# PM2, global
sudo npm install -g pm2
pm2 startup   # run the printed sudo command so PM2 survives reboots
```

### Database

```bash
sudo -u postgres psql
```
```sql
CREATE DATABASE indrive;
CREATE USER fastride WITH ENCRYPTED PASSWORD 'choose-a-strong-password';
GRANT ALL PRIVILEGES ON DATABASE indrive TO fastride;
\q
```

Local Postgres has SSL off by default on Ubuntu, which is why `DB_SSL=false`
is the default in `.env.example` — leave it `false` here. If you later move to
RDS, set `DB_SSL=true` instead.

### Clone the app

The deploy workflow expects the repo at `/home/ubuntu/fastride-server`
(see `APP_DIR` in [deploy.yaml](.github/workflows/deploy.yaml)):

```bash
git clone <your-repo-url> /home/ubuntu/fastride-server
cd /home/ubuntu/fastride-server
mkdir -p logs
```

### Place the `.env` file

`.env` is gitignored on purpose (it holds secrets) and is **never** created or
touched by the deploy pipeline — `git pull` leaves untracked files alone, so
once it's on the server it survives every future deploy.

Create it directly on the server, once:

```bash
nano /home/ubuntu/fastride-server/.env
```

Copy the contents of [.env.example](.env.example) as a starting point and
fill in real production values. Key things to change from the example:

- `NODE_ENV=production` — this disables TypeORM `synchronize`, so schema
  changes only happen via migrations (see below).
- `DB_HOST=localhost`, `DB_USER=fastride`, `DB_PASSWORD=<the password above>`,
  `DB_NAME=indrive`, `DB_SSL=false`
- `CORS_ORIGIN=https://yourfrontend.com` (comma-separate if there's more than
  one origin, e.g. a web app and an admin dashboard)
- `JWT_SECRET` / `JWT_REFRESH_SECRET` — generate real random secrets, e.g.
  `openssl rand -base64 48`
- `JAZZCASH_RETURN_URL` / `JAZZCASH_IPN_URL` — must point at your real public
  domain (`https://api.yourdomain.com/...`), matching what's registered in the
  JazzCash merchant portal
- `JAZZCASH_ENV=production` plus real merchant credentials, once you're off
  sandbox

Whenever you add a new environment variable to the app going forward, add it
to `.env.example` in git (documentation only) **and** manually update the real
`.env` on the server — the pipeline won't do this for you.

### First manual run

Before wiring up CI, prove it boots:

```bash
cd /home/ubuntu/fastride-server
npm ci
npm run build
npm run migration:run
pm2 start ecosystem.config.js
pm2 save
curl http://localhost:3001/health
```

You should see `{"status":"ok", ...}`.

## 3. Nginx + HTTPS

Copy the reference config and point it at your domain:

```bash
sudo cp deploy/nginx.conf /etc/nginx/sites-available/fastride
sudo nano /etc/nginx/sites-available/fastride   # set server_name to your real domain
sudo ln -s /etc/nginx/sites-available/fastride /etc/nginx/sites-enabled/fastride
sudo nginx -t && sudo systemctl reload nginx
```

Then get a certificate:

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d api.yourdomain.com
```

Certbot rewrites the Nginx config in place to add the HTTPS server block and
sets up auto-renewal. Your app is now reachable at
`https://api.yourdomain.com`, proxied to the Node process on `127.0.0.1:3001`.

## 4. Wire up GitHub Actions

The workflow needs three repo secrets (Settings → Secrets and variables →
Actions), and it deploys against an `environment: production`, so either
create that environment (Settings → Environments) or remove the
`environment:` line from the workflow if you don't need approval gates:

| Secret | Value |
|---|---|
| `EC2_HOST` | Elastic IP or public DNS of the instance |
| `EC2_USER` | `ubuntu` |
| `EC2_SSH_PRIVATE_KEY` | Private half of a deploy key with access to this instance |

Generate a dedicated deploy key rather than reusing your personal one:

```bash
ssh-keygen -t ed25519 -f deploy_key -C "github-actions-deploy" -N ""
```

Append `deploy_key.pub` to `/home/ubuntu/.ssh/authorized_keys` on the
instance, and paste the contents of `deploy_key` (the private key) into the
`EC2_SSH_PRIVATE_KEY` secret. Delete the local `deploy_key` files afterward.

## 5. What happens on every push to `main`

1. GitHub checks out the branch (for the SSH step's context only).
2. It SSHes into the instance and, inside `/home/ubuntu/fastride-server`:
   `git pull` → `npm ci` → `npm run build` → `npm run migration:run` →
   `pm2 reload ecosystem.config.js` (or first `pm2 start` if it isn't running
   yet) → `pm2 save`.
3. `.env` is untouched throughout, since it's untracked by git.

If PM2 isn't installed at all, the workflow falls back to a systemd unit
named `fastride-server` if one exists, then to a bare `nohup node dist/main.js`
as a last resort — but with the bootstrap above, PM2 is what actually runs.

## Troubleshooting

- **Migration step fails on first deploy**: run `npm run migration:run`
  manually on the server once to see the real error — usually a DB
  credentials or `DB_SSL` mismatch.
- **502 from Nginx**: check `pm2 logs main` — the Node process likely isn't
  listening on 3001 (crashed on boot, usually a bad `.env` value).
- **CORS errors from your frontend**: confirm `CORS_ORIGIN` in the server's
  `.env` exactly matches the frontend's origin (scheme + host, no trailing
  slash), then `pm2 reload ecosystem.config.js` after editing `.env`.
- **JazzCash callbacks failing**: `JAZZCASH_RETURN_URL` / `JAZZCASH_IPN_URL`
  must be publicly reachable HTTPS URLs matching what's registered in the
  JazzCash portal — `localhost` values from `.env.example` will not work.
