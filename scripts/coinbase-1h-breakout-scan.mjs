// Scan Coinbase Exchange (public) 1H candles for a simple 7D breakout + 2x volume rule.
// Usage: node scripts/coinbase-1h-breakout-scan.mjs

const GRANULARITY = 3600; // 1h
const LOOKBACK_CANDLES = 24 * 7; // 168
const PRODUCTS = [
  "BTC-USD",
  "ETH-USD",
  "SOL-USD",
  "LINK-USD",
  "AVAX-USD",
  "ADA-USD",
  "XRP-USD",
  "DOGE-USD",
  "LTC-USD",
  "BCH-USD",
  "UNI-USD",
  "AAVE-USD",
  "ATOM-USD",
];

async function fetchJson(url, opts) {
  const res = await fetch(url, opts);
  const text = await res.text();
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}: ${text.slice(0, 200)}`);
  return JSON.parse(text);
}

function avg(arr) {
  if (!arr.length) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function fmt(n, d = 2) {
  if (!Number.isFinite(n)) return "-";
  return n.toFixed(d);
}

async function getCandles(productId) {
  // Coinbase returns candles newest-first.
  const url = `https://api.exchange.coinbase.com/products/${encodeURIComponent(productId)}/candles?granularity=${GRANULARITY}`;
  const data = await fetchJson(url, {
    headers: {
      "User-Agent": "clawdbot/coinbase-scan",
      "Accept": "application/json",
    },
  });
  // Ensure we have enough candles.
  const candles = data
    .map(([time, low, high, open, close, volume]) => ({
      time,
      low,
      high,
      open,
      close,
      volume,
    }))
    .sort((a, b) => a.time - b.time);

  // Take the last N candles.
  return candles.slice(-1 * (LOOKBACK_CANDLES + 1)); // +1 to separate "current" from "prior"
}

function scanCandles(candles) {
  if (candles.length < LOOKBACK_CANDLES + 1) return null;

  const prior = candles.slice(0, -1);
  const last = candles[candles.length - 1];

  const maxPriorClose = Math.max(...prior.map((c) => c.close));
  const avgPriorVol = avg(prior.map((c) => c.volume));

  const breakout = last.close > maxPriorClose;
  const volOk = last.volume >= 2 * avgPriorVol;

  return {
    last,
    maxPriorClose,
    avgPriorVol,
    breakout,
    volOk,
  };
}

async function main() {
  const results = [];
  for (const productId of PRODUCTS) {
    try {
      const candles = await getCandles(productId);
      const scan = scanCandles(candles);
      if (!scan) continue;
      results.push({ productId, ...scan });
    } catch (e) {
      results.push({ productId, error: String(e?.message || e) });
    }
  }

  const now = new Date();
  console.log(`Scan time: ${now.toISOString()}`);

  const candidates = results
    .filter((r) => !r.error && r.breakout && r.volOk)
    .sort((a, b) => (b.last.volume / b.avgPriorVol) - (a.last.volume / a.avgPriorVol));

  if (!candidates.length) {
    console.log("No candidates (7D breakout + 2x volume) right now.");
  } else {
    console.log("Candidates:");
    for (const r of candidates) {
      const ratio = r.last.volume / r.avgPriorVol;
      console.log(
        `- ${r.productId} close=${fmt(r.last.close, 4)} ` +
          `vs 7DmaxClose=${fmt(r.maxPriorClose, 4)} ` +
          `volRatio=${fmt(ratio, 2)} (lastVol=${fmt(r.last.volume, 2)})`
      );
    }
  }

  // Debug table
  console.log("\nAll scans:");
  for (const r of results) {
    if (r.error) {
      console.log(`- ${r.productId}: ERROR ${r.error}`);
      continue;
    }
    const ratio = r.last.volume / r.avgPriorVol;
    console.log(
      `- ${r.productId}: close=${fmt(r.last.close, 4)} ` +
        `7DmaxClose=${fmt(r.maxPriorClose, 4)} ` +
        `volRatio=${fmt(ratio, 2)} breakout=${r.breakout} volOk=${r.volOk}`
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
