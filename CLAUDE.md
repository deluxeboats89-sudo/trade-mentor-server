# Trade Mentor Server

## Overview
Multi-exchange trading mentor with AI-powered analysis. Supports Bitunix, Binance, and Hyperliquid.

## Server Endpoints

### Market Data
- `GET /api/tickers` - Bitunix tickers
- `GET /api/klines` - Bitunix klines
- `GET /api/funding-rate` - Binance funding rate
- `GET /api/long-short` - Binance long/short ratio
- `GET /api/fear-greed` - Fear & Greed Index
- `GET /api/snapshot` - Combined market snapshot

### Hyperliquid (Public API - No Auth)
- `GET /api/hl/tickers` - All coins with prices, funding, OI
- `GET /api/hl/positions?wallet=0x...` - User positions (public)
- `GET /api/hl/funding?coin=BTC` - Funding history
- `GET /api/hl/orderbook?coin=BTC` - L2 orderbook

### Additional Data
- `GET /api/whales` - Whale Alert transactions (requires WHALE_ALERT_KEY)
- `POST /api/tradingview-webhook` - TradingView alert receiver
- `GET /api/tradingview-alerts` - Stored TV alerts
- `GET /api/coinglass-oi` - Open Interest (CoinGlass/Binance fallback)
- `GET /api/sentiment` - Social sentiment (requires SANTIMENT_KEY)

### AI
- `POST /api/mentor` - Anthropic Claude proxy

## Hyperliquid API Reference

Base URL: `https://api.hyperliquid.xyz/info`
Method: POST with JSON body

### metaAndAssetCtxs
```json
{"type": "metaAndAssetCtxs"}
```
Returns: [meta, assetCtxs] where meta.universe contains coin info and assetCtxs contains markPx, funding, openInterest, dayNtlVlm, prevDayPx

### clearinghouseState
```json
{"type": "clearinghouseState", "user": "0x..."}
```
Returns: assetPositions[], marginSummary (accountValue, totalMarginUsed, withdrawable)

### fundingHistory
```json
{"type": "fundingHistory", "coin": "BTC", "startTime": 1234567890000}
```
Returns: [{time, coin, fundingRate, premium}]

### l2Book
```json
{"type": "l2Book", "coin": "BTC"}
```
Returns: levels[[bids], [asks]] with {px, sz, n}

## Environment Variables
- `ANTHROPIC_API_KEY` - Claude API key
- `WHALE_ALERT_KEY` - whale-alert.io API key
- `TELEGRAM_BOT_TOKEN` - Telegram bot token
- `TELEGRAM_CHAT_ID` - Telegram chat ID
- `SANTIMENT_KEY` - Santiment API key
- `CRYPTOPANIC_TOKEN` - CryptoPanic news token

## Frontend
Single-page app in `public/index.html` with:
- Exchange toggle: Bitunix | Binance | Hyperliquid
- Mentor AI chat with trade analysis
- Scanner with RSI signals
- Cockpit with market data
- Trading diary
