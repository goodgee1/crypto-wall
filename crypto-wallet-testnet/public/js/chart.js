/* ============================================================
   NovaWallet — Live candlestick chart
   Uses Lightweight Charts v5 (self-hosted) + exchange WebSocket
   Queries /api/orders/health first to pick the right exchange.
   ============================================================ */

let binanceWs = null;
let candleChart = null;
let candleSeries = null;
let currentSymbol = 'btcusdt';
let currentBybitSymbol = 'BTCUSDT';
let lastPriceUpdate = 0;
let activeExchange = null;  // 'binance' | 'bybit' | 'coingecko' | 'fallback'

/* ---------------- HELPERS ---------------- */
function toBinanceSymbol(pair) {
  return pair.replace('/', '').toLowerCase();     // BTC/USDT -> btcusdt
}
function toBybitSymbol(pair) {
  return pair.replace('/', '').toUpperCase();     // BTC/USDT -> BTCUSDT
}

/* ---------------- CHART INIT ---------------- */
function initCandleChart() {
  const container = document.getElementById('candle-chart');
  if (!container) {
    console.warn('candle-chart container not found');
    return false;
  }
  if (typeof LightweightCharts === 'undefined') {
    console.warn('Lightweight Charts library not loaded — did you self-host it?');
    container.innerHTML = '<div class="empty">Chart library missing. Run: curl -L "https://unpkg.com/lightweight-charts@4.2.0/dist/lightweight-charts.standalone.production.js" -o public/js/lightweight-charts.js</div>';
    return false;
  }

  if (candleChart) {
    candleChart.remove();
    candleChart = null;
    candleSeries = null;
  }

  candleChart = LightweightCharts.createChart(container, {
    width: container.clientWidth,
    height: 380,
    layout: { background: { color: 'transparent' }, textColor: '#94a3b8' },
    grid: {
      vertLines: { color: 'rgba(148,163,184,0.08)' },
      horzLines: { color: 'rgba(148,163,184,0.08)' }
    },
    crosshair: { mode: LightweightCharts.CrosshairMode.Normal },
    rightPriceScale: { borderColor: 'rgba(148,163,184,0.2)' },
    timeScale: {
      borderColor: 'rgba(148,163,184,0.2)',
      timeVisible: true,
      secondsVisible: false
    }
  });

  candleSeries = candleChart.addSeries(LightweightCharts.CandlestickSeries, {
    upColor: '#4ade80',
    downColor: '#ef4444',
    borderUpColor: '#4ade80',
    borderDownColor: '#ef4444',
    wickUpColor: '#4ade80',
    wickDownColor: '#ef4444'
  });

  window.addEventListener('resize', () => {
    if (candleChart && container) {
      candleChart.applyOptions({ width: container.clientWidth });
    }
  });

  return true;
}

/* ---------------- HISTORICAL CANDLES (multi-exchange) ---------------- */
async function loadHistoricalCandles(pair) {
  const binanceSymbol = pair.replace('/', '').toUpperCase();
  const bybitSymbol = binanceSymbol;

  // Try exchanges in order. First one that responds wins.
  const attempts = [
    {
      name: 'binance',
      url: `https://api.binance.com/api/v3/klines?symbol=${binanceSymbol}&interval=1m&limit=100`,
      parse: (data) => data.map(k => ({
        time: Math.floor(k[0] / 1000),
        open: parseFloat(k[1]),
        high: parseFloat(k[2]),
        low: parseFloat(k[3]),
        close: parseFloat(k[4])
      }))
    },
    {
      name: 'bybit',
      url: `https://api.bybit.com/v5/market/kline?category=spot&symbol=${bybitSymbol}&interval=1&limit=100`,
      parse: (json) => {
        if (json.retCode !== 0) throw new Error(json.retMsg);
        return json.result.list.slice().reverse().map(k => ({
          time: Math.floor(parseInt(k[0]) / 1000),
          open: parseFloat(k[1]),
          high: parseFloat(k[2]),
          low: parseFloat(k[3]),
          close: parseFloat(k[4])
        }));
      }
    }
  ];

  for (const attempt of attempts) {
    try {
      const res = await fetch(attempt.url, { signal: AbortSignal.timeout(5000) });
      if (!res.ok) continue;
      const raw = await res.json();
      const candles = attempt.parse(raw);
      if (!candles || !candles.length) continue;

      if (candleSeries) {
        candleSeries.setData(candles);
        candleChart.timeScale().fitContent();
      }
      const latest = candles[candles.length - 1];
      if (latest) updatePriceDisplay(latest.close, pair);

      console.log(`Historical candles loaded from ${attempt.name}`);
      return;
    } catch (e) {
      console.warn(`Historical candles from ${attempt.name} failed:`, e.message);
    }
  }

  console.error('All historical candle sources failed');
  toast('Could not load chart data — check network', 'warn', 4000);
}

