// ═══════════════════════════════════════════════════════════════════
// TRADE MENTOR SERVER — Bitunix API Proxy
// Node.js + Express — läuft auf Render.com / Railway / VPS
// ═══════════════════════════════════════════════════════════════════
const express  = require("express");
const cors     = require("cors");
const crypto   = require("crypto");
const path     = require("path");

const app  = express();
const PORT = process.env.PORT || 3000;

// ── Bitunix Base URL ──
const BITUNIX = "https://fapi.bitunix.com/api/v1/futures";

// ── CORS: Erlaube deinen Browser ──
app.use(cors({ origin: "*" }));
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// ═══════════════════════════════════════════════════════════════════
// BITUNIX SIGNATURE HELPER
// ═══════════════════════════════════════════════════════════════════
function buildSignature(apiKey, apiSecret, nonce, timestamp) {
  const step1 = crypto
    .createHmac("sha256", apiSecret)
    .update(`${nonce}${timestamp}${apiKey}`)
    .digest("hex");
  const sign = crypto
    .createHmac("sha256", apiSecret)
    .update(`${step1}${apiSecret}`)
    .digest("hex");
  return sign;
}

function buildHeaders(apiKey, apiSecret) {
  const nonce     = Math.random().toString(36).slice(2, 12);
  const timestamp = String(Math.floor(Date.now() / 1000));
  const sign      = buildSignature(apiKey, apiSecret, nonce, timestamp);
  return {
    "api-key":        apiKey,
    "nonce":          nonce,
    "timestamp":      timestamp,
    "sign":           sign,
    "Content-Type":   "application/json",
  };
}

// ═══════════════════════════════════════════════════════════════════
// UNIVERSAL FETCH HELPER
// ═══════════════════════════════════════════════════════════════════
async function bitunixFetch(endpoint, apiKey, apiSecret, method = "GET", body = null) {
  const headers = apiKey && apiSecret
    ? buildHeaders(apiKey, apiSecret)
    : { "Content-Type": "application/json" };

  const opts = { method, headers };
  if (body) opts.body = JSON.stringify(body);

  const res  = await fetch(`${BITUNIX}${endpoint}`, opts);
  const text = await res.text();

  try {
    return JSON.parse(text);
  } catch {
    return { code: -1, msg: text };
  }
}

// ═══════════════════════════════════════════════════════════════════
// ── PUBLIC ROUTES (kein API Key nötig) ──
// ═══════════════════════════════════════════════════════════════════

// Live Ticker — mehrere Coins
app.get("/api/tickers", async (req, res) => {
  try {
    const symbols = req.query.symbols || "BTCUSDT,ETHUSDT,DOGEUSDT,XRPUSDT,SOLUSDT";
    const data    = await bitunixFetch(`/market/tickers?symbols=${symbols}`);
    res.json(data);
  } catch (e) {
    res.status(500).json({ code: -1, msg: e.message });
  }
});

// Kline / Candlestick — für RSI Berechnung
app.get("/api/klines", async (req, res) => {
  try {
    const { symbol = "BTCUSDT", interval = "1m", limit = 60 } = req.query;
    const data = await bitunixFetch(`/market/kline?symbol=${symbol}&interval=${interval}&limit=${limit}`);
    res.json(data);
  } catch (e) {
    res.status(500).json({ code: -1, msg: e.message });
  }
});

// Order Book
app.get("/api/orderbook", async (req, res) => {
  try {
    const { symbol = "BTCUSDT", limit = 20 } = req.query;
    const data = await bitunixFetch(`/market/depth?symbol=${symbol}&limit=${limit}`);
    res.json(data);
  } catch (e) {
    res.status(500).json({ code: -1, msg: e.message });
  }
});

// ═══════════════════════════════════════════════════════════════════
// ── PRIVATE ROUTES (API Key + Secret im Header) ──
// ═══════════════════════════════════════════════════════════════════

// Middleware: API Key aus Header lesen
function requireAuth(req, res, next) {
  const apiKey = req.headers["x-api-key"];
  const apiSec = req.headers["x-api-secret"];
  if (!apiKey || !apiSec) {
    return res.status(401).json({ code: 401, msg: "API Key und Secret erforderlich" });
  }
  req.apiKey = apiKey;
  req.apiSec = apiSec;
  next();
}

// Offene Positionen
app.get("/api/positions", requireAuth, async (req, res) => {
  try {
    const data = await bitunixFetch(
      "/position/get_pending_positions",
      req.apiKey, req.apiSec
    );
    res.json(data);
  } catch (e) {
    res.status(500).json({ code: -1, msg: e.message });
  }
});

// Account Balance
app.get("/api/balance", requireAuth, async (req, res) => {
  try {
    const data = await bitunixFetch(
      "/account/single_account",
      req.apiKey, req.apiSec
    );
    res.json(data);
  } catch (e) {
    res.status(500).json({ code: -1, msg: e.message });
  }
});

// Order History
app.get("/api/orders", requireAuth, async (req, res) => {
  try {
    const { symbol = "", limit = 20 } = req.query;
    const endpoint = `/trade/get_history_orders?limit=${limit}${symbol ? "&symbol=" + symbol : ""}`;
    const data     = await bitunixFetch(endpoint, req.apiKey, req.apiSec);
    res.json(data);
  } catch (e) {
    res.status(500).json({ code: -1, msg: e.message });
  }
});

// Pending Orders
app.get("/api/pending-orders", requireAuth, async (req, res) => {
  try {
    const { symbol = "" } = req.query;
    const endpoint = `/trade/get_pending_orders${symbol ? "?symbol=" + symbol : ""}`;
    const data     = await bitunixFetch(endpoint, req.apiKey, req.apiSec);
    res.json(data);
  } catch (e) {
    res.status(500).json({ code: -1, msg: e.message });
  }
});

// ═══════════════════════════════════════════════════════════════════
// HEALTH CHECK
// ═══════════════════════════════════════════════════════════════════
app.get("/health", (req, res) => {
  res.json({ status: "ok", time: new Date().toISOString(), service: "Trade Mentor Proxy" });
});

// ── Catch-all → App ausliefern ──
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// ── Start ──
app.listen(PORT, () => {
  console.log(`\n🛡️  Trade Mentor Server läuft auf Port ${PORT}`);
  console.log(`   Health: http://localhost:${PORT}/health`);
  console.log(`   Tickers: http://localhost:${PORT}/api/tickers`);
  console.log(`   Klines:  http://localhost:${PORT}/api/klines?symbol=BTCUSDT\n`);
});
