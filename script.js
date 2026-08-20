/* ═══════════════════════════════════════════════════════════════════
   SHELEN v13 — script.js  (Part 1 of 2)
   Precision Over Noise · MT5 Bridge Edition
   State · MT5 WebSocket Engine · Navigation · Auth · Modals · Clock
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

/* ───────────────────────────────────────────────────────────────────
   §1  STORAGE HELPER
─────────────────────────────────────────────────────────────────── */
const LS = {
  get: (k) => {
    try { return JSON.parse(localStorage.getItem(k)); } catch { return null; }
  },
  set: (k, v) => {
    try { localStorage.setItem(k, JSON.stringify(v)); } catch {}
  },
  del: (k) => {
    try { localStorage.removeItem(k); } catch {}
  }
};

/* ───────────────────────────────────────────────────────────────────
   §2  GLOBAL STATE — declared first, no hoisting tricks
─────────────────────────────────────────────────────────────────── */

// Auth
let user          = LS.get('iz_user');
let users         = LS.get('iz_users')  || [];
let activeTier    = (user && user.plan)  ? user.plan : (LS.get('iz_tier') || 'free');
let regPlanChoice = 'free';

// Trades / Journal
let trades        = LS.get('iz_trades') || [];

// Chat
let chatMsgs      = LS.get('iz_chat')   || [];
let chatReplyRef  = null;   // { id, user, text }
let voiceRecording = false;

// Trading Engine
let sigCount      = 0;
let stratRunning  = true;
let stratPaused   = false;
let stratStart    = Date.now();
let rptVal        = 1;       // risk % per trade
let curStyle      = 'scalp';
let curTF         = '5';

// Price State — populated by MT5Bridge or simulation
let priceState    = {};      // { [symId]: { bid, ask, price, prev, dir, spread } }

// Currency Strength
let csData        = {};

// Music
let musicPlaying  = false;
let musicIdx      = 0;
let musicMuted    = false;

// Photo Analysis
let _photoB64     = null;
let _photoMime    = null;

// UI Toggles
let voiceAlertOn  = true;
let kzWidgetOn    = true;
let scanlinesOn   = false;

// Active Page
let activePage    = 'home';

/* ───────────────────────────────────────────────────────────────────
   §3  CONSTANTS & DATA

   §3.1  Tier Limits
─────────────────────────────────────────────────────────────────── */
const TIER_LIMITS = {
  free:    { signals: 5,     photo: false, news: false, orderbook: false, swing: false },
  medium:  { signals: 50,    photo: true,  news: true,  orderbook: true,  swing: false },
  premium: { signals: 99999, photo: true,  news: true,  orderbook: true,  swing: true  }
};
const getTierLimits = () => TIER_LIMITS[activeTier] || TIER_LIMITS.free;

/* §3.2  Instruments */
const SYMS = [
  { id:'XAUUSD', label:'XAUUSD', sub:'Gold / USD',      tv:'OANDA:XAUUSD',   base:3320,   dp:2, pip:0.10   },
  { id:'BTCUSD', label:'BTCUSD', sub:'Bitcoin / USD',   tv:'BINANCE:BTCUSDT',base:67500,  dp:0, pip:10     },
  { id:'EURUSD', label:'EURUSD', sub:'Euro / Dollar',   tv:'OANDA:EURUSD',   base:1.0855, dp:4, pip:0.0001 },
  { id:'GBPUSD', label:'GBPUSD', sub:'Pound / Dollar',  tv:'OANDA:GBPUSD',   base:1.2700, dp:4, pip:0.0001 },
  { id:'USDJPY', label:'USDJPY', sub:'Dollar / Yen',    tv:'OANDA:USDJPY',   base:149.50, dp:2, pip:0.01   },
  { id:'GBPJPY', label:'GBPJPY', sub:'Pound / Yen',     tv:'OANDA:GBPJPY',   base:189.80, dp:2, pip:0.01   },
  { id:'AUDUSD', label:'AUDUSD', sub:'Aussie / Dollar', tv:'OANDA:AUDUSD',   base:0.6540, dp:4, pip:0.0001 },
  { id:'USDCAD', label:'USDCAD', sub:'Dollar / CAD',    tv:'OANDA:USDCAD',   base:1.3640, dp:4, pip:0.0001 },
  { id:'ETHUSD', label:'ETHUSD', sub:'Ethereum / USD',  tv:'BINANCE:ETHUSDT',base:3200,   dp:2, pip:1      },
  { id:'XAGUSD', label:'XAGUSD', sub:'Silver / USD',    tv:'OANDA:XAGUSD',   base:27.50,  dp:3, pip:0.001  },
  { id:'WTIUSD', label:'WTI OIL',sub:'Crude Oil',       tv:'TVC:USOIL',      base:81.50,  dp:2, pip:0.01   },
  { id:'NAS100', label:'NAS100', sub:'Nasdaq 100',      tv:'NASDAQ:NDX',     base:18200,  dp:0, pip:1      },
  { id:'US30',   label:'US30',   sub:'Dow Jones',       tv:'FOREXCOM:DJI',   base:39400,  dp:0, pip:1      },
];
let curSym = SYMS[0];

// Initialise priceState for all symbols
SYMS.forEach(s => {
  priceState[s.id] = { bid: s.base, ask: s.base + s.pip, price: s.base, prev: s.base, dir: 'neu', spread: s.pip };
});

/* §3.3  Currency Strength Currencies */
const CS_CURRENCIES = ['USD','EUR','GBP','JPY','AUD','CHF','CAD','NZD'];
CS_CURRENCIES.forEach(c => { csData[c] = 30 + Math.random() * 40; });

/* §3.4  Heatmap Pairs */
const HM_PAIRS = ['XAUUSD','BTCUSD','EURUSD','GBPUSD','USDJPY','ETHUSD','WTIUSD','NAS100'];

/* §3.5  Music Tracks */
const TRACKS = [
  { title:'Lo-Fi Scalp Session',      url:'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3' },
  { title:'Elektronomia — Sky High',  url:'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3' },
  { title:'TheFatRat — Windfall',     url:'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-6.mp3' },
  { title:'Jim Yosef — Firefly',      url:'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-9.mp3' },
  { title:'Tobu — Candyland',         url:'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-12.mp3' },
  { title:'Different Heaven — OMG',   url:'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3' },
];

/* §3.6  Chat Emojis */
const EMOJIS = ['🔥','📈','📉','💰','🎯','⚡','💎','🚀','🏆','💪','📊','🌙','⭐','🎉','😤','🤑','💹','✅','⚠️','🛑'];

/* §3.7  Preloaded Chat Messages */
const CHAT_PRELOADED = [
  { id:'p1', user:'AlphaTrader',  avatar:'AP', time:'09:15', msg:'XAUUSD BUY LIMIT aktif di 3318. OCL HTF + FVG confluence keren banget 🔥', color:'var(--gold2)' },
  { id:'p2', user:'QuantMaster',  avatar:'QM', time:'09:32', msg:'Setuju! Killzone London baru buka. AMD phase manipulation udah selesai 📈', color:'var(--cyan)' },
  { id:'p3', user:'NizarAdmin',   avatar:'NN', time:'09:45', msg:'📢 Signal Premium: XAUUSD BUY LIMIT 3315-3320. SL 3305. TP1:3340 TP2:3365. R:R 1:5 🎯', color:'var(--green)' },
  { id:'p4', user:'ForexKing',    avatar:'FK', time:'10:02', msg:'EURUSD setup bagus. SBR level di 1.0870 udah di-test 3×. Potential breakdown 📉', color:'var(--blue)' },
  { id:'p5', user:'AlphaTrader',  avatar:'AP', time:'10:18', msg:'Update: TP1 XAUUSD tercapai +$180 profit. Moving SL to breakeven 💰', color:'var(--gold2)' },
];

/* §3.8  Flash News Items */
const FLASH_ITEMS = [
  '📊 XAUUSD AMD Cycle Active — London KZ 03:00 UTC',
  '⚡ NFP Blowout 287K → DXY spike — GOLD retraces ke $3,290 OB',
  '🤖 ALCHEMIST SIGNAL: BUY LIMIT XAUUSD @ 3285 · SL 3270 · TP 3350',
  '📰 ECB holds rates — EUR/USD SBR level breakout ke 1.0920',
  '⚠️ FOMC Minutes 14:00 UTC — volatility expected HIGH',
  '🚀 BTC ETF inflow $680M satu hari — BSL zone $70,200 diincar',
  '🏆 R:R MINIMUM 1:5 setiap trade — SHELEN Rule #1',
  '📈 Nasdaq targets 20,000 — AI mega-cap earnings season crushes estimates',
];

/* §3.9  News Data */
const NEWS_DATA = [
  { cat:'macro',     impact:'high', hl:'Federal Reserve Signals Rate Cut Window Q2 Amid Cooling Inflation at 2.8%',         sum:'Fed Chair Powell struck an optimistic tone. Markets priced in 78% probability of a 25bp cut at June FOMC, driving Treasury yields lower and gold to fresh highs.',                                 src:'Reuters',   time:'14:32' },
  { cat:'fx',        impact:'high', hl:'EUR/USD Breaks Above 1.09 Handle as German PMI Smashes 52.3 Estimate',               sum:'The euro surged to a 3-month high after Eurozone flash manufacturing PMI surprised sharply. ECB hawks pushed back rate cut expectations significantly.',                                       src:'Bloomberg', time:'13:15' },
  { cat:'crypto',    impact:'high', hl:'Bitcoin Tests $70K Resistance as BlackRock IBIT Records $680M Single-Day Inflow',    sum:'Institutional demand exploded with total spot Bitcoin ETF inflows reaching $1.2B in one session. The $69,400–$70,200 zone is identified as critical BSL.',                                   src:'CoinDesk',  time:'12:48' },
  { cat:'commodity', impact:'high', hl:'Gold Pulls Back from $3,420 ATH on NFP Blowout 287K — Bulls Eye $3,500 Next Target', sum:'XAU/USD retraced sharply after NFP shocked at 287K vs 200K forecast, boosting DXY. Structural bull trend intact with HTF OCL support at $3,280 acting as floor.',                          src:'Reuters',   time:'12:05' },
  { cat:'equity',    impact:'med',  hl:'Nasdaq Targets 20,000 as AI Mega-Cap Earnings Beat Consensus by 35%',                sum:'Technology giants delivered exceptional Q1 results with NVDA guiding $28B quarterly revenue. AI infrastructure CapEx continues to surprise to the upside.',                                   src:'WSJ',       time:'11:30' },
  { cat:'macro',     impact:'low',  hl:'Bank of Japan Signals Further Normalization as Wage Growth Accelerates to 3.2%',     sum:'BOJ minutes revealed growing policymaker comfort with continued tightening. Sustained wage growth above 3% seen as sufficient for gradual policy normalization.',                            src:'Nikkei',    time:'10:55' },
  { cat:'fx',        impact:'med',  hl:'GBP/USD Holds 1.27 After UK CPI Inline at 2.6%; BOE First Cut Pushed to August',    sum:'Sterling showed resilience after the UK inflation print. PDH resistance at 1.2745 remains key — clean break signals next leg to 1.2900.',                                                src:'FT',        time:'10:20' },
  { cat:'commodity', impact:'high', hl:'WTI Crude Surges 3.2% as OPEC+ Extends 1.66M BPD Cut Through September',            sum:'Saudi Arabia and Russia jointly announced extension of voluntary output cuts. The surprise caught short sellers in a brutal squeeze, triggering the largest single-day move in weeks.',      src:'Reuters',   time:'09:10' },
];

/* §3.10  Economic Calendar Data */
const ECO_DATA = [
  { t:'08:30', f:'🇺🇸', n:'Non-Farm Payrolls',    p:'203K',  e:'215K',  a:'287K',   up:true,  im:'high' },
  { t:'08:30', f:'🇺🇸', n:'Unemployment Rate',     p:'3.7%',  e:'3.7%',  a:'3.6%',   up:true,  im:'high' },
  { t:'10:00', f:'🇺🇸', n:'ISM Manufacturing PMI', p:'47.8',  e:'48.5',  a:'49.2',   up:true,  im:'med'  },
  { t:'11:00', f:'🇪🇺', n:'ECB Interest Rate',     p:'4.50%', e:'4.50%', a:'4.50%',  up:false, im:'high' },
  { t:'12:30', f:'🇬🇧', n:'UK CPI YoY',            p:'3.2%',  e:'2.8%',  a:'2.6%',   up:false, im:'med'  },
  { t:'14:00', f:'🇺🇸', n:'FOMC Meeting Minutes',  p:'—',     e:'—',     a:'⏳',     up:false, im:'high' },
  { t:'15:30', f:'🇯🇵', n:'BOJ Policy Rate',       p:'-0.1%', e:'0.1%',  a:'⏳',     up:false, im:'high' },
  { t:'17:00', f:'🇺🇸', n:'Crude Oil Inventories', p:'-3.2M', e:'-1.5M', a:'⏳',     up:false, im:'med'  },
];

/* §3.11  Sentiment Data */
const SENT_DATA = [
  { n:'GOLD (XAU)', b:74 }, { n:'BITCOIN',   b:68 }, { n:'EUR/USD', b:46 },
  { n:'US30',       b:60 }, { n:'GBP/USD',   b:55 }, { n:'USD/JPY', b:38 },
  { n:'ETHEREUM',   b:62 }, { n:'WTI OIL',   b:52 },
];


/* ═══════════════════════════════════════════════════════════════════
   §4  MT5 WEBSOCKET BRIDGE ENGINE
   Zero-latency, auto-reconnecting WebSocket to MT5 EA server
   Handles: TickData · AccountState · Positions · Ping/Pong
   ═══════════════════════════════════════════════════════════════════ */