/* ---------------- LIVE STREAM ---------------- */
async function startLiveStream(pair) {
  currentSymbol = toBinanceSymbol(pair);
  currentBybitSymbol = toBybitSymbol(pair);

  // Close existing stream
  if (binanceWs) {
    try { binanceWs.close(); } catch {}
    binanceWs = null;
  }

  // Ask the server which exchange works
  let exchange = 'binance';
  try {
    const h = await fetch('/api/orders/health', {
      headers: { 'Authorization': `Bearer ${token()}` }
    }).then(r => r.json());
    exchange = h.exchange || 'binance';
    activeExchange = exchange;
  } catch {
    exchange = 'binance';
  }

  console.log(`Live stream using: ${exchange}`);

  // Route to the right WebSocket
  if (exchange === 'bybit' || exchange === 'coingecko') {
    startBybitStream();
  } else if (exchange === 'fallback') {
    // No exchange works — simulate drift from cached price
    startSimulatedStream();
  } else {
    startBinanceStream();
  }
}

function startBinanceStream() {
  const url = `wss://stream.binance.com:9443/ws/${currentSymbol}@kline_1m`;
  let failed = false;
  binanceWs = new WebSocket(url);

  binanceWs.onopen = () => console.log('Binance WS connected');

  binanceWs.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      if (!data.k) return;
      if (data.k.s !== currentSymbol.toUpperCase()) return;

      const candle = {
        time: Math.floor(data.k.t / 1000),
        open: parseFloat(data.k.o),
        high: parseFloat(data.k.h),
        low: parseFloat(data.k.l),
        close: parseFloat(data.k.c)
      };
      if (candleSeries) candleSeries.update(candle);

      const now = Date.now();
      if (now - lastPriceUpdate > 500) {
        lastPriceUpdate = now;
        updatePriceDisplay(candle.close, currentPairForLabel);
      }
    } catch {}
  };

  binanceWs.onerror = () => {
    if (failed) return;
    failed = true;
    console.warn('Binance WS failed — switching to Bybit');
    startBybitStream();
  };
}

function startBybitStream() {
  if (binanceWs) {
    try { binanceWs.close(); } catch {}
    binanceWs = null;
  }

  const ws = new WebSocket('wss://stream.bybit.com/v5/public/spot');
  binanceWs = ws;

  ws.onopen = () => {
    console.log('Bybit WS connected for', currentBybitSymbol);
    ws.send(JSON.stringify({
      op: 'subscribe',
      args: [`kline.1.${currentBybitSymbol}`]
    }));
  };

  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      if (!data.topic || !data.topic.startsWith('kline.')) return;
      if (!data.data || !data.data[0]) return;

      const k = data.data[0];
      const candle = {
        time: Math.floor(parseInt(k.start) / 1000),
        open: parseFloat(k.open),
        high: parseFloat(k.high),
        low: parseFloat(k.low),
        close: parseFloat(k.close)
      };
      if (candleSeries) candleSeries.update(candle);

      const now = Date.now();
      if (now - lastPriceUpdate > 500) {
        lastPriceUpdate = now;
        updatePriceDisplay(candle.close, currentPairForLabel);
      }
    } catch {}
  };

  ws.onerror = () => {
    console.warn('Bybit WS failed too');
  };
}

function startSimulatedStream() {
  // No real-time data available — fake small drifts so the chart isn't totally static
  console.warn('Running simulated price drift (no exchange reachable)');
  const base = window.__livePrice || 68000;
  let price = base;

  setInterval(() => {
    price = price * (1 + (Math.random() - 0.5) * 0.0005);
    const now = Math.floor(Date.now() / 1000);
    const bucket = Math.floor(now / 60) * 60;

    if (candleSeries) {
      candleSeries.update({
        time: bucket,
        open: price,
        high: price,
        low: price,
        close: price
      });
    }
    updatePriceDisplay(price, currentPairForLabel);
  }, 3000);
}

/* ---------------- PRICE DISPLAY ---------------- */
let currentPairForLabel = 'BTC/USDT';

function updatePriceDisplay(price, pair) {
  const priceEl = document.getElementById('pair-price');
  if (priceEl) {
    priceEl.textContent = `$${price.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    })}`;
  }
  const labelEl = document.getElementById('chart-pair-label');
  if (labelEl) labelEl.textContent = `· ${pair}`;

  window.__livePrice = price;
  window.__livePair = pair;
}

/* ---------------- PUBLIC API ---------------- */
window.initTradeChart = async function (pair) {
  currentPairForLabel = pair;
  initCandleChart();
  await loadHistoricalCandles(pair);
  await startLiveStream(pair);
};

window.switchTradePair = async function (pair) {
  currentPairForLabel = pair;
  if (!candleChart) {
    await window.initTradeChart(pair);
    return;
  }
  await loadHistoricalCandles(pair);
  await startLiveStream(pair);
};