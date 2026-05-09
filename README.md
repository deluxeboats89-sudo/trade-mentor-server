# 🛡️ Trade Mentor Server — Deployment Guide

## Was du hier hast

Ein Node.js Server der als Proxy zwischen deinem Browser und der Bitunix API sitzt.
Löst das CORS-Problem — danach laden echte Live-Daten im Browser.

## Dateistruktur

```
trade-mentor-server/
├── server.js          ← Proxy Server (Node.js)
├── package.json       ← Dependencies
├── README.md          ← Diese Datei
└── public/
    └── index.html     ← Die komplette Trade Mentor App
```

---

## DEPLOYMENT in 10 Minuten (Render.com — kostenlos)

### Schritt 1: GitHub
1. Gehe auf github.com → Account erstellen (falls nicht vorhanden)
2. "New Repository" → Name: `trade-mentor-server` → Public → Create
3. Lade alle Dateien hoch (drag & drop in GitHub)

### Schritt 2: Render.com
1. Gehe auf render.com → Account erstellen (mit GitHub verbinden)
2. "New +" → "Web Service"
3. Dein GitHub Repo `trade-mentor-server` auswählen
4. Einstellungen:
   - **Name:** trade-mentor (beliebig)
   - **Runtime:** Node
   - **Build Command:** `npm install`
   - **Start Command:** `node server.js`
   - **Plan:** Free
5. "Create Web Service" klicken
6. Nach ~2 Minuten bekommst du eine URL wie:
   `https://trade-mentor-xxxx.onrender.com`

### Schritt 3: App einrichten
1. Öffne deine Render URL im Browser → Du siehst die Trade Mentor App
2. Gehe zu ⚙️ SETUP → SERVER URL → deine Render URL eintragen → Speichern & Testen
3. API Key von Bitunix eintragen (Bitunix App → Profil → API Management)
4. Session starten → Echte Live-Daten!

---

## API Endpoints

| Endpoint | Auth | Beschreibung |
|----------|------|--------------|
| GET /health | nein | Server Status |
| GET /api/tickers | nein | Live Preise aller Coins |
| GET /api/klines | nein | Candlestick Daten (für RSI) |
| GET /api/orderbook | nein | Order Book |
| GET /api/positions | ja | Offene Positionen |
| GET /api/balance | ja | Account Balance |
| GET /api/orders | ja | Order History |

**Auth:** API Key und Secret als Header:
```
x-api-key: dein-api-key
x-api-secret: dein-api-secret
```

---

## Lokal testen (optional)

```bash
# Node.js muss installiert sein (nodejs.org)
cd trade-mentor-server
npm install
node server.js

# Öffne: http://localhost:3000
```

---

## Hinweise

- **Render Free Tier:** Schläft nach 15min Inaktivität, wacht beim ersten Request auf (~30 Sek)
- **Railway.app:** Alternative für $5/Monat — schläft nie
- **API Keys:** Werden nur lokal in deinem Browser gespeichert (localStorage), nie an den Server gesendet
- **Nur Read-Rechte:** Der Mentor kann NICHT traden — er liest nur deine Positionen

---

## iPhone Auto-Trigger

1. Shortcuts App → Automatisierung → + → Neue persönliche Automatisierung
2. App → Bitunix → ✓ Geöffnet wird
3. Aktion: URL öffnen → `https://deine-render-url.onrender.com`
4. "Vor Ausführung fragen" → DEAKTIVIEREN
5. Bitunix öffnen → Mentor startet automatisch ✓