const MT5Bridge = (() => {

  /* Private state */
  let _ws            = null;
  let _url           = LS.get('shelen_mt5_url') || 'ws://localhost:8080';
  let _connected     = false;
  let _simMode       = false;
  let _simTimer      = null;
  let _reconnTimer   = null;
  let _pingTimer     = null;
  let _reconnAttempt = 0;
  let _maxReconn     = 8;
  let _latencyMs     = 0;
  let _pingTs        = 0;

  /* ── Public API ── */
  const api = {

    get connected() { return _connected; },
    get url()       { return _url; },

    /* Connect to MT5 Bridge EA WebSocket server */
    connect(customUrl) {
      if (customUrl) {
        _url = customUrl.trim();
        LS.set('shelen_mt5_url', _url);
      }
      _stopSim();
      _clearReconn();
      _clearPing();
      if (_ws) { try { _ws.close(1000, 'reconnect'); } catch {} _ws = null; }

      _setStatus('connecting', 'MENGHUBUNGKAN…', _url);
      toast('Menghubungkan ke MT5 Bridge…', 'warn');

      try {
        _ws = new WebSocket(_url);
      } catch (e) {
        _setStatus('disconnected', 'URL TIDAK VALID', e.message);
        _startSim();
        return;
      }

      _ws.onopen = () => {
        _connected     = true;
        _simMode       = false;
        _reconnAttempt = 0;
        _setStatus('live', 'LIVE · ' + _url, 'MT5 BRIDGE TERHUBUNG ✓');
        toast('✅ MT5 Bridge terhubung — harga live dari akun MT5!');
        addLog('sys', '[MT5] Connected: ' + _url);
        _startPing();
        // Ask EA to stream all subscribed symbols
        _send({ action: 'subscribe', symbols: SYMS.map(s => s.id) });
      };

      _ws.onmessage = (ev) => {
        try { _handleMsg(JSON.parse(ev.data)); } catch {}
      };

      _ws.onclose = (ev) => {
        _connected = false;
        _clearPing();
        if (ev.code === 1000) {
          // Intentional close — go to sim
          _setStatus('disconnected', 'DISCONNECTED', 'Manual disconnect');
          _startSim();
          return;
        }
        _reconnAttempt++;
        if (_reconnAttempt <= _maxReconn) {
          const delay = Math.min(2000 * _reconnAttempt, 20000);
          _setStatus('connecting', 'RECONNECT #' + _reconnAttempt + '/' + _maxReconn, 'Retry in ' + (delay/1000).toFixed(0) + 's…');
          _reconnTimer = setTimeout(() => api.connect(), delay);
        } else {
          _setStatus('disconnected', 'RECONNECT GAGAL', 'Beralih ke mode simulasi');
          toast('MT5 Bridge gagal — menggunakan simulasi harga', 'warn');
          _startSim();
          _reconnAttempt = 0;
        }
      };

      _ws.onerror = () => {
        /* onerror always fires before onclose — just let onclose handle it */
      };
    },

    disconnect() {
      _maxReconn = 0;  // prevent auto-reconnect
      _clearReconn();
      _clearPing();
      if (_ws) { try { _ws.close(1000, 'user_disconnect'); } catch {} _ws = null; }
      _connected = false;
      _setStatus('disconnected', 'DISCONNECTED', 'Manual disconnect');
      _startSim();
      toast('MT5 Bridge disconnected');
      addLog('warn', '[MT5] Disconnected by user');
      _maxReconn = 8;  // restore for future connect
    },

    reconnect() {
      _reconnAttempt = 0;
      _maxReconn     = 8;
      api.connect();
    },

    /* Called from Home page quick-connect field */
    connectFromHome() {
      const inp = document.getElementById('homeMT5UrlInput');
      const url = inp ? inp.value.trim() : 'ws://localhost:8080';
      api.connect(url);
      // Sync modal input
      const modalInp = document.getElementById('mt5UrlInput');
      if (modalInp) modalInp.value = url;
    }
  };

  /* ── Private helpers ── */

  function _send(obj) {
    if (_ws && _ws.readyState === WebSocket.OPEN) {
      try { _ws.send(JSON.stringify(obj)); } catch {}
    }
  }

  function _startPing() {
    _clearPing();
    _pingTimer = setInterval(() => {
      _pingTs = Date.now();
      _send({ type: 'ping', ts: _pingTs });
    }, 10000);
  }

  function _clearPing() {
    if (_pingTimer) { clearInterval(_pingTimer); _pingTimer = null; }
  }

  function _clearReconn() {
    if (_reconnTimer) { clearTimeout(_reconnTimer); _reconnTimer = null; }
  }

  /* Dispatch incoming messages from EA */
  function _handleMsg(data) {
    if (!data || !data.type) return;
    switch (data.type) {
      case 'tick':      _processTick(data);      break;
      case 'account':   _processAccount(data);   break;
      case 'positions': _processPositions(data); break;
      case 'pong':      _processPong(data);       break;
      case 'error':     addLog('warn', '[MT5] Error: ' + (data.msg || JSON.stringify(data))); break;
      default:
        // Legacy flat format: {symbol, bid, ask}
        if (data.symbol && data.bid !== undefined) _processTick(data);
    }
  }

  /* ── Tick Data Handler ── */
  function _processTick(d) {
    const id  = d.symbol;
    if (!id) return;
    const sym = SYMS.find(s => s.id === id);
    const dp  = sym ? sym.dp : 2;
    const bid = parseFloat(d.bid) || 0;
    const ask = parseFloat(d.ask) || bid + (sym ? sym.pip : 0.01);
    const mid = (bid + ask) / 2;
    const prev = priceState[id] ? priceState[id].price : mid;

    priceState[id] = {
      bid,
      ask,
      price:  parseFloat(mid.toFixed(dp)),
      prev,
      dir:    mid > prev + 1e-10 ? 'up' : mid < prev - 1e-10 ? 'dn' : 'neu',
      spread: parseFloat((ask - bid).toFixed(dp)),
      live:   true,
      ts:     Date.now()
    };

    if (window.ICTZones) window.ICTZones.onTick(id, mid, Date.now());

    _refreshPriceUI(id);
  }

  /* ── Account State Handler ── */
  function _processAccount(d) {
    const bal  = parseFloat(d.balance)    || 0;
    const eq   = parseFloat(d.equity)     || 0;
    const mar  = parseFloat(d.margin)     || 0;
    const free = parseFloat(d.freeMargin) || (eq - mar);
    const dd   = parseFloat(d.drawdown)   || ((bal - eq) / bal * 100);
    const prof = parseFloat(d.profit)     || (eq - bal);

    const fmt = n => '$' + n.toLocaleString('en-US', { minimumFractionDigits:2, maximumFractionDigits:2 });

    _setText('mt5Balance',    fmt(bal));
    _setText('mt5Equity',     fmt(eq));
    _setText('mt5Margin',     fmt(mar));
    _setText('mt5FreeMargin', fmt(free));
    _setText('mt5Drawdown',   dd.toFixed(2) + '%');
    _setText('mt5Profit',     (prof >= 0 ? '+' : '') + fmt(prof));

    // Colour equity
    const eqEl = document.getElementById('mt5Equity');
    if (eqEl) eqEl.className = 'mt5-acc-value ' + (eq >= bal ? 'mt5-acc-value--positive' : 'mt5-acc-value--danger');

    // Sync risk calculator with live balance
    const eqInp = document.getElementById('eqInp');
    if (eqInp && bal > 0) { eqInp.value = bal.toFixed(2); calcLot(); }

    // Update risk panel note
    _setText('riskMT5Note', 'MT5 LIVE · ' + (d.broker || '') + (d.account ? ' #' + d.account : ''));

    addLog('sys', '[MT5] Account: bal=' + fmt(bal) + ' eq=' + fmt(eq) + ' dd=' + dd.toFixed(1) + '%');
  }

  /* ── Open Positions Handler ── */
  function _processPositions(d) {
    const positions = d.data || [];
    const listEl    = document.getElementById('mt5PositionsList');
    const rowsEl    = document.getElementById('mt5PosRows');
    const cntEl     = document.getElementById('mt5PosCount');
    if (!listEl || !rowsEl) return;

    if (!positions.length) {
      listEl.hidden = true;
      return;
    }
    listEl.hidden = false;
    if (cntEl) cntEl.textContent = positions.length + ' OPEN';

    rowsEl.innerHTML = positions.map(p => {
      const profit = parseFloat(p.profit) || 0;
      return `<div class="mt5-pos-row">
        <span class="mt5-pos-symbol">${p.symbol}</span>
        <span class="mt5-pos-type ${p.type}">${p.type.toUpperCase()} ${p.volume}</span>
        <span class="cs">${p.openPrice || '—'}</span>
        <span class="mt5-pos-profit ${profit >= 0 ? 'pos' : 'neg'}">${profit >= 0 ? '+' : ''}$${profit.toFixed(2)}</span>
      </div>`;
    }).join('');
  }

  /* ── Pong Handler ── */
  function _processPong(d) {
    _latencyMs = Date.now() - _pingTs;
    const el = document.getElementById('mt5Latency');
    if (el) el.textContent = _latencyMs + 'ms';
    const mel = document.getElementById('mt5ModalLatency');
    if (mel) mel.textContent = _latencyMs + 'ms';
  }

  /* ── Status Updater — syncs all MT5 status elements ── */
  function _setStatus(state, mainTxt, subTxt) {
    // state: 'live' | 'connecting' | 'disconnected'
    const dots  = ['mt5StatusDot', 'tbMT5Dot', 'mt5ModalDot'];
    dots.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.dataset.state = state;
    });

    // Main panel text
    _setText('mt5StatusText',       mainTxt);
    _setText('mt5ModalStatusTxt',   mainTxt);
    _setText('homeMT5Status',       state === 'live' ? 'LIVE' : state === 'connecting' ? 'MENGHUBUNGKAN…' : 'TIDAK TERHUBUNG');
    _setText('settMT5Status',       state.toUpperCase());
    _setText('settMT5URL',          _url);

    // Topbar label
    const tbLbl = document.getElementById('tbMT5Label');
    if (tbLbl) tbLbl.textContent = state === 'live' ? 'LIVE' : state === 'connecting' ? '…' : 'MT5';

    // Bridge modal sub-info
    if (subTxt) _setText('mt5BridgeInfo', subTxt);

    // Ticker mode label
    const modeEl = document.getElementById('mt5ModeTxt');
    if (modeEl) modeEl.textContent = state === 'live' ? 'MODE: MT5 LIVE' : state === 'connecting' ? 'MODE: CONNECTING' : 'MODE: SIMULASI';
  }

  /* ── Price Simulation (fallback when bridge unavailable) ── */
  function _startSim() {
    if (_simMode) return;
    _simMode = true;
    _stopSim();
    _setStatus('disconnected', 'MT5 OFFLINE — SIMULASI AKTIF', 'Harga disimulasikan secara lokal');
    _simTimer = setInterval(() => {
      SYMS.forEach(s => {
        const st   = priceState[s.id];
        const vol  = s.base * 0.0007;
        const raw  = st.price + (Math.random() - 0.499) * vol * 2;
        const mid  = parseFloat(Math.max(s.base * 0.85, raw).toFixed(s.dp));
        const bid  = parseFloat((mid - s.pip * 0.5).toFixed(s.dp));
        const ask  = parseFloat((mid + s.pip * 0.5).toFixed(s.dp));
        priceState[s.id] = {
          bid, ask,
          price:  mid,
          prev:   st.price,
          dir:    mid > st.price ? 'up' : mid < st.price ? 'dn' : 'neu',
          spread: s.pip,
          live:   false,
          ts:     Date.now()
        };
        _refreshPriceUI(s.id);
      });
    }, 1400);
  }

  function _stopSim() {
    if (_simTimer) { clearInterval(_simTimer); _simTimer = null; }
    _simMode = false;
  }

  /* ── DOM helpers ── */
  function _setText(id, txt) {
    const el = document.getElementById(id);
    if (el) el.textContent = txt;
  }

  function _refreshPriceUI(symId) {
    const st  = priceState[symId];
    const sym = SYMS.find(s => s.id === symId);
    if (!st || !sym) return;
    const dp  = sym.dp;
    const fmt = n => n.toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp });
    const px  = fmt(st.price);

    // Topbar strip
    const tbEl = document.getElementById('tbpx-' + symId);
    if (tbEl) { tbEl.textContent = px; tbEl.className = 'tb-price-val ' + st.dir; }

    // Symbol modal live prices
    const spEl = document.getElementById('sp-' + symId);
    if (spEl) {
      spEl.textContent = px;
      spEl.className   = 'sym-opt-price ' + st.dir;
    }

    // Ticker bar (DOM update via buildTicker interval)
    // Orderbook: only refresh for currently selected symbol
    if (symId === curSym.id) _updateOBFromPrice(st);
  }

  function _updateOBFromPrice(st) {
    // Lightweight OB refresh driven by real spread
    updateOBWith(st.price, st.spread);
  }

  return api;
})();


/* ═══════════════════════════════════════════════════════════════════
   §5  UTILITY FUNCTIONS
   ═══════════════════════════════════════════════════════════════════ */

/** getElementById shorthand */
const $ = id => document.getElementById(id);

/** Set element text + optional colour */
function setEl(id, txt, color) {
  const el = $(id);
  if (!el) return;
  el.textContent = txt;
  if (color !== undefined) el.style.color = color;
}

/** Toast notification — type: '' | 'warn' | 'err' */
function toast(msg, type) {
  const t = $('toast');
  if (!t) return;
  t.textContent = msg;
  t.className   = 'toast show' + (type === 'warn' ? ' warn' : type === 'err' ? ' err' : '');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => { t.className = 'toast'; }, 3400);
}

/** Append a line to the Execution Log */
function addLog(type, msg) {
  const el = $('logBody');
  if (!el) return;
  const ts  = new Date().toISOString().substr(11, 8);
  const div = document.createElement('div');
  div.className = 'll ' + (type || 'sys');
  div.innerHTML = `<span class="ts">${ts}</span><span class="msg">${escHtml(msg)}</span>`;
  el.appendChild(div);
  // Keep last 80 lines
  while (el.children.length > 80) el.removeChild(el.firstChild);
  el.scrollTop = el.scrollHeight;
}

function clearLog() { const el = $('logBody'); if (el) el.innerHTML = ''; toast('Log cleared'); }

/** HTML-escape for safe innerHTML use */
function escHtml(s) {
  return String(s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

/** Format price to symbol decimal places */
function fmtPrice(symId, price) {
  const sym = SYMS.find(s => s.id === symId);
  const dp  = sym ? sym.dp : 2;
  return price.toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp });
}


/* ═══════════════════════════════════════════════════════════════════
   §6  CLOCK & KILLZONE ENGINE
   ═══════════════════════════════════════════════════════════════════ */
function updateClock() {
  const now  = new Date();
  const utcH = now.getUTCHours();
  const utcM = now.getUTCMinutes();
  const utcS = now.getUTCSeconds();
  const pad  = n => String(n).padStart(2, '0');
  const MONTHS = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];

  setEl('tbClockTime', `${pad(utcH)}:${pad(utcM)}:${pad(utcS)}`);
  setEl('tbClockDate', `${now.getUTCDate()} ${MONTHS[now.getUTCMonth()]} UTC`);

  // News page clock
  const nc = $('newsClock');
  if (nc) nc.textContent = `${pad(utcH)}:${pad(utcM)} UTC`;

  // Killzone & session
  _updateKillzone(utcH, utcM, utcS);
}

const KZ_SESSIONS = [
  { label: '🔥 LONDON KZ',   h0:  3, m0:  0, h1:  5, m1:  0, color: 'var(--gold2)', isKZ: true  },
  { label: 'LONDON SESSION', h0:  5, m0:  0, h1: 12, m1:  0, color: 'var(--gold2)', isKZ: false },
  { label: 'NY PRE-MARKET',  h0: 12, m0:  0, h1: 13, m1: 30, color: 'var(--cyan)',  isKZ: false },
  { label: '⚡ NY KZ',        h0: 13, m0: 30, h1: 16, m1:  0, color: 'var(--cyan)',  isKZ: true  },
  { label: 'NY SESSION',     h0: 16, m0:  0, h1: 21, m1:  0, color: 'var(--cyan)',  isKZ: false },
  { label: 'ASIA SESSION',   h0: 23, m0:  0, h1: 27, m1:  0, color: 'var(--txt3)', isKZ: false },
];

function _updateKillzone(h, m, s) {
  const kzEl   = $('kzWidget');
  const timeEl = $('kzTime');
  const sesEl  = $('kzSession');
  const dotEl  = $('kzDot');
  if (!kzEl || !kzVisible()) return;

  const totMin  = h * 60 + m;
  const pad     = n => String(n).padStart(2, '0');
  const timeStr = `${pad(h)}:${pad(m)}:${pad(s)}`;

  let matched = { label: 'ASIA SESSION', color: 'var(--txt3)', isKZ: false };
  for (const sess of KZ_SESSIONS) {
    const from = sess.h0 * 60 + sess.m0;
    const to   = sess.h1 * 60 + sess.m1;
    if (totMin >= from && totMin < to) { matched = sess; break; }
  }

  if (timeEl)  { timeEl.textContent = timeStr; timeEl.style.color  = matched.color; }
  if (sesEl)   { sesEl.textContent  = matched.label; sesEl.style.color = matched.color; }
  if (dotEl)   dotEl.style.background = matched.color;
  kzEl.classList.toggle('kz-pulse', matched.isKZ);
}

function kzVisible() { return kzWidgetOn; }


/* ═══════════════════════════════════════════════════════════════════
   §7  PAGE NAVIGATION
   ═══════════════════════════════════════════════════════════════════ */

/** Pages that require login */
const AUTH_PAGES  = new Set(['terminal','news','journal','chat']);
/** Pages that require Medium+ plan */
const MEDIUM_PAGES = new Set(['news']);

function goPage(name) {
  // Auth gate
  if (AUTH_PAGES.has(name) && !user) {
    toast('Login dulu untuk akses ini 🔒', 'warn');
    setTimeout(openAuth, 350);
    return;
  }

  // Hide all pages (set display:none via removing active + hidden)
  document.querySelectorAll('.page').forEach(p => {
    p.classList.remove('active');
    p.hidden = true;
  });

  // Show target page
  const pg = $('pg-' + name);
  if (!pg) return;
  pg.hidden = false;
  pg.classList.add('active');
  pg.scrollTop = 0;   // reset scroll on every page switch
  activePage = name;

  // Update bottom nav
  document.querySelectorAll('.bn').forEach(b => b.classList.remove('bn--active', 'on'));
  const bnEl = $('bn-' + name);
  if (bnEl) bnEl.classList.add('bn--active', 'on');

  // Ticker bar — show only on terminal + news
  const tb = $('tickerBar');
  if (tb) tb.hidden = !(name === 'terminal' || name === 'news');

  // Killzone widget — show only in terminal
  const kz = $('kzWidget');
  if (kz) kz.hidden = (name !== 'terminal');

  // Page-specific setup
  switch (name) {
    case 'terminal': _setupTerminalPage(); break;
    case 'news':     _setupNewsPage();     break;
    case 'journal':  _setupJournalPage();  break;
    case 'chat':     _setupChatPage();     break;
    case 'hub':      _setupHubPage();      break;
    case 'pricing':  _applyTierUI();       break;
  }
}

/* Page setup helpers */
function _setupTerminalPage() {
  _unlockPage('terminal', 'tc-content');
  if (!user) return;
  loadChart();
  updateMetrics();
  updateCS();
  _updateOBFromState();
}

function _setupNewsPage() {
  const lim = getTierLimits();
  if (!lim.news) {
    _lockPage('news', 'nc-content');
    return;
  }
  _unlockPage('news', 'nc-content');
  renderNews('all');
  renderEco();
  renderSentiment();
}

function _setupJournalPage() {
  _unlockPage('journal', 'jc-content');
  if (!user) return;
  renderJournalStats();
}

function _setupChatPage() {
  _unlockPage('chat', 'cc-content');
  if (!user) return;
  if (!chatMsgs.length) chatMsgs = [...CHAT_PRELOADED];
  renderChat();
  setTimeout(() => {
    const msgs = $('chatMsgs');
    if (msgs) msgs.scrollTop = msgs.scrollHeight;
  }, 80);
}

function _setupHubPage() {
  // Game canvas + broker section — no auth required
}

function _unlockPage(name, contentId) {
  const lock = $('lock-' + name);
  const cont = $(contentId);
  if (!user) {
    if (lock) lock.style.display = 'flex';
    if (cont) cont.hidden = true;
    return;
  }
  if (lock) lock.style.display = 'none';
  if (cont) cont.hidden = false;
}

function _lockPage(name, contentId) {
  const lock = $('lock-' + name);
  const cont = $(contentId);
  if (lock) { lock.style.display = 'flex'; }
  if (cont) cont.hidden = true;
}

function _updateOBFromState() {
  const st = priceState[curSym.id];
  if (st) updateOBWith(st.price, st.spread);
}


/* ═══════════════════════════════════════════════════════════════════
   §8  AUTH SYSTEM
   ═══════════════════════════════════════════════════════════════════ */
function openAuth()  { _showModal('authOverlay'); }
function closeAuth() { _hideModal('authOverlay'); }

function handleUserBtn() {
  if (user) openSettingsModal();
  else      openAuth();
}

function switchAuthTab(tab) {
  const isLogin = tab === 'login';
  $('loginForm').classList.toggle('auth-form--active', isLogin);
  $('loginForm').classList.toggle('on', isLogin);
  $('regForm').classList.toggle('auth-form--active', !isLogin);
  $('regForm').classList.toggle('on', !isLogin);
  $('tabLogin').classList.toggle('auth-tab--active', isLogin);
  $('tabReg').classList.toggle('auth-tab--active', !isLogin);
  $('tabLogin').setAttribute('aria-selected', String(isLogin));
  $('tabReg').setAttribute('aria-selected', String(!isLogin));
}

function doLogin() {
  const email = ($('lEmail') || {}).value?.trim() || '';
  const pass  = ($('lPass')  || {}).value         || '';
  if (!email || !pass) { toast('Isi email dan password.', 'err'); return; }

  const found = users.find(u => u.email === email && u.pass === pass);
  if (!found) { toast('Email atau password salah.', 'err'); return; }

  _loginSuccess(found);
}

function doRegister() {
  const name  = ($('rName')  || {}).value?.trim() || '';
  const email = ($('rEmail') || {}).value?.trim() || '';
  const pass  = ($('rPass')  || {}).value         || '';

  if (!name || !email || !pass) { toast('Semua field wajib diisi.', 'err'); return; }
  if (pass.length < 6)           { toast('Password min 6 karakter.', 'err'); return; }
  if (users.find(u => u.email === email)) { toast('Email sudah terdaftar.', 'err'); return; }

  const newUser = {
    id:      'u' + Date.now(),
    name,
    email,
    pass,
    plan:    'free',      // always start free — payment via WA
    joined:  new Date().toISOString().split('T')[0]
  };
  users.push(newUser);
  LS.set('iz_users', users);
  _loginSuccess(newUser);

  // If they chose a paid plan, open payment modal after login
  if (regPlanChoice !== 'free') {
    setTimeout(() => openPayModal(regPlanChoice), 700);
  }
}

function _loginSuccess(u) {
  user = u;
  LS.set('iz_user', u);
  activeTier = u.plan || 'free';
  LS.set('iz_tier', activeTier);
  closeAuth();
  _updateUserBtn();
  _applyTierUI();
  toast('Selamat datang, ' + u.name.split(' ')[0] + '! ⚡');
  addLog('sys', 'Login: ' + u.name + ' · ' + activeTier.toUpperCase());
  goPage('terminal');
  setTimeout(() => _oracleWelcome(u.name), 600);
}

function _updateUserBtn() {
  const btn = $('userBtn');
  if (!btn) return;
  btn.textContent = user ? user.name.split(' ')[0].toUpperCase().slice(0, 9) : 'LOGIN';
  btn.onclick     = user ? openSettingsModal : openAuth;
}

