// ═══════════════════════════════════════════════════════════════════
// TRADE MENTOR SERVER v2 — Bitunix + Market Data Proxy
// ═══════════════════════════════════════════════════════════════════
const express = require("express");
const cors    = require("cors");
const crypto  = require("crypto");
const path    = require("path");

const app  = express();
const PORT = process.env.PORT || 3000;

const BITUNIX = "https://fapi.bitunix.com/api/v1/futures";

app.use(cors({ origin: "*" }));
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// ── Simple in-memory cache ──
const cache = new Map();
function cached(key, ttlMs, fn) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.ts < ttlMs) return Promise.resolve(hit.data);
  return fn().then(data => { cache.set(key, { data, ts: Date.now() }); return data; });
}

// ── TradingView Alerts Storage (in-memory) ──
const tvAlerts = [];
const MAX_TV_ALERTS = 50;

// ── Bitunix helpers ──
function buildSignature(apiKey, apiSecret, nonce, timestamp) {
  const step1 = crypto.createHmac("sha256", apiSecret).update(`${nonce}${timestamp}${apiKey}`).digest("hex");
  return crypto.createHmac("sha256", apiSecret).update(`${step1}${apiSecret}`).digest("hex");
}
function buildHeaders(apiKey, apiSecret) {
  const nonce     = Math.random().toString(36).slice(2, 12);
  const timestamp = String(Math.floor(Date.now() / 1000));
  return { "api-key": apiKey, nonce, timestamp, "sign": buildSignature(apiKey, apiSecret, nonce, timestamp), "Content-Type": "application/json" };
}
async function bitunixFetch(endpoint, apiKey, apiSecret, method = "GET", body = null) {
  const headers = apiKey && apiSecret ? buildHeaders(apiKey, apiSecret) : { "Content-Type": "application/json" };
  const opts = { method, headers };
  if (body) opts.body = JSON.stringify(body);
  const res  = await fetch(`${BITUNIX}${endpoint}`, opts);
  const text = await res.text();
  try { return JSON.parse(text); } catch { return { code: -1, msg: text }; }
}

// ═══════════════════════════════════════════════════════════════════
// PUBLIC BITUNIX
// ═══════════════════════════════════════════════════════════════════
app.get("/api/tickers", async (req, res) => {
  try {
    const symbols = req.query.symbols || "BTCUSDT,ETHUSDT,DOGEUSDT,XRPUSDT,SOLUSDT";
    res.json(await bitunixFetch(`/market/tickers?symbols=${symbols}`));
  } catch (e) { res.status(500).json({ code: -1, msg: e.message }); }
});

app.get("/api/klines", async (req, res) => {
  try {
    const { symbol = "BTCUSDT", interval = "1m", limit = 60 } = req.query;
    res.json(await bitunixFetch(`/market/kline?symbol=${symbol}&interval=${interval}&limit=${limit}`));
  } catch (e) { res.status(500).json({ code: -1, msg: e.message }); }
});

app.get("/api/orderbook", async (req, res) => {
  try {
    const { symbol = "BTCUSDT", limit = 20 } = req.query;
    res.json(await bitunixFetch(`/market/depth?symbol=${symbol}&limit=${limit}`));
  } catch (e) { res.status(500).json({ code: -1, msg: e.message }); }
});

