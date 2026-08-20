/* ============================================================
   ICT / SMC ZONE DETECTOR — "Alchemist" methodology
   ------------------------------------------------------------
   Detects structural price zones from real OHLC candle data:
   swing highs/lows, equal highs/lows (liquidity pools), fair
   value gaps, order blocks, dealing range (premium/discount),
   and resistance↔support flips (RBS/SBR).

   This module deliberately does NOT output a trade verdict, a
   single entry price, a stop loss, a take profit, or a
   confidence percentage. It reports which named criteria it
   found and where (an area, not a price) — the trading
   decision stays with whoever reads it.

   Candle source — two options, both real, neither random:
     1) Live ticks are aggregated into OHLC candles as they
        arrive, via onTick(). Works immediately with zero setup,
        but has no history from before the page was opened, so
        scans will report "not enough data yet" until enough
        candles have formed.
     2) If you set a real TwelveData API key below, backfill()
        pulls real historical candles once per symbol/timeframe
        so scans are meaningful right away. Leave it as 'demo'
        to skip this and rely on live aggregation only.
   ============================================================ */
(function (global) {
  'use strict';

  // Set a real TwelveData API key here to enable historical backfill.
  // https://twelvedata.com/pricing — the free tier includes time_series.
  // 'demo' only works for TwelveData's own demo symbols, not XAUUSD/forex,
  // so scans will rely on live-aggregated candles until you set a real key.
  const TD_HISTORY_KEY = 'demo';

  const TF_MINUTES = { '1': 1, '5': 5, '15': 15, '30': 30, '60': 60, '240': 240, 'D': 1440, 'W': 10080 };
  const MAX_CANDLES = 300;
  const MIN_CANDLES_TO_SCAN = 15;

  // symbol -> tfKey -> { candles:[...closed], current:{...forming}, tfMin }
  const store = {};

  function tfKey(tf) { return String(tf); }

  function bucketStart(ts, tfMin) {
    const ms = tfMin * 60000;
    return Math.floor(ts / ms) * ms;
  }

  function ensureSeries(symbol, tf) {
    const tfMin = TF_MINUTES[tfKey(tf)] || 5;
    store[symbol] = store[symbol] || {};
    store[symbol][tfKey(tf)] = store[symbol][tfKey(tf)] || { candles: [], current: null, tfMin };
    return store[symbol][tfKey(tf)];
  }

  /** Feed one live price tick into every timeframe bucket tracked for this symbol. */
  function onTick(symbol, price, ts) {
    if (!symbol || !isFinite(price)) return;
    ts = ts || Date.now();
    Object.keys(TF_MINUTES).forEach(tf => {
      const series = ensureSeries(symbol, tf);
      const start = bucketStart(ts, series.tfMin);
      if (!series.current || series.current.time !== start) {
        if (series.current) {
          series.candles.push(series.current);
          if (series.candles.length > MAX_CANDLES) series.candles.shift();
        }
        series.current = { time: start, open: price, high: price, low: price, close: price };
      } else {
        series.current.high = Math.max(series.current.high, price);
        series.current.low = Math.min(series.current.low, price);
        series.current.close = price;
      }
    });
  }

  /** Closed candles plus the still-forming one, oldest first. */
  function getCandles(symbol, tf) {
    const series = ensureSeries(symbol, tf);
    return series.current ? series.candles.concat([series.current]) : series.candles.slice();
  }

  /** One-time historical backfill via TwelveData REST time_series. No-op without a real key. */
  async function backfill(symbol, tf, tvInterval) {
    if (!TD_HISTORY_KEY || TD_HISTORY_KEY === 'demo') return false;
    try {
      const tdSymbol = symbol.length === 6 ? symbol.slice(0, 3) + '/' + symbol.slice(3) : symbol;
      const url = `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(tdSymbol)}&interval=${encodeURIComponent(tvInterval)}&outputsize=200&apikey=${TD_HISTORY_KEY}`;
      const res = await fetch(url);
      const data = await res.json();
      if (!data || !data.values) { console.warn('[ICTZones] backfill: no values in response', data); return false; }
      const series = ensureSeries(symbol, tf);
      series.candles = data.values.slice().reverse().map(v => ({
        time: new Date(v.datetime).getTime(),
        open: parseFloat(v.open), high: parseFloat(v.high),
        low: parseFloat(v.low), close: parseFloat(v.close)
      })).filter(c => isFinite(c.open) && isFinite(c.high) && isFinite(c.low) && isFinite(c.close));
      return series.candles.length > 0;
    } catch (e) {
      console.warn('[ICTZones] backfill failed, falling back to live-aggregated candles only:', e);
      return false;
    }
  }

  /* ---------------- Detectors (all operate on a plain OHLC array) ---------------- */

  // Swing high/low: a candle whose high/low is the most extreme among
  // `arm` candles on both sides of it.
  function findSwings(candles, arm) {
    arm = arm || 2;
    const swings = [];
    for (let i = arm; i < candles.length - arm; i++) {
      const c = candles[i];
      let isHigh = true, isLow = true;
      for (let j = i - arm; j <= i + arm; j++) {
        if (j === i) continue;
        if (candles[j].high >= c.high) isHigh = false;
        if (candles[j].low <= c.low) isLow = false;
      }
      if (isHigh) swings.push({ index: i, time: c.time, price: c.high, type: 'high' });
      if (isLow) swings.push({ index: i, time: c.time, price: c.low, type: 'low' });
    }
    return swings;
  }

  // EQH / EQL: clusters of 2+ swing points within `tolerance` price of each
  // other — the liquidity pools the Alchemist ebook describes as BSL/SSL.
  function findEqualLevels(swings, tolerance) {
    const out = [];
    ['high', 'low'].forEach(kind => {
      const pts = swings.filter(s => s.type === kind).sort((a, b) => a.price - b.price);
      let cluster = [];
      pts.forEach(p => {
        if (cluster.length && Math.abs(p.price - cluster[cluster.length - 1].price) > tolerance) {
          if (cluster.length >= 2) out.push(cluster);
          cluster = [];
        }
        cluster.push(p);
      });
      if (cluster.length >= 2) out.push(cluster);
    });
    return out.map(c => ({
      type: c[0].type === 'high' ? 'EQH' : 'EQL',
      price: c.reduce((s, x) => s + x.price, 0) / c.length,
      touches: c.length,
      lastIndex: Math.max.apply(null, c.map(x => x.index))
    }));
  }

  // Fair Value Gap: 3-candle imbalance where candle[i-1]'s wick doesn't
  // overlap candle[i+1]'s wick. Filled gaps (price already traded back
  // through) are dropped — only open imbalances are returned.
  function findFVGs(candles) {
    const gaps = [];
    for (let i = 1; i < candles.length - 1; i++) {
      const a = candles[i - 1], b = candles[i + 1];
      if (a.high < b.low) gaps.push({ type: 'bullish', low: a.high, high: b.low, index: i, time: candles[i].time });
      else if (a.low > b.high) gaps.push({ type: 'bearish', low: b.high, high: a.low, index: i, time: candles[i].time });
    }
    gaps.forEach(g => {
      g.filled = false;
      for (let k = g.index + 2; k < candles.length; k++) {
        if (candles[k].low <= g.high && candles[k].high >= g.low) { g.filled = true; break; }
      }
    });
    return gaps.filter(g => !g.filled);
  }

  // Order Block: the last opposite-colour candle immediately before a
  // displacement candle (range > displacementMult × the recent average
  // range). Mitigated blocks (price already came back through) are dropped.
  function findOrderBlocks(candles, displacementMult) {
    displacementMult = displacementMult || 1.5;
    if (candles.length < 10) return [];
    const ranges = candles.map(c => c.high - c.low);
    const avgRange = ranges.reduce((a, b) => a + b, 0) / ranges.length;
    const blocks = [];
    for (let i = 1; i < candles.length; i++) {
      const c = candles[i];
      const displaced = (c.high - c.low) > avgRange * displacementMult;
      if (!displaced) continue;
      const ob = candles[i - 1];
      if (c.close > c.open && ob.close < ob.open) {
        blocks.push({ type: 'bullish', low: ob.low, high: ob.high, index: i - 1, time: ob.time });
      } else if (c.close < c.open && ob.close > ob.open) {
        blocks.push({ type: 'bearish', low: ob.low, high: ob.high, index: i - 1, time: ob.time });
      }
    }
    blocks.forEach(b => {
      b.mitigated = false;
      for (let k = b.index + 2; k < candles.length; k++) {
        if (candles[k].low <= b.high && candles[k].high >= b.low) { b.mitigated = true; break; }
      }
    });
    return blocks.filter(b => !b.mitigated);
  }

  // Dealing range: high/low/midpoint over the recent lookback window.
  // Above the midpoint = premium (the ebook's sell-leaning zone), below = discount.
  function getDealingRange(candles, lookback) {
    lookback = lookback || 60;
    const recent = candles.slice(-lookback);
    if (!recent.length) return null;
    const high = Math.max.apply(null, recent.map(c => c.high));
    const low = Math.min.apply(null, recent.map(c => c.low));
    return { high: high, low: low, mid: (high + low) / 2 };
  }

  // RBS / SBR: a level that price closed clearly beyond, then later
  // returned to within `tolerance` of without closing back through it —
  // i.e. a break-and-retest in progress.
  function findRBSSBR(candles, levels, tolerance) {
    const flips = [];
    levels.forEach(lvl => {
      for (let i = lvl.lastIndex + 1; i < candles.length; i++) {
        const broke = lvl.type === 'EQH' ? candles[i].close > lvl.price : candles[i].close < lvl.price;
        if (!broke) continue;
        for (let k = i + 1; k < candles.length; k++) {
          const closedThrough = lvl.type === 'EQH'
            ? candles[k].close < lvl.price - tolerance
            : candles[k].close > lvl.price + tolerance;
          if (closedThrough) break;
          if (Math.abs(candles[k].close - lvl.price) <= tolerance) {
            flips.push({ type: lvl.type === 'EQH' ? 'RBS' : 'SBR', price: lvl.price, time: candles[k].time });
            break;
          }
        }
        break;
      }
    });
    return flips;
  }

  /* ---------------- Master scan ---------------- */

  /**
   * Scans the tracked candles for `symbol`/`tf` and returns zones near
   * `currentPrice`. Each zone lists exactly which named criteria matched
   * (auditable) plus a plain confluence count. It never returns a
   * direction-to-take, an entry price, a stop loss, a take profit, or a
   * manufactured confidence percentage — only what the rules found and
   * where, so the person reading it can decide for themselves.
   */
  function scanZones(symbol, tf, currentPrice, pipSize) {
    const candles = getCandles(symbol, tf);
    if (candles.length < MIN_CANDLES_TO_SCAN) {
      return { ready: false, candleCount: candles.length, zones: [], range: null };
    }

    const swings = findSwings(candles, 2);
    const eqLevels = findEqualLevels(swings, pipSize * 4);
    const fvgs = findFVGs(candles);
    const obs = findOrderBlocks(candles, 1.5);
    const range = getDealingRange(candles, 60);
    const flips = findRBSSBR(candles, eqLevels, pipSize * 4);

    const raw = [];
    obs.forEach(ob => raw.push({ side: ob.type, low: ob.low, high: ob.high, tags: ['Order Block'] }));
    fvgs.forEach(g => raw.push({ side: g.type, low: g.low, high: g.high, tags: ['Fair Value Gap'] }));

    // Merge overlapping same-side zones into one, combining their tags —
    // this is where "confluence" comes from: real overlap, not a guess.
    const merged = [];
    raw.forEach(z => {
      const hit = merged.find(m => m.side === z.side && !(z.high < m.low || z.low > m.high));
      if (hit) {
        hit.low = Math.min(hit.low, z.low);
        hit.high = Math.max(hit.high, z.high);
        z.tags.forEach(t => { if (hit.tags.indexOf(t) === -1) hit.tags.push(t); });
      } else {
        merged.push({ side: z.side, low: z.low, high: z.high, tags: z.tags.slice() });
      }
    });

    merged.forEach(z => {
      const zMid = (z.low + z.high) / 2;
      eqLevels.forEach(lvl => {
        if (z.side === 'bearish' && lvl.type === 'EQH' && Math.abs(lvl.price - z.high) <= pipSize * 8) {
          z.tags.push('Buy-side Liquidity (' + lvl.touches + '\u00d7 equal high)');
        }
        if (z.side === 'bullish' && lvl.type === 'EQL' && Math.abs(lvl.price - z.low) <= pipSize * 8) {
          z.tags.push('Sell-side Liquidity (' + lvl.touches + '\u00d7 equal low)');
        }
      });
      if (range) z.tags.push(zMid > range.mid ? 'Premium Zone' : 'Discount Zone');
      flips.forEach(f => { if (Math.abs(f.price - zMid) <= pipSize * 6) z.tags.push(f.type + ' retest'); });

      z.confluence = z.tags.length;
      z.distancePips = currentPrice != null ? Math.round(Math.abs(currentPrice - zMid) / pipSize) : null;
    });

    merged.sort((a, b) => (a.distancePips == null ? 1e9 : a.distancePips) - (b.distancePips == null ? 1e9 : b.distancePips));

    return { ready: true, candleCount: candles.length, range: range, zones: merged };
  }

  global.ICTZones = { onTick: onTick, getCandles: getCandles, backfill: backfill, scanZones: scanZones, TF_MINUTES: TF_MINUTES };

})(window);