function selectRegPlan(plan) {
  regPlanChoice = plan;
  ['free','medium','premium'].forEach(p => {
    const el = $('pp-' + p);
    if (!el) return;
    const on = p === plan;
    el.classList.toggle('plan-pill--active', on);
    el.setAttribute('aria-checked', String(on));
  });
}

function chooseTier(tier) {
  activeTier = tier;
  LS.set('iz_tier', tier);
  if (user) { user.plan = tier; LS.set('iz_user', user); }
  _applyTierUI();
  toast('Plan: ' + tier.toUpperCase() + ' aktif ✓');
  addLog('sys', 'Tier changed → ' + tier.toUpperCase());
}

function _applyTierUI() {
  // Show/hide tier badges on pricing cards
  ['free','medium','premium'].forEach(t => {
    const badge = $('badge-' + t);
    if (badge) badge.classList.toggle('show', activeTier === t);
  });

  // Photo drop zone note
  const lim  = getTierLimits();
  const tnEl = $('photoTierNote');
  if (tnEl) {
    tnEl.textContent = lim.photo
      ? '✓ AI Photo Analysis aktif — plan ' + activeTier.toUpperCase()
      : '🔒 Plan Medium/Premium diperlukan untuk fitur ini';
  }

  // Settings modal
  if (user) {
    setEl('settAccName', user.name.toUpperCase().slice(0, 14));
    setEl('settPlanStatus', activeTier.toUpperCase());
    setEl('settSigCount', sigCount + ' / ' + (lim.signals >= 9999 ? '∞' : lim.signals));
  }
}


/* ═══════════════════════════════════════════════════════════════════
   §9  MODAL SYSTEM
   ═══════════════════════════════════════════════════════════════════ */

/** Generic modal show/hide — uses [hidden] attribute */
function _showModal(id) {
  const el = $(id);
  if (!el) return;
  el.removeAttribute('hidden');
  el.style.display = 'flex';
  document.body.style.overflow = 'hidden';  // prevent bg scroll
}
function _hideModal(id) {
  const el = $(id);
  if (!el) return;
  el.setAttribute('hidden', '');
  el.style.display = '';
  document.body.style.overflow = '';
}

/* Tap outside sheet closes modal */
function _initModalDismiss(overlayId, closeFn) {
  const el = $(overlayId);
  if (!el) return;
  el.addEventListener('click', e => { if (e.target === el) closeFn(); });
  el.addEventListener('touchend', e => { if (e.target === el) closeFn(); }, { passive: true });
}

/* Symbol Modal */
function openSymModal() {
  const grid = $('symGrid');
  if (!grid) return;
  grid.innerHTML = SYMS.map(s => {
    const st  = priceState[s.id];
    const dp  = s.dp;
    const px  = st ? st.price.toLocaleString('en-US', { minimumFractionDigits:dp, maximumFractionDigits:dp }) : '—';
    const dir = st ? st.dir : 'neu';
    const live = st && st.live ? ' · LIVE' : '';
    return `<div class="sym-opt ${s.id === curSym.id ? 'on' : ''}" onclick="selectSym('${s.id}')" role="listitem">
      <span class="sym-opt-name">${s.label}</span>
      <span class="sym-opt-sub">${s.sub}${live}</span>
      <span class="sym-opt-price ${dir}" id="sp-${s.id}">${px}</span>
    </div>`;
  }).join('');
  _showModal('symModal');
}
function closeSymModal() { _hideModal('symModal'); }

function selectSym(id) {
  const found = SYMS.find(s => s.id === id);
  if (!found) return;
  curSym = found;
  closeSymModal();
  loadChart();
  const lbl = $('symLabel');
  if (lbl) lbl.textContent = curSym.label;
  toast('Chart: ' + curSym.label);
  addLog('sys', 'Symbol → ' + curSym.id);
}

/* MT5 Modal */
function openMT5Modal() {
  // Sync url input
  const inp = $('mt5UrlInput');
  if (inp) inp.value = MT5Bridge.url;
  // Build pair tags
  _buildMT5PairsGrid();
  _showModal('mt5Modal');
}
function closeMT5Modal() { _hideModal('mt5Modal'); }

function _buildMT5PairsGrid() {
  const grid = $('mt5PairsGrid');
  if (!grid) return;
  grid.innerHTML = SYMS.map(s =>
    `<span class="mt5-pair-tag ${MT5Bridge.connected ? '' : 'inactive'}">${s.id}</span>`
  ).join('');
}

/* Payment Modal */
const PLAN_PRICES = { free: 0, medium: 6, premium: 20 };
let   _payPlan   = 'medium';

function openPayModal(plan) {
  _payPlan = plan || 'medium';
  const price  = PLAN_PRICES[_payPlan] || 0;
  const code   = Math.floor(Math.random() * 900) + 100;  // unique 3-digit suffix
  const total  = price * 15000 + code;  // IDR (approx $1 = Rp15,000)
  const fmt    = n => 'Rp' + n.toLocaleString('id-ID');

  setEl('payPlanBadge', _payPlan === 'premium' ? '💎 PREMIUM' : '⚡ MEDIUM');
  setEl('payPlanName',  'Aktifkan akses ' + _payPlan.toUpperCase() + ' di SHELEN Terminal');
  setEl('payBaseAmt',   fmt(price * 15000));
  setEl('payCodeAmt',   '+' + fmt(code) + ' (kode unik)');
  setEl('payTotalBig',  fmt(total));

  _showModal('payModal');
}
function closePayModal() { _hideModal('payModal'); }

function doWhatsAppTransfer() {
  const price  = PLAN_PRICES[_payPlan] || 0;
  const msg    = encodeURIComponent(
    `Halo Admin SHELEN!\n\nSaya sudah transfer untuk upgrade ke plan *${_payPlan.toUpperCase()}*.\n\n` +
    `• Nama: ${user ? user.name : '—'}\n` +
    `• Email: ${user ? user.email : '—'}\n` +
    `• Plan: ${_payPlan.toUpperCase()} ($${price}/bulan)\n\n` +
    `Mohon diverifikasi dan aktifkan akun saya. Terima kasih!`
  );
  window.open('https://wa.me/6285839053130?text=' + msg, '_blank');
  closePayModal();
  toast('Menuju WhatsApp Admin… 💬');
}

/* Settings Modal */
function openSettingsModal() {
  _applyTierUI();
  // Sync toggles
  const st = $('scanToggleSettings');
  if (st) { st.classList.toggle('toggle--on', scanlinesOn); st.setAttribute('aria-checked', String(scanlinesOn)); }
  setEl('scanLabelSettings', scanlinesOn ? 'ON' : 'OFF');

  const vt = $('voiceAlertToggle');
  if (vt) { vt.classList.toggle('toggle--on', voiceAlertOn); vt.setAttribute('aria-checked', String(voiceAlertOn)); }
  setEl('voiceAlertLabel', voiceAlertOn ? 'ON' : 'OFF');

  const kt = $('kzToggle');
  if (kt) { kt.classList.toggle('toggle--on', kzWidgetOn); kt.setAttribute('aria-checked', String(kzWidgetOn)); }
  setEl('kzToggleLabel', kzWidgetOn ? 'ON' : 'OFF');

  _showModal('settingsModal');
}
function closeSettingsModal() { _hideModal('settingsModal'); }
function closeSett() { closeSettingsModal(); }

/* TOS Modal */
function openTosModal()  { _showModal('tosModal'); }
function closeTosModal() { _hideModal('tosModal'); }


/* ═══════════════════════════════════════════════════════════════════
   §10  TOPBAR & TICKER PRICE DISPLAYS
   ═══════════════════════════════════════════════════════════════════ */

const TOP_SYMBOLS = ['XAUUSD','BTCUSD','EURUSD','GBPUSD','USDJPY'];

function buildTopbarPrices() {
  const strip = $('tbPriceStrip');
  if (!strip) return;
  strip.innerHTML = TOP_SYMBOLS.map(id => {
    const sym = SYMS.find(s => s.id === id);
    const lbl = id === 'XAUUSD' ? 'GOLD' : id === 'BTCUSD' ? 'BTC' : id;
    return `<div class="tb-price-item">
      <span class="tb-price-sym">${lbl}</span>
      <span class="tb-price-val neu" id="tbpx-${id}">—</span>
    </div>`;
  }).join('');
}

function buildTicker() {
  const inner = $('tickerInner');
  if (!inner) return;
  const items = SYMS.map(s => {
    const st  = priceState[s.id];
    const dp  = s.dp;
    const px  = st ? st.price.toLocaleString('en-US', { minimumFractionDigits:dp, maximumFractionDigits:dp }) : '—';
    const pct = st ? ((st.price - s.base) / s.base * 100).toFixed(2) : '0.00';
    const dir = st ? st.dir : 'neu';
    const arr = dir === 'up' ? '▲' : dir === 'dn' ? '▼' : '─';
    return `<span class="tk-item" aria-hidden="true">
      <span class="tk-pair">${s.label}</span>
      <span class="tk-price tk-${dir}">${px}</span>
      <span class="tk-chg tk-${dir}">${arr}${Math.abs(pct)}%</span>
    </span>`;
  }).join('');
  // Duplicate for seamless loop
  inner.innerHTML = items + items;
}

function buildFlashNews() {
  const track = $('flashNewsTrack');
  if (!track) return;
  // Double for seamless scroll
  const items = [...FLASH_ITEMS, ...FLASH_ITEMS].map(t =>
    `<span class="fn-item"><span class="fn-badge">LIVE</span>${escHtml(t)}</span>`
  ).join('');
  track.innerHTML = items;
}


/* ═══════════════════════════════════════════════════════════════════
   §11  CHART
   ═══════════════════════════════════════════════════════════════════ */
function loadChart() {
  const iframe = $('tvIframe');
  if (!iframe) return;
  const interval = curTF === 'D' ? '1D' : curTF === 'W' ? '1W' : curTF;
  iframe.src = [
    'https://s.tradingview.com/widgetembed/',
    '?frameElementId=tvwf',
    '&symbol='   + encodeURIComponent(curSym.tv),
    '&interval=' + interval,
    '&hidesidetoolbar=0&hidetoptoolbar=0',
    '&theme=dark&style=1&locale=id',
    '&bgcolor=%23000000&gridColor=%230a1018'
  ].join('');

  const lbl = $('symLabel');
  if (lbl) lbl.textContent = curSym.label;
  addLog('sys', 'Chart → ' + curSym.id + ' ' + curTF);
}

function setTF(tf, btn) {
  curTF = tf;
  document.querySelectorAll('#tfBar .tf-btn').forEach(b => {
    b.classList.remove('tf-btn--active', 'on');
  });
  if (btn) btn.classList.add('tf-btn--active', 'on');
  loadChart();
}


/* ═══════════════════════════════════════════════════════════════════
   §12  ORDERBOOK DOM
   ═══════════════════════════════════════════════════════════════════ */
function updateOBWith(mid, spread) {
  const lim = getTierLimits();
  // OB requires medium+
  if (!lim.orderbook) return;

  const bidEl = $('obBids');
  const askEl = $('obAsks');
  const spEl  = $('obSpreadLabel');
  if (!bidEl || !askEl) return;

  const dp  = curSym.dp;
  const pip = spread || curSym.pip;
  if (spEl) spEl.textContent = 'SPREAD: ' + pip.toFixed(dp);

  const ROWS  = 8;
  const sizes = Array.from({ length: ROWS }, () => Math.random() * 10 + 0.5);
  const maxS  = Math.max(...sizes);

  let bidHtml = '', askHtml = '';
  for (let i = 0; i < ROWS; i++) {
    const stepB = pip * (i + 1) * 0.5;
    const stepA = pip * (i + 0.5) * 0.5;
    const pxB   = (mid - stepB).toFixed(dp);
    const pxA   = (mid + stepA).toFixed(dp);
    const szB   = (sizes[i] * 1000).toFixed(0);
    const szA   = (sizes[ROWS - 1 - i] * 1000).toFixed(0);
    const wB    = Math.round((sizes[i] / maxS) * 100);
    const wA    = Math.round((sizes[ROWS - 1 - i] / maxS) * 100);
    bidHtml += `<div class="ob-row bid"><div class="ob-row-fill" style="width:${wB}%"></div><span class="ob-px">${pxB}</span><span class="ob-sz">${szB}</span></div>`;
    askHtml += `<div class="ob-row ask"><div class="ob-row-fill" style="width:${wA}%"></div><span class="ob-px">${pxA}</span><span class="ob-sz">${szA}</span></div>`;
  }
  bidEl.innerHTML = bidHtml;
  askEl.innerHTML = askHtml;
}


/* ═══════════════════════════════════════════════════════════════════
   §13  CURRENCY STRENGTH METER
   ═══════════════════════════════════════════════════════════════════ */
function updateCS() {
  // Drift csData values slowly
  CS_CURRENCIES.forEach(c => {
    csData[c] = Math.max(5, Math.min(95, csData[c] + (Math.random() - 0.5) * 4));
  });

  // Sort descending
  const sorted = [...CS_CURRENCIES].sort((a, b) => csData[b] - csData[a]);
  const wrap   = $('csWrap');
  if (!wrap) return;

  wrap.innerHTML = sorted.map(c => {
    const v   = csData[c];
    const col = v > 62 ? 'var(--green)' : v < 38 ? 'var(--red)' : 'var(--gold2)';
    return `<div class="cs-bar-row">
      <span class="cs-sym">${c}</span>
      <div class="cs-track"><div class="cs-fill" style="width:${v}%;background:${col}"></div></div>
      <span class="cs-pct" style="color:${col}">${v.toFixed(0)}%</span>
    </div>`;
  }).join('');

  setEl('csLastUpdate', new Date().toISOString().substr(11,8) + ' UTC');
}


/* ═══════════════════════════════════════════════════════════════════
   §14  STRATEGY ENGINE CONTROLS
   ═══════════════════════════════════════════════════════════════════ */
function toggleStrat() {
  stratPaused = !stratPaused;
  const blob = $('sBlob');
  const txt  = $('sTxt');
  const btn  = $('btnPause');

  if (stratPaused) {
    if (blob) { blob.className = 'ss-dot ss-dot--pause'; }
    if (txt)  { txt.textContent = 'STRATEGY PAUSED'; txt.style.color = 'var(--gold2)'; }
    if (btn)  btn.textContent = '▶ RESUME';
    addLog('warn', 'Strategy PAUSED by user');
    toast('Strategi di-pause ⏸', 'warn');
  } else {
    if (blob) { blob.className = 'ss-dot ss-dot--run'; }
    if (txt)  { txt.textContent = 'STRATEGY RUNNING'; txt.style.color = 'var(--green)'; }
    if (btn)  btn.textContent = '⏸ PAUSE';
    addLog('sys', 'Strategy RESUMED');
    toast('Strategi berjalan ▶');
  }
}

function stopStrat() {
  if (!confirm('Stop strategy engine?')) return;
  stratRunning = false;
  stratPaused  = false;
  const blob = $('sBlob');
  const txt  = $('sTxt');
  if (blob) blob.className = 'ss-dot ss-dot--stop';
  if (txt)  { txt.textContent = 'STRATEGY STOPPED'; txt.style.color = 'var(--red)'; }
  addLog('warn', 'Strategy STOPPED');
  toast('Strategi dihentikan ⏹', 'err');
}

function resetStrat() {
  stratRunning  = true;
  stratPaused   = false;
  stratStart    = Date.now();
  sigCount      = 0;
  const blob = $('sBlob');
  const txt  = $('sTxt');
  const btn  = $('btnPause');
  if (blob) blob.className = 'ss-dot ss-dot--run';
  if (txt)  { txt.textContent = 'STRATEGY RUNNING'; txt.style.color = 'var(--green)'; }
  if (btn)  btn.textContent = '⏸ PAUSE';
  updateMetrics();
  addLog('sys', 'Session RESET');
  toast('Session di-reset ↺');
}

/* Strategy Timer */
setInterval(() => {
  if (!stratRunning || stratPaused) return;
  const e = Date.now() - stratStart;
  const h = Math.floor(e / 3600000);
  const m = Math.floor((e % 3600000) / 60000);
  const s = Math.floor((e % 60000) / 1000);
  const pad = n => String(n).padStart(2,'0');
  setEl('sTime', `${pad(h)}:${pad(m)}:${pad(s)}`);
}, 1000);


/* ═══════════════════════════════════════════════════════════════════
   §15  RISK / LOT CALCULATOR
   ═══════════════════════════════════════════════════════════════════ */
function calcLot() {
  const eq     = parseFloat($('eqInp')?.value || '10000') || 10000;
  const risk   = eq * rptVal / 100;
  const slPips = curStyle === 'scalp' ? 10 : curStyle === 'intraday' ? 20 : 50;

  // Pip value heuristic per instrument
  let pipUSD = 10; // default: FX majors $10 per pip per 1.0 lot
  const id   = curSym.id;
  if (id === 'XAUUSD')              pipUSD = 10;   // $10/pip/lot
  else if (id === 'BTCUSD')         pipUSD = 1;    // $1/pip
  else if (id.includes('JPY'))      pipUSD = 0.067; // per micro-pip for JPY
  else if (['NAS100','US30'].includes(id)) pipUSD = 1;

  const lots = Math.max(0.01, Math.min(100, risk / (slPips * pipUSD)));
  setEl('lotOut', lots.toFixed(2) + ' lots');
  return parseFloat(lots.toFixed(2));
}

function setDD(v)  { setEl('ddLbl', v + '%'); }
function setRPT(v) { rptVal = parseFloat(v); setEl('rptLbl', v + '%'); calcLot(); }

function setStyle(s, btn) {
  const lim = getTierLimits();
  if (s === 'swing' && !lim.swing) {
    toast('🔒 Swing mode hanya di plan Premium!', 'warn');
    return;
  }
  curStyle = s;
  document.querySelectorAll('.style-tab').forEach(t => t.classList.remove('style-tab--active','on'));
  if (btn) btn.classList.add('style-tab--active','on');
  calcLot();
}


/* ═══════════════════════════════════════════════════════════════════
   §16  MUSIC PLAYER
   ═══════════════════════════════════════════════════════════════════ */
function buildTrackList() {
  const list = $('trackList');
  if (!list) return;
  list.innerHTML = TRACKS.map((t, i) =>
    `<span class="track-pill ${i === musicIdx ? 'on' : ''}" onclick="playTrack(${i})" role="button">${t.title}</span>`
  ).join('');
}

function playTrack(idx) {
  musicIdx = idx;
  const audio = $('bgAudio');
  if (!audio) return;
  audio.src = TRACKS[musicIdx].url;
  audio.play().catch(() => {});
  musicPlaying = true;
  setEl('musicTitle', TRACKS[musicIdx].title);
  const btn = $('playBtn');
  if (btn) btn.textContent = '⏸';
  buildTrackList();
}