// ═══════════════════════════════════════════════════════════════════
// MARKET DATA — Binance Futures + External APIs
// ═══════════════════════════════════════════════════════════════════
app.get("/api/funding-rate", async (req, res) => {
  try {
    const { symbol = "BTCUSDT" } = req.query;
    const data = await cached(`funding_${symbol}`, 60000, async () => {
      const r = await fetch(`https://fapi.binance.com/fapi/v1/fundingRate?symbol=${symbol}&limit=1`);
      const d = await r.json();
      return Array.isArray(d) ? d[0] || {} : d;
    });
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get("/api/open-interest", async (req, res) => {
  try {
    const { symbol = "BTCUSDT" } = req.query;
    const data = await cached(`oi_${symbol}`, 30000, async () => {
      const r = await fetch(`https://fapi.binance.com/fapi/v1/openInterest?symbol=${symbol}`);
      return r.json();
    });
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get("/api/long-short", async (req, res) => {
  try {
    const { symbol = "BTCUSDT" } = req.query;
    const data = await cached(`ls_${symbol}`, 60000, async () => {
      const r = await fetch(`https://fapi.binance.com/fapi/v1/globalLongShortAccountRatio?symbol=${symbol}&period=1h&limit=1`);
      const d = await r.json();
      return Array.isArray(d) ? d[0] || {} : d;
    });
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get("/api/fear-greed", async (req, res) => {
  try {
    const data = await cached("fear_greed", 300000, async () => {
      const r = await fetch("https://api.alternative.me/fng/?limit=1");
      const d = await r.json();
      return d.data?.[0] || {};
    });
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get("/api/market-data", async (req, res) => {
  try {
    const { ids = "bitcoin,ethereum,dogecoin,ripple,solana" } = req.query;
    const data = await cached(`mkt_${ids}`, 60000, async () => {
      const r = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true&include_market_cap=true`);
      return r.json();
    });
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get("/api/trending", async (req, res) => {
  try {
    const data = await cached("trending", 300000, async () => {
      const r = await fetch("https://api.coingecko.com/api/v3/search/trending");
      return r.json();
    });
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get("/api/news", async (req, res) => {
  try {
    const { currency = "BTC" } = req.query;
    const token = process.env.CRYPTOPANIC_TOKEN || "";
    const data = await cached(`news_${currency}`, 300000, async () => {
      const url = token
        ? `https://cryptopanic.com/api/v1/posts/?auth_token=${token}&kind=news&currencies=${currency}&public=true`
        : `https://cryptopanic.com/api/v1/posts/?auth_token=demo&kind=news&public=true`;
      const r = await fetch(url);
      return r.json();
    });
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get("/api/snapshot", async (req, res) => {
  try {
    const { symbol = "BTCUSDT" } = req.query;
    const data = await cached(`snap_${symbol}`, 30000, async () => {
      const [fgR, fundR, lsR, oiR] = await Promise.allSettled([
        fetch("https://api.alternative.me/fng/?limit=1"),
        fetch(`https://fapi.binance.com/fapi/v1/fundingRate?symbol=${symbol}&limit=1`),
        fetch(`https://fapi.binance.com/fapi/v1/globalLongShortAccountRatio?symbol=${symbol}&period=1h&limit=1`),
        fetch(`https://fapi.binance.com/fapi/v1/openInterest?symbol=${symbol}`),
      ]);
      const safe = async (r) => { try { return await r.value.json(); } catch { return null; } };
      const [fg, fund, ls, oi] = await Promise.all([safe(fgR), safe(fundR), safe(lsR), safe(oiR)]);
      return {
        fear_greed:    fg?.data?.[0]  || null,
        funding_rate:  Array.isArray(fund) ? fund[0] : fund,
        long_short:    Array.isArray(ls)   ? ls[0]   : ls,
        open_interest: oi,
        symbol,
        timestamp: new Date().toISOString(),
      };
    });
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════════════════════
// HYPERLIQUID API (Public — No Auth Required)
// ═══════════════════════════════════════════════════════════════════
const HL_API = "https://api.hyperliquid.xyz/info";

async function hlFetch(body) {
  const r = await fetch(HL_API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return r.json();
}

// All tickers with prices, funding, OI
app.get("/api/hl/tickers", async (req, res) => {
  try {
    const data = await cached("hl_tickers", 10000, async () => {
      const raw = await hlFetch({ type: "metaAndAssetCtxs" });
      if (!raw || !Array.isArray(raw) || raw.length < 2) return { coins: [] };
      const meta = raw[0]?.universe || [];
      const assetCtxs = raw[1] || [];
      const coins = meta.map((m, i) => {
        const ctx = assetCtxs[i] || {};
        return {
          coin: m.name,
          szDecimals: m.szDecimals,
          price: parseFloat(ctx.markPx || 0),
          funding: parseFloat(ctx.funding || 0),
          openInterest: parseFloat(ctx.openInterest || 0),
          volume24h: parseFloat(ctx.dayNtlVlm || 0),
          change24h: parseFloat(ctx.prevDayPx) > 0
            ? ((parseFloat(ctx.markPx) - parseFloat(ctx.prevDayPx)) / parseFloat(ctx.prevDayPx) * 100)
            : 0,
        };
      });
      return { coins, timestamp: Date.now() };
    });
    res.json({ success: true, ...data });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// User positions (public - just needs wallet address)
app.get("/api/hl/positions", async (req, res) => {
  try {
    const { wallet } = req.query;
    if (!wallet) return res.json({ success: false, error: "wallet parameter required", positions: [] });
    const data = await cached(`hl_pos_${wallet}`, 5000, async () => {
      const raw = await hlFetch({ type: "clearinghouseState", user: wallet });
      if (!raw || !raw.assetPositions) return { positions: [], marginSummary: null };
      const positions = raw.assetPositions
        .filter(p => p.position && parseFloat(p.position.szi) !== 0)
        .map(p => ({
          coin: p.position.coin,
          size: parseFloat(p.position.szi),
          entryPrice: parseFloat(p.position.entryPx),
          markPrice: parseFloat(p.position.positionValue) / Math.abs(parseFloat(p.position.szi)) || 0,
          unrealizedPnl: parseFloat(p.position.unrealizedPnl),
          leverage: parseFloat(p.position.leverage?.value || 1),
          liquidationPrice: parseFloat(p.position.liquidationPx || 0),
          side: parseFloat(p.position.szi) > 0 ? "LONG" : "SHORT",
        }));
      return {
        positions,
        marginSummary: raw.marginSummary ? {
          accountValue: parseFloat(raw.marginSummary.accountValue),
          totalMarginUsed: parseFloat(raw.marginSummary.totalMarginUsed),
          withdrawable: parseFloat(raw.marginSummary.withdrawable),
        } : null,
      };
    });
    res.json({ success: true, wallet, ...data });
  } catch (e) { res.status(500).json({ success: false, error: e.message, positions: [] }); }
});

// Funding history for a coin
app.get("/api/hl/funding", async (req, res) => {
  try {
    const { coin = "BTC" } = req.query;
    const startTime = Date.now() - 24 * 60 * 60 * 1000;
    const data = await cached(`hl_funding_${coin}`, 60000, async () => {
      const raw = await hlFetch({ type: "fundingHistory", coin: coin.toUpperCase(), startTime });
      if (!Array.isArray(raw)) return { history: [], current: null };
      const history = raw.map(f => ({
        time: f.time,
        coin: f.coin,
        fundingRate: parseFloat(f.fundingRate),
        premium: parseFloat(f.premium),
      }));
      const current = history.length > 0 ? history[history.length - 1] : null;
      const avg8h = history.slice(-8).reduce((sum, h) => sum + h.fundingRate, 0) / Math.min(history.length, 8);
      return { history, current, avg8h, coin };
    });
    res.json({ success: true, ...data });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// Orderbook L2
app.get("/api/hl/orderbook", async (req, res) => {
  try {
    const { coin = "BTC" } = req.query;
    const data = await cached(`hl_book_${coin}`, 3000, async () => {
      const raw = await hlFetch({ type: "l2Book", coin: coin.toUpperCase() });
      if (!raw || !raw.levels) return { bids: [], asks: [] };
      return {
        coin,
        bids: raw.levels[0]?.map(l => ({ price: parseFloat(l.px), size: parseFloat(l.sz), count: l.n })) || [],
        asks: raw.levels[1]?.map(l => ({ price: parseFloat(l.px), size: parseFloat(l.sz), count: l.n })) || [],
      };
    });
    res.json({ success: true, ...data });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// ═══════════════════════════════════════════════════════════════════
// WHALE ALERT API
// ═══════════════════════════════════════════════════════════════════
app.get("/api/whales", async (req, res) => {
  try {
    const { min_value = 1000000, currency = "BTC", limit = 10 } = req.query;
    const apiKey = process.env.WHALE_ALERT_KEY || "";
    if (!apiKey) {
      return res.json({ success: false, error: "WHALE_ALERT_KEY nicht konfiguriert", transactions: [] });
    }
    const data = await cached(`whales_${currency}_${min_value}`, 60000, async () => {
      const start = Math.floor(Date.now() / 1000) - 3600; // letzte Stunde
      const url = `https://api.whale-alert.io/v1/transactions?api_key=${apiKey}&min_value=${min_value}&currency=${currency.toLowerCase()}&limit=${limit}&start=${start}`;
      const r = await fetch(url);
      const d = await r.json();
      if (d.result === "success" && d.transactions) {
        return d.transactions.map(tx => ({
          hash: tx.hash,
          timestamp: tx.timestamp,
          amount: tx.amount,
          amount_usd: tx.amount_usd,
          from: tx.from?.owner_type || "unknown",
          to: tx.to?.owner_type || "unknown",
          from_exchange: tx.from?.owner || null,
          to_exchange: tx.to?.owner || null,
          blockchain: tx.blockchain,
          symbol: tx.symbol,
        }));
      }
      return [];
    });
    // Analyse: Exchange-Bewegungen
    const analyzed = data.map(tx => {
      let signal = "neutral";
      let message = "";
      if (tx.to === "exchange" && tx.amount_usd >= 1000000) {
        signal = "bearish";
        message = `🐋 Whale verkauft — ${(tx.amount_usd / 1e6).toFixed(1)}M USD → ${tx.to_exchange || "Exchange"}`;
      } else if (tx.from === "exchange" && tx.amount_usd >= 1000000) {
        signal = "bullish";
        message = `🐋 Whale kauft — ${(tx.amount_usd / 1e6).toFixed(1)}M USD von ${tx.from_exchange || "Exchange"} abgezogen`;
      }
      return { ...tx, signal, message };
    });
    res.json({ success: true, count: analyzed.length, transactions: analyzed });
  } catch (e) { res.status(500).json({ success: false, error: e.message, transactions: [] }); }
});

// ═══════════════════════════════════════════════════════════════════
// TRADINGVIEW WEBHOOKS
// ═══════════════════════════════════════════════════════════════════
app.post("/api/tradingview-webhook", async (req, res) => {
  try {
    const { symbol, price, message, action, timeframe } = req.body;
    const alert = {
      id: Date.now(),
      timestamp: new Date().toISOString(),
      symbol: symbol || "UNKNOWN",
      price: price || null,
      message: message || "",
      action: action || null,
      timeframe: timeframe || null,
    };
    tvAlerts.unshift(alert);
    if (tvAlerts.length > MAX_TV_ALERTS) tvAlerts.pop();
    console.log(`📺 TradingView Alert: ${symbol} @ ${price} — ${message}`);

    // Optional: Telegram notification
    const telegramToken = process.env.TELEGRAM_BOT_TOKEN;
    const telegramChat = process.env.TELEGRAM_CHAT_ID;
    if (telegramToken && telegramChat) {
      try {
        const text = `📺 TradingView Alert\n${symbol} @ ${price}\n${message}`;
        await fetch(`https://api.telegram.org/bot${telegramToken}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chat_id: telegramChat, text, parse_mode: "HTML" }),
        });
      } catch (tgErr) { console.log("Telegram send failed:", tgErr.message); }
    }

    res.json({ success: true, alert });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.get("/api/tradingview-alerts", (req, res) => {
  const { limit = 10 } = req.query;
  res.json({
    success: true,
    count: tvAlerts.length,
    alerts: tvAlerts.slice(0, parseInt(limit))
  });
});

// ═══════════════════════════════════════════════════════════════════
// COINGLASS OPEN INTEREST
// ═══════════════════════════════════════════════════════════════════
app.get("/api/coinglass-oi", async (req, res) => {
  try {
    const { symbol = "BTC" } = req.query;
    const data = await cached(`coinglass_oi_${symbol}`, 30000, async () => {
      // Versuche CoinGlass zuerst
      try {
        const r = await fetch(`https://open-api.coinglass.com/public/v2/indicator/open_interest?symbol=${symbol}`, {
          headers: { "Accept": "application/json" }
        });
        const d = await r.json();
        if (d.success && d.data) {
          return { source: "coinglass", data: d.data };
        }
      } catch (cgErr) { console.log("CoinGlass failed, trying Binance fallback"); }

      // Fallback: Binance OI
      const binanceSymbol = symbol.toUpperCase() + "USDT";
      const [oiR, oi24hR] = await Promise.all([
        fetch(`https://fapi.binance.com/fapi/v1/openInterest?symbol=${binanceSymbol}`),
        fetch(`https://fapi.binance.com/futures/data/openInterestHist?symbol=${binanceSymbol}&period=1h&limit=24`),
      ]);
      const oi = await oiR.json();
      const oi24hRaw = await oi24hR.json();
      const oi24h = Array.isArray(oi24hRaw) ? oi24hRaw : [];

      const currentOI = parseFloat(oi.openInterest || 0);
      const oi24hAgo = oi24h.length > 0 ? parseFloat(oi24h[0].sumOpenInterest || 0) : currentOI;
      const change24h = oi24hAgo > 0 ? ((currentOI - oi24hAgo) / oi24hAgo * 100) : 0;

      return {
        source: "binance",
        symbol: binanceSymbol,
        openInterest: currentOI,
        openInterestUSD: currentOI,
        change24h: change24h.toFixed(2),
        history: oi24h.slice(-12).map(h => ({
          timestamp: h.timestamp,
          oi: parseFloat(h.sumOpenInterest || 0)
        })),
      };
    });
    res.json({ success: true, ...data });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// ═══════════════════════════════════════════════════════════════════
// SANTIMENT SOCIAL SENTIMENT (optional)
// ═══════════════════════════════════════════════════════════════════
app.get("/api/sentiment", async (req, res) => {
  try {
    const { coin = "bitcoin" } = req.query;
    const apiKey = process.env.SANTIMENT_KEY || "";
    if (!apiKey) {
      return res.json({ success: false, error: "SANTIMENT_KEY nicht konfiguriert", data: null });
    }
    const data = await cached(`sentiment_${coin}`, 300000, async () => {
      const now = new Date().toISOString();
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const query = `{
        getMetric(metric: "social_volume_total") {
          timeseriesData(slug: "${coin}", from: "${yesterday}", to: "${now}", interval: "1h") {
            datetime
            value
          }
        }
      }`;
      const r = await fetch("https://api.santiment.net/graphql", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Apikey ${apiKey}`,
        },
        body: JSON.stringify({ query }),
      });
      const d = await r.json();
      const timeseries = d.data?.getMetric?.timeseriesData || [];
      const values = timeseries.map(t => t.value);
      const avg = values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0;
      const latest = values[values.length - 1] || 0;
      const trend = latest > avg * 1.5 ? "high" : latest < avg * 0.5 ? "low" : "normal";
      return {
        coin,
        socialVolume: latest,
        average24h: avg,
        trend,
        message: trend === "high" ? "📈 FOMO im Markt — Social Volume hoch" :
                 trend === "low" ? "📉 Interesse niedrig" : "📊 Normal",
        history: timeseries.slice(-12),
      };
    });
    res.json({ success: true, ...data });
  } catch (e) { res.status(500).json({ success: false, error: e.message, data: null }); }
});

// ═══════════════════════════════════════════════════════════════════
// ANTHROPIC PROXY — schützt API Key auf dem Server
// ═══════════════════════════════════════════════════════════════════
app.post("/api/mentor", async (req, res) => {
  const apiKey = process.env.ANTHROPIC_API_KEY || req.headers["x-anthropic-key"] || "";
  if (!apiKey) return res.status(401).json({ error: "Kein Anthropic API Key konfiguriert" });
  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type":      "application/json",
        "x-api-key":         apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(req.body),
    });
    const d = await r.json();
    res.json(d);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════════════════════
// PRIVATE BITUNIX
// ═══════════════════════════════════════════════════════════════════
function requireAuth(req, res, next) {
  const apiKey = req.headers["x-api-key"];
  const apiSec = req.headers["x-api-secret"];
  if (!apiKey || !apiSec) return res.status(401).json({ code: 401, msg: "API Key und Secret erforderlich" });
  req.apiKey = apiKey; req.apiSec = apiSec;
  next();
}

app.get("/api/positions", requireAuth, async (req, res) => {
  try { res.json(await bitunixFetch("/position/get_pending_positions", req.apiKey, req.apiSec)); }
  catch (e) { res.status(500).json({ code: -1, msg: e.message }); }
});
app.get("/api/balance", requireAuth, async (req, res) => {
  try { res.json(await bitunixFetch("/account/single_account", req.apiKey, req.apiSec)); }
  catch (e) { res.status(500).json({ code: -1, msg: e.message }); }
});
app.get("/api/orders", requireAuth, async (req, res) => {
  try {
    const { symbol = "", limit = 20 } = req.query;
    res.json(await bitunixFetch(`/trade/get_history_orders?limit=${limit}${symbol?"&symbol="+symbol:""}`, req.apiKey, req.apiSec));
  } catch (e) { res.status(500).json({ code: -1, msg: e.message }); }
});
app.get("/api/pending-orders", requireAuth, async (req, res) => {
  try {
    const { symbol = "" } = req.query;
    res.json(await bitunixFetch(`/trade/get_pending_orders${symbol?"?symbol="+symbol:""}`, req.apiKey, req.apiSec));
  } catch (e) { res.status(500).json({ code: -1, msg: e.message }); }
});

app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    time: new Date().toISOString(),
    service: "Trade Mentor Proxy v4",
    exchanges: ["bitunix", "binance", "hyperliquid"],
    endpoints: [
      "/api/snapshot",
      "/api/fear-greed",
      "/api/funding-rate",
      "/api/long-short",
      "/api/mentor",
      "/api/whales",
      "/api/tradingview-webhook",
      "/api/tradingview-alerts",
      "/api/coinglass-oi",
      "/api/sentiment",
      "/api/hl/tickers",
      "/api/hl/positions",
      "/api/hl/funding",
      "/api/hl/orderbook"
    ],
    features: {
      whale_alert: !!process.env.WHALE_ALERT_KEY,
      telegram: !!(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID),
      santiment: !!process.env.SANTIMENT_KEY,
      hyperliquid: true,
    }
  });
});

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
  console.log(`\n🛡️  Trade Mentor Server v4 läuft auf Port ${PORT}`);
  console.log(`   Exchanges: Bitunix | Binance | Hyperliquid`);
  console.log(`   Snapshot: http://localhost:${PORT}/api/snapshot`);
  console.log(`   Mentor AI: POST http://localhost:${PORT}/api/mentor`);
  console.log(`   🟢 Hyperliquid: http://localhost:${PORT}/api/hl/tickers`);
  console.log(`   🐋 Whales: http://localhost:${PORT}/api/whales`);
  console.log(`   📺 TradingView: POST http://localhost:${PORT}/api/tradingview-webhook`);
  if (process.env.WHALE_ALERT_KEY) console.log(`   ✓ Whale Alert API aktiv`);
  if (process.env.TELEGRAM_BOT_TOKEN) console.log(`   ✓ Telegram Notifications aktiv\n`);
});
