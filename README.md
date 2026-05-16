# 🦂 Scorpion Class Store

A virtual classroom reward store where students spend behavior tickets on prizes.

## Features

**Admin (`/admin`)**
- Password-protected dashboard
- Inventory management with categories
- Student accounts with ticket balances
- Order queue (approve/fulfill/cancel)
- Transaction history log
- Low stock alerts
- Open/close the store instantly

**Student Store (`/`)**
- PIN-based login (mobile-friendly)
- Browse items by category
- Purchase items (tickets deducted)
- Redemption code on purchase
- Order history

## Default Login

- **Admin password:** `scorpions`  ← Change this after first login in Settings!
- Students log in with their PIN (set by admin)

## Deploy to Railway

### Option 1: Deploy from GitHub (recommended)

1. Push this folder to a GitHub repository
2. Go to [railway.app](https://railway.app) and sign in
3. Click **New Project → Deploy from GitHub repo**
4. Select your repo — Railway auto-detects Node.js and deploys
5. Done! Your app is live at the generated URL

### Option 2: Deploy via Railway CLI

```bash
npm install -g @railway/cli
railway login
railway init
railway up
```

### Environment Variables (optional)

Set these in Railway's Variables tab for production:

| Variable | Description | Default |
|---|---|---|
| `SESSION_SECRET` | Secret for session cookies | `scorpion-store-secret-change-me` |
| `PORT` | Port to listen on | `3000` (Railway sets this automatically) |
| `DB_DIR` | Where to store the SQLite database | App root |

> ⚠️ **Important:** Railway's filesystem is ephemeral by default. For persistent data, add a Railway **Volume** and set `DB_DIR` to the volume mount path (e.g. `/data`).

## Adding a Persistent Volume (Railway)

1. In your Railway project, click your service
2. Go to **Settings → Volumes**
3. Add a volume mounted at `/data`
4. Add environment variable: `DB_DIR=/data`

This ensures your student data, inventory, and orders survive redeploys.

## Local Development

```bash
npm install
npm start
# Open http://localhost:3000
```