function togglePlay() {
  const audio = $('bgAudio');
  if (!audio) return;
  if (musicPlaying) {
    audio.pause();
    musicPlaying = false;
    const btn = $('playBtn');
    if (btn) btn.textContent = '▶';
  } else {
    if (!audio.src) audio.src = TRACKS[musicIdx].url;
    audio.play().catch(() => {});
    musicPlaying = true;
    const btn = $('playBtn');
    if (btn) btn.textContent = '⏸';
  }
}

function prevTrack() {
  musicIdx = (musicIdx - 1 + TRACKS.length) % TRACKS.length;
  playTrack(musicIdx);
}

function nextTrack() {
  musicIdx = (musicIdx + 1) % TRACKS.length;
  playTrack(musicIdx);
}

function toggleMute() {
  const audio = $('bgAudio');
  if (!audio) return;
  musicMuted    = !musicMuted;
  audio.muted   = musicMuted;
  const btn = $('muteBtn');
  if (btn) btn.textContent = musicMuted ? '🔇' : '🔊';
}

function setVol(v) {
  const audio = $('bgAudio');
  if (audio) audio.volume = v / 100;
}


/* ═══════════════════════════════════════════════════════════════════
   §17  UI ARCHITECT — CUSTOMIZER
   ═══════════════════════════════════════════════════════════════════ */
function changeAccentColor(hex) {
  document.documentElement.style.setProperty('--gold2', hex);
  // Derive gold and gold3 from hex
  document.documentElement.style.setProperty('--gold',  _shadeHex(hex, -0.15));
  document.documentElement.style.setProperty('--gold3', _shadeHex(hex,  0.2));
  LS.set('shelen_accent', hex);

  // Sync both color pickers
  ['accentColorPicker'].forEach(id => {
    const el = $(id);
    if (el) el.value = hex;
  });
}

function _shadeHex(hex, pct) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.min(255, Math.max(0, Math.round(((n >> 16) & 0xFF) * (1 + pct))));
  const g = Math.min(255, Math.max(0, Math.round(((n >>  8) & 0xFF) * (1 + pct))));
  const b = Math.min(255, Math.max(0, Math.round(( n        & 0xFF) * (1 + pct))));
  return '#' + [r,g,b].map(c => c.toString(16).padStart(2,'0')).join('');
}

function toggleScanlines() {
  scanlinesOn = !scanlinesOn;
  document.body.classList.toggle('scanlines-on', scanlinesOn);
  // Sync all scanline toggles
  ['scanToggle','scanToggleSettings'].forEach(id => {
    const el = $(id);
    if (!el) return;
    el.classList.toggle('toggle--on', scanlinesOn);
    el.setAttribute('aria-checked', String(scanlinesOn));
  });
  ['scanLabel','scanLabelSettings'].forEach(id => setEl(id, scanlinesOn ? 'ON' : 'OFF'));
  toast('CRT Effect: ' + (scanlinesOn ? 'ON' : 'OFF'));
}

function toggleVoiceAlert() {
  voiceAlertOn = !voiceAlertOn;
  const el  = $('voiceAlertToggle');
  const lbl = $('voiceAlertLabel');
  if (el)  { el.classList.toggle('toggle--on', voiceAlertOn); el.setAttribute('aria-checked', String(voiceAlertOn)); }
  if (lbl) lbl.textContent = voiceAlertOn ? 'ON' : 'OFF';
  toast('Voice Alert: ' + (voiceAlertOn ? 'ON' : 'OFF'));
}

function toggleKZWidget() {
  kzWidgetOn = !kzWidgetOn;
  const kz  = $('kzWidget');
  const el  = $('kzToggle');
  const lbl = $('kzToggleLabel');
  if (kz)  kz.hidden = !kzWidgetOn;
  if (el)  { el.classList.toggle('toggle--on', kzWidgetOn); el.setAttribute('aria-checked', String(kzWidgetOn)); }
  if (lbl) lbl.textContent = kzWidgetOn ? 'ON' : 'OFF';
  toast('Killzone Clock: ' + (kzWidgetOn ? 'ON' : 'OFF'));
}


/* ═══════════════════════════════════════════════════════════════════
   §18  METRICS UPDATE
   ═══════════════════════════════════════════════════════════════════ */
function updateMetrics() {
  const W   = trades.filter(t => (+t.pnl || 0) > 0).length;
  const tot = trades.length;
  const pnl = trades.reduce((a, t) => a + (+t.pnl || 0), 0);
  const wr  = tot ? (W / tot * 100).toFixed(1) : '0.0';

  // Max drawdown
  let peak = 10000, maxDD = 0, cur = 10000;
  trades.forEach(t => {
    cur += (+t.pnl || 0);
    if (cur > peak) peak = cur;
    const dd = (peak - cur) / peak * 100;
    if (dd > maxDD) maxDD = dd;
  });

  const pnlEl = $('mc-pnl');
  if (pnlEl) {
    pnlEl.textContent = (pnl >= 0 ? '+$' : '-$') + Math.abs(pnl).toFixed(0);
    pnlEl.className   = 'mc-value mc-value--' + (pnl >= 0 ? 'green' : 'red');
  }
  setEl('mc-wr',  wr + '%');
  setEl('mc-sig', String(sigCount));
  setEl('mc-dd',  maxDD.toFixed(1) + '%');
}


/* ═══════════════════════════════════════════════════════════════════
   §19  NEWS PAGE RENDERERS
   ═══════════════════════════════════════════════════════════════════ */
let _newsFilter = 'all';

function filterNews(cat, btn) {
  _newsFilter = cat;
  document.querySelectorAll('.nf-btn').forEach(b => b.classList.remove('nf-btn--active','on'));
  if (btn) btn.classList.add('nf-btn--active','on');
  renderNews(cat);
}

function renderNews(cat) {
  const list = $('newsList');
  if (!list) return;
  const items = NEWS_DATA.filter(n => !cat || cat === 'all' || n.cat === cat);

  list.innerHTML = items.map(n => `
    <article class="nc" onclick="void(0)">
      <div class="nc-cat ${n.cat}">${n.cat.toUpperCase()}</div>
      <h3 class="nc-hl">${escHtml(n.hl)}</h3>
      <p class="nc-sum">${escHtml(n.sum)}</p>
      <footer class="nc-foot">
        <span>${n.src} · ${n.time} UTC</span>
        <span class="impact-pill ${n.impact}">
          ${n.impact === 'high' ? '🔴' : n.impact === 'med' ? '🟡' : '🟢'} ${n.impact.toUpperCase()} IMPACT
        </span>
      </footer>
    </article>
  `).join('');
}

function renderEco() {
  const list = $('ecoList');
  if (!list) return;
  list.innerHTML = ECO_DATA.map(e => {
    const aClass = e.a === '⏳' ? 'pend' : e.up ? 'pos' : 'neg';
    return `<div class="eco-row">
      <div class="eco-time">${e.t} UTC<br><span class="impact-pill ${e.im}" style="margin-top:2px;">${e.im.toUpperCase()}</span></div>
      <div class="eco-flag">${e.f}</div>
      <div>
        <div class="eco-n">${escHtml(e.n)}</div>
        <div class="eco-d">
          Prev: ${e.p} · Est: ${e.e} ·
          <span class="act ${aClass}">Act: ${e.a}</span>
        </div>
      </div>
    </div>`;
  }).join('');
}

function renderSentiment() {
  const list = $('sentList');
  if (!list) return;
  list.innerHTML = SENT_DATA.map(s => `
    <div>
      <div class="sent-lbl">
        <span class="sent-nm">${s.n}</span>
        <span style="color:${s.b > 60 ? 'var(--green)' : s.b < 40 ? 'var(--red)' : 'var(--gold2)'}">${s.b > 60 ? 'BULLISH' : s.b < 40 ? 'BEARISH' : 'NETRAL'} ${s.b}%</span>
      </div>
      <div class="sent-bar">
        <div class="sent-fill" style="width:${s.b}%;background:${s.b > 60 ? 'var(--green)' : s.b < 40 ? 'var(--red)' : 'var(--gold2)'}"></div>
      </div>
    </div>
  `).join('');

  // Update sentiment needles
  _updateSentimentNeedle('termSabNeedle', 'termSabVerdict');
  _updateSentimentNeedle('newsSabNeedle', 'newsSabVerdict');
}

function _updateSentimentNeedle(needleId, verdictId) {
  const avg = SENT_DATA.reduce((a, s) => a + s.b, 0) / SENT_DATA.length;
  const el  = $(needleId);
  const vEl = $(verdictId);
  if (el) el.style.left = avg.toFixed(1) + '%';
  if (vEl) {
    const label  = avg > 60 ? 'BULLISH' : avg < 40 ? 'BEARISH' : 'NETRAL';
    const color  = avg > 60 ? 'var(--green)' : avg < 40 ? 'var(--red)' : 'var(--gold2)';
    vEl.textContent = label;
    vEl.style.color = color;
  }
}


/* ═══════════════════════════════════════════════════════════════════
   §20  CHAT SYSTEM
   ═══════════════════════════════════════════════════════════════════ */
const AVATAR_COLORS = ['var(--gold2)','var(--cyan)','var(--green)','var(--purple)','var(--orange)','var(--red)'];

function renderChat() {
  const el = $('chatMsgs');
  if (!el) return;
  el.innerHTML = chatMsgs.map((m, i) => _buildMsgHtml(m, i)).join('');
  _buildEmojiBar();
}

function _buildMsgHtml(m, idx) {
  const isMine = user && m.user === user.name;
  const color  = m.color || AVATAR_COLORS[m.user ? m.user.charCodeAt(0) % AVATAR_COLORS.length : 0];
  const initials = (m.avatar || m.user || '?').slice(0, 2).toUpperCase();
  const replyHtml = m.replyTo
    ? `<div class="msg-reply-ref">↩ ${escHtml(m.replyTo.user)}: ${escHtml(m.replyTo.text.slice(0,60))}${m.replyTo.text.length > 60 ? '…' : ''}</div>`
    : '';
  const imgHtml  = m.imgSrc
    ? `<img class="msg-img" src="${m.imgSrc}" alt="image" loading="lazy">`
    : '';

  return `<div class="msg-wrap${isMine ? ' mine' : ''}" id="msg-${m.id}" data-idx="${idx}"
    ontouchstart="_msgTouchStart(event,'msg-${m.id}')"
    ontouchend="_msgTouchEnd(event,'msg-${m.id}')"
    ontouchcancel="_msgTouchCancel('msg-${m.id}')">
    <div class="msg-header">
      <div class="msg-avatar" style="background:${color}">${initials}</div>
      <span class="msg-username" style="color:${color}">${escHtml(m.user)}</span>
      <span class="msg-time">${m.time}</span>
      ${!isMine ? '' : '<span class="msg-online-dot" aria-hidden="true"></span>'}
    </div>
    ${imgHtml}
    <div class="msg-bubble">
      ${replyHtml}
      ${escHtml(m.msg)}
      ${m.edited ? '<span class="msg-edited">(edited)</span>' : ''}
    </div>
    <div class="msg-actions" role="toolbar">
      <button class="msg-action-btn reply-btn" onclick="_replyMsg('msg-${m.id}')">↩ Reply</button>
      ${isMine ? `<button class="msg-action-btn edit-btn" onclick="_editMsg('msg-${m.id}')">✏ Edit</button>` : ''}
      ${isMine ? `<button class="msg-action-btn del-btn" onclick="_delMsg('msg-${m.id}')">🗑 Del</button>` : ''}
    </div>
  </div>`;
}

/* Long-press touch handlers — no native context menu */
let _touchHoldTimer = null;
function _msgTouchStart(e, msgId) {
  _touchHoldTimer = setTimeout(() => {
    const el = $(msgId);
    if (el) el.classList.toggle('action-open');
    e.preventDefault();
  }, 500);
}
function _msgTouchEnd(e, msgId) { clearTimeout(_touchHoldTimer); }
function _msgTouchCancel(msgId) { clearTimeout(_touchHoldTimer); }

function _replyMsg(msgId) {
  const idx  = parseInt($(msgId)?.dataset.idx);
  const msg  = chatMsgs[idx];
  if (!msg) return;
  chatReplyRef = { user: msg.user, text: msg.msg };
  // Show reply preview in input area
  let prev = $('chatReplyPreview');
  if (!prev) {
    prev = document.createElement('div');
    prev.id        = 'chatReplyPreview';
    prev.className = 'reply-preview';
    const wrap = $('chatInputWrap');
    if (wrap) wrap.prepend(prev);
  }
  prev.hidden = false;
  prev.innerHTML = `<span class="rp-name">↩ Replying to ${escHtml(chatReplyRef.user)}</span>
    <span>${escHtml(chatReplyRef.text.slice(0,80))}${chatReplyRef.text.length > 80 ? '…' : ''}</span>
    <span class="rp-close" onclick="_cancelReply()">✕</span>`;
  const inp = $('chatInput');
  if (inp) inp.focus();
  $(msgId)?.classList.remove('action-open');
}

function _cancelReply() {
  chatReplyRef = null;
  const prev = $('chatReplyPreview');
  if (prev) prev.hidden = true;
}

function _editMsg(msgId) {
  const el  = $(msgId);
  const idx = parseInt(el?.dataset.idx);
  if (isNaN(idx)) return;
  const msg = chatMsgs[idx];
  if (!msg || msg.user !== user?.name) return;
  const newText = prompt('Ubah pesan:', msg.msg);
  if (!newText || newText.trim() === msg.msg) return;
  chatMsgs[idx].msg    = newText.trim();
  chatMsgs[idx].edited = true;
  LS.set('iz_chat', chatMsgs);
  renderChat();
  el?.classList.remove('action-open');
}

function _delMsg(msgId) {
  const el  = $(msgId);
  const idx = parseInt(el?.dataset.idx);
  if (isNaN(idx)) return;
  if (!confirm('Hapus pesan ini?')) return;
  chatMsgs.splice(idx, 1);
  LS.set('iz_chat', chatMsgs);
  renderChat();
}

function sendMsg() {
  const inp  = $('chatInput');
  const text = inp?.value.trim();
  if (!text || !user) return;

  const msg = {
    id:      'm' + Date.now(),
    user:    user.name,
    avatar:  user.name.slice(0,2).toUpperCase(),
    time:    new Date().toISOString().substr(11,5),
    msg:     text,
    color:   'var(--gold2)',
    replyTo: chatReplyRef || null,
    edited:  false
  };

  chatMsgs.push(msg);
  LS.set('iz_chat', chatMsgs);

  inp.value = '';
  inp.style.height = 'auto';
  _cancelReply();
  renderChat();

  const msgEl = $('chatMsgs');
  if (msgEl) msgEl.scrollTop = msgEl.scrollHeight;
}

function handleChatKey(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMsg();
  }
}

function autoResizeChatInput(el) {
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 100) + 'px';
}

function sendImage(input) {
  if (!input.files?.length || !user) return;
  const file = input.files[0];
  const reader = new FileReader();
  reader.onload = (e) => {
    const msg = {
      id:     'm' + Date.now(),
      user:   user.name,
      avatar: user.name.slice(0,2).toUpperCase(),
      time:   new Date().toISOString().substr(11,5),
      msg:    '📷 Chart screenshot',
      color:  'var(--gold2)',
      imgSrc: e.target.result,
      edited: false
    };
    chatMsgs.push(msg);
    LS.set('iz_chat', chatMsgs);
    renderChat();
    const msgEl = $('chatMsgs');
    if (msgEl) msgEl.scrollTop = msgEl.scrollHeight;
  };
  reader.readAsDataURL(file);
  input.value = '';
}

function toggleVoice() {
  voiceRecording = !voiceRecording;
  const btn = $('voiceBtn');
  if (btn) btn.classList.toggle('recording', voiceRecording);
  toast(voiceRecording ? '🎙 Merekam…' : '⏹ Rekaman berhenti', voiceRecording ? '' : 'warn');
}

function _buildEmojiBar() {
  const bar = $('emojiBar');
  if (!bar) return;
  bar.innerHTML = EMOJIS.map(e =>
    `<button class="emoji-btn" onclick="insertEmoji('${e}')" aria-label="${e}">${e}</button>`
  ).join('');
}

function insertEmoji(e) {
  const inp = $('chatInput');
  if (!inp) return;
  const pos = inp.selectionStart || inp.value.length;
  inp.value = inp.value.slice(0, pos) + e + inp.value.slice(pos);
  inp.focus();
  inp.setSelectionRange(pos + e.length, pos + e.length);
}

function chatAI() {
  toast('🤖 Ask Buddy — fitur dalam pengembangan', 'warn');
}


/* ═══════════════════════════════════════════════════════════════════
   §21  PHOTO CHART ANALYSIS
   ═══════════════════════════════════════════════════════════════════ */
function loadPhotoPreview(input) {
  if (!input.files?.length) return;
  const file   = input.files[0];
  const reader = new FileReader();
  reader.onload = e => {
    _photoB64  = e.target.result.split(',')[1];
    _photoMime = file.type;
    const img  = $('photoPreviewImg');
    const wrap = $('photoPreviewWrap');
    const drop = $('photoDropZone');
    if (img)  img.src    = e.target.result;
    if (wrap) wrap.hidden = false;
    if (drop) drop.hidden = true;
  };
  reader.readAsDataURL(file);
}

function handlePhotoDrop(e) {
  e.preventDefault();
  const dz = $('photoDropZone');
  if (dz) dz.classList.remove('photo-drop--over');
  const file = e.dataTransfer?.files?.[0];
  if (!file || !file.type.startsWith('image/')) {
    toast('Hanya file gambar (PNG/JPG/WEBP)', 'err');
    return;
  }
  const fake  = { files: [file] };
  loadPhotoPreview(fake);
}

function clearPhoto() {
  _photoB64  = null;
  _photoMime = null;
  const inp  = $('chartPhotoInput');
  if (inp) inp.value = '';
  const img  = $('photoPreviewImg');
  const wrap = $('photoPreviewWrap');
  const drop = $('photoDropZone');
  if (img)  img.src    = '';
  if (wrap) wrap.hidden = true;
  if (drop) drop.hidden = false;
}

async function runPhotoAnalysis() {
  const lim = getTierLimits();
  if (!lim.photo) {
    toast('🔒 AI Photo Analysis hanya di Medium/Premium', 'warn');
    goPage('pricing');
    return;
  }
  if (!_photoB64) { toast('Upload chart photo dulu.', 'err'); return; }

  const feed = $('sigFeed');
  if (feed) feed.innerHTML = `<div class="scanning">🤖 ALCHEMIST AI ANALYZING CHART IMAGE…</div>`;

  // Build analysis prompt  
  const inst  = $('sigInst')?.value || curSym.id;
  const strat = $('sigStrat')?.value || 'alch';
  const style = curStyle;

  const prompt = [
    `You are ALCHEMIST v8, an elite ICT/SMC/MSNR quantitative analyst.`,
    `Analyze this ${inst} chart screenshot using ${strat} methodology for ${style} trading.`,
    `Provide: 1) Trend & Market Structure 2) Key POI/Entry zone 3) SL/TP levels 4) R:R ratio 5) Confidence % 6) Final BUY/SELL verdict.`,
    `Be precise with price levels. Format as a technical report. Max 250 words.`
  ].join(' ');

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 900,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: _photoMime, data: _photoB64 } },
            { type: 'text',  text: prompt }
          ]
        }]
      })
    });

    const data   = await response.json();
    const result = data?.content?.[0]?.text || 'Analisis tidak tersedia.';

    if (feed) {
      feed.innerHTML = `
        <div class="sig-card" style="border-left-color:var(--purple);">
          <div class="sig-top">
            <div>
              <div class="sig-sym">${inst} — PHOTO AI</div>
              <div class="sig-dir" style="color:var(--purple);">🤖 ALCHEMIST ANALYSIS</div>
            </div>
            <span style="font-family:var(--mono);font-size:7.5px;color:var(--txt3);">${new Date().toISOString().substr(11,5)} UTC</span>
          </div>
          <div class="ai-reasoning" style="border-color:rgba(155,109,255,.3);">
            <span class="ai-label">AI PHOTO CHART ANALYSIS — ${strat.toUpperCase()} · ${style.toUpperCase()}</span>
            <div style="white-space:pre-line;line-height:1.9;">${escHtml(result)}</div>
          </div>
        </div>`;
    }

    addLog('sys', 'Photo AI analysis complete for ' + inst);
    sigCount++;
    updateMetrics();

  } catch (err) {
    if (feed) feed.innerHTML = `<div class="sig-feed-empty">AI API error — ${escHtml(err.message)}</div>`;
    addLog('warn', '[PhotoAI] Error: ' + err.message);
    toast('API error: ' + err.message, 'err');
  }
}


/* ═══════════════════════════════════════════════════════════════════
   §22  VOICE ORACLE (Web Speech API)
   ═══════════════════════════════════════════════════════════════════ */
function voiceAlert() {
  if (!voiceAlertOn) return;
  _speak('Shelen terminal active. MT5 bridge ' + (MT5Bridge.connected ? 'connected' : 'in simulation mode') + '. Market scanning ready.');
}

function _oracleWelcome(name) {
  if (!voiceAlertOn) return;
  const firstName = (name || '').split(' ')[0];
  _speak('Welcome back ' + firstName + '. Shelen v13 ready. MT5 bridge active.');
}

function _oracleSignal(inst, dir, entry) {
  if (!voiceAlertOn) return;
  _speak(`${inst} ${dir} signal. Entry zone ${entry}. Check terminal for full analysis.`);
}

function askBuddy() {
  const st   = priceState[curSym.id];
  const bias = _getMarketBias();
  const msg  = `Shelen Buddy update. ${curSym.id} currently at ${st ? st.price.toFixed(curSym.dp) : 'unknown'}. ` +
               `AI daily bias is ${bias}. Strategy engine is ${stratRunning ? (stratPaused ? 'paused' : 'running') : 'stopped'}. ` +
               `Today's signal count: ${sigCount}. Stay disciplined, respect your stop losses.`;
  _speak(msg);
  toast('🤖 Buddy: ' + bias + ' bias on ' + curSym.id);
}

function _getMarketBias() {
  const avg = SENT_DATA.reduce((a, s) => a + s.b, 0) / SENT_DATA.length;
  return avg > 60 ? 'BULLISH' : avg < 40 ? 'BEARISH' : 'NEUTRAL';
}

function _speak(text) {
  if (!('speechSynthesis' in window)) return;
  speechSynthesis.cancel();
  const utt = new SpeechSynthesisUtterance(text);
  utt.rate = 0.9;
  utt.pitch = 0.8;
  utt.volume = 0.85;
  speechSynthesis.speak(utt);
}


/* ═══════════════════════════════════════════════════════════════════
   §23  INTERVAL ENGINES
   ═══════════════════════════════════════════════════════════════════ */

// Clock — runs every second
setInterval(updateClock, 1000);

// OB refresh — every 2s from current price state
setInterval(() => {
  const st = priceState[curSym.id];
  if (st && activePage === 'terminal') updateOBWith(st.price, st.spread);
}, 2000);

// CS update — every 3.5s
setInterval(() => {
  if (activePage === 'terminal') updateCS();
}, 3500);

// Ticker rebuild — every 4s
setInterval(buildTicker, 4000);


/* ═══════════════════════════════════════════════════════════════════
   §24  MODAL DISMISS LISTENERS
   ═══════════════════════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
  _initModalDismiss('authOverlay',     closeAuth);
  _initModalDismiss('symModal',        closeSymModal);
  _initModalDismiss('mt5Modal',        closeMT5Modal);
  _initModalDismiss('payModal',        closePayModal);
  _initModalDismiss('settingsModal',   closeSettingsModal);
  _initModalDismiss('tosModal',        closeTosModal);
});

// ESC key closes any open modal
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  ['authOverlay','symModal','mt5Modal','payModal','settingsModal','tosModal'].forEach(id => {
    const el = $(id);
    if (el && !el.hasAttribute('hidden')) _hideModal(id);
  });
});


/* ═══════════════════════════════════════════════════════════════════
   §25  INITIALISATION
   ═══════════════════════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {

  // 1. Build static UI
  buildTopbarPrices();
  buildFlashNews();
  buildTicker();
  buildTrackList();

  // 2. Restore accent color
  const savedAccent = LS.get('shelen_accent');
  if (savedAccent) changeAccentColor(savedAccent);

  // 3. Restore auth state
  if (user) {
    _updateUserBtn();
    _applyTierUI();
  }

  // 4. Open home page
  goPage('home');

  // 5. Start MT5 Bridge in simulation mode immediately
  //    → will auto-connect if URL was previously saved and set
  MT5Bridge._startSim?.call?.() || setTimeout(() => {
    // Start sim via the class's internal method
    // The class auto-starts sim on init
    const storedUrl = LS.get('shelen_mt5_url');
    if (storedUrl && storedUrl !== 'ws://localhost:8080') {
      // Auto-reconnect if user had previously set a custom URL
      MT5Bridge.connect(storedUrl);
    } else {
      // Kick simulation directly by triggering the fallback
      MT5Bridge.connect('ws://localhost:8080');  // will fail → fall to sim
    }
  }, 800);

  // 6. First clock tick
  updateClock();

  // 7. Show version toast
  setTimeout(() => toast('SHELEN v13 — MT5 Bridge Edition ⚡'), 1200);

  console.log('%c SHELEN v13 %c Precision Over Noise ', 
    'background:#c8922a;color:#000;font-weight:bold;padding:3px 6px;border-radius:3px 0 0 3px;',
    'background:#010204;color:#f0b44a;padding:3px 6px;border-radius:0 3px 3px 0;border:1px solid #f0b44a;'
  );
});

/* ═══════════════════════════════════════════════════════════════════
   End of script.js Part 1
   ─────────────────────────────────────────────────────────────────
   Part 2 continues in script.js (same file, appended):
   §26 AI Signal Engine (PATTERNS + genSignal)
   §27 Journal (renderJournalStats, drawEquity, addTrade, exportCSV, shareToIG)
   §28 Alchemist Candle Game (startGame, gameLoop, restartGame)
   ═══════════════════════════════════════════════════════════════════ */

/* ═══════════════════════════════════════════════════════════════════
   script.js — PART 2
   §26 Dual-Engine WebSocket System (MT5 Bridge + TwelveData Fallback)
   §27 Founder GodMode Detection System
   §28 AI Signal Engine (Alchemist v8 — full pattern array)
   §29 Journal (stats, equity curve, heatmap, winrate ring, partial close)
   §30 Share to IG Story (Canvas API)
   §31 Trade Log (addTrade, exportCSV)
   §32 Alchemist Candle Minigame
   §33 Stats Counter Animation
   §34 Sentiment Engine
   §35 Flash News Ticker with Countdown
   §36 UI Polish & Final Init
   ═══════════════════════════════════════════════════════════════════ */

/* ═══════════════════════════════════════════════════════════════════
   §26  DUAL-ENGINE WEBSOCKET SYSTEM
   ─────────────────────────────────────────────────────────────────
   ENGINE A → MT5 EA Bridge  (user-supplied ws:// / wss:// URL)
   ENGINE B → TwelveData API (wss://ws.twelvedata.com) — auto fallback
   The UI provides a URL input + CONNECT button.
   If the field is EMPTY → Engine B fires automatically.
   Price display flashes gold on every tick update.
   ═══════════════════════════════════════════════════════════════════ */

const TWELVEDATA_KEY = 'demo'; // replace with your TwelveData API key
const TWELVEDATA_URL = `wss://ws.twelvedata.com/v1/quotes/price?apikey=${TWELVEDATA_KEY}`;

/* Dual Engine state */
const DualEngine = (() => {
  let _ws        = null;
  let _engine    = null;  // 'mt5' | 'twelvedata' | null
  let _symbols   = ['XAU/USD','EUR/USD','GBP/USD','BTC/USD'];
  let _reconnTmr = null;
  let _attempts  = 0;

  /* ── Status Display ── */
  function _setStatus(state, engineLabel, detail) {
    // Dot states: 'live' | 'connecting' | 'disconnected'
    ['mt5StatusDot','tbMT5Dot','mt5ModalDot','dualEngineDot'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.dataset.state = state;
    });
    const stateLabel = engineLabel
      ? (state === 'live' ? `LIVE — ${engineLabel}` : state === 'connecting' ? `CONNECTING — ${engineLabel}` : `OFFLINE — ${engineLabel}`)
      : (state === 'live' ? 'LIVE' : 'OFFLINE');
    ['mt5StatusText','dualEngineStatus'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.textContent = stateLabel;
    });
    const tbLbl = document.getElementById('tbMT5Label');
    if (tbLbl) tbLbl.textContent = state === 'live' ? (engineLabel === 'MT5' ? 'LIVE' : 'API') : state === 'connecting' ? '…' : 'OFF';

    // Mode badge in terminal panel
    const modeTxt = document.getElementById('dualEngineMode');
    if (modeTxt) modeTxt.textContent = engineLabel ? `ENGINE: ${engineLabel}` : 'ENGINE: OFFLINE';

    // Home status label
    const homeStatus = document.getElementById('homeMT5Status');
    if (homeStatus) homeStatus.textContent = state === 'live' ? `${engineLabel} LIVE ✓` : state === 'connecting' ? 'MENGHUBUNGKAN…' : 'TIDAK TERHUBUNG';

    // Settings modal
    const settMT5 = document.getElementById('settMT5Status');
    if (settMT5) settMT5.textContent = state === 'live' ? `${engineLabel} LIVE` : 'OFFLINE';

    if (detail) {
      const el = document.getElementById('mt5BridgeInfo');
      if (el) el.textContent = detail;
    }
  }

  /* ── Flash price update effect ── */
  function _flashPrice(el) {
    if (!el) return;
    el.style.transition = 'color 0s';
    el.style.color      = 'var(--gold3)';
    clearTimeout(el._flashTimer);
    el._flashTimer = setTimeout(() => {
      el.style.transition = 'color .6s';
      el.style.color      = '';
    }, 220);
  }

  /* ── Process incoming tick regardless of source ── */
  function _applyTick(symbol, price, bid, ask) {
    // Normalise symbol: 'XAU/USD' → 'XAUUSD', 'EUR/USD' → 'EURUSD'
    const id  = symbol.replace('/', '').toUpperCase();
    const sym = SYMS.find(s => s.id === id);
    const dp  = sym ? sym.dp : 2;
    const mid = price || ((bid + ask) / 2) || 0;
    if (!mid) return;

    const prev = priceState[id] ? priceState[id].price : mid;
    priceState[id] = {
      bid:    bid  || mid - (sym ? sym.pip * 0.5 : 0.01),
      ask:    ask  || mid + (sym ? sym.pip * 0.5 : 0.01),
      price:  parseFloat(mid.toFixed(dp)),
      prev,
      dir:    mid > prev + 1e-9 ? 'up' : mid < prev - 1e-9 ? 'dn' : 'neu',
      spread: parseFloat(((ask || mid) - (bid || mid)).toFixed(dp)),
      live:   true,
      ts:     Date.now()
    };

    if (window.ICTZones) window.ICTZones.onTick(id, mid, Date.now());

    // Topbar
    const tbEl = document.getElementById('tbpx-' + id);
    if (tbEl) {
      tbEl.textContent = mid.toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp });
      tbEl.className   = 'tb-price-val ' + priceState[id].dir;
      _flashPrice(tbEl);
    }

    // Main price display (hero)
    const mainEl = document.getElementById('mainPriceDisplay-' + id);
    if (mainEl) {
      mainEl.textContent = mid.toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp });
      _flashPrice(mainEl);
    }

    // Symbol modal
    const spEl = document.getElementById('sp-' + id);
    if (spEl) {
      spEl.textContent = mid.toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp });
      spEl.className   = 'sym-opt-price ' + priceState[id].dir;
    }

    // OB refresh for active symbol
    if (id === curSym.id) updateOBWith(priceState[id].price, priceState[id].spread);
  }

  /* ── ENGINE A: MT5 Bridge ── */
  function _connectMT5(url) {
    _engine = 'mt5';
    _setStatus('connecting', 'MT5', url);
    try { _ws = new WebSocket(url); } catch {
      _setStatus('disconnected', 'MT5', 'URL tidak valid');
      _startFallback();
      return;
    }
    _ws.onopen = () => {
      _attempts = 0;
      _setStatus('live', 'MT5', url);
      toast('✅ MT5 Bridge terhubung — harga LIVE dari akun MT5');
      addLog('sys', '[DualEngine] ENGINE A — MT5 Bridge: ' + url);
      try { _ws.send(JSON.stringify({ action: 'subscribe', symbols: SYMS.map(s => s.id) })); } catch {}
    };
    _ws.onmessage = ev => {
      try {
        const d = JSON.parse(ev.data);
        if (!d) return;
        if (d.type === 'tick' || d.symbol) {
          _applyTick(d.symbol, d.price, d.bid, d.ask);
        } else if (d.type === 'account') {
          // Forward to MT5Bridge account processor
          _handleAccountState(d);
        } else if (d.type === 'positions') {
          _handlePositions(d);
        }
      } catch {}
    };
    _ws.onclose = () => {
      _attempts++;
      if (_attempts <= 5) {
        const delay = Math.min(3000 * _attempts, 15000);
        _setStatus('connecting', 'MT5', `Reconnect #${_attempts}…`);
        _reconnTmr = setTimeout(() => _connectMT5(url), delay);
      } else {
        _setStatus('disconnected', 'MT5', 'Gagal — beralih ke Global Feed');
        _startFallback();
      }
    };
    _ws.onerror = () => {};
  }

  /* ── ENGINE B: TwelveData Global API ── */
  function _connectTwelveData() {
    _engine = 'twelvedata';
    _setStatus('connecting', 'GLOBAL FEED', TWELVEDATA_URL);
    try { _ws = new WebSocket(TWELVEDATA_URL); } catch {
      _setStatus('disconnected', 'GLOBAL FEED', 'Koneksi gagal — mode simulasi');
      return;
    }
    _ws.onopen = () => {
      _attempts = 0;
      _setStatus('live', 'GLOBAL FEED', 'TwelveData WSS ✓');
      toast('📡 Global Feed aktif — TwelveData live pricing');
      addLog('sys', '[DualEngine] ENGINE B — TwelveData Global Feed');
      // Subscribe to major symbols
      try {
        _ws.send(JSON.stringify({
          action:  'subscribe',
          params:  { symbols: ['XAU/USD','EUR/USD','GBP/USD','BTC/USD','ETH/USD','USD/JPY'] }
        }));
      } catch {}
    };
    _ws.onmessage = ev => {
      try {
        const d = JSON.parse(ev.data);
        if (!d) return;
        // TwelveData format: { symbol, price, timestamp } or array
        if (d.event === 'price' && d.symbol && d.price !== undefined) {
          _applyTick(d.symbol, parseFloat(d.price), 0, 0);
        } else if (Array.isArray(d)) {
          d.forEach(item => {
            if (item.symbol && item.price !== undefined) _applyTick(item.symbol, parseFloat(item.price), 0, 0);
          });
        } else if (d.price !== undefined && d.symbol) {
          _applyTick(d.symbol, parseFloat(d.price), 0, 0);
        }
      } catch {}
    };
    _ws.onclose = () => {
      _attempts++;
      if (_attempts <= 3) {
        _setStatus('connecting', 'GLOBAL FEED', `Reconnect #${_attempts}…`);
        _reconnTmr = setTimeout(_connectTwelveData, 5000);
      } else {
        _setStatus('disconnected', 'GLOBAL FEED', 'Feed offline — simulasi aktif');
      }
    };
    _ws.onerror = () => {};
  }

  /* ── Fallback to TwelveData when MT5 fails ── */
  function _startFallback() {
    addLog('warn', '[DualEngine] MT5 failed → switching to ENGINE B (TwelveData)');
    _connectTwelveData();
  }

  /* ── Account & Position helpers (forward from MT5 messages) ── */
  function _handleAccountState(d) {
    const bal  = parseFloat(d.balance)    || 0;
    const eq   = parseFloat(d.equity)     || 0;
    const mar  = parseFloat(d.margin)     || 0;
    const free = parseFloat(d.freeMargin) || eq - mar;
    const dd   = parseFloat(d.drawdown)   || ((bal - eq) / Math.max(bal,1) * 100);
    const prof = parseFloat(d.profit)     || eq - bal;
    const fmt  = n => '$' + n.toLocaleString('en-US', { minimumFractionDigits:2, maximumFractionDigits:2 });
    const setT = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    setT('mt5Balance', fmt(bal)); setT('mt5Equity', fmt(eq));
    setT('mt5Margin', fmt(mar)); setT('mt5FreeMargin', fmt(free));
    setT('mt5Drawdown', dd.toFixed(2) + '%');
    setT('mt5Profit', (prof >= 0 ? '+' : '') + fmt(prof));
    const eqInp = document.getElementById('eqInp');
    if (eqInp && bal > 0) { eqInp.value = bal.toFixed(2); calcLot(); }
  }

  function _handlePositions(d) {
    const positions = d.data || [];
    const listEl = document.getElementById('mt5PositionsList');
    const rowsEl = document.getElementById('mt5PosRows');
    const cntEl  = document.getElementById('mt5PosCount');
    if (!listEl || !rowsEl) return;
    if (!positions.length) { listEl.hidden = true; return; }
    listEl.hidden = false;
    if (cntEl) cntEl.textContent = positions.length + ' OPEN';
    rowsEl.innerHTML = positions.map(p => {
      const pnl = parseFloat(p.profit) || 0;
      return `<div class="mt5-pos-row">
        <span class="mt5-pos-symbol">${p.symbol}</span>
        <span class="mt5-pos-type ${p.type}">${p.type?.toUpperCase()} ${p.volume}</span>
        <span class="cs">${p.openPrice || '—'}</span>
        <span class="mt5-pos-profit ${pnl >= 0 ? 'pos' : 'neg'}">${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)}</span>
      </div>`;
    }).join('');
  }

  /* ── Public API ── */
  return {
    /* Called by CONNECT button in the Bridge Setup modal / home card */
    connect(urlFromInput) {
      // Clear any existing connection
      if (_reconnTmr) { clearTimeout(_reconnTmr); _reconnTmr = null; }
      if (_ws) { try { _ws.close(1000, 'user_reconnect'); } catch {} _ws = null; }
      _attempts = 0;

      const url = (urlFromInput || '').trim();

      if (url && (url.startsWith('ws://') || url.startsWith('wss://'))) {
        // ENGINE A — MT5 Bridge
        LS.set('shelen_mt5_url', url);
        const modalInp = document.getElementById('mt5UrlInput');
        if (modalInp) modalInp.value = url;
        _connectMT5(url);
      } else {
        // ENGINE B — TwelveData (field was empty or invalid)
        _connectTwelveData();
      }
    },

    disconnect() {
      if (_reconnTmr) { clearTimeout(_reconnTmr); _reconnTmr = null; }
      if (_ws) { try { _ws.close(1000, 'user_disconnect'); } catch {} _ws = null; }
      _setStatus('disconnected', _engine ? _engine.toUpperCase() : 'NONE', 'Manual disconnect');
      _engine = null;
      _attempts = 0;
      toast('Engine disconnected');
      addLog('warn', '[DualEngine] Disconnected by user');
    },

    reconnect() { this.connect(LS.get('shelen_mt5_url') || ''); },

    /* Expose for home page quick-connect */
    connectFromHome() {
      const inp = document.getElementById('homeMT5UrlInput');
      this.connect(inp ? inp.value : '');
    },

    get connected() { return _ws && _ws.readyState === WebSocket.OPEN; },
    get engine()    { return _engine; },
    get url()       { return LS.get('shelen_mt5_url') || 'ws://localhost:8080'; }
  };
})();

/* Alias so existing code referencing MT5Bridge still works */
MT5Bridge.connect       = (url) => DualEngine.connect(url);
MT5Bridge.disconnect    = ()    => DualEngine.disconnect();
MT5Bridge.reconnect     = ()    => DualEngine.reconnect();
MT5Bridge.connectFromHome = ()  => DualEngine.connectFromHome();


/* ═══════════════════════════════════════════════════════════════════
   §27  FOUNDER GODMODE DETECTION SYSTEM
   ─────────────────────────────────────────────────────────────────
   URL param  →  ?auth=founder_unlock
   Sets localStorage flag  →  isFounder = true
   Calls unlockAllFeatures() which removes all paywalls and upgrades
   the profile badge to "FOUNDER" instantly.
   Regular users visiting the base URL are completely unaffected.
   ═══════════════════════════════════════════════════════════════════ */
const FounderSystem = (() => {
  const SECRET_PARAM  = 'auth';
  const SECRET_VALUE  = 'founder_unlock';
  const LS_KEY        = 'shelen_is_founder';
  const FOUNDER_NAME  = 'Nizar Nurkhalik';
  const FOUNDER_EMAIL = 'nizar@shelen.id';

  /* Check URL on load */
  function _checkURLParam() {
    const params = new URLSearchParams(window.location.search);
    if (params.get(SECRET_PARAM) === SECRET_VALUE) {
      LS.set(LS_KEY, true);
      // Clean URL without reloading (hide the param from address bar)
      const cleanURL = window.location.pathname + window.location.hash;
      window.history.replaceState({}, '', cleanURL);
    }
  }

  /* Is founder? Check localStorage */
  function _isFounder() {
    return LS.get(LS_KEY) === true;
  }

  /* The nuclear unlock — removes every paywall, tier gate, and lock screen */
  function _unlockAllFeatures() {
    // 1. Create / elevate founder user in auth state
    const founderUser = {
      id:     'founder_nizar',
      name:   FOUNDER_NAME,
      email:  FOUNDER_EMAIL,
      pass:   '',
      plan:   'premium',
      joined: '2024-01-01',
      isFounder: true
    };
    user       = founderUser;
    activeTier = 'premium';
    LS.set('iz_user',  founderUser);
    LS.set('iz_tier',  'premium');

    // 2. Remove all lock screens
    document.querySelectorAll('.lock').forEach(el => {
      el.style.display = 'none';
      el.remove();
    });

    // 3. Show all gated content panels
    ['tc-content','nc-content','jc-content','cc-content'].forEach(id => {
      const el = document.getElementById(id);
      if (el) { el.hidden = false; el.style.display = ''; }
    });

    // 4. Apply premium tier (all limits removed)
    activeTier = 'premium';
    if (typeof _applyTierUI === 'function') _applyTierUI();

    // 5. Update user button with FOUNDER badge
    const btn = document.getElementById('userBtn');
    if (btn) {
      btn.textContent = 'FOUNDER';
      btn.style.background    = 'linear-gradient(135deg, var(--gold), #e89828)';
      btn.style.color         = '#000';
      btn.style.fontWeight    = '700';
      btn.style.borderColor   = 'transparent';
      btn.style.letterSpacing = '2px';
      btn.onclick = openSettingsModal;
    }

    // 6. Unlock all paywall modals' buttons
    document.querySelectorAll('[onclick*="openPayModal"],[onclick*="openAuth"]').forEach(el => {
      if (el.tagName === 'BUTTON') {
        el.disabled   = false;
        el.style.opacity = '1';
      }
    });

    // 7. Tier badges
    ['free','medium','premium'].forEach(t => {
      const badge = document.getElementById('badge-' + t);
      if (badge) badge.classList.toggle('show', t === 'premium');
    });

    // 8. Unlock swing trading style tab
    const swingBtn = document.getElementById('st-swing');
    if (swingBtn) swingBtn.style.opacity = '1';

    // 9. Enable signal scan button
    const scanBtn = document.getElementById('btnScan');
    if (scanBtn) { scanBtn.disabled = false; scanBtn.style.opacity = '1'; }

    // 10. Inject FOUNDER crown in topbar logo
    const logo = document.querySelector('.tb-logo');
    if (logo && !document.getElementById('founderCrown')) {
      const crown = document.createElement('span');
      crown.id        = 'founderCrown';
      crown.textContent = '👑';
      crown.style.cssText = 'font-size:13px;margin-left:3px;filter:drop-shadow(0 0 4px gold);';
      logo.appendChild(crown);
    }

    // 11. Log and toast
    addLog('sys', '[GODMODE] Founder unlock activated — all features unlocked for ' + FOUNDER_NAME);
    setTimeout(() => toast('👑 GODMODE ACTIVE — Welcome, Founder Nizar ⚡'), 600);
    console.log(
      '%c 👑 SHELEN GODMODE %c FOUNDER UNLOCK ACTIVE ',
      'background:linear-gradient(90deg,#c8922a,#f0b44a);color:#000;font-weight:900;padding:4px 8px;border-radius:4px 0 0 4px;font-size:13px;',
      'background:#010204;color:#f0b44a;padding:4px 8px;border-radius:0 4px 4px 0;border:1px solid #f0b44a;font-size:13px;'
    );
  }

  /* Console command for Nizar: window.founderUnlock() */
  function _manualUnlock() {
    LS.set(LS_KEY, true);
    _unlockAllFeatures();
  }

  /* Revoke (for testing) */
  function _revoke() {
    LS.del(LS_KEY);
    LS.del('iz_user');
    LS.del('iz_tier');
    user = null; activeTier = 'free';
    toast('Founder revoked. Refresh to apply.');
  }

  /* Public */
  return {
    init() {
      _checkURLParam();
      if (_isFounder()) {
        // Defer until DOM is ready
        if (document.readyState === 'loading') {
          document.addEventListener('DOMContentLoaded', _unlockAllFeatures);
        } else {
          // Small delay so other inits complete first
          setTimeout(_unlockAllFeatures, 200);
        }
      }
    },
    isFounder:   _isFounder,
    unlock:      _manualUnlock,
    revoke:      _revoke,
    unlockAll:   _unlockAllFeatures
  };
})();

/* Expose to window — Nizar's browser console commands */
window.founderUnlock = () => FounderSystem.unlock();
window.founderRevoke = () => FounderSystem.revoke();

/* Admin plan activator (console-only) */
window.izarAdminActivate = (email, plan) => {
  const allUsers = LS.get('iz_users') || [];
  const idx = allUsers.findIndex(u => u.email === email);
  if (idx === -1) { console.error('[SHELEN ADMIN] User not found:', email); return 'NOT FOUND'; }
  allUsers[idx].plan = plan;
  LS.set('iz_users', allUsers);
  if (user && user.email === email) {
    user.plan = plan; activeTier = plan;
    LS.set('iz_user', user); LS.set('iz_tier', plan);
    _applyTierUI();
    toast(`✅ Plan ${plan.toUpperCase()} activated for ${email}`);
    addLog('sys', `[ADMIN] Plan → ${plan} for ${email}`);
    goPage('terminal');
  }
  console.log('[SHELEN ADMIN] ✅ Activated', plan, 'for', email);
  return 'DONE';
};


/* ═══════════════════════════════════════════════════════════════════
   §28  AI SIGNAL ENGINE — ALCHEMIST v8
   Full ICT/SMC/MSNR/CRT pattern library + live MT5/API prices
   ═══════════════════════════════════════════════════════════════════ */

/* ── Pattern Library ── */
const ALCH_PATTERNS = {
  alch: {
    name: 'Alchemist QM + OCL',
    reasons: [
      'Quasimodo pattern detected on HTF. OCL (Old Candle Low) acting as premium zone. Displacement confirmed post-sweep.',
      'Double top / double bottom pattern with OCL retest. Equilibrium zone tested, premium/discount ratio ideal.',
      'Alchemist sequence: sweep → displacement → retest. QM neckline breached — momentum confirmed.',
      'OCL mitigation complete on M15. HTF structure bullish. FVG embedded inside QM wing — high probability entry.',
      'Quasimodo shoulder acting as EQH sweep target. Price returned to OCL — classic Alchemist reversal setup.',
    ]
  },
  ict: {
    name: 'ICT AMD + Killzone',
    reasons: [
      'AMD cycle: Accumulation 00:00–03:00 UTC. Manipulation (sweep) 03:00–05:00 UTC. Distribution phase initiated.',
      'ICT Optimal Trade Entry (OTE) 0.618–0.786 Fibonacci retracement confirmed. HTF bias aligned.',
      'London Killzone sweep of prior day low. FVG (Fair Value Gap) left on M5 chart — magnet for price.',
      'NY Killzone: BSL (Buy Side Liquidity) resting above swing high. SMT divergence confirmed on M1 vs M5.',
      'ICT Silver Bullet window 3:00–4:00 AM. IOFED institutional order flow entry confirmed. Power of 3 active.',
    ]
  },
  msnr: {
    name: 'MSNR RBS + SBR',
    reasons: [
      'Resistance Becomes Support (RBS): Prior HTF resistance broken, now retested as support. Clean structure flip.',
      'Support Becomes Resistance (SBR): Bearish SBR confluence with FVG rejection. Orderbook shows seller stacking.',
      'MSNR multi-touch level with OB mitigation. Three touches confirmed — institutional interest validated.',
      'MSNR breakout-retest sequence complete. Volume confirmed breakout. SBR level now acting as entry zone.',
      'MSNR key level confluence with D1 OCL. Momentum returning after deep pullback. Structure intact.',
    ]
  },
  crt: {
    name: 'CRT TBS + Sweep',
    reasons: [
      'Candle Range Theory: True Body Sweep (TBS) of H4 candle. Price swept below 50% — reversal imminent.',
      'CRT midnight candle sweep: Low swept at Asia session, setting up London/NY expansion trade.',
      'Opening Range Expansion: CRT pattern with H1 body above/below 50%. Displacement confirmed post-sweep.',
      'CRT sequential sweep: Consecutive TBS signals on M15 and H1. Multi-timeframe convergence detected.',
      'CRT daily candle 50% retest. Price returned to IBWM (Inside Bar within Model). Entry at precision level.',
    ]
  },
  full: {
    name: 'FULL CONFLUENCE ★',
    reasons: [
      'MAXIMUM CONFLUENCE: ICT AMD + Alchemist QM + MSNR RBS + CRT TBS aligned on same price zone. Probability: VERY HIGH.',
      'Full stack: H4 OCL + M15 FVG + LTF OTE + KZ timing + Sentiment 78% bullish. All systems green.',
      'FULL CONFLUENCE active: Structure break on H1, OB mitigation on M5, FVG on M1, AMD cycle distribution. Entry at precision.',
      'Elite setup: QM + RBS + ICT Killzone + 0.786 OTE + volume imbalance. 5 confluence factors confirmed.',
      'GODMODE SIGNAL: All 4 strategies aligned. Daily bias confirmed. LTF entry model perfect. Rare setup — max size.',
    ]
  }
};

const SCALP_SETUPS  = ['M1 Sweep + M5 FVG Fill','W Formation + OCL Retest','TBS M1 + M5 Confirmation','Micro QM + OTE Entry','Breaker Block M5'];
const INTRA_SETUPS  = ['H1 MSB + M15 Entry','4H OB + M15 OTE','Daily FVG + H1 Tap','H4 QM + H1 Sweep Entry','ICT AMD H1 Phase'];
const SWING_SETUPS  = ['W1 Structure + D1 OB','Monthly OCL Retest','Macro AMD + W1 FVG','Quarterly Bias H4 Entry','D1 Sweep + 4H OTE'];

/* ── Main Zone Scanner ──────────────────────────────────────────────
   Real ICT/SMC detection (js/ict-zones.js) run against real candle
   data. No Math.random(), no manufactured verdict, no fabricated
   confidence %. It reports which named criteria matched and where —
   an area, not a price — and the trading decision stays with whoever
   reads it. See js/ict-zones.js for the detection logic itself. ── */
async function genSignal() {
  if (!user) { toast('Login dulu.', 'warn'); openAuth(); return; }
  if (!stratRunning || stratPaused) { toast('Strategy engine paused/stopped.', 'warn'); return; }

  const lim = getTierLimits();
  if (sigCount >= lim.signals) {
    const feed = document.getElementById('sigFeed');
    if (feed) feed.innerHTML = `
      <div class="signal-blur-overlay">
        <span style="font-size:32px;">🔒</span>
        <p style="font-family:var(--mono);font-size:10px;color:var(--gold2);letter-spacing:2px;">LIMIT HARIAN HABIS</p>
        <p style="font-family:var(--mono);font-size:8.5px;color:var(--txt2);">${sigCount} / ${lim.signals} scan terpakai. Upgrade untuk scan unlimited ♾️</p>
        <button class="btn btn-gold" style="width:220px;margin-top:6px;" onclick="goPage('pricing')">⚡ UPGRADE SEKARANG</button>
      </div>`;
    return;
  }

  // Style gate
  if (curStyle === 'swing' && !lim.swing) {
    toast('🔒 Swing mode eksklusif Premium!', 'warn');
    return;
  }

  const btn  = document.getElementById('btnScan');
  const feed = document.getElementById('sigFeed');
  if (btn)  { btn.disabled = true; btn.textContent = '▪ SCANNING ZONES…'; }
  if (feed) feed.innerHTML = `<div class="scanning">◉ ALCHEMIST — SCANNING ${curTF}m STRUCTURE…</div>`;

  const inst = document.getElementById('sigInst')?.value || curSym.id;
  const sym  = SYMS.find(s => s.id === inst) || SYMS[0];
  const dp   = sym.dp;
  const pip  = sym.pip;
  const st   = priceState[inst] || priceState[curSym.id] || { price: sym.base, spread: sym.pip };
  const mid  = st.price || sym.base;

  // One-time historical backfill so the scan is meaningful right away.
  // No-op unless a real TwelveData key is set in js/ict-zones.js.
  if (window.ICTZones) {
    const tvInterval = curTF === 'D' ? '1day' : curTF === 'W' ? '1week' : curTF + 'min';
    await window.ICTZones.backfill(inst, curTF, tvInterval);
  }
  await new Promise(r => setTimeout(r, 350)); // short UX pause, not fake "AI thinking"

  if (btn) { btn.disabled = false; btn.textContent = '▶ SCAN STRUCTURE'; }
  if (!feed) return;

  const result = window.ICTZones
    ? window.ICTZones.scanZones(inst, curTF, mid, pip)
    : { ready: false, candleCount: 0, zones: [], range: null };

  const now = new Date();
  const timeStr = now.toISOString().substr(11, 5) + ' UTC';

  if (!result.ready) {
    feed.innerHTML = `<div class="scanning" style="opacity:.85;">
      ⏳ Candle ${inst} ${curTF}m baru ${result.candleCount}/15 — belum cukup buat scan struktur.<br>
      Biarkan chart terbuka beberapa menit biar candle live kebentuk, atau isi API key TwelveData asli
      di <code>js/ict-zones.js</code> (const <code>TD_HISTORY_KEY</code>) buat langsung dapet histori.
    </div>`;
    return;
  }

  const rangeLabel = result.range
    ? `Dealing range ${result.range.low.toFixed(dp)}–${result.range.high.toFixed(dp)} · Mid ${result.range.mid.toFixed(dp)}`
    : '';

  if (!result.zones.length) {
    feed.innerHTML = `<div class="scanning" style="opacity:.85;">
      Nggak ada order block / FVG yang masih fresh di dekat harga sekarang untuk ${inst} ${curTF}m.<br>${rangeLabel}
    </div>`;
    sigCount++; updateMetrics(); _applyTierUI();
    addLog('sys', `[SCAN #${sigCount}] ${inst} ${curTF}m — 0 zona terdeteksi. ${rangeLabel}`);
    return;
  }

  const fmt = n => n.toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp });

  const cardsHtml = result.zones.slice(0, 6).map((z, idx) => {
    const cardId  = 'zone-' + Date.now() + '-' + idx;
    const isBull  = z.side === 'bullish';
    const zMid    = (z.low + z.high) / 2;
    const posNote = mid >= z.high ? `${z.distancePips} pip di bawah harga`
                  : mid <= z.low  ? `${z.distancePips} pip di atas harga`
                  : 'harga sedang di dalam area ini';
    return `
    <div class="sig-card ${isBull ? '' : 'sell'}" id="${cardId}">
      <div class="sig-top">
        <div>
          <div class="sig-sym">${inst}</div>
          <div class="sig-dir ${isBull ? 'long' : 'short'}">${isBull ? '▲ DEMAND ZONE' : '▼ SUPPLY ZONE'}</div>
        </div>
        <div style="text-align:right;font-family:var(--mono);font-size:8px;color:var(--txt3);">
          ZONA ${idx + 1}/${result.zones.length}<br>${timeStr}
        </div>
      </div>

      <span class="sig-type-badge ${isBull ? 'buy-limit' : 'sell-limit'}">
        ${curTF}m · ${z.confluence} kriteria match
      </span>

      <div class="sig-zone">
        <div class="sig-zone-label">AREA (bukan satu harga)</div>
        <div class="sig-zone-prices">${fmt(z.low)} – ${fmt(z.high)}</div>
        <div class="sig-zone-sub">
          LIVE: ${fmt(mid)}
          ${DualEngine.connected ? '· ' + (DualEngine.engine === 'mt5' ? '🔌 MT5 LIVE' : '📡 GLOBAL FEED') : '· ⚙️ SIM'}
          · ${posNote}
        </div>
      </div>

      <div class="zone-tags-row">
        ${z.tags.map(t => `<span class="sig-type-badge ${isBull ? 'buy-limit' : 'sell-limit'}">${t}</span>`).join('')}
      </div>

      <div class="zone-note">
        Ini area yang cocok dengan kriteria di atas — bukan sinyal beli/jual. Entry, stop loss, take profit, dan ukuran lot sepenuhnya keputusan kamu sendiri.
      </div>

      <div style="display:flex;gap:6px;margin-top:9px;">
        <button class="btn btn-ghost btn-sm" style="flex:1;" onclick="dismissSignal('${cardId}')">✕ DISMISS</button>
      </div>
    </div>`;
  }).join('');

  feed.innerHTML = `<div class="zone-range-label">${rangeLabel}</div>` + cardsHtml;

  sigCount++;
  updateMetrics();
  _applyTierUI();
  addLog('sys', `[SCAN #${sigCount}] ${inst} ${curTF}m — ${result.zones.length} zona terdeteksi. ${rangeLabel}`);

  if (voiceAlertOn) {
    _speak(`${inst}. ${result.zones.length} zona terdeteksi pada timeframe ${curTF} menit. Keputusan entry ada di tangan kamu.`);
  }

  // Auto-refresh sentiment after scan
  refreshSentiment();
}

/* Dismiss a signal card */
function dismissSignal(id) {
  const el = document.getElementById(id);
  if (el) { el.style.opacity = '0'; el.style.transform = 'translateX(-20px)'; setTimeout(() => el.remove(), 300); }
}

/* Quick-log a signal directly to journal */
function logSignalAsTrade(pair, dir, entry, sl, tp) {
  if (!user) { toast('Login dulu.', 'warn'); return; }
  const inp = { tPair: pair, tDir: dir, tE: entry, tX: '', tSL: sl, tTP: tp, tLot: calcLot(), tPnl: '', tNote: 'Auto-logged from AI Signal #' + sigCount };
  // Populate journal form
  Object.entries(inp).forEach(([id, val]) => { const el = document.getElementById(id); if (el) el.value = val; });
  toast('Signal di-copy ke form Journal 📓');
  goPage('journal');
}


/* ═══════════════════════════════════════════════════════════════════
   §29  JOURNAL SYSTEM
   Trade log · Stats · Equity Curve · Winrate Ring · Heatmap · Partial Close
   ═══════════════════════════════════════════════════════════════════ */

/* ── Add Trade ── */
function addTrade() {
  if (!user) { toast('Login dulu.', 'warn'); return; }
  const pair  = document.getElementById('tPair')?.value  || 'XAUUSD';
  const dir   = document.getElementById('tDir')?.value   || 'BUY';
  const entry = parseFloat(document.getElementById('tE')?.value)   || 0;
  const exit  = parseFloat(document.getElementById('tX')?.value)   || 0;
  const sl    = parseFloat(document.getElementById('tSL')?.value)  || 0;
  const tp    = parseFloat(document.getElementById('tTP')?.value)  || 0;
  const lot   = parseFloat(document.getElementById('tLot')?.value) || 0.1;
  const pnl   = parseFloat(document.getElementById('tPnl')?.value) || 0;
  const note  = document.getElementById('tNote')?.value  || '';

  if (!entry) { toast('Masukkan harga entry.', 'err'); return; }

  const trade = {
    id:    't' + Date.now(),
    date:  new Date().toISOString().split('T')[0],
    time:  new Date().toISOString().substr(11,5),
    pair, dir, entry, exit, sl, tp, lot, pnl, note
  };

  trades.push(trade);
  LS.set('iz_trades', trades);

  // Clear form
  ['tE','tX','tSL','tTP','tPnl','tNote'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });

  renderJournalStats();
  addLog(dir === 'BUY' ? 'buy' : 'sell', `[JOURNAL] ${dir} ${pair} @ ${entry} P&L: ${pnl >= 0 ? '+' : ''}$${parseFloat(pnl).toFixed(2)}`);
  toast('Trade dicatat ke journal! 📓');
}

/* ── Render All Journal Stats ── */
function renderJournalStats() {
  if (!trades.length) {
    document.getElementById('tradeCards') && (document.getElementById('tradeCards').innerHTML = '<div style="text-align:center;padding:24px;font-family:var(--mono);font-size:9px;color:var(--txt3);">— BELUM ADA TRADE —</div>');
    return;
  }

  const wins   = trades.filter(t => (+t.pnl || 0) > 0);
  const losses = trades.filter(t => (+t.pnl || 0) < 0);
  const total  = trades.length;
  const pnlSum = trades.reduce((a, t) => a + (+t.pnl || 0), 0);
  const wr     = total ? (wins.length / total * 100) : 0;

  // Max Drawdown calc
  let equity = 10000, peak = 10000, maxDD = 0;
  trades.forEach(t => {
    equity += (+t.pnl || 0);
    if (equity > peak) peak = equity;
    const dd = peak > 0 ? (peak - equity) / peak * 100 : 0;
    if (dd > maxDD) maxDD = dd;
  });

  // Stats
  const setEl2 = (id, v, cls) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = v;
    if (cls) el.className = el.className.replace(/\bjsc-\w+/g, cls);
  };

  setEl2('jT',  total.toString());
  setEl2('jWR', wr.toFixed(1) + '%');
  setEl2('jPnl', (pnlSum >= 0 ? '+$' : '-$') + Math.abs(pnlSum).toFixed(2));
  setEl2('jDD',  maxDD.toFixed(1) + '%');

  const wlEl = document.getElementById('jWLs');
  if (wlEl) wlEl.textContent = `W:${wins.length} / L:${losses.length}`;
  const pctEl = document.getElementById('jPct');
  if (pctEl) { pctEl.textContent = (pnlSum >= 0 ? '+' : '') + (pnlSum / 100).toFixed(2) + '%'; }

  // Winrate Ring
  _drawWinrateRing(wr);

  // Drawdown meter
  const ddFill = document.getElementById('ddFill');
  const ddCur  = document.getElementById('ddcur');
  if (ddFill) ddFill.style.width = Math.min(maxDD * 10, 100) + '%';
  if (ddCur)  ddCur.textContent  = maxDD.toFixed(1) + '%';

  // Heatmap by pair
  _drawHeatmap();

  // Equity curve
  _drawEquityCurve();

  // Trade cards list
  _renderTradeCards();
}

/* ── Winrate Ring (SVG arc via stroke-dashoffset) ── */
function _drawWinrateRing(wr) {
  const arc    = document.getElementById('wrArc');
  const pctEl  = document.getElementById('wrPct');
  const wEl    = document.getElementById('wW');
  const lEl    = document.getElementById('wL');
  if (!arc) return;

  const wins   = trades.filter(t => (+t.pnl || 0) > 0).length;
  const losses = trades.length - wins;
  const circumference = 282.74; // 2π × 45
  const offset = circumference - (wr / 100) * circumference;

  arc.style.strokeDashoffset = offset;
  arc.style.stroke = wr >= 60 ? 'var(--green)' : wr >= 45 ? 'var(--gold2)' : 'var(--red)';
  if (pctEl) pctEl.textContent = wr.toFixed(0) + '%';
  if (wEl) wEl.textContent = wins;
  if (lEl) lEl.textContent = losses;
}

/* ── P&L Heatmap by Pair ── */
function _drawHeatmap() {
  const grid = document.getElementById('hmGrid');
  if (!grid) return;
  const pairMap = {};
  trades.forEach(t => {
    if (!pairMap[t.pair]) pairMap[t.pair] = 0;
    pairMap[t.pair] += (+t.pnl || 0);
  });
  const sorted = Object.entries(pairMap).sort((a, b) => b[1] - a[1]);
  const maxAbs = Math.max(...sorted.map(([, v]) => Math.abs(v)), 1);

  grid.innerHTML = sorted.map(([pair, pnl]) => {
    const intensity = Math.min(Math.abs(pnl) / maxAbs, 1);
    const bg = pnl >= 0
      ? `rgba(0,212,138,${0.12 + intensity * 0.55})`
      : `rgba(232,51,74,${0.12 + intensity * 0.55})`;
    return `<div class="hm-cell" style="background:${bg};color:${pnl>=0?'var(--green)':'var(--red)'};">
      <div style="font-size:8px;font-family:var(--mono);margin-bottom:2px;">${pair}</div>
      <div style="font-size:10px;font-family:var(--mono);font-weight:600;">${pnl>=0?'+':''}$${pnl.toFixed(0)}</div>
    </div>`;
  }).join('');
}

/* ── Equity Curve Canvas ── */
function _drawEquityCurve() {
  const canvas = document.getElementById('eqCv');
  if (!canvas) return;
  const ctx    = canvas.getContext('2d');
  const W      = canvas.offsetWidth || 300;
  const H      = canvas.offsetHeight || 130;
  canvas.width  = W;
  canvas.height = H;

  // Build equity array
  let eq = 10000;
  const points = [eq];
  trades.forEach(t => { eq += (+t.pnl || 0); points.push(eq); });

  const minP = Math.min(...points);
  const maxP = Math.max(...points);
  const range = Math.max(maxP - minP, 100);
  const pad   = { t: 12, b: 16, l: 8, r: 8 };

  ctx.clearRect(0, 0, W, H);

  if (points.length < 2) {
    ctx.fillStyle = 'rgba(255,255,255,.06)';
    ctx.fillRect(pad.l, pad.t, W - pad.l - pad.r, H - pad.t - pad.b);
    ctx.fillStyle = 'rgba(255,255,255,.2)';
    ctx.font = '10px monospace';
    ctx.fillText('Belum ada data cukup', W / 2 - 60, H / 2);
    return;
  }

  const toX = i  => pad.l + (i / (points.length - 1)) * (W - pad.l - pad.r);
  const toY = pt => pad.t + (1 - (pt - minP) / range) * (H - pad.t - pad.b);

  // Grid lines
  ctx.strokeStyle = 'rgba(255,255,255,.04)';
  ctx.lineWidth   = 1;
  [0.25, 0.5, 0.75].forEach(f => {
    ctx.beginPath();
    ctx.moveTo(pad.l, pad.t + f * (H - pad.t - pad.b));
    ctx.lineTo(W - pad.r, pad.t + f * (H - pad.t - pad.b));
    ctx.stroke();
  });

  // Gradient fill
  const grad = ctx.createLinearGradient(0, pad.t, 0, H - pad.b);
  grad.addColorStop(0,   'rgba(0,212,138,.28)');
  grad.addColorStop(1,   'rgba(0,212,138,.0)');
  ctx.beginPath();
  ctx.moveTo(toX(0), H - pad.b);
  points.forEach((p, i) => ctx.lineTo(toX(i), toY(p)));
  ctx.lineTo(toX(points.length - 1), H - pad.b);
  ctx.closePath();
  ctx.fillStyle = grad;
  ctx.fill();

  // Line
  ctx.beginPath();
  points.forEach((p, i) => i === 0 ? ctx.moveTo(toX(i), toY(p)) : ctx.lineTo(toX(i), toY(p)));
  ctx.strokeStyle = 'var(--green)';
  ctx.lineWidth   = 2;
  ctx.lineJoin    = 'round';
  ctx.stroke();

  // Current equity label
  const lastY = toY(points[points.length - 1]);
  ctx.fillStyle = 'var(--green)';
  ctx.font      = '9px monospace';
  ctx.fillText('$' + eq.toLocaleString('en-US', { minimumFractionDigits:2 }), toX(points.length-1) - 50, lastY - 6);

  // Dot at latest
  ctx.beginPath();
  ctx.arc(toX(points.length-1), lastY, 4, 0, Math.PI*2);
  ctx.fillStyle = 'var(--green)';
  ctx.fill();
  ctx.strokeStyle = '#000';
  ctx.lineWidth   = 1.5;
  ctx.stroke();
}

/* ── Trade Cards List ── */
function _renderTradeCards() {
  const el = document.getElementById('tradeCards');
  if (!el) return;
  if (!trades.length) { el.innerHTML = '<div style="text-align:center;padding:24px;font-family:var(--mono);font-size:9px;color:var(--txt3);">— BELUM ADA TRADE —</div>'; return; }

  el.innerHTML = [...trades].reverse().slice(0, 30).map((t, i) => {
    const pnl    = parseFloat(t.pnl) || 0;
    const isPos  = pnl >= 0;
    const rr     = t.sl && t.tp && t.entry ? Math.abs((t.tp - t.entry) / (t.entry - t.sl)).toFixed(1) : '—';
    return `<div class="trade-card ${t.dir.toLowerCase()}" data-idx="${trades.length - 1 - i}">
      <span class="trade-card-dir">${t.dir}</span>
      <div>
        <div class="trade-card-pair">${t.pair}</div>
        <div class="trade-card-date">${t.date} ${t.time || ''} · R:R ${rr} · ${t.lot}L</div>
      </div>
      <span class="trade-card-pnl ${isPos ? 'pos' : 'neg'}">${isPos ? '+' : ''}$${pnl.toFixed(2)}</span>
    </div>`;
  }).join('');
}

/* ── Export CSV ── */
function exportCSV() {
  if (!trades.length) { toast('Belum ada trade untuk diexport.', 'warn'); return; }
  const h = 'Date,Time,Pair,Dir,Entry,Exit,SL,TP,Lot,PnL,Note\n';
  const r = trades.map(t =>
    [t.date, t.time||'', t.pair, t.dir, t.entry, t.exit, t.sl, t.tp, t.lot, t.pnl, '"' + (t.note||'').replace(/"/g,"'") + '"'].join(',')
  ).join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([h + r], { type: 'text/csv;charset=utf-8;' }));
  a.download = `shelen_trades_${new Date().toISOString().split('T')[0]}.csv`;
  a.click();
  toast('CSV exported ✅');
}

/* ── Partial Close Calculator ── */
function updatePC(pct) {
  const pctEl  = document.getElementById('pcPct');
  const lotEl  = document.getElementById('pcLot');
  const remEl  = document.getElementById('pcRem');
  const beEl   = document.getElementById('pcBE');
  const pnlEl2 = document.getElementById('pcPnl');
  if (pctEl) pctEl.textContent = pct + '%';

  const baseLot  = parseFloat(document.getElementById('tLot')?.value || '0.10') || 0.10;
  const closeLot = (baseLot * pct / 100).toFixed(2);
  const remLot   = (baseLot - parseFloat(closeLot)).toFixed(2);

  if (lotEl) lotEl.textContent = closeLot + ' lots';
  if (remEl) remEl.textContent = remLot   + ' lots';

  // Breakeven estimate (very simplified)
  const entry = parseFloat(document.getElementById('tE')?.value || '0') || 0;
  const tp    = parseFloat(document.getElementById('tTP')?.value || '0') || 0;
  if (entry && tp) {
    const be = parseFloat(((entry + tp) / 2).toFixed(curSym.dp)).toLocaleString();
    if (beEl)  beEl.textContent  = be;
    const estPnl = (Math.abs(tp - entry) * 0.5 * parseFloat(closeLot) * 100).toFixed(2);
    if (pnlEl2) pnlEl2.textContent = '+$' + estPnl + ' (est.)';
  }
}

/* ── Share to IG Story (Canvas export) ── */
function shareToIG() {
  const canvas = document.getElementById('shareCanvas');
  if (!canvas) { toast('Canvas not found', 'err'); return; }

  const wins   = trades.filter(t => (+t.pnl||0) > 0).length;
  const total  = trades.length;
  const pnlSum = trades.reduce((a, t) => a + (+t.pnl||0), 0);
  const wr     = total ? (wins/total*100).toFixed(1) : '0.0';
  const W = 1080, H = 1920;
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');

  // Background
  ctx.fillStyle = '#010204';
  ctx.fillRect(0, 0, W, H);

  // Gold gradient accent bar top
  const topGrad = ctx.createLinearGradient(0,0,W,0);
  topGrad.addColorStop(0,'#c8922a'); topGrad.addColorStop(.5,'#f0b44a'); topGrad.addColorStop(1,'#c8922a');
  ctx.fillStyle = topGrad;
  ctx.fillRect(0, 0, W, 10);
  ctx.fillRect(0, H-10, W, 10);

  // Logo
  ctx.fillStyle = '#f0b44a';
  ctx.font = 'bold 150px Arial';
  ctx.fillText('SHE', 80, 220);
  ctx.fillStyle = '#dde4f0';
  ctx.fillText('LEN', 420, 220);
  ctx.fillStyle = 'rgba(240,180,74,.3)';
  ctx.fillRect(80, 245, W-160, 2);

  // Subtitle
  ctx.fillStyle = 'rgba(136,153,184,.75)';
  ctx.font = '42px monospace';
  ctx.fillText('PRECISION OVER NOISE · v13', 80, 305);

  // Stat cards
  const stats = [
    { label: 'WIN RATE',      value: wr + '%',         color: parseFloat(wr) >= 50 ? '#00d48a' : '#e8334a' },
    { label: 'NET P&L',       value: (pnlSum>=0?'+$':'-$') + Math.abs(pnlSum).toFixed(0), color: pnlSum >= 0 ? '#00d48a' : '#e8334a' },
    { label: 'TOTAL TRADES',  value: total.toString(),  color: '#f0b44a' },
    { label: 'W / L',         value: wins + ' / ' + (total - wins), color: '#00d4e8' },
  ];
  stats.forEach((s, i) => {
    const y = 380 + i * 350;
    ctx.fillStyle = 'rgba(6,9,16,.9)';
    ctx.beginPath(); ctx.roundRect(80, y, W-160, 310, 20); ctx.fill();
    ctx.strokeStyle = s.color + '55';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.roundRect(80, y, W-160, 310, 20); ctx.stroke();
    // Top accent line
    ctx.fillStyle = s.color;
    ctx.fillRect(80, y, W-160, 5);
    // Label
    ctx.fillStyle = 'rgba(136,153,184,.7)';
    ctx.font = '38px monospace';
    ctx.fillText(s.label, 120, y + 80);
    // Value
    ctx.fillStyle = s.color;
    ctx.font = 'bold 120px Arial';
    ctx.fillText(s.value, 120, y + 230);
  });

  // Strategy tag
  ctx.fillStyle = 'rgba(200,146,42,.14)';
  ctx.beginPath(); ctx.roundRect(80, H-450, W-160, 90, 14); ctx.fill();
  ctx.fillStyle = '#f0b44a';
  ctx.font = '34px monospace';
  ctx.fillText('🏆 ICT · SMC · ALCHEMIST · MSNR · CRT', 120, H-395);

  // Watermark
  ctx.fillStyle = 'rgba(136,153,184,.35)';
  ctx.font = '30px monospace';
  ctx.fillText('@shelentrading · Nizar Nurkhalik', 80, H-200);
  ctx.fillStyle = '#f0b44a';
  ctx.font = '28px monospace';
  ctx.fillText('shelen.id · PRECISION OVER NOISE', 80, H-160);

  // Download
  const a   = document.createElement('a');
  a.href    = canvas.toDataURL('image/png', 0.95);
  a.download = 'shelen_story_' + new Date().toISOString().split('T')[0] + '.png';
  a.click();
  toast('Story exported! Upload ke IG 📸');
}


/* ═══════════════════════════════════════════════════════════════════
   §30  SENTIMENT ENGINE
   ═══════════════════════════════════════════════════════════════════ */
let _sentimentTarget  = 65;
let _sentimentCurrent = 50;

function refreshSentiment() {
  // Randomise target slightly each refresh
  _sentimentTarget = Math.max(20, Math.min(85, _sentimentTarget + (Math.random() - 0.48) * 10));
  // Update SENT_DATA bullish values
  SENT_DATA.forEach(s => {
    s.b = Math.max(10, Math.min(90, s.b + (Math.random() - 0.48) * 5));
  });
  if (activePage === 'news') renderSentiment();
}

function animateSentiment() {
  _sentimentCurrent += (_sentimentTarget - _sentimentCurrent) * 0.04;
  const pct = Math.max(5, Math.min(95, _sentimentCurrent));

  ['termSabNeedle','newsSabNeedle'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.left = pct + '%';
  });

  const color   = pct > 62 ? 'var(--green)' : pct < 38 ? 'var(--red)' : 'var(--gold2)';
  const verdict = pct > 62 ? 'BULLISH'      : pct < 38 ? 'BEARISH'    : 'NETRAL';
  ['termSabVerdict','newsSabVerdict'].forEach(id => {
    const el = document.getElementById(id);
    if (el) { el.textContent = verdict; el.style.color = color; }
  });
}

setInterval(animateSentiment, 80);
setInterval(refreshSentiment, 25000);


/* ═══════════════════════════════════════════════════════════════════
   §31  FLASH NEWS TICKER WITH COUNTDOWN
   ═══════════════════════════════════════════════════════════════════ */
const HIGH_EVENTS = [
  { name:'NON-FARM PAYROLLS', utcH:12, utcM:30 },
  { name:'FOMC MINUTES',      utcH:18, utcM:0  },
  { name:'CPI YoY',           utcH:12, utcM:30 },
  { name:'BOJ RATE DECISION', utcH:3,  utcM:0  },
  { name:'ECB RATE DECISION', utcH:11, utcM:45 },
];

function _getNextEvent() {
  const now = new Date();
  const cur = now.getUTCHours() * 60 + now.getUTCMinutes();
  let best = null, minDiff = Infinity;
  HIGH_EVENTS.forEach(ev => {
    let diff = ev.utcH * 60 + ev.utcM - cur;
    if (diff < 0) diff += 1440;
    if (diff < minDiff) { minDiff = diff; best = { ...ev, diff }; }
  });
  return best;
}

function buildFlashNews() {
  const track = document.getElementById('flashNewsTrack');
  if (!track) return;
  const next  = _getNextEvent();
  const items = [
    '⚡ SHELEN v13 — MT5 BRIDGE EDITION · PRECISION OVER NOISE',
    '📊 GOLD (XAUUSD) · ICT AMD Strategy · Alchemist v8',
    next ? `🔴 NEXT HIGH IMPACT: ${next.name} · dalam ${Math.floor(next.diff/60)}h${next.diff%60}m` : '📅 Cek Economic Calendar untuk event berikutnya',
    '⚡ R:R MINIMUM 1:5 · SL MAX 20 PIPS · SHELEN RULE #1',
    '🤖 ALCHEMIST AI v8 · Full Confluence Engine Online',
    '📈 LONDON KZ 03:00–05:00 UTC · NY KZ 13:00–15:00 UTC',
    '💎 PREMIUM: Signal Unlimited + AI Photo + Voice Alert',
  ];
  const doubled = [...items, ...items];
  track.innerHTML = doubled.map(t =>
    `<span class="fn-item">${t.includes('HIGH IMPACT') ? '<span class="fn-badge">LIVE</span>' : '📡'} ${t}</span>`
  ).join('');
}

setInterval(buildFlashNews, 60000);


/* ═══════════════════════════════════════════════════════════════════
   §32  ALCHEMIST CANDLE MINIGAME
   ─────────────────────────────────────────────────────────────────
   Player: gold candle that jumps
   Enemies: random red bearish candles scrolling left
   Coins: collectible gold coins
   Canvas: 360×220px — scales to width:100% via CSS
   ═══════════════════════════════════════════════════════════════════ */
const Game = (() => {
  const CANVAS_W = 360, CANVAS_H = 220;
  const GROUND   = CANVAS_H - 32;
  const GRAVITY  = 0.52;
  const JUMP_V   = -11.5;
  const BASE_SPD = 3.8;

  let ctx, running = false, raf = null;
  let score = 0, highScore = 0, frame = 0;
  let player, enemies, coins, speed, nextEnemy, nextCoin;

  function _initPlayer() {
    return { x: 55, y: GROUND - 38, w: 18, h: 38, vy: 0, onGround: true, alive: true };
  }

  function _spawnEnemy() {
    const h = 30 + Math.floor(Math.random() * 50);
    enemies.push({ x: CANVAS_W + 10, y: GROUND - h, w: 16, h, speed: speed + Math.random() * 1.5 });
  }

  function _spawnCoin() {
    coins.push({ x: CANVAS_W + 10, y: GROUND - 55 - Math.random() * 60, r: 7, collected: false });
  }

  function _rect(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  function _circle(coin, p) {
    const cx = coin.x, cy = coin.y;
    return cx > p.x && cx < p.x + p.w && cy > p.y && cy < p.y + p.h;
  }

  function _draw() {
    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);

    // Sky gradient
    const sky = ctx.createLinearGradient(0, 0, 0, GROUND);
    sky.addColorStop(0, '#010204'); sky.addColorStop(1, '#0b1018');
    ctx.fillStyle = sky; ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    // Grid lines (subtle)
    ctx.strokeStyle = 'rgba(200,146,42,.04)'; ctx.lineWidth = 1;
    for (let x = 0; x < CANVAS_W; x += 40) { ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,CANVAS_H); ctx.stroke(); }

    // Ground
    ctx.fillStyle = '#161c2a'; ctx.fillRect(0, GROUND + 2, CANVAS_W, CANVAS_H - GROUND);
    const gGrad = ctx.createLinearGradient(0, GROUND, 0, GROUND + 4);
    gGrad.addColorStop(0,'#f0b44a'); gGrad.addColorStop(1,'#c8922a');
    ctx.fillStyle = gGrad; ctx.fillRect(0, GROUND, CANVAS_W, 3);

    // Coins
    coins.forEach(c => {
      if (c.collected) return;
      ctx.beginPath();
      ctx.arc(c.x, c.y, c.r, 0, Math.PI*2);
      const cg = ctx.createRadialGradient(c.x-2,c.y-2,1,c.x,c.y,c.r);
      cg.addColorStop(0,'#fcd980'); cg.addColorStop(1,'#c8922a');
      ctx.fillStyle = cg; ctx.fill();
      ctx.strokeStyle = 'rgba(200,146,42,.5)'; ctx.lineWidth = 1; ctx.stroke();
    });

    // Enemies — bearish red candles
    enemies.forEach(e => {
      // Body
      ctx.fillStyle = '#e8334a';
      ctx.fillRect(e.x, e.y, e.w, e.h);
      // Wick top
      ctx.fillStyle = '#ff6080';
      ctx.fillRect(e.x + e.w/2 - 1.5, e.y - 8, 3, 8);
      // Wick bottom
      ctx.fillRect(e.x + e.w/2 - 1.5, e.y + e.h, 3, 6);
      // Highlight
      ctx.fillStyle = 'rgba(255,100,128,.25)';
      ctx.fillRect(e.x, e.y, 3, e.h);
    });

    // Player — bullish gold candle
    if (player.alive) {
      // Glow
      ctx.shadowColor = '#f0b44a'; ctx.shadowBlur = 14;
      // Body
      const pg = ctx.createLinearGradient(player.x, player.y, player.x + player.w, player.y);
      pg.addColorStop(0,'#f0b44a'); pg.addColorStop(1,'#c8922a');
      ctx.fillStyle = pg;
      ctx.fillRect(player.x, player.y, player.w, player.h);
      ctx.shadowBlur = 0;
      // Wick top
      ctx.fillStyle = '#fcd980';
      ctx.fillRect(player.x + player.w/2 - 1.5, player.y - 10, 3, 10);
      // Wick bottom
      ctx.fillStyle = '#c8922a';
      ctx.fillRect(player.x + player.w/2 - 1.5, player.y + player.h, 3, 7);
      // Highlight
      ctx.fillStyle = 'rgba(255,220,100,.2)';
      ctx.fillRect(player.x, player.y, 4, player.h);
    }

    // Score
    ctx.fillStyle = 'rgba(240,180,74,.85)';
    ctx.font = 'bold 13px monospace';
    ctx.fillText('◈ ' + score, 10, 22);

    // Speed indicator
    ctx.fillStyle = 'rgba(136,153,184,.45)';
    ctx.font = '9px monospace';
    ctx.fillText('SPD ' + speed.toFixed(1) + 'x', CANVAS_W - 68, 22);

    // Frame counter (used for score)
    ctx.fillStyle = 'rgba(136,153,184,.3)';
    ctx.fillText('FRAME ' + frame, 10, CANVAS_H - 8);
  }

  function _update() {
    frame++;
    speed = BASE_SPD + frame / 600;

    // Gravity
    if (!player.onGround) {
      player.vy += GRAVITY;
      player.y  += player.vy;
      if (player.y >= GROUND - player.h) {
        player.y      = GROUND - player.h;
        player.vy     = 0;
        player.onGround = true;
      }
    }

    // Score from survival
    if (frame % 6 === 0) score++;

    // Spawn enemies
    nextEnemy--;
    if (nextEnemy <= 0) {
      _spawnEnemy();
      nextEnemy = 55 + Math.floor(Math.random() * 80) - Math.min(frame / 120, 30);
    }

    // Spawn coins
    nextCoin--;
    if (nextCoin <= 0) {
      _spawnCoin();
      nextCoin = 90 + Math.floor(Math.random() * 60);
    }

    // Move enemies
    enemies = enemies.filter(e => {
      e.x -= e.speed;
      if (_rect(player, e)) { _gameOver(); return false; }
      return e.x > -e.w;
    });

    // Move coins
    coins.forEach(c => {
      c.x -= speed;
      if (!c.collected && _circle(c, player)) {
        c.collected = true;
        score += 10;
        document.getElementById('gameScore') && (document.getElementById('gameScore').textContent = score);
      }
    });
    coins = coins.filter(c => !c.collected && c.x > -20);

    document.getElementById('gameScore') && (document.getElementById('gameScore').textContent = score);
  }

  function _loop() {
    if (!running) return;
    _update();
    _draw();
    raf = requestAnimationFrame(_loop);
  }

  function _gameOver() {
    running = false;
    if (raf) { cancelAnimationFrame(raf); raf = null; }
    if (score > highScore) {
      highScore = score;
      LS.set('shelen_highscore', highScore);
      document.getElementById('gameHigh') && (document.getElementById('gameHigh').textContent = highScore);
    }

    const msgs = [
      'Market took your stop. Risk management next time 📉',
      'Bearish candle wins this round. SHELEN never quits ⚡',
      `Score ${score}! Keep dodging the reds 🏆`,
      'Margin call! Add more skill, not more capital 💡',
    ];
    const goScreen = document.getElementById('gameOverScreen');
    const goMsg    = document.getElementById('gameOverMsg');
    const goScore  = document.getElementById('gameOverScore');
    if (goScreen) { goScreen.hidden = false; goScreen.style.display = 'flex'; }
    if (goMsg)    goMsg.textContent = msgs[Math.floor(Math.random() * msgs.length)];
    if (goScore)  goScore.textContent = 'SCORE: ' + score + (score > highScore ? ' 🏆 NEW BEST!' : '');
  }

  /* Public */
  return {
    start() {
      const cvs = document.getElementById('gameCanvas');
      if (!cvs) return;
      ctx = cvs.getContext('2d');

      // Hide overlays
      const overlay   = document.getElementById('gameOverlay');
      const overScreen = document.getElementById('gameOverScreen');
      if (overlay)   overlay.hidden = true;
      if (overScreen) { overScreen.hidden = true; overScreen.style.display = 'none'; }

      // Init state
      score = 0; frame = 0;
      speed = BASE_SPD;
      player = _initPlayer();
      enemies = []; coins = [];
      nextEnemy = 60; nextCoin = 90;
      running = true;

      document.getElementById('gameScore') && (document.getElementById('gameScore').textContent = '0');
      highScore = LS.get('shelen_highscore') || 0;
      document.getElementById('gameHigh') && (document.getElementById('gameHigh').textContent = highScore);

      _loop();
    },

    jump() {
      if (!running) return;
      if (player.onGround) {
        player.vy       = JUMP_V;
        player.onGround = false;
      }
    },

    restart() { this.start(); }
  };
})();

/* Global wrappers used by onclick in HTML */
function startGame()   { Game.start();   }
function restartGame() { Game.restart(); }

/* Game controls — keyboard + touch */
document.addEventListener('keydown', e => {
  if (e.code === 'Space' || e.code === 'ArrowUp') { e.preventDefault(); Game.jump(); }
});

document.addEventListener('DOMContentLoaded', () => {
  const cvs = document.getElementById('gameCanvas');
  if (!cvs) return;
  cvs.addEventListener('click',      () => Game.jump(), { passive: true });
  cvs.addEventListener('touchstart', () => Game.jump(), { passive: true });
  // Swipe up
  let _touchStartY = 0;
  cvs.addEventListener('touchstart', e => { _touchStartY = e.touches[0].clientY; }, { passive: true });
  cvs.addEventListener('touchend',   e => {
    if (_touchStartY - e.changedTouches[0].clientY > 25) Game.jump();
  }, { passive: true });
});


/* ═══════════════════════════════════════════════════════════════════
   §33  COUNTER ANIMATION
   ═══════════════════════════════════════════════════════════════════ */
function animCount(id, target, suffix, duration) {
  const el = document.getElementById(id);
  if (!el) return;
  let start = null;
  const step = ts => {
    if (!start) start = ts;
    const pct  = Math.min((ts - start) / duration, 1);
    const ease = 1 - Math.pow(1 - pct, 3);
    el.textContent = Math.floor(ease * target).toLocaleString() + (suffix || '');
    if (pct < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}


/* ═══════════════════════════════════════════════════════════════════
   §34  FINAL INIT — DOMContentLoaded
   Everything comes together here
   ═══════════════════════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {

  /* 1. FOUNDER GODMODE check (URL param → localStorage) */
  FounderSystem.init();

  /* 2. Auth state restore */
  if (user) {
    activeTier = user.plan || 'free';
    _updateUserBtn();
    _applyTierUI();
  }

  /* 3. Build static UI */
  buildTopbarPrices();
  buildFlashNews();
  buildTicker();
  buildTrackList();

  /* 4. Restore accent color */
  const savedAccent = LS.get('shelen_accent');
  if (savedAccent) changeAccentColor(savedAccent);

  /* 5. Restore MT5 URL in modal input */
  const storedURL = LS.get('shelen_mt5_url');
  if (storedURL) {
    const modalInp = document.getElementById('mt5UrlInput');
    if (modalInp) modalInp.value = storedURL;
    const homeInp = document.getElementById('homeMT5UrlInput');
    if (homeInp) homeInp.value = storedURL;
  }

  /* 6. Go to home page */
  goPage('home');

  /* 7. Start Dual Engine
     → tries MT5 Bridge if URL was saved, else falls back to TwelveData,
       which then falls back to local simulation if both fail */
  setTimeout(() => {
    DualEngine.connect(storedURL || '');   // empty string → TwelveData → sim
  }, 900);

  /* 8. First clock tick */
  updateClock();

  /* 9. Initial calc */
  calcLot();

  /* 10. Animate stats counters */
  setTimeout(() => {
    animCount('hsSigCount', 3124, '', 1800);
    setInterval(() => {
      const el = document.getElementById('hsSigCount');
      if (el) {
        const c = parseInt((el.textContent || '0').replace(/,/g, '')) || 3124;
        el.textContent = (c + Math.floor(Math.random() * 3)).toLocaleString();
      }
    }, 12000);
  }, 500);

  /* 11. First OB render */
  setTimeout(() => updateOBWith(priceState[curSym.id]?.price || curSym.base, curSym.pip), 600);

  /* 12. First CS render */
  setTimeout(updateCS, 700);

  /* 13. Execution log startup messages */
  setTimeout(() => addLog('sys', 'SHELEN v13 — ALCHEMIST ENGINE READY'), 700);
  setTimeout(() => addLog('sys', 'Dual-Engine WSS initialising…'), 1100);
  setTimeout(() => addLog('sys', 'Risk params: SL=20pip · R:R=1:5 · MaxDD=5%'), 1600);
  setTimeout(() => addLog('sys', 'MT5 Bridge · TwelveData API · Local Sim — all engines standby'), 2100);

  /* 14. Welcome toast */
  setTimeout(() => toast('SHELEN v13 — Precision Over Noise ⚡'), 1400);

  /* 15. Sentiment first render */
  setTimeout(refreshSentiment, 1500);

  /* 16. Photo tier note */
  _applyTierUI();

  /* 17. High score restore */
  const hs = LS.get('shelen_highscore') || 0;
  const hsEl = document.getElementById('gameHigh');
  if (hsEl) hsEl.textContent = hs;

  /* 18. Console signature */
  console.log(
    '%c SHELEN %c v13 %c Precision Over Noise ',
    'background:#c8922a;color:#000;font-weight:900;padding:4px 8px;border-radius:4px 0 0 4px;font-size:14px;',
    'background:#010204;color:#f0b44a;font-weight:700;padding:4px 6px;font-size:14px;',
    'background:#060910;color:#7a8599;padding:4px 8px;border-radius:0 4px 4px 0;font-size:13px;border:1px solid #1e2535;'
  );
  console.log('%c Creator: Nizar Nurkhalik · MT5 Bridge + TwelveData API + AI Signal Engine', 'color:#7a8599;font-size:11px;');
  console.log('%c Admin functions: window.founderUnlock() · window.founderRevoke() · window.izarAdminActivate(email, plan)', 'color:#3b8cf9;font-size:11px;');
});

/* ═══════════════════════════════════════════════════════════════════
   End of script.js — SHELEN v13 Complete
   ═══════════════════════════════════════════════════════════════════ */
