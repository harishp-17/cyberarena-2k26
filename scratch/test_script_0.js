
/* ============================================================
   CONFIG
   ============================================================ */
const API_URL = "PASTE_YOUR_GOOGLE_APPS_SCRIPT_WEB_APP_URL_HERE";
const API_KEY = "";                       // must equal API_KEY in Code.gs (leave "" if you don't use one)
const ADMIN_PIN = "0769";
const MAX_TAB_WARNINGS = 3;               // per round
const STORAGE_KEY = "cyberarena_session_v1";
const PREF_KEY = "cyberarena_prefs_v1";
const SESSION_TTL_MS = 8 * 60 * 60 * 1000; // a saved session older than this is ignored
const READ_SECONDS = 60;
const ROUND_SECONDS = { 1: 30 * 60, 2: 30 * 60, 3: 60 * 60 };

const $ = id => document.getElementById(id);
const reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ============================================================
   DATASET  (embedded JSON block near the end of this page)
   ============================================================ */
const DATA = JSON.parse($('cyberData').textContent);
const R1 = DATA.round1, R2 = DATA.round2, R3 = DATA.round3;
const TOTAL_Q = R1.length + R2.length + R3.questions.length;

/* ============================================================
   HELPERS
   ============================================================ */
function escapeHtml(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function norm(s){ return String(s == null ? '' : s).toLowerCase().replace(/[^a-z0-9]/g, ''); }
function matchesAny(input, accepted){ const n = norm(input); return n !== '' && accepted.some(a => norm(a) === n); }
function fmtTime(t){ const m = Math.floor(t / 60), s = t % 60; return String(m).padStart(2,'0') + ':' + String(s).padStart(2,'0'); }
function shuffle(a){ for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
function caesar(s, k){ return s.replace(/[A-Z]/gi, c => { const b = c <= 'Z' ? 65 : 97; return String.fromCharCode((c.charCodeAt(0) - b + k + 260) % 26 + b); }); }
function showToast(msg){
  const t = $('toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(showToast._t); showToast._t = setTimeout(() => t.classList.remove('show'), 3200);
}

/* safe localStorage (works even if storage is blocked, e.g. private mode) */
const store = {
  get(k){ try { return localStorage.getItem(k); } catch (e) { return null; } },
  set(k, v){ try { localStorage.setItem(k, v); return true; } catch (e) { return false; } },
  del(k){ try { localStorage.removeItem(k); } catch (e) {} }
};
let prefs = {}; try { prefs = JSON.parse(store.get(PREF_KEY) || '{}') || {}; } catch (e) { prefs = {}; }

/* ============================================================
   CYBER SOUND FX ENGINE  (Web Audio API — synthesized, no audio files)
   ============================================================ */
const SFX = (function(){
  let ac = null, master = null, muted = !!prefs.muted;
  function ctx(){
    if (muted) return null;
    if (!ac) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      try { ac = new AC(); master = ac.createGain(); master.gain.value = 0.6; master.connect(ac.destination); } catch (e) { return null; }
    }
    if (ac.state === 'suspended') ac.resume().catch(() => {});
    return ac;
  }
  function tone(o){
    const c = ctx(); if (!c) return;
    const t0 = c.currentTime + (o.d || 0), dur = o.t || 0.1, v = o.v || 0.06;
    const osc = c.createOscillator(), g = c.createGain();
    osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(o.f, t0);
    if (o.f2) osc.frequency.exponentialRampToValueAtTime(o.f2, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(v, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g); g.connect(master);
    osc.start(t0); osc.stop(t0 + dur + 0.03);
  }
  return {
    click(){   tone({ f: 720, f2: 1100, t: 0.06, type: 'square', v: 0.025 }); },
    flip(){    tone({ f: 420, f2: 680, t: 0.09, type: 'triangle', v: 0.06 }); },
    match(){   tone({ f: 660, t: 0.10, v: 0.07 }); tone({ f: 990, t: 0.16, v: 0.07, d: 0.09 }); },
    miss(){    tone({ f: 240, f2: 140, t: 0.18, type: 'sawtooth', v: 0.04 }); },
    tick(n){   tone({ f: n <= 3 ? 1250 : 920, t: 0.07, type: 'square', v: 0.05 }); },          // 10-second warning
    success(){ [523, 659, 784].forEach((f, i) => tone({ f, t: 0.16, v: 0.07, d: i * 0.08 })); },  // accepted submission
    round(){   [392, 523, 659, 784, 1047].forEach((f, i) => tone({ f, t: 0.22, type: 'triangle', v: 0.07, d: i * 0.09 })); }, // round complete
    rank(){    [659, 784, 988, 1319].forEach((f, i) => tone({ f, t: 0.14, type: 'triangle', v: 0.06, d: i * 0.07 })); },
    warn(){    tone({ f: 190, f2: 110, t: 0.38, type: 'sawtooth', v: 0.06 }); },
    toggleMute(){ muted = !muted; prefs.muted = muted; store.set(PREF_KEY, JSON.stringify(prefs)); return muted; },
    isMuted(){ return muted; }
  };
})();
function syncMuteIcon(){
  const m = SFX.isMuted();
  $('muteBtn').classList.toggle('off', m);
  $('muteBtn').setAttribute('aria-label', m ? 'Unmute sound' : 'Mute sound');
  $('muteBtn').querySelector('use').setAttribute('href', m ? '#i-volume-xmark' : '#i-volume-high');
}
function toggleMute(){ SFX.toggleMute(); syncMuteIcon(); if (!SFX.isMuted()) SFX.success(); }
/* one delegated listener gives every button / option / card a click sound */
document.addEventListener('click', e => {
  const t = e.target.closest('button,.option,.step-dot,.ev-head,.game-tab,.switch');
  if (t && !t.hasAttribute('data-silent') && t.id !== 'muteBtn') SFX.click();
}, true);

/* ============================================================
   SESSION STATE + AUTO-SAVE  (localStorage)
   ============================================================ */
let S = null;                 // the live session (mirrors localStorage)
let sessionCleared = false;   // true once the final report is submitted / admin clears
let gameActive = false;       // anti-cheat only polices live rounds

function blankSession(player){
  return {
    v: 1,
    sid: 'CA' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
    player,
    round: 'INSTR',                 // 'INSTR' | 'COUNTDOWN' | 'R1' | 'R2' | 'R3' | 'WAITING'
    instrRound: 1,
    readEndsAt: 0,
    waiting: null,                  // { just, next }
    deadline: 0,                    // absolute epoch-ms when the current round timer ends
    remainingSeconds: 0,
    startedAt: Date.now(), completedAt: null, durationSeconds: 0, status: "IN_PROGRESS", violations: 0, totalViolations: 0, strikes_count: 0, lifetime_violations: 0, is_locked: false, lock_reason: "", pardon_history: [],
    seq: 0, rank: 0,
    scores: { r1: 0, r2: 0, r3: 0 },
    r1: { idx: 0, answers: new Array(R1.length).fill(null), submitted: false },
    r2: { idx: 0, answers: new Array(R2.length).fill(''),   submitted: false },
    r3: { idx: 0, answers: new Array(R3.questions.length).fill(''), submitted: false, flags: [] },
    startedAt: Date.now(), savedAt: Date.now()
  };
}
function save(){
  if (!S || sessionCleared) return;
  S.savedAt = Date.now();
  store.set(STORAGE_KEY, JSON.stringify(S));
}
function loadSession(){
  const raw = store.get(STORAGE_KEY); if (!raw) return null;
  try {
    const o = JSON.parse(raw);
    if (!o || o.v !== 1 || !o.player || !o.player.name || !o.sid) return null;
    if (!['INSTR','COUNTDOWN','R1','R2','R3','WAITING'].includes(o.round)) return null;
    if (Date.now() - (o.savedAt || 0) > SESSION_TTL_MS) return null;
    if (!o.r1 || !o.r2 || !o.r3 || !o.scores) return null;
    if (o.round === 'WAITING' && (!o.waiting || !o.waiting.just)) return null;
    if (o.r1.answers.length !== R1.length || o.r2.answers.length !== R2.length || o.r3.answers.length !== R3.questions.length) return null;
    if (!Array.isArray(o.r3.flags)) o.r3.flags = [];
    return o;
  } catch (e) { return null; }
}
function clearSession(){ sessionCleared = true; store.del(STORAGE_KEY); }

/* ============================================================
   RANK BADGES  (progress = questions completed across all rounds)
   ============================================================ */
const RANKS = [
  { name: 'Cyber Rookie',       min: 0.00, color: '#94a3b8', icon: 'user-secret' },
  { name: 'Net Defender',       min: 0.20, color: '#38bdf8', icon: 'shield-halved' },
  { name: 'Forensics Expert',   min: 0.50, color: '#e056fd', icon: 'magnifying-glass' },
  { name: 'Digital Mastermind', min: 0.90, color: '#fbbf24', icon: 'crown' }
];
function countCompleted(){
  if (!S) return 0;
  return S.r1.answers.filter(a => a !== null && a !== undefined).length
       + S.r2.answers.filter(a => String(a).trim() !== '').length
       + S.r3.answers.filter(a => String(a).trim() !== '').length;
}
function rankFor(count){ let r = 0; RANKS.forEach((k, i) => { if (count >= Math.ceil(TOTAL_Q * k.min)) r = i; }); return r; }
function updateRank(silent){
  if (!S) return;
  const c = countCompleted(), r = rankFor(c), k = RANKS[r], b = $('rankBadge');
  b.style.setProperty('--rank-c', k.color);
  $('rankName').textContent = k.name;
  $('rankCount').textContent = c + '/' + TOTAL_Q;
  $('rankIcon').querySelector('use').setAttribute('href', '#i-' + k.icon);
  b.classList.add('show');
  if (r > (S.rank || 0) && !silent) {
    b.classList.remove('pop'); void b.offsetWidth; b.classList.add('pop');
    SFX.rank(); showToast('Rank up! You are now a ' + k.name);
  }
  S.rank = r;
}
function setHeader(){
  const p = S.player;
  $('playerTag').textContent = p.name + ' · ' + p.dept + ' · Yr ' + p.year;
  $('rankBadge').classList.add('show');
}

/* ============================================================
   SCREEN NAVIGATION  (+ Matrix Rain in the waiting room)
   ============================================================ */
function go(id){
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  $(id).classList.add('active');
  window.scrollTo(0, 0);
  if (id === 'screen-waiting') startMatrix(); else stopMatrix();
}
function currentScreenIs(id){ const el = $(id); return !!el && el.classList.contains('active'); }

const MX = { raf: 0, last: 0, fs: 16, drops: [], chars: '01アイウエオカキクケコサシスセソ<>/{}$#%&ABCDEF'.split('') };
function resizeMatrix(){
  const cv = $('matrixCanvas'); cv.width = window.innerWidth; cv.height = window.innerHeight;
  MX.drops = Array.from({ length: Math.ceil(cv.width / MX.fs) }, () => Math.floor(Math.random() * -40));
}
function drawMatrixFrame(){
  const cv = $('matrixCanvas'), c = cv.getContext('2d');
  c.fillStyle = 'rgba(8,12,20,0.10)'; c.fillRect(0, 0, cv.width, cv.height);
  c.font = MX.fs + 'px ui-monospace, Menlo, Consolas, monospace';
  for (let i = 0; i < MX.drops.length; i++) {
    const y = MX.drops[i] * MX.fs;
    if (y >= 0) {
      const ch = MX.chars[Math.floor(Math.random() * MX.chars.length)];
      c.fillStyle = (i % 7 === 0) ? '#38bdf8' : '#22c55e';
      c.fillText(ch, i * MX.fs, y);
      c.fillStyle = '#d1fae5'; c.fillText(ch, i * MX.fs, y);       // bright head
    }
    if (y > cv.height && Math.random() > 0.975) MX.drops[i] = 0;
    MX.drops[i]++;
  }
}
function matrixLoop(ts){
  MX.raf = requestAnimationFrame(matrixLoop);
  if (ts - MX.last < 55) return;
  MX.last = ts; drawMatrixFrame();
}
function startMatrix(){
  document.body.classList.add('matrix-on');
  resizeMatrix();
  const cv = $('matrixCanvas'); cv.getContext('2d').clearRect(0, 0, cv.width, cv.height);
  cancelAnimationFrame(MX.raf); MX.raf = 0;
  if (reducedMotion) { for (let i = 0; i < 40; i++) drawMatrixFrame(); return; }
  MX.raf = requestAnimationFrame(matrixLoop);
}
function stopMatrix(){
  document.body.classList.remove('matrix-on');
  cancelAnimationFrame(MX.raf); MX.raf = 0;
}
window.addEventListener('resize', () => { if (document.body.classList.contains('matrix-on')) resizeMatrix(); });

/* ============================================================
   MASTER ROUND TIMER  — absolute deadline, so refresh can't add time
   ============================================================ */
let masterIntervalId = null, masterOnExpire = null, lastPersisted = -1, lastWarn = -1;
function remainingNow(){ return S ? Math.max(0, Math.ceil((S.deadline - Date.now()) / 1000)) : 0; }
function startMasterTimer(seconds, onExpire){
  S.deadline = Date.now() + seconds * 1000; save();
  runMasterTimer(onExpire);
}
function runMasterTimer(onExpire){
  clearInterval(masterIntervalId);
  masterOnExpire = onExpire; lastPersisted = -1; lastWarn = -1;
  masterIntervalId = setInterval(tickMaster, 500);
  tickMaster();
}
function stopMasterTimer(){ clearInterval(masterIntervalId); masterIntervalId = null; masterOnExpire = null; }
function tickMaster(){
  if (!S) { stopMasterTimer(); return; }
  const r = remainingNow();
  S.remainingSeconds = r;
  updateTimerDisplays(r);
  if (r !== lastPersisted) { lastPersisted = r; save(); }
  if (r > 0 && r <= 10 && r !== lastWarn) { lastWarn = r; SFX.tick(r); }      // 10-second warning beeps
  if (r <= 0) {
    const cb = masterOnExpire; stopMasterTimer();
    if (cb) cb();
  }
}
function updateTimerDisplays(r){
  const t = fmtTime(r);
  document.querySelectorAll('.roundTimerDisplay').forEach(el => { el.textContent = t; el.classList.toggle('low', r <= 60); });
}

/* ============================================================
   ANTI-CHEATING
   ============================================================ */
document.addEventListener('contextmenu', e => e.preventDefault());
document.addEventListener('copy', e => e.preventDefault());
document.addEventListener('cut', e => e.preventDefault());
document.addEventListener('paste', e => e.preventDefault());
document.addEventListener('selectstart', e => {
  const tag = (e.target && e.target.tagName) || '';
  if (tag === 'INPUT' || tag === 'TEXTAREA') return;
  e.preventDefault();
});
let isInternalModalOpen = false;
function isAnyModalActive() {
  if (isInternalModalOpen) return true;
  try {
    if (typeof document !== 'undefined' && document.querySelector) {
      const activeModal = document.querySelector('.modal-overlay.active:not(.unclosable-lockout)');
      if (activeModal) return true;
    }
  } catch(e){}
  return false;
}

/* ============================================================
   REUSABLE IN-APP DOM MODAL COMPONENT (ALERT / CONFIRM / PROMPT)
   Guarantees zero native dialogs and zero false focus violations
   ============================================================ */
let appDialogCallback = null;

function showAppModal(options) {
  return new Promise((resolve) => {
    const modal = $('modalAppDialog');
    if (!modal) {
      if (options.onConfirm) options.onConfirm(options.defaultValue || true);
      resolve(options.defaultValue || true);
      return;
    }

    const mode = options.mode || 'alert';
    const titleEl = $('appDialogTitleText');
    const iconEl = $('appDialogIcon');
    const msgEl = $('appDialogMessage');
    const inputWrap = $('appDialogInputWrap');
    const inputLabel = $('appDialogInputLabel');
    const inputText = $('appDialogInputText');
    const cancelBtn = $('appDialogCancelBtn');
    const confirmBtn = $('appDialogConfirmBtn');

    if (titleEl) titleEl.textContent = options.title || (mode === 'prompt' ? 'INPUT REQUIRED' : (mode === 'confirm' ? 'CONFIRM ACTION' : 'SYSTEM NOTICE'));
    if (iconEl) iconEl.textContent = options.icon || (mode === 'prompt' ? '✏️' : (mode === 'confirm' ? '❓' : 'ℹ️'));
    if (msgEl) msgEl.textContent = options.message || '';

    if (mode === 'prompt') {
      if (inputWrap) inputWrap.style.display = 'block';
      if (inputLabel) inputLabel.textContent = options.inputLabel || 'Enter value:';
      if (inputText) {
        inputText.value = options.defaultValue != null ? options.defaultValue : '';
        inputText.placeholder = options.placeholder || '';
      }
    } else {
      if (inputWrap) inputWrap.style.display = 'none';
    }

    if (mode === 'confirm' || mode === 'prompt') {
      if (cancelBtn) {
        cancelBtn.style.display = 'block';
        cancelBtn.textContent = options.cancelText || 'Cancel';
      }
    } else {
      if (cancelBtn) cancelBtn.style.display = 'none';
    }

    if (confirmBtn) {
      confirmBtn.textContent = options.confirmText || (mode === 'alert' ? 'OK' : 'Confirm');
    }

    appDialogCallback = (confirmed) => {
      let result = null;
      if (confirmed) {
        if (mode === 'prompt') {
          result = inputText ? inputText.value.trim() : '';
        } else {
          result = true;
        }
      } else {
        result = mode === 'prompt' ? null : false;
      }

      if (confirmed && options.onConfirm) {
        options.onConfirm(result);
      } else if (!confirmed && options.onCancel) {
        options.onCancel();
      }
      resolve(result);
    };

    isInternalModalOpen = true;
    modal.classList.add('active');

    if (mode === 'prompt' && inputText) {
      setTimeout(() => {
        inputText.focus();
        if (inputText.select) inputText.select();
      }, 50);
    }
  });
}

function handleAppDialogSubmit() {
  closeAppDialog(true);
}

function closeAppDialog(confirmed) {
  const modal = $('modalAppDialog');
  if (modal) modal.classList.remove('active');
  isInternalModalOpen = false;
  if (appDialogCallback) {
    const cb = appDialogCallback;
    appDialogCallback = null;
    cb(confirmed);
  }
}

// Global drop-in helpers & native dialog prohibition
window.appAlert = function(message, title) {
  return showAppModal({ mode: 'alert', title: title || 'SYSTEM NOTICE', message: String(message), icon: 'ℹ️' });
};
window.appConfirm = function(message, title) {
  return showAppModal({ mode: 'confirm', title: title || 'CONFIRM ACTION', message: String(message), icon: '❓' });
};
window.appPrompt = function(message, defaultValue, title) {
  return showAppModal({ mode: 'prompt', title: title || 'INPUT REQUIRED', message: String(message), defaultValue: defaultValue || '', icon: '✏️' });
};

// Override native dialogs globally to ensure zero accidental focus loss
window.alert = window.appAlert;
window.confirm = window.appConfirm;
window.prompt = window.appPrompt;

document.addEventListener('visibilitychange', () => { if (document.hidden && gameActive && S && S.status !== 'COMPLETED' && !isInternalModalOpen && !isAnyModalActive()) registerTabViolation(); });
window.addEventListener('blur', () => { if (gameActive && S && S.status !== 'COMPLETED' && !isInternalModalOpen && !isAnyModalActive()) registerTabViolation(); });

let lastViolationTs = 0;
function registerTabViolation(){
  if (!S || S.is_locked || isInternalModalOpen || isAnyModalActive()) return;
  const now = Date.now();
  if (now - lastViolationTs < 1500) return;
  lastViolationTs = now;
  
  S.strikes_count = (S.strikes_count || 0) + 1;
  S.violations = S.strikes_count;
  S.totalViolations = (S.totalViolations || 0) + 1;
  S.lifetime_violations = S.totalViolations;
  S.lastViolationTime = now;
  save();
  SFX.warn();

  if (S.strikes_count >= MAX_TAB_WARNINGS) {
    triggerCandidateLockout('Tab switch or unauthorized window change (' + S.strikes_count + '/' + MAX_TAB_WARNINGS + ' strikes)');
  } else {
    const box = $('modalTabWarn'), txt = $('tabWarnText');
    if (txt) txt.textContent = 'You switched away from the challenge window (Strike ' + S.strikes_count + '/' + MAX_TAB_WARNINGS + '). At ' + MAX_TAB_WARNINGS + ' strikes your session is locked until proctor review.';
    if (box) box.classList.add('active');
  }
  broadcastParticipantHeartbeat();
}
function closeTabWarn(){ $('modalTabWarn').classList.remove('active'); }

/* ============================================================
   PROCTOR LOCKOUT, TIMER FREEZE & REPEATABLE CYCLE LOGIC
   ============================================================ */
function freezeMasterTimer(){
  if (!S) return;
  S.lockedRemainingSeconds = remainingNow();
  stopMasterTimer();
  save();
}

function resumeMasterTimer(){
  if (!S) return;
  if (S.lockedRemainingSeconds != null) {
    S.deadline = Date.now() + S.lockedRemainingSeconds * 1000;
    delete S.lockedRemainingSeconds;
    save();
  }
  const curR = (S.round === 'R1' ? 1 : (S.round === 'R2' ? 2 : (S.round === 'R3' ? 3 : null)));
  if (curR) runMasterTimer(() => handleRoundExpire(curR));
}

function triggerCandidateLockout(reason){
  if (!S) return;
  S.is_locked = true;
  S.lock_reason = reason || 'Tab switch or unauthorized window change';
  S.lastLockoutTime = Date.now();
  freezeMasterTimer();
  save();

  // Close minor warning box if open
  const warnBox = $('modalTabWarn');
  if (warnBox) warnBox.classList.remove('active');

  // Activate unclosable full-screen lockout overlay
  const lockModal = $('modalCandidateLockout');
  const strikeInfo = $('lockoutStrikeInfo');
  const reasonText = $('lockoutReasonText');

  if (strikeInfo) strikeInfo.textContent = 'Active Strikes: ' + (S.strikes_count || MAX_TAB_WARNINGS) + ' / ' + MAX_TAB_WARNINGS + ' (Lockout Enforced)';
  if (reasonText) reasonText.textContent = S.lock_reason;
  if (lockModal) lockModal.classList.add('active');

  SFX.warn();
  broadcastParticipantHeartbeat();
}

function dismissCandidateLockout(pardonEvent){
  if (!S || !S.is_locked) return;
  S.is_locked = false;
  const prevStrikes = S.strikes_count || S.violations || MAX_TAB_WARNINGS;
  S.strikes_count = 0;
  S.violations = 0;
  delete S.lock_reason;

  // Append to lifetime audit trail
  if (!Array.isArray(S.pardon_history)) S.pardon_history = [];
  S.pardon_history.push({
    pardoned_at: (pardonEvent && pardonEvent.pardoned_at) || Date.now(),
    pardoned_by: (pardonEvent && pardonEvent.pardoned_by) || 'System Admin (0769)',
    prior_strikes: (pardonEvent && pardonEvent.prior_strikes) || prevStrikes,
    reason: 'Proctor re-entry authorization granted'
  });

  save();
  resumeMasterTimer();

  const lockModal = $('modalCandidateLockout');
  if (lockModal) lockModal.classList.remove('active');

  SFX.success();
  showToast('🔓 Terminal Access Restored! Active strikes reset to 0/3. You may resume testing.');
  broadcastParticipantHeartbeat();
}

function initCandidateUnlockListener(){
  // 1. Storage event across tabs/windows
  window.addEventListener('storage', e => {
    if (e.key === 'cyberarena_unlock_events_v1' && e.newValue) {
      try {
        const payload = JSON.parse(e.newValue);
        if (S && S.is_locked && (payload.sid === S.sid || payload.sid === 'all')) {
          dismissCandidateLockout(payload);
        }
      } catch(err){}
    }
  });

  // 2. Fast polling (every 800ms) ensuring immediate unfreezing
  setInterval(() => {
    if (!S || !S.is_locked) return;
    try {
      const raw = localStorage.getItem('cyberarena_unlock_events_v1');
      if (raw) {
        const payload = JSON.parse(raw);
        if (payload && (payload.sid === S.sid || payload.sid === 'all') && payload.pardoned_at > (S.lastLockoutTime || 0)) {
          dismissCandidateLockout(payload);
          return;
        }
      }
      const roster = getLiveRoster();
      if (roster && roster[S.sid]) {
        const r = roster[S.sid];
        if (!r.is_locked && S.is_locked) {
          dismissCandidateLockout({
            pardoned_at: Date.now(),
            pardoned_by: 'System Admin (0769)',
            prior_strikes: S.strikes_count || 3
          });
        }
      }
    } catch(err){}
  }, 800);
}
initCandidateUnlockListener();

function forceSubmitCurrentRound(){
  if (!S) return;
  if (S.round === 'R1') finalizeRound(1);
  else if (S.round === 'R2') finalizeRound(2);
  else if (S.round === 'R3') finalizeRound(3);
}

/* ---- secret admin shortcut: Ctrl+Shift + H + M held together ---- */
let heldKeys = new Set();
document.addEventListener('keydown', e => {
  heldKeys.add(e.key.toLowerCase());
  if (e.ctrlKey && e.shiftKey && heldKeys.has('h') && heldKeys.has('m')) { openPinModal(); heldKeys.clear(); }
});
document.addEventListener('keyup', e => heldKeys.delete(e.key.toLowerCase()));

function openPinModal(){
  document.querySelectorAll('.pinDigit').forEach(i => i.value = '');
  $('pinError').style.display = 'none';
  $('modalPin').classList.add('active');
  const first = document.querySelector('.pinDigit');
  setTimeout(() => first && first.focus(), 50);
}
function closePinModal(){ $('modalPin').classList.remove('active'); }
document.querySelectorAll('.pinDigit').forEach((input, idx, all) => {
  input.addEventListener('input', () => { if (input.value && idx < all.length - 1) all[idx + 1].focus(); });
  input.addEventListener('keydown', e => { if (e.key === 'Backspace' && !input.value && idx > 0) all[idx - 1].focus(); });
});
function checkPin(){
  const entered = Array.from(document.querySelectorAll('.pinDigit')).map(i => i.value).join('');
  if (entered === ADMIN_PIN) { closePinModal(); enterAdmin(); }
  else $('pinError').style.display = 'block';
}

/* ============================================================
   ADMIN DASHBOARD
   ============================================================ */
let adminPrevScreen = 'screen-landing', autoRefreshOn = false, autoRefreshInterval = null, clearArmed = false;
function enterAdmin(){
  const cur = document.querySelector('.screen.active');
  adminPrevScreen = (cur && cur.id !== 'screen-admin') ? cur.id : 'screen-landing';
  go('screen-admin');

  // Activate simulation by default so admin room is never empty!
  adminSimActive = true;
  seedSimulatedStudents();
  startAdminSimulationLoop();

  // Show proctor surveillance tab by default
  adminSwitchTab('proctor');

  renderAdminProctorConsole();
  renderAdminHintConsole();
  refreshLeaderboard();
}
function exitAdmin(){
  if (autoRefreshInterval) clearInterval(autoRefreshInterval);
  stopAdminSimulationLoop();
  if (inspectRefreshInterval) clearInterval(inspectRefreshInterval);
  activeInspectedSid = null;
  autoRefreshOn = false; $('autoRefreshSwitch').classList.remove('on');
  go(adminPrevScreen);
}
function toggleAutoRefresh(){
  autoRefreshOn = !autoRefreshOn;
  $('autoRefreshSwitch').classList.toggle('on', autoRefreshOn);
  if (autoRefreshOn) {
    autoRefreshInterval = setInterval(() => {
      refreshLeaderboard();
      renderAdminHintConsole();
      renderAdminProctorConsole();
    }, 3000);
  } else clearInterval(autoRefreshInterval);
}
/* Admin: wipe the saved session on THIS device (e.g. student PC handed to the next participant) */
function clearLocalSession(btn){
  const label = btn.querySelector('span');
  if (!clearArmed) {
    clearArmed = true; label.textContent = 'Click again to confirm';
    setTimeout(() => { clearArmed = false; label.textContent = 'Clear saved session'; }, 4000);
    return;
  }
  clearSession();
  showToast('Saved session cleared on this device — reloading…');
  setTimeout(() => location.reload(), 900);
}
/* ============================================================
   MULTI-ROUND ANSWER AUDIT & SCORE AGGREGATION ENGINE
   ============================================================ */
function generateParticipantAuditSheet(p) {
  if (!p) return null;
  if (p.audit_sheet && p.audit_sheet.rounds && p.audit_sheet.rounds[1]) return p.audit_sheet;

  // Extract raw answers if present
  const r1_ans = (p.r1 && p.r1.answers) || p.r1_answers || (p.r1_session && p.r1_session.answers) || [];
  const r2_ans = (p.r2 && p.r2.answers) || p.r2_answers || (p.r2_session && p.r2_session.answers) || [];
  const r3_ans = (p.r3 && p.r3.answers) || p.r3_answers || (p.r3_session && p.r3_session.answers) || [];

  const targetR1 = (p.scores && p.scores.r1 != null) ? p.scores.r1 : (p.r1 != null ? Number(p.r1) : 0);
  const targetR2 = (p.scores && p.scores.r2 != null) ? p.scores.r2 : (p.r2 != null ? Number(p.r2) : 0);
  const targetR3 = (p.scores && p.scores.r3 != null) ? p.scores.r3 : (p.r3 != null ? Number(p.r3) : 0);

  // Round 1 (MCQ - 25 Questions)
  let r1_correct_count = 0;
  const r1_questions = R1.map((q, i) => {
    const rawChoice = r1_ans[i];
    const isAnswered = rawChoice != null && rawChoice !== '';
    let is_correct = false;
    let candOption = '';

    if (p.isSim) {
      is_correct = (i < targetR1);
      candOption = is_correct ? q.options[q.answer] : q.options[(q.answer + 1) % 4];
    } else {
      is_correct = (rawChoice === q.answer);
      candOption = isAnswered && q.options[rawChoice] ? q.options[rawChoice] : '(Unanswered)';
    }

    const marks = is_correct ? 1 : 0;
    if (is_correct) r1_correct_count++;

    return {
      round_number: 1,
      question_id: 'R1_Q' + (i + 1),
      prompt: q.q,
      candidate_answer: candOption,
      expected_answer: q.options[q.answer],
      is_correct: is_correct,
      marks_awarded: marks,
      max_marks: 1,
      time_spent_seconds: Math.round(1800 / R1.length)
    };
  });
  const r1_score = p.isSim ? targetR1 : r1_correct_count;

  // Round 2 (Arcade Puzzles - 15 Puzzles)
  let r2_correct_count = 0;
  const r2_questions = R2.map((pz, i) => {
    const rawVal = r2_ans[i];
    const expected = pz.answers[0];
    let is_correct = false;
    let candAnswer = '';

    if (p.isSim) {
      is_correct = (i < targetR2);
      candAnswer = is_correct ? expected : (rawVal || 'err_hash_unresolved');
    } else {
      is_correct = matchesAny(rawVal, pz.answers);
      candAnswer = rawVal ? String(rawVal) : '(Unanswered)';
    }

    const marks = is_correct ? 1 : 0;
    if (is_correct) r2_correct_count++;

    return {
      round_number: 2,
      question_id: 'R2_P' + (i + 1),
      prompt: pz.body + (pz.mono ? ' [' + pz.mono + ']' : ''),
      type: pz.type,
      candidate_answer: candAnswer,
      expected_answer: pz.answers.join(' / '),
      is_correct: is_correct,
      marks_awarded: marks,
      max_marks: 1,
      time_spent_seconds: Math.round(1800 / R2.length)
    };
  });
  const r2_score = p.isSim ? targetR2 : r2_correct_count;

  // Round 3 (Digital Forensics - 5 Questions)
  let r3_correct_count = 0;
  const r3_questions = R3.questions.map((q, i) => {
    const rawVal = r3_ans[i];
    const expected = q.answers[0];
    let is_correct = false;
    let candAnswer = '';

    if (p.isSim) {
      is_correct = (i < targetR3);
      candAnswer = is_correct ? expected : (rawVal || '10.0.0.99 (Unverified IP)');
    } else {
      is_correct = matchesAny(rawVal, q.answers);
      candAnswer = rawVal ? String(rawVal) : '(Unanswered)';
    }

    const marks = is_correct ? 1 : 0;
    if (is_correct) r3_correct_count++;

    return {
      round_number: 3,
      question_id: 'R3_Q' + (i + 1),
      prompt: q.label,
      candidate_answer: candAnswer,
      expected_answer: q.answers.join(' / '),
      is_correct: is_correct,
      marks_awarded: marks,
      max_marks: 1,
      time_spent_seconds: Math.round(3600 / R3.questions.length)
    };
  });
  const r3_score = p.isSim ? targetR3 : r3_correct_count;

  const bonus_points = Number((p.scores && p.scores.bonus != null) ? p.scores.bonus : (p.bonus || 0));
  const penalties = Number(p.penalties || 0);
  const total_score = r1_score + r2_score + r3_score + bonus_points - penalties;
  const total_questions = R1.length + R2.length + R3.questions.length;
  const total_correct = r1_score + r2_score + r3_score;
  const accuracy_rate = Math.round((total_correct / total_questions) * 1000) / 10;

  const sheet = {
    sid: p.sid,
    name: (p.player && p.player.name) || p.name || 'Operative',
    dept: (p.player && p.player.dept) || p.dept || 'CSBS',
    year: (p.player && p.player.year) || p.year || 'III',
    status: p.status || 'IN_PROGRESS',
    durationSeconds: p.durationSeconds || 1800,
    completedAt: p.completedAt || null,
    violations: p.lifetime_violations != null ? p.lifetime_violations : (p.violations || 0),
    total_score: total_score,
    bonus_points: bonus_points,
    penalties: penalties,
    accuracy_rate: accuracy_rate,
    total_questions: total_questions,
    total_correct: total_correct,
    total_incorrect: total_questions - total_correct,
    rounds: {
      1: {
        round_number: 1,
        title: 'Round 1: Cyber Quiz Master',
        max_score: R1.length,
        score: r1_score,
        durationSeconds: Math.min(p.durationSeconds || 1800, 1800),
        questions: r1_questions
      },
      2: {
        round_number: 2,
        title: 'Round 2: Cyber Arcade Puzzles',
        max_score: R2.length,
        score: r2_score,
        durationSeconds: Math.min(p.durationSeconds || 1800, 1800),
        questions: r2_questions
      },
      3: {
        round_number: 3,
        title: 'Round 3: Digital Forensics & Incident Case Study',
        max_score: R3.questions.length,
        score: r3_score,
        durationSeconds: Math.max(0, (p.durationSeconds || 1800) - 3600),
        questions: r3_questions
      }
    },
    bonus_breakdown: [
      { name: 'ThreatGEN Red vs Blue / Terminal Decryption Lounge', points: bonus_points }
    ]
  };

  return sheet;
}

/* ============================================================
   LEADERBOARD RANKING ENGINE (STRICT 4-TIER HIERARCHICAL CRITERIA)
   1. Primary: Cumulative total_score (Descending)
   2. Tie-breaker 1: Total test completion duration (Ascending — faster ranks higher)
   3. Tie-breaker 2: Accuracy rate / lowest incorrect attempts (Descending)
   4. Tie-breaker 3: Total security violations / strike count (Ascending — fewer violations ranks higher)
   5. Fallback: Completed timestamp (Ascending)
   ============================================================ */
function getRankedLeaderboard(){
  const roster = getLiveRoster();
  const list = Object.values(roster);

  list.sort((a, b) => {
    if (!a.audit_sheet) a.audit_sheet = generateParticipantAuditSheet(a);
    if (!b.audit_sheet) b.audit_sheet = generateParticipantAuditSheet(b);

    const scoreA = Number(a.score != null ? a.score : ((a.r1||0)+(a.r2||0)+(a.r3||0)+(a.bonus||0)));
    const scoreB = Number(b.score != null ? b.score : ((b.r1||0)+(b.r2||0)+(b.r3||0)+(b.bonus||0)));
    if (scoreB !== scoreA) return scoreB - scoreA;

    const durA = Number(a.durationSeconds) || (a.duration ? Number(a.duration) : 1800);
    const durB = Number(b.durationSeconds) || (b.duration ? Number(b.duration) : 1800);
    if (durA !== durB) return durA - durB;

    const accA = a.audit_sheet ? Number(a.audit_sheet.accuracy_rate || 0) : 0;
    const accB = b.audit_sheet ? Number(b.audit_sheet.accuracy_rate || 0) : 0;
    if (accB !== accA) return accB - accA;

    const violA = Number(a.lifetime_violations != null ? a.lifetime_violations : (a.violations || 0));
    const violB = Number(b.lifetime_violations != null ? b.lifetime_violations : (b.violations || 0));
    if (violA !== violB) return violA - violB;

    const timeA = Number(a.completedAt || a.lastSeen || 0);
    const timeB = Number(b.completedAt || b.lastSeen || 0);
    return timeA - timeB;
  });

  return list.map((s, idx) => {
    const sheet = s.audit_sheet || generateParticipantAuditSheet(s);
    return {
      rank: idx + 1,
      sid: s.sid,
      name: s.name,
      dept: s.dept || 'CSBS',
      year: s.year || 'III',
      r1: s.r1 || 0,
      r2: s.r2 || 0,
      r3: s.r3 || 0,
      bonus: s.bonus || 0,
      total: (s.r1 || 0) + (s.r2 || 0) + (s.r3 || 0) + (s.bonus || 0),
      status: s.status || 'IN_PROGRESS',
      violations: s.lifetime_violations != null ? s.lifetime_violations : (s.violations || 0),
      durationSeconds: s.durationSeconds || 0,
      accuracy_rate: sheet ? sheet.accuracy_rate : 0,
      completedAt: s.completedAt || null,
      isSim: !!s.isSim,
      audit_sheet: sheet
    };
  });
}

function broadcastLeaderboardUpdate(sid){
  const ranked = getRankedLeaderboard();
  try {
    localStorage.setItem('cyberarena_leaderboard_events_v1', JSON.stringify({
      event: 'LEADERBOARD_UPDATED',
      sid: sid,
      timestamp: Date.now(),
      leaderboard: ranked
    }));
  } catch(e){}
  refreshLeaderboard();
  renderAdminProctorConsole();
}

function initLeaderboardListener(){
  window.addEventListener('storage', e => {
    if (e.key === 'cyberarena_leaderboard_events_v1' && e.newValue) {
      try {
        refreshLeaderboard();
        renderAdminProctorConsole();
      } catch(err){}
    }
  });
}
initLeaderboardListener();

async function refreshLeaderboard(){
  const tbody = $('adminTableBody'), tag = $('adminDemoTag');
  const configured = API_URL && !API_URL.startsWith('PASTE_');
  let rows = [], demo = false;
  if (configured) {
    try {
      const res = await fetch(API_URL + '?action=leaderboard' + (API_KEY ? '&key=' + encodeURIComponent(API_KEY) : ''), { method: 'GET' });
      const data = await res.json();
      rows = data.rows || [];
    } catch (err) { demo = true; }
  } else demo = true;

  if (demo) {
    const liveLeaderboard = getRankedLeaderboard();
    if (liveLeaderboard && liveLeaderboard.length > 0) {
      rows = liveLeaderboard;
    } else {
      rows = [
        { sid: 'sim_varma', name: 'Dr. S. Varma', dept: 'CSE', year: 'IV', r1: 25, r2: 15, r3: 5, bonus: 3, status: 'COMPLETED', violations: 0, durationSeconds: 1710, accuracy_rate: 100 },
        { sid: 'sim_sharma', name: 'A. Sharma', dept: 'CSBS', year: 'III', r1: 24, r2: 11, r3: 4, bonus: 0, status: 'FINISHED', violations: 0, durationSeconds: 1920, accuracy_rate: 86.7 },
        { sid: 'sim_iyer', name: 'R. Iyer', dept: 'CSE', year: 'II', r1: 22, r2: 13, r3: 3, bonus: 0, status: 'FINISHED', violations: 1, durationSeconds: 2040, accuracy_rate: 84.4 },
        { sid: 'sim_menon', name: 'P. Menon', dept: 'CSBS', year: 'IV', r1: 19, r2: 9, r3: 2, bonus: 0, status: 'IN PROGRESS', violations: 0, durationSeconds: 2200, accuracy_rate: 66.7 }
      ];
    }
  }

  if (tag) tag.style.display = demo ? 'inline-block' : 'none';
  if (tag) tag.textContent = configured ? 'OFFLINE — LOCAL RADAR LEADERBOARD' : 'RADAR LEADERBOARD (LIVE AGGREGATION)';

  // Calculate totals and apply standard 4-tier tie-breaker
  rows.forEach(r => {
    r.total = (r.r1 || 0) + (r.r2 || 0) + (r.r3 || 0) + (r.bonus || 0);
  });
  rows.sort((a, b) => {
    if (b.total !== a.total) return b.total - a.total;
    const durA = Number(a.durationSeconds) || 1800;
    const durB = Number(b.durationSeconds) || 1800;
    if (durA !== durB) return durA - durB;
    const accA = Number(a.accuracy_rate != null ? a.accuracy_rate : (a.audit_sheet ? a.audit_sheet.accuracy_rate : 0));
    const accB = Number(b.accuracy_rate != null ? b.accuracy_rate : (b.audit_sheet ? b.audit_sheet.accuracy_rate : 0));
    if (accB !== accA) return accB - accA;
    const vA = Number(a.violations) || 0;
    const vB = Number(b.violations) || 0;
    if (vA !== vB) return vA - vB;
    return (a.completedAt || 0) - (b.completedAt || 0);
  });

  if (tbody) {
    tbody.innerHTML = rows.map((r, i) => {
      let rankCls = '';
      let rankBadge = '#' + (i + 1);
      if (i === 0) { rankCls = 'rank-row-gold'; rankBadge = '🥇 #1'; }
      else if (i === 1) { rankCls = 'rank-row-silver'; rankBadge = '🥈 #2'; }
      else if (i === 2) { rankCls = 'rank-row-bronze'; rankBadge = '🥉 #3'; }

      const isFin = (r.status === 'COMPLETED' || r.status === 'FINISHED' || r.status === 'SUBMITTED');
      const statusBadge = isFin
        ? '<span style="color:#34d399; font-weight:700;">🏁 ' + escapeHtml(r.status) + '</span>'
        : '<span style="color:#38bdf8;">' + escapeHtml(r.status || 'IN PROGRESS') + '</span>';

      const durText = r.durationSeconds ? fmtTime(r.durationSeconds) : '--:--';

      return '<tr class="' + rankCls + '">' +
        '<td><b style="font-family:var(--font-mono); font-size:13px;">' + rankBadge + '</b></td>' +
        '<td><b>' + escapeHtml(r.name) + '</b><br><small style="color:#94a3b8;">' + escapeHtml(r.sid || 'SID') + ' · ' + escapeHtml(r.dept) + ' · Yr ' + escapeHtml(r.year) + '</small></td>' +
        '<td>' + (r.r1 || 0) + '</td>' +
        '<td>' + (r.r2 || 0) + '</td>' +
        '<td>' + (r.r3 || 0) + '</td>' +
        '<td>' + (r.bonus || 0) + '</td>' +
        '<td><b style="color:var(--cyan); font-size:14px; font-family:var(--font-mono);">' + r.total + '</b></td>' +
        '<td><span style="font-family:var(--font-mono); font-size:11.5px; color:#cbd5e1;">' + durText + '</span></td>' +
        '<td>' + statusBadge + '</td>' +
        '<td>' +
          '<button data-sid="' + r.sid + '" class="threat-btn-sm" style="color:#38bdf8; border-color:rgba(56,189,248,0.4); padding:3px 10px; font-size:11px; white-space:nowrap;" onclick="openAnswerSheetModal(this.dataset.sid)" title="Audit candidate multi-round answer sheet">📄 View Answers</button>' +
        '</td>' +
      '</tr>';
    }).join('');
  }
}

/* ============================================================
   ANSWER SHEET MODAL CONTROLLER & COMPONENT
   ============================================================ */
let currentAuditSid = null;
let currentAuditRound = 1;

function openAnswerSheetModal(sid, roundNum){
  const roster = getLiveRoster();
  let s = roster[sid];
  if (!s && S && S.sid === sid) s = S;
  if (!s) {
    const ranked = getRankedLeaderboard();
    s = ranked.find(r => r.sid === sid);
  }
  if (!s) {
    showToast('Participant record not found.');
    return;
  }

  currentAuditSid = sid;
  currentAuditRound = roundNum || 1;

  let sheet = s.audit_sheet;
  if (!sheet) {
    sheet = generateParticipantAuditSheet(s);
    s.audit_sheet = sheet;
    roster[sid] = s;
    saveLiveRoster(roster);
  }

  renderAnswerSheetModal(s, currentAuditRound);
  const m = $('modalAnswerSheet');
  if (m) m.classList.add('active');
  SFX.click();
}

function switchAuditRoundTab(roundNum){
  currentAuditRound = roundNum;
  if (!currentAuditSid) return;
  const roster = getLiveRoster();
  let s = roster[currentAuditSid];
  if (!s && S && S.sid === currentAuditSid) s = S;
  if (s) renderAnswerSheetModal(s, roundNum);
}

function closeAnswerSheetModal(){
  currentAuditSid = null;
  const m = $('modalAnswerSheet');
  if (m) m.classList.remove('active');
}

function renderAnswerSheetModal(s, activeRound){
  const content = $('modalAnswerSheetContent');
  if (!content) return;

  const sheet = s.audit_sheet || generateParticipantAuditSheet(s);
  const durFmt = fmtTime(sheet.durationSeconds || 0);

  // Top header banner
  const bannerHtml = 
    '<div class="audit-header-banner">' +
      '<div class="audit-header-meta">' +
        '<div class="admin-student-avatar">' + (s.isSim ? '🤖' : '👤') + '</div>' +
        '<div>' +
          '<div style="font-family:var(--font-display); font-size:15px; color:#fff; font-weight:700;">' + escapeHtml(sheet.name) + '</div>' +
          '<div style="color:#94a3b8; font-size:11px; font-family:var(--font-mono);">' + escapeHtml(sheet.sid) + ' · ' + escapeHtml(sheet.dept) + ' · Year ' + escapeHtml(sheet.year) + ' · <span style="color:#38bdf8;">' + escapeHtml(sheet.status) + '</span></div>' +
        '</div>' +
      '</div>' +
      '<div class="audit-header-stats">' +
        '<div class="audit-stat-pill"><label>Grand Total</label><span style="color:var(--cyan);">' + sheet.total_score + ' pts</span></div>' +
        '<div class="audit-stat-pill"><label>Accuracy</label><span style="color:#34d399;">' + sheet.accuracy_rate + '%</span></div>' +
        '<div class="audit-stat-pill"><label>Total Time</label><span>' + durFmt + '</span></div>' +
        '<div class="audit-stat-pill"><label>Violations</label><span style="color:' + (sheet.violations > 0 ? '#fb7185' : '#4ade80') + ';">' + sheet.violations + '</span></div>' +
      '</div>' +
    '</div>';

  // Navigation tabs
  const r1Score = (sheet.rounds && sheet.rounds[1]) ? sheet.rounds[1].score : 0;
  const r2Score = (sheet.rounds && sheet.rounds[2]) ? sheet.rounds[2].score : 0;
  const r3Score = (sheet.rounds && sheet.rounds[3]) ? sheet.rounds[3].score : 0;

  const tabsHtml = 
    '<div class="audit-nav-tabs">' +
      '<button class="audit-tab-btn' + (activeRound === 1 ? ' active' : '') + '" onclick="switchAuditRoundTab(1)">' +
        '<span>Round 1: Quiz Master</span>' +
        '<span class="audit-tab-badge">' + r1Score + '/25</span>' +
      '</button>' +
      '<button class="audit-tab-btn' + (activeRound === 2 ? ' active' : '') + '" onclick="switchAuditRoundTab(2)">' +
        '<span>Round 2: Cyber Arcade</span>' +
        '<span class="audit-tab-badge">' + r2Score + '/15</span>' +
      '</button>' +
      '<button class="audit-tab-btn' + (activeRound === 3 ? ' active' : '') + '" onclick="switchAuditRoundTab(3)">' +
        '<span>Round 3: Digital Forensics</span>' +
        '<span class="audit-tab-badge">' + r3Score + '/5</span>' +
      '</button>' +
      '<button class="audit-tab-btn' + (activeRound === 4 ? ' active' : '') + '" onclick="switchAuditRoundTab(4)">' +
        '<span>Bonus &amp; Penalties</span>' +
        '<span class="audit-tab-badge">+' + sheet.bonus_points + '</span>' +
      '</button>' +
    '</div>';

  // Active Tab Body
  let bodyHtml = '';
  if (activeRound === 4) {
    bodyHtml = 
      '<div class="audit-round-summary">' +
        '<div><b style="color:#f59e0b;">Waiting Room &amp; Tactical Simulator Bonuses</b></div>' +
        '<div>Bonus Points: <b style="color:#34d399;">+' + sheet.bonus_points + ' pts</b> | Clue Penalties: <b style="color:#ef4444;">-' + sheet.penalties + ' pts</b></div>' +
      '</div>' +
      '<div style="background:rgba(15,23,42,0.8); border:1px solid #1e3a5f; border-radius:10px; padding:16px; font-family:var(--font-mono); font-size:12px; color:#cbd5e1; line-height:1.8;">' +
        '<div style="font-weight:700; color:#38bdf8; margin-bottom:10px; font-size:13px;">Cumulative Score Aggregation Formula:</div>' +
        '<div style="padding:10px; background:rgba(2,6,23,0.7); border-radius:8px; border:1px dashed #334155; margin-bottom:14px;">' +
          '<code>total_score = round_1_score (' + r1Score + ') + round_2_score (' + r2Score + ') + round_3_score (' + r3Score + ') + bonus_points (' + sheet.bonus_points + ') - penalties (' + sheet.penalties + ') = <b style="color:var(--cyan); font-size:14px;">' + sheet.total_score + ' pts</b></code>' +
        '</div>' +
        '<div style="display:flex; flex-direction:column; gap:8px;">' +
          '<div style="display:flex; justify-content:space-between; border-bottom:1px solid rgba(51,65,85,0.5); padding-bottom:6px;">' +
            '<span>🎮 ThreatGEN Red vs Blue SCADA Simulator Victories:</span>' +
            '<span style="color:#34d399; font-weight:700;">+' + Math.min(sheet.bonus_points, 50) + ' pts</span>' +
          '</div>' +
          '<div style="display:flex; justify-content:space-between; border-bottom:1px solid rgba(51,65,85,0.5); padding-bottom:6px;">' +
            '<span>💻 Cyber Terminal Caesar Cipher Decryptions:</span>' +
            '<span style="color:#34d399; font-weight:700;">Credited to Bonus Lounge</span>' +
          '</div>' +
          '<div style="display:flex; justify-content:space-between; padding-top:4px;">' +
            '<span>🙋 Admin Clue Deductions:</span>' +
            '<span style="color:' + (sheet.penalties > 0 ? '#ef4444' : '#94a3b8') + ';">-' + sheet.penalties + ' pts</span>' +
          '</div>' +
        '</div>' +
      '</div>';
  } else {
    const rData = sheet.rounds && sheet.rounds[activeRound];
    if (rData) {
      const acc = Math.round((rData.score / rData.max_score) * 100);
      const roundSummary = 
        '<div class="audit-round-summary">' +
          '<div><b style="color:#38bdf8;">' + escapeHtml(rData.title) + '</b></div>' +
          '<div>Round Marks: <b style="color:#34d399;">' + rData.score + ' / ' + rData.max_score + ' pts (' + acc + '%)</b> · Round Duration: <b>' + fmtTime(rData.durationSeconds) + '</b></div>' +
        '</div>';

      const qCards = rData.questions.map((q, idx) => {
        let statusClass = q.is_correct ? 'is-correct' : 'is-incorrect';
        let statusTagClass = q.is_correct ? 'correct' : 'incorrect';
        let statusText = q.is_correct ? '✔ CORRECT (+1 pt)' : '✖ INCORRECT (0 pts)';

        return '<div class="audit-q-card ' + statusClass + '">' +
          '<div class="audit-q-top">' +
            '<div class="audit-q-title"><b>Q' + (idx + 1) + ' [' + escapeHtml(q.question_id) + '].</b> ' + escapeHtml(q.prompt) + '</div>' +
            '<span class="audit-status-tag ' + statusTagClass + '">' + statusText + '</span>' +
          '</div>' +
          '<div class="audit-comparison-grid">' +
            '<div class="audit-ans-box ' + (q.is_correct ? 'candidate-correct' : 'candidate-incorrect') + '">' +
              '<label>Candidate Submitted Answer</label>' +
              '<div>' + escapeHtml(q.candidate_answer) + '</div>' +
            '</div>' +
            '<div class="audit-ans-box expected">' +
              '<label>Official / Accepted Answer</label>' +
              '<div>' + escapeHtml(q.expected_answer) + '</div>' +
            '</div>' +
          '</div>' +
        '</div>';
      }).join('');

      bodyHtml = roundSummary + '<div class="audit-q-list">' + qCards + '</div>';
    }
  }

  content.innerHTML = bannerHtml + tabsHtml + bodyHtml;
}

/* ============================================================
   BACKEND SYNC  (Google Apps Script — idempotent, spread + retried)
   ============================================================ */
function payload(status){
  S.seq = (S.seq || 0) + 1; save();
  return { action: 'sync', key: API_KEY, sid: S.sid, seq: S.seq, name: S.player.name, dept: S.player.dept, year: S.player.year,
           r1: S.scores.r1, r2: S.scores.r2, r3: S.scores.r3, round: S.round, status: status || 'IN_PROGRESS',
           violations: S.totalViolations || 0, ts: Date.now() };
}
/* spreadMs randomises the send time so 70 students finishing together don't hit the sheet in the same instant;
   Code.gs also serialises writes with LockService, and stale/duplicate packets are ignored via `seq`. */
function sendToBackend(p, tries, spreadMs){
  if (!API_URL || API_URL.startsWith('PASTE_')) return;
  setTimeout(() => {
    fetch(API_URL, { method: 'POST', mode: 'no-cors', keepalive: true, headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(p) })
      .catch(() => { if (tries > 1) sendToBackend(p, tries - 1, 5000); });
  }, Math.random() * (spreadMs || 0));
}
function syncProgress(spreadMs, tries, status){ if (S) sendToBackend(payload(status), tries || 3, spreadMs == null ? 2500 : spreadMs); }

/* ============================================================
   REGISTRATION
   ============================================================ */
function submitRegistration(){
  const name = $('regName').value.trim(), dept = $('regDept').value.trim(), year = $('regYear').value;
  if (!name || !dept || !year) { $('regError').style.display = 'block'; return; }
  $('regError').style.display = 'none';
  S = blankSession({ name, dept, year });
  sessionCleared = false;
  save(); setHeader(); updateRank(true);
  syncProgress(1500, 3, 'IN_PROGRESS');
  SFX.success();
  startRoundFlow(1);
}
['regName', 'regDept'].forEach(id => $(id).addEventListener('keydown', e => { if (e.key === 'Enter') submitRegistration(); }));

/* ============================================================
   ROUND FLOW: instructions -> 1-min read -> 3,2,1 -> live round
   ============================================================ */
const AUTOSAVE_RULE = 'Your progress is auto-saved on this device — if the page refreshes or closes, reopen it and you resume exactly where you were, with the timer still running.';
const roundMeta = {
  1: { title: 'Cyber Quiz Master', eyebrow: 'ROUND 1 / 3', rules: [
    R1.length + ' multiple-choice questions covering cybersecurity fundamentals and digital trust.',
    'The round timer runs for 30 minutes.',
    'Use Next / Previous to move between questions — you may revisit and change answers.',
    "If you submit early, you'll enter the Cyber Waiting Room with mini-games until the round timer ends — then Round 2 begins.",
    'Switching tabs or minimizing the window is logged as a violation (' + MAX_TAB_WARNINGS + ' violations auto-submit the round).',
    AUTOSAVE_RULE ] },
  2: { title: 'Cyber Arcade', eyebrow: 'ROUND 2 / 3', rules: [
    R2.length + ' puzzles: cryptography, scam detection, and emoji-decoding challenges.',
    'Each puzzle takes a short text answer — spelling matters, but answers are not case-sensitive.',
    'The round timer runs for 30 minutes.',
    "If you submit early, you'll wait in the Cyber Waiting Room until Round 3 begins.",
    AUTOSAVE_RULE ] },
  3: { title: 'The Final Investigation — Boss Level', eyebrow: 'ROUND 3 / 3', rules: [
    'One cyber-crime case study with four pieces of evidence, pinned at the top of the screen. Tap the flag on any card to mark it suspicious.',
    'Answer all ' + R3.questions.length + ' investigation questions using the stepper — Previous / Next Question move between them.',
    'You have 60 minutes for this final round.',
    'The submit button appears on Question ' + R3.questions.length + '. There is no waiting room — submitting ends the competition immediately.',
    AUTOSAVE_RULE ] }
};
let readIv = null;
function startRoundFlow(n){
  S.round = 'INSTR'; S.instrRound = n; S.readEndsAt = Date.now() + READ_SECONDS * 1000; S.violations = 0; S.waiting = null;
  save();
  showInstructions(n); runReadTimer();
}
function showInstructions(n){
  const meta = roundMeta[n];
  $('instrEyebrow').textContent = meta.eyebrow;
  $('instrTitle').textContent = 'Round ' + n + ' — ' + meta.title;
  $('instrList').innerHTML = meta.rules.map(r => '<li>' + escapeHtml(r) + '</li>').join('');
  gameActive = false;
  go('screen-instructions');
}
function runReadTimer(){
  clearInterval(readIv);
  const el = $('readTimer');
  const tick = () => {
    const r = Math.max(0, Math.ceil((S.readEndsAt - Date.now()) / 1000));
    el.textContent = fmtTime(r);
    if (r > 0 && r <= 10 && r !== runReadTimer._w) { runReadTimer._w = r; SFX.tick(r); }
    if (r <= 0) { clearInterval(readIv); readIv = null; beginCountdown(); }
  };
  readIv = setInterval(tick, 500); tick();
}
function beginCountdown(){
  S.round = 'COUNTDOWN'; save();
  runCountdown(() => startRound(S.instrRound));
}
function runCountdown(done){
  go('screen-countdown');
  gameActive = false;
  let n = 3; const el = $('countdownNum');
  el.textContent = n; SFX.tick(n);
  const iv = setInterval(() => {
    n--;
    if (n <= 0) { clearInterval(iv); el.textContent = 'GO'; SFX.success(); setTimeout(done, 500); }
    else { el.textContent = n; SFX.tick(n); }
  }, 900);
}
function startRound(n){
  S.round = 'R' + n; S.violations = 0; S.waiting = null; save();
  showRound(n);
  gameActive = true;
  startMasterTimer(ROUND_SECONDS[n], () => handleRoundExpire(n));
}
function showRound(n){
  if (n === 1) { go('screen-round1'); renderR1(); }
  if (n === 2) { go('screen-round2'); renderR2(); }
  if (n === 3) { go('screen-round3'); initRound3UI(); }
}
/* fires when the shared round timer hits zero — whether the student is answering or waiting */
function handleRoundExpire(n){
  gameActive = false;
  const spread = 20000;                       // everyone expires together -> spread the DB writes
  SFX.round();
  if (n === 1) { if (!S.r1.submitted) { showToast('Time is up — Round 1 auto-submitted.'); gradeRound1(spread); } startRoundFlow(2); }
  else if (n === 2) { if (!S.r2.submitted) { showToast('Time is up — Round 2 auto-submitted.'); gradeRound2(spread); } startRoundFlow(3); }
  else { if (!S.r3.submitted) { showToast('Time is up — final report auto-submitted.'); gradeRound3(spread); } finishCompetition(true); }
}

/* submit confirmation (manual submits only — timeouts / violations skip it) */
function requestSubmit(n){
  if (!S || S.is_locked) return;
  let unanswered;
  if (n === 1) unanswered = S.r1.answers.filter(a => a === null || a === undefined).length;
  else if (n === 2) unanswered = S.r2.answers.filter(a => String(a).trim() === '').length;
  else unanswered = S.r3.answers.filter(a => String(a).trim() === '').length;
  $('confirmTitle').textContent = n === 3 ? 'SUBMIT FINAL REPORT?' : 'SUBMIT ROUND ' + n + '?';
  $('confirmText').textContent = (unanswered ? unanswered + (unanswered === 1 ? ' question is' : ' questions are') + ' still unanswered. ' : 'All questions answered. ') +
    (n === 3 ? 'Submitting ends the competition immediately and cannot be undone.' : 'You cannot change your answers after submitting.');
  $('confirmYes').onclick = () => { closeConfirm(); finalizeRound(n); };
  isInternalModalOpen = true;
  $('modalConfirm').classList.add('active');
}
function closeConfirm(){ 
  $('modalConfirm').classList.remove('active'); 
  isInternalModalOpen = false;
}
function finalizeRound(n){
  if (!S) return;
  if (n === 1) { if (S.r1.submitted) return; gradeRound1(); SFX.success(); enterWaitingRoom(1, 2); }
  else if (n === 2) { if (S.r2.submitted) return; gradeRound2(); SFX.success(); enterWaitingRoom(2, 3); }
  else { if (S.r3.submitted) return; gradeRound3(8000); finishCompetition(false); }
}

/* ============================================================
   ROUND 1 — CYBER QUIZ MASTER
   ============================================================ */
function renderR1(){
  const st = S.r1, q = R1[st.idx];
  $('r1Counter').textContent = 'Question ' + (st.idx + 1) + ' / ' + R1.length;
  $('r1QText').textContent = q.q;
  $('r1Progress').style.width = (st.answers.filter(a => a !== null).length / R1.length * 100) + '%';
  $('r1Options').innerHTML = q.options.map((o, i) =>
    '<div class="option ' + (st.answers[st.idx] === i ? 'selected' : '') + '" onclick="selectR1(' + i + ')"><span class="letter">' +
    String.fromCharCode(65 + i) + '</span><span>' + escapeHtml(o) + '</span></div>').join('');
  $('r1Prev').disabled = st.idx === 0;
  $('r1Next').innerHTML = st.idx === R1.length - 1 ? 'SUBMIT ROUND →' : 'Next →';
  renderCurrentHintBox('Round 1', 'R1_Q' + (st.idx + 1), 'r1HintSlot');
}
function selectR1(i){ if (!S || S.is_locked) return; S.r1.answers[S.r1.idx] = i; save(); updateRank(); renderR1(); }
function r1Nav(dir){
  if (!S || S.is_locked) return;
  if (dir === 1 && S.r1.idx === R1.length - 1) { requestSubmit(1); return; }
  S.r1.idx = Math.min(Math.max(S.r1.idx + dir, 0), R1.length - 1); save(); renderR1();
}
function gradeRound1(spread){
  let c = 0; R1.forEach((q, i) => { if (S.r1.answers[i] === q.answer) c++; });
  S.scores.r1 = c; S.r1.submitted = true; S.audit_sheet = generateParticipantAuditSheet(S); save();
  syncProgress(spread == null ? 2500 : spread);
}

/* ============================================================
   ROUND 2 — CYBER ARCADE
   ============================================================ */
function renderR2(){
  const st = S.r2, p = R2[st.idx];
  $('r2Counter').textContent = 'Puzzle ' + (st.idx + 1) + ' / ' + R2.length;
  $('r2Progress').style.width = (st.answers.filter(a => String(a).trim() !== '').length / R2.length * 100) + '%';
  $('r2Card').innerHTML = '<div class="ptype">' + escapeHtml(p.type) + '</div><div class="pbody">' + escapeHtml(p.body) + '</div>' +
    (p.mono ? '<div class="mono-box">' + escapeHtml(p.mono) + '</div>' : '');
  $('r2Answer').value = st.answers[st.idx] || '';
  $('r2Prev').disabled = st.idx === 0;
  $('r2Next').innerHTML = st.idx === R2.length - 1 ? 'SUBMIT ROUND →' : 'Next →';
  renderCurrentHintBox('Round 2', 'R2_P' + (st.idx + 1), 'r2HintSlot');
}
$('r2Answer').addEventListener('input', e => {
  if (!S || S.round !== 'R2' || S.is_locked) return;
  S.r2.answers[S.r2.idx] = e.target.value; save(); updateRank();
  $('r2Progress').style.width = (S.r2.answers.filter(a => String(a).trim() !== '').length / R2.length * 100) + '%';
});
$('r2Answer').addEventListener('keydown', e => { if (e.key === 'Enter') r2Nav(1); });
function r2Nav(dir){
  if (!S || S.is_locked) return;
  if (dir === 1 && S.r2.idx === R2.length - 1) { requestSubmit(2); return; }
  S.r2.idx = Math.min(Math.max(S.r2.idx + dir, 0), R2.length - 1); save(); renderR2();
}
function gradeRound2(spread){
  let c = 0; R2.forEach((p, i) => { if (matchesAny(S.r2.answers[i], p.answers)) c++; });
  S.scores.r2 = c; S.r2.submitted = true; S.audit_sheet = generateParticipantAuditSheet(S); save();
  syncProgress(spread == null ? 2500 : spread);
}

/* ============================================================
   WAITING ROOM  (early finishers, rounds 1 & 2)
   ============================================================ */
function enterWaitingRoom(justFinished, next){
  S.round = 'WAITING'; S.waiting = { just: justFinished, next }; gameActive = false; save();
  showWaiting();
  // the shared round timer keeps running; it will fire handleRoundExpire(justFinished)
  runMasterTimer(() => handleRoundExpire(justFinished));
}
function showWaiting(){
  $('waitTitle').textContent = 'Round ' + S.waiting.just + ' submitted!';
  $('waitNextRound').textContent = S.waiting.next;
  go('screen-waiting');
  initMiniGame(); termReset(); switchGame('flip');
}
function switchGame(g){
  document.querySelectorAll('.game-tab').forEach(t => t.classList.toggle('active', t.dataset.game === g));
  $('pane-flip').classList.toggle('active', g === 'flip');
  $('pane-term').classList.toggle('active', g === 'term');
  if ($('pane-threatgen')) $('pane-threatgen').classList.toggle('active', g === 'threatgen');
  if (g === 'term') setTimeout(() => $('termInput').focus(), 50);
  if (g === 'threatgen') initThreatGen();
}

/* ---- Mini-game 1: Cyber Encryption Flip Match ---- */
const memorySymbols = ['🔒','🛡️','🔑','💻','🧬','📡','🐛','🕵️'];
let miniState = { cards: [], flipped: [], matched: 0, moves: 0, lock: false };
function initMiniGame(){
  const deck = shuffle([...memorySymbols, ...memorySymbols].map((s, i) => ({ id: i, symbol: s })));
  miniState = { cards: deck, flipped: [], matched: 0, moves: 0, lock: false };
  $('miniMoves').textContent = '0'; $('miniMatches').textContent = '0';
  renderMiniGame();
}
function renderMiniGame(){
  $('miniGrid').innerHTML = miniState.cards.map((c, i) =>
    '<div class="mcard ' + (miniState.flipped.includes(i) ? 'flipped' : '') + ' ' + (c.matched ? 'matched' : '') +
    '" data-silent="1" onclick="flipMiniCard(' + i + ')"><span class="face">' + c.symbol + '</span><span class="back">?</span></div>').join('');
}
function flipMiniCard(i){
  if (miniState.lock) return;
  const c = miniState.cards[i];
  if (c.matched || miniState.flipped.includes(i)) return;
  miniState.flipped.push(i); SFX.flip(); renderMiniGame();
  if (miniState.flipped.length === 2) {
    miniState.moves++; $('miniMoves').textContent = miniState.moves;
    const [a, b] = miniState.flipped;
    if (miniState.cards[a].symbol === miniState.cards[b].symbol) {
      miniState.cards[a].matched = miniState.cards[b].matched = true; miniState.matched++;
      $('miniMatches').textContent = miniState.matched; miniState.flipped = [];
      setTimeout(SFX.match, 120); renderMiniGame();
      if (miniState.matched === memorySymbols.length) { setTimeout(SFX.success, 500); showToast('All pairs matched in ' + miniState.moves + ' moves!'); awardWaitingBonus('flip', 'Memory Flip Match'); }
    } else {
      miniState.lock = true;
      setTimeout(() => { SFX.miss(); miniState.flipped = []; miniState.lock = false; renderMiniGame(); }, 800);
    }
  }
}

/* ---- Mini-game 2: Hack The Terminal (cryptogram / word guessing) ---- */
const TERM_WORDS = [
  { w: 'BOTNET',   h: 'A network of hijacked devices controlled remotely' },
  { w: 'ROOTKIT',  h: 'Stealthy malware that hides deep inside the operating system' },
  { w: 'SPOOFING', h: 'Faking an identity or sender address' },
  { w: 'PAYLOAD',  h: 'The part of malware that carries out the harmful action' },
  { w: 'HASHING',  h: 'A one-way function that fingerprints data' },
  { w: 'SANDBOX',  h: 'An isolated environment for safely running suspicious code' },
  { w: 'EXPLOIT',  h: 'Code that abuses a vulnerability' },
  { w: 'BACKDOOR', h: 'A hidden entry point that bypasses authentication' },
  { w: 'WORM',     h: 'Self-replicating malware that spreads across networks' },
  { w: 'SPYWARE',  h: 'Software that secretly gathers information about a user' },
  { w: 'SALTING',  h: 'Adding random data to a password before it is hashed' },
  { w: 'DARKWEB',  h: 'Hidden part of the internet reachable only with special software' }
];
let term = { bag: [], cur: null, shift: 0, cipher: '', tries: 6, solved: 0, revealed: [], hints: 0, busy: false };
function termLog(text, cls){
  const l = $('termLog'), d = document.createElement('div');
  if (cls) d.className = cls; d.textContent = text; l.appendChild(d); l.scrollTop = l.scrollHeight;
}
function termMask(){ return term.cur.w.split('').map((c, i) => term.revealed.includes(i) ? c : '_').join(' '); }
function termMeta(){ $('termTries').textContent = term.tries; $('termSolved').textContent = term.solved; }
function termReset(){ term.bag = []; term.solved = 0; termNew(); }
function termNew(){
  if (!term.bag.length) term.bag = shuffle(TERM_WORDS.slice());
  term.cur = term.bag.pop();
  term.shift = 1 + Math.floor(Math.random() * 7);
  term.cipher = caesar(term.cur.w, term.shift);
  term.tries = 6; term.revealed = []; term.hints = 0; term.busy = false;
  $('termLog').innerHTML = '';
  termLog('> INCOMING TRANSMISSION INTERCEPTED', 'cy');
  termLog('> CIPHERTEXT : ' + term.cipher, 'ok');
  termLog('> CAESAR KEY : +' + term.shift + '   (decrypt by shifting every letter BACK by ' + term.shift + ')', 'ok');
  termLog('> MASK       : ' + termMask(), 'ok');
  termLog('> Type the decrypted word and press ENTER.  Commands: hint · skip · help', 'dim');
  termMeta();
}
function termSubmit(){
  if (term.busy) return;
  const inp = $('termInput'), raw = inp.value.trim(); inp.value = '';
  if (!raw) return;
  termLog('root@arena:~$ ' + raw, 'dim');
  const cmd = raw.toLowerCase();
  if (cmd === 'help') { termLog('  hint  → clue (first one is free, then it costs 1 attempt and reveals a letter)', 'dim'); termLog('  skip  → give up on this word', 'dim'); termLog('  clear → clear the screen', 'dim'); return; }
  if (cmd === 'clear') { $('termLog').innerHTML = ''; return; }
  if (cmd === 'hint') {
    if (term.hints === 0) { termLog('> CLUE: ' + term.cur.h, 'cy'); }
    else { if (!termRevealLetter()) { termLog('> No more letters to reveal.', 'dim'); return; } term.tries--; termLog('> LETTER REVEALED (-1 attempt)  MASK: ' + termMask(), 'ok'); if (term.tries <= 0) return termLose(); }
    term.hints++; termMeta(); return;
  }
  if (cmd === 'skip') { termLog('> SKIPPED — the word was ' + term.cur.w, 'err'); term.busy = true; setTimeout(termNew, 1400); return; }
  const guess = raw.toUpperCase().replace(/[^A-Z]/g, '');
  if (guess === term.cur.w) {
    term.solved++; SFX.success(); awardWaitingBonus('term', 'Terminal Decrypted');
    termLog('> ACCESS GRANTED ✔  "' + term.cur.w + '" decrypted.', 'ok');
    term.busy = true; termMeta(); setTimeout(termNew, 1600);
  } else {
    term.tries--; SFX.miss(); termRevealLetter();
    termLog('> ACCESS DENIED ✖  ' + term.tries + ' attempt' + (term.tries === 1 ? '' : 's') + ' left   MASK: ' + termMask(), 'err');
    termMeta();
    if (term.tries <= 0) termLose();
  }
}
function termRevealLetter(){
  const open = []; term.cur.w.split('').forEach((c, i) => { if (!term.revealed.includes(i)) open.push(i); });
  if (open.length <= 1) return false;               // always keep at least one letter hidden
  term.revealed.push(open[Math.floor(Math.random() * open.length)]); return true;
}
function termLose(){
  termLog('> SYSTEM LOCKED. The password was ' + term.cur.w, 'err');
  term.busy = true; termMeta(); setTimeout(termNew, 2000);
}
$('termInput').addEventListener('keydown', e => { if (e.key === 'Enter') termSubmit(); });




/* ============================================================
   THREATGEN: RED VS. BLUE — STUDENT-FRIENDLY SIMULATOR V3
   ============================================================ */
let tg = null;

const TG_NODES_DEF = [
  // ZONE A: DMZ
  { id: 'gw',   zone: 'dmz', name: 'Gateway Firewall',   ip: '198.51.100.1',  icon: '🧱', role: 'Perimeter Barrier & Packet Filter', links: ['web', 'mail'], sec: 65, cost: 2000 },
  { id: 'web',  zone: 'dmz', name: 'Web Server',         ip: '198.51.100.25', icon: '🌐', role: 'Corporate Web Portal & APIs',       links: ['gw', 'work', 'db'], sec: 50, cost: 2500 },
  { id: 'mail', zone: 'dmz', name: 'Exchange Mail',       ip: '198.51.100.30', icon: '✉️', role: 'Company Email (Phishing Vector)',   links: ['gw', 'work'], sec: 40, cost: 2000 },
  
  // ZONE B: CORPORATE IT
  { id: 'work', zone: 'it',  name: 'User Workstations',  ip: '10.0.1.50',     icon: '💻', role: 'Finance & HR Employee Laptops',      links: ['web', 'mail', 'ad', 'scada'], sec: 35, cost: 1500 },
  { id: 'ad',   zone: 'it',  name: 'Active Directory',   ip: '10.0.1.10',     icon: '🖥️', role: 'Domain Controller (Master Passwords)', links: ['work', 'db'], sec: 70, cost: 3500 },
  { id: 'db',   zone: 'it',  name: 'Financial Database', ip: '10.0.1.90',     icon: '🗄️', role: 'Customer Bank Records (Crown Jewels)', links: ['web', 'ad'], sec: 75, cost: 4000 },

  // ZONE C: INDUSTRIAL OT / SCADA
  { id: 'scada', zone: 'ot', name: 'SCADA Host',         ip: '10.2.0.15',     icon: '⚙️', role: 'Industrial Control Host',           links: ['work', 'hmi', 'plc'], sec: 60, cost: 4000 },
  { id: 'hmi',   zone: 'ot', name: 'HMI Touchscreen',    ip: '10.2.0.25',     icon: '🎛️', role: 'Operator Physical Control Screen',  links: ['scada', 'plc'], sec: 50, cost: 3000 },
  { id: 'plc',   zone: 'ot', name: 'Industrial PLC',     ip: '10.2.0.35',     icon: '🖧', role: 'Programmable Logic Controller',      links: ['scada', 'hmi', 'valve'], sec: 65, cost: 4500 },
  { id: 'valve', zone: 'ot', name: 'Pipeline Valve',     ip: '10.2.0.40',     icon: '🚰', role: 'Physical Oil & Gas Pressure Valve',  links: ['plc'], sec: 80, cost: 5000 }
];

function initThreatGen(role){
  const currentRole = role || (tg ? tg.playerRole : 'blue');
  const nodes = TG_NODES_DEF.map(d => ({
    ...d,
    status: (d.id === 'mail' || d.id === 'work') ? 'vulnerable' : 'secure',
    monitored: false,
    probed: false,
    isolated: false,
    sabotaged: false
  }));

  tg = {
    playerRole: currentRole, // 'blue' or 'red'
    turn: 1,
    maxTurns: 15,
    cash: 35000,
    ap: 3,
    maxAp: 3,
    score: currentRole === 'blue' ? 100 : 0,
    selectedNode: 'gw',
    gameOver: false,
    winner: null,
    nodes: nodes
  };

  $('tgRoleBlue').classList.toggle('active', currentRole === 'blue');
  $('tgRoleRed').classList.toggle('active', currentRole === 'red');
  $('tgAvatar').className = 'tg-v3-avatar ' + (currentRole === 'red' ? 'red' : 'blue');
  $('tgAvatar').textContent = currentRole === 'red' ? '🥷' : '🛡️';
  $('tgScoreLabel').textContent = currentRole === 'blue' ? 'DEFENSE:' : 'BREACH:';

  updateCoachMessage();
  renderTgBoard();
  renderTgCockpit();
  updateTgStats();
}

function tgSetRole(r){
  if (tg && tg.playerRole === r) return;
  SFX.click();
  initThreatGen(r);
}

function tgToggleManual(){
  const m = $('threatManual');
  if (m) m.style.display = m.style.display === 'none' ? 'block' : 'none';
}

function updateCoachMessage(){
  const textEl = $('tgCoachText'), iconEl = $('tgCoachIcon');
  if (!textEl) return;

  const isBlue = tg.playerRole === 'blue';
  const comp = tg.nodes.filter(n => n.status === 'compromised');
  const valve = tg.nodes.find(n => n.id === 'valve');

  if (valve.sabotaged) {
    iconEl.textContent = '💀';
    textEl.innerHTML = '<b style="color:#fb7185;">CRITICAL EMERGENCY!</b> The Pipeline Valve has been sabotaged! Industrial plant pressure critical!';
    return;
  }

  if (comp.length > 0) {
    iconEl.textContent = '⚠️';
    const names = comp.map(n => n.name).join(', ');
    if (isBlue) {
      textEl.innerHTML = '<b style="color:#fbbf24;">INTRUSION ALERT!</b> Malware detected on <b>[' + names + ']</b>! Click the infected host and tap <b>"🧹 Disinfect"</b> or <b>"🔒 Air-Gap"</b>!';
    } else {
      textEl.innerHTML = '<b style="color:#4ade80;">FOOTHOLD SECURED!</b> You have breached <b>[' + names + ']</b>! Now use <b>"🔀 Lateral Pivot"</b> to reach the <b>SCADA Server</b> or <b>Pipeline Valve</b>!';
    }
    return;
  }

  if (isBlue) {
    if (tg.turn === 1) {
      iconEl.textContent = '🤖';
      textEl.innerHTML = 'Welcome Defender! Click on <b>[Gateway Firewall]</b> or <b>[User Workstations]</b>, then tap <b>"🛡️ Patch System"</b> to block hacker entry!';
    } else if (tg.turn <= 5) {
      iconEl.textContent = '🛡️';
      textEl.innerHTML = 'Hackers are scanning the network! Deploy <b>"🚨 Install EDR"</b> on [Workstations] to double your defenses against phishing!';
    } else {
      iconEl.textContent = '🏭';
      textEl.innerHTML = 'Adversaries may attempt to jump into Industrial OT! Make sure the <b>[Pipeline Valve]</b> and <b>[SCADA Host]</b> are fully patched!';
    }
  } else {
    if (tg.turn === 1) {
      iconEl.textContent = '🥷';
      textEl.innerHTML = 'Adversary Objective: Click <b>[Exchange Mail]</b> or <b>[Web Server]</b> in Zone A, then tap <b>"💥 Phish / Exploit"</b> to gain your first shell!';
    } else {
      iconEl.textContent = '💥';
      textEl.innerHTML = 'Tunnel deeper! Target the <b>[Active Directory]</b> server for master credentials, or sabotage the <b>[Pipeline Valve]</b> to win immediately!';
    }
  }
}

function updateTgStats(){
  if (!tg) return;
  $('tgCashDisp').textContent = '$' + tg.cash.toLocaleString();
  $('tgApDisp').textContent = tg.ap + ' / ' + tg.maxAp;
  $('tgTurnDisp').textContent = tg.turn + ' / ' + tg.maxTurns;
  $('tgScoreDisp').textContent = tg.score + ' PTS';
}

function renderTgBoard(){
  if (!tg) return;
  const dmzRow = $('tgRowDmz'), itRow = $('tgRowIt'), otRow = $('tgRowOt');
  if (!dmzRow || !itRow || !otRow) return;

  const renderNodes = (zoneNodes) => {
    return zoneNodes.map(n => {
      const isSel = n.id === tg.selectedNode;
      const fillW = Math.max(5, Math.min(100, n.sec));
      const fillCol = n.status === 'compromised' ? '#fb4570' : n.status === 'vulnerable' ? '#f2b23b' : '#38bdf8';

      let pillCls = 'v3-badge-secure', pillTxt = 'SECURE';
      if (n.sabotaged) { pillCls = 'v3-badge-compromised'; pillTxt = 'SABOTAGED'; }
      else if (n.status === 'compromised') { pillCls = 'v3-badge-compromised'; pillTxt = 'BREACHED'; }
      else if (n.status === 'isolated') { pillCls = 'v3-badge-isolated'; pillTxt = 'ISOLATED'; }
      else if (n.monitored) { pillCls = 'v3-badge-monitored'; pillTxt = 'EDR ARMED'; }
      else if (n.probed) { pillCls = 'v3-badge-probed'; pillTxt = 'PROBED'; }
      else if (n.status === 'vulnerable') { pillCls = 'v3-badge-vulnerable'; pillTxt = 'WEAK CVE'; }

      return '<div class="tg-v3-node status-' + n.status + ' ' + (isSel ? 'selected' : '') + '" onclick="tgSelectNode(\'' + n.id + '\')">' +
        '<div class="tg-v3-node-icon">' + n.icon + '</div>' +
        '<div class="tg-v3-node-info">' +
          '<div class="tg-v3-node-name">' + escapeHtml(n.name) + '</div>' +
          '<div class="tg-v3-node-sub">' + escapeHtml(n.ip) + '</div>' +
          '<div class="tg-v3-node-bar">' +
            '<span>DEF: ' + n.sec + '%</span>' +
            '<div class="tg-v3-track"><div class="tg-v3-fill" style="width:' + fillW + '%; background:' + fillCol + ';"></div></div>' +
          '</div>' +
        '</div>' +
        '<span class="tg-v3-node-badge ' + pillCls + '">' + pillTxt + '</span>' +
      '</div>';
    }).join('');
  };

  dmzRow.innerHTML = renderNodes(tg.nodes.filter(n => n.zone === 'dmz'));
  itRow.innerHTML = renderNodes(tg.nodes.filter(n => n.zone === 'it'));
  otRow.innerHTML = renderNodes(tg.nodes.filter(n => n.zone === 'ot'));
  setTimeout(drawTgCircuitLines, 50);
}

function tgSelectNode(id){
  if (!tg || tg.gameOver) return;
  tg.selectedNode = id;
  SFX.click();
  renderTgBoard();
  renderTgCockpit();
}

function renderTgCockpit(){
  if (!tg) return;
  const node = tg.nodes.find(n => n.id === tg.selectedNode);
  if (!node) return;

  $('tgTargetTitle').innerHTML = '<span style="font-size:18px;">' + node.icon + '</span> <b>' + escapeHtml(node.name) + '</b> <span style="font-size:11px; color:#94a3b8;">(' + node.ip + ' &bull; ' + node.role + ')</span>';

  const grid = $('tgActionsGrid');
  grid.innerHTML = '';

  if (tg.gameOver) {
    grid.innerHTML = '<div style="grid-column:1/-1; text-align:center; padding:12px; font-family:var(--font-display); font-size:13px; color:' + (tg.winner === tg.playerRole ? '#4ade80' : '#fb7185') + ';">' +
      (tg.winner === tg.playerRole ? '🏆 VICTORY ACHIEVED! Excellent execution.' : '💀 MISSION DEFEAT! Tactical objectives compromised.') +
      '<button class="btn solid small" style="margin-left:14px;" onclick="initThreatGen()">Play Again</button></div>';
    return;
  }

  const isBlue = tg.playerRole === 'blue';
  const ap = tg.ap, cash = tg.cash;

  const hasFoothold = tg.nodes.some(n => n.status === 'compromised');
  const canReach = !hasFoothold ? (node.zone === 'dmz') :
    (node.status === 'compromised' || node.links.some(lid => {
      const linkN = tg.nodes.find(n => n.id === lid);
      return linkN && linkN.status === 'compromised' && linkN.status !== 'isolated';
    }));

  if (isBlue) {
    // Large, clear Blue action cards
    const acts = [
      { id: 'patch', name: '🛡️ Patch System', ap: 1, cash: 2000, desc: 'Install security hotfix to remove flaws (+35% Defense).', chance: '100%', enabled: ap >= 1 && cash >= 2000 && node.sec < 100 },
      { id: 'scan', name: '👁️ Network Scan', ap: 1, cash: 1500, desc: 'Inspect traffic to detect hidden hacker recon (+15% Defense).', chance: '100%', enabled: ap >= 1 && cash >= 1500 },
      { id: 'edr', name: '🚨 Install EDR', ap: 1, cash: 3000, desc: 'Equip active endpoint alarms (Cuts hacker success by 50%).', chance: '100%', enabled: ap >= 1 && cash >= 3000 && !node.monitored },
      { id: 'airgap', name: '🔒 Air-Gap Cable', ap: 2, cash: 4000, desc: 'Pull network plug to stop malware from spreading here.', chance: '95%', enabled: ap >= 2 && cash >= 4000 && node.status !== 'isolated' },
      { id: 'remediate', name: '🧹 Disinfect Host', ap: 2, cash: 4500, desc: 'Wipe hacker backdoors and restore computer to clean SECURE state.', chance: '90%', enabled: ap >= 2 && cash >= 4500 && node.status === 'compromised' }
    ];

    grid.innerHTML = acts.map(a =>
      '<button class="tg-v3-card blue-c" ' + (a.enabled ? '' : 'disabled') + ' onclick="tgExecAct(\'' + a.id + '\')">' +
        '<div class="tg-card-top"><span class="tg-card-ap">' + a.ap + ' AP</span><span class="tg-card-cost">$' + a.cash.toLocaleString() + '</span></div>' +
        '<div class="tg-card-name">' + a.name + '</div>' +
        '<div class="tg-card-desc">' + a.desc + '</div>' +
        '<div class="tg-card-footer"><span>Success Chance:</span><span class="tg-card-chance">' + a.chance + '</span></div>' + (!a.enabled ? '<div style="color:#fbbf24; font-size:8.5px; margin-top:2px; font-family:var(--font-mono); font-weight:700;">⚠ Requires: ' + a.ap + ' AP & $' + a.cash.toLocaleString() + '</div>' : '') +
      '</button>'
    ).join('');
  } else {
    // Large, clear Red action cards
    const effChance = node.monitored ? Math.max(15, Math.round((100 - node.sec) * 0.5)) : Math.max(25, 95 - node.sec);

    const acts = [
      { id: 'recon', name: '🔍 Scan for Weakness', ap: 1, cash: 1000, desc: 'Probe open ports and mark system as PROBED.', chance: '100%', enabled: ap >= 1 && cash >= 1000 && canReach },
      { id: 'exploit', name: '💥 Phish / Exploit', ap: 1, cash: 2500, desc: 'Hack into computer and establish attacker shell.', chance: effChance + '%', enabled: ap >= 1 && cash >= 2500 && canReach && (node.status === 'vulnerable' || node.probed) && node.status !== 'compromised' },
      { id: 'pivot', name: '🔀 Pivot to Next Host', ap: 2, cash: 3500, desc: 'Tunnel through compromised machine to attack internal subnet.', chance: Math.max(25, 85 - Math.round(node.sec * 0.5)) + '%', enabled: ap >= 2 && cash >= 3500 && canReach && hasFoothold && node.status !== 'compromised' },
      { id: 'ransom', name: '💀 Ransomware Lock', ap: 2, cash: 4000, desc: 'Freeze machine and extort +$8,000 ransom payment!', chance: '100%', enabled: ap >= 2 && cash >= 4000 && node.status === 'compromised' },
      { id: 'sabotage', name: '🚰 Sabotage Valve / Exfil', ap: 2, cash: 6000, desc: (node.id === 'valve' ? 'Overheat physical pipeline valve!' : 'Exfiltrate database records!'), chance: (node.status === 'compromised' ? '90%' : '40%'), enabled: ap >= 2 && cash >= 6000 && (node.id === 'valve' || node.id === 'db') }
    ];

    grid.innerHTML = acts.map(a =>
      '<button class="tg-v3-card red-c" ' + (a.enabled ? '' : 'disabled') + ' onclick="tgExecAct(\'' + a.id + '\')">' +
        '<div class="tg-card-top"><span class="tg-card-ap">' + a.ap + ' AP</span><span class="tg-card-cost">$' + a.cash.toLocaleString() + '</span></div>' +
        '<div class="tg-card-name">' + a.name + '</div>' +
        '<div class="tg-card-desc">' + a.desc + '</div>' +
        '<div class="tg-card-footer"><span>Success Chance:</span><span class="tg-card-chance">' + a.chance + '</span></div>' + (!a.enabled ? '<div style="color:#fbbf24; font-size:8.5px; margin-top:2px; font-family:var(--font-mono); font-weight:700;">⚠ Requires: ' + a.ap + ' AP & $' + a.cash.toLocaleString() + '</div>' : '') +
      '</button>'
    ).join('');
  }
}

function tgExecAct(act){
  if (!tg || tg.gameOver || tg.ap <= 0) return;
  const node = tg.nodes.find(n => n.id === tg.selectedNode);
  if (!node) return;

  const isBlue = tg.playerRole === 'blue';

  if (isBlue) {
    if (act === 'patch') {
      tg.ap -= 1; tg.cash -= 2000;
      node.sec = Math.min(100, node.sec + 35);
      if (node.status === 'vulnerable') node.status = 'secure';
      tg.score += 15;
      showToast('🛡️ Patch Deployed on ' + node.name + ' (+35% Defense!)'); tgSpawnFloatFx(node.id, '+35% DEFENSE 🛡️', '#4ade80');
      SFX.success();
    } else if (act === 'scan') {
      tg.ap -= 1; tg.cash -= 1500;
      node.sec = Math.min(100, node.sec + 15);
      node.probed = false;
      tg.score += 10;
      showToast('👁️ Network Scan Clean on ' + node.name + ' (+15% Defense!)'); tgSpawnFloatFx(node.id, '+15% DEFENSE 👁️', '#38bdf8');
      SFX.click();
    } else if (act === 'edr') {
      tg.ap -= 1; tg.cash -= 3000;
      node.monitored = true;
      node.sec = Math.min(100, node.sec + 10);
      tg.score += 15;
      showToast('🚨 EDR Sensors Armed on ' + node.name + '!'); tgSpawnFloatFx(node.id, 'EDR ARMED 🚨', '#4ade80');
      SFX.success();
    } else if (act === 'airgap') {
      tg.ap -= 2; tg.cash -= 4000;
      node.status = 'isolated';
      tg.score += 10;
      showToast('🔒 ' + node.name + ' Quarantined from Network!'); tgSpawnFloatFx(node.id, 'AIR-GAPPED 🔒', '#c084fc');
      SFX.warn();
    } else if (act === 'remediate') {
      tg.ap -= 2; tg.cash -= 4500;
      node.status = 'secure';
      node.sabotaged = false;
      node.sec = Math.max(60, node.sec + 25);
      tg.score += 30;
      showToast('🧹 Backdoor Eradicated from ' + node.name + '! Machine is Clean!'); tgSpawnFloatFx(node.id, 'RESTORED CLEAN 🧹', '#38bdf8');
      SFX.round();
    }
  } else {
    // Red Actions
    if (act === 'recon') {
      tg.ap -= 1; tg.cash -= 1000;
      node.probed = true;
      tg.score += 10;
      showToast('🔍 Scanned ' + node.name + ' — Open ports discovered!');
      SFX.click();
    } else if (act === 'exploit') {
      tg.ap -= 1; tg.cash -= 2500;
      const effChance = node.monitored ? Math.max(15, Math.round((100 - node.sec) * 0.5)) : Math.max(25, 95 - node.sec);
      const roll = Math.floor(Math.random() * 100);

      if (roll < effChance) {
        node.status = 'compromised';
        node.sec = Math.max(10, node.sec - 35);
        tg.score += 25;
        showToast('💥 EXPLOIT SUCCESS! Shell spawned on ' + node.name + '!'); tgSpawnFloatFx(node.id, 'BREACHED 💥', '#fb4570');
        SFX.success();
      } else {
        showToast('🛡️ Exploit blocked by ' + node.name + ' defense!');
        SFX.miss();
      }
    } else if (act === 'pivot') {
      tg.ap -= 2; tg.cash -= 3500;
      const roll = Math.floor(Math.random() * 100);
      const pivotChance = Math.max(25, 85 - Math.round(node.sec * 0.5));
      if (roll < pivotChance) {
        node.status = 'compromised';
        tg.score += 30;
        showToast('🔀 Pivoted into ' + node.name + '! Foothold secured!');
        SFX.success();
      } else {
        showToast('🛡️ Firewall blocked lateral tunnel to ' + node.name + '!');
        SFX.miss();
      }
    } else if (act === 'ransom') {
      tg.ap -= 2; tg.cash += 8000;
      node.sec = 0;
      tg.score += 35;
      showToast('💀 Ransomware deployed! Extorted +$8,000 ransom!');
      SFX.warn();
    } else if (act === 'sabotage') {
      tg.ap -= 2; tg.cash -= 6000;
      node.sabotaged = true;
      node.status = 'compromised';
      tg.score += 60;
      showToast('🚰 Physical safety sabotage triggered on ' + node.name + '!');
      SFX.round();
    }
  }

  checkTgWinLoss();
  updateCoachMessage();
  renderTgBoard();
  renderTgCockpit();
  updateTgStats();
}

function tgEndTurn(){
  if (!tg || tg.gameOver) return;

  // Show combat modal summarizing AI turn
  const modal = $('tgCombatOverlay');
  const title = $('tgCombatTitle'), msg = $('tgCombatMsg'), icon = $('tgCombatIcon');

  if (tg.playerRole === 'blue') {
    // Red AI attacks
    const targets = [tg.nodes.find(n => n.id === 'work'), tg.nodes.find(n => n.id === 'mail'), tg.nodes.find(n => n.id === 'web')];
    const t = targets[Math.floor(Math.random() * targets.length)];
    const roll = Math.floor(Math.random() * 100);
    const breachChance = Math.max(20, 90 - t.sec);

    if (roll < breachChance) {
      t.status = 'compromised';
      icon.textContent = '🚨';
      title.textContent = 'SECURITY BREACH DETECTED!';
      msg.innerHTML = 'The adversary launched a spear-phishing payload against <b>' + t.name + '</b> and breached it!<br><br>👉 <b>Action:</b> Disinfect or isolate ' + t.name + ' next turn before they spread!';
      SFX.warn();
    } else {
      icon.textContent = '🛡️';
      title.textContent = 'ATTACK BLOCKED BY DEFENSES!';
      msg.innerHTML = 'The adversary tried to exploit <b>' + t.name + '</b>, but your security controls held strong and deflected the intrusion!';
      SFX.success();
    }
  } else {
    // Blue AI defends
    const comp = tg.nodes.filter(n => n.status === 'compromised');
    if (comp.length > 0) {
      const t = comp[0];
      t.status = 'secure';
      t.sec = Math.min(100, t.sec + 25);
      icon.textContent = '🛡️';
      title.textContent = 'BLUE SECOPS COUNTER-ATTACK';
      msg.innerHTML = 'Corporate incident response teams purged your backdoor on <b>' + t.name + '</b> and re-hardened the system!';
      SFX.miss();
    } else {
      icon.textContent = '📡';
      title.textContent = 'BLUE DEPLOYED SENSORS';
      msg.innerHTML = 'Blue team automated patches sealed open ports across DMZ servers.';
      SFX.click();
    }
  }

  modal.style.display = 'flex';

  tg.turn++;
  tg.ap = tg.maxAp;
  tg.cash += 5000;

  if (tg.turn > tg.maxTurns && !tg.gameOver) {
    tg.gameOver = true;
    tg.winner = 'blue';
  }

  checkTgWinLoss();
  updateCoachMessage();
  renderTgBoard();
  renderTgCockpit();
  updateTgStats();
}

function tgCloseCombatModal(){
  const m = $('tgCombatOverlay');
  if (m) m.style.display = 'none';
}

function checkTgWinLoss(){
  if (!tg || tg.gameOver) return;
  const valve = tg.nodes.find(n => n.id === 'valve');
  const compCount = tg.nodes.filter(n => n.status === 'compromised').length;
  const cleanCount = tg.nodes.filter(n => n.status === 'secure').length;

  if (valve.sabotaged || compCount >= 5) {
    tg.gameOver = true;
    tg.winner = 'red';
    if (tg.playerRole === 'red') {
      showToast('🏆 VICTORY! You compromised corporate critical infrastructure!'); awardWaitingBonus('threatgen', 'ThreatGEN Infiltration');
      SFX.round();
    } else {
      showToast('💀 DEFEAT! Critical safety failure on corporate network.');
      SFX.warn();
    }
  } else if (cleanCount >= 9 && tg.turn >= 4) {
    tg.gameOver = true;
    tg.winner = 'blue';
    if (tg.playerRole === 'blue') {
      showToast('🏆 VICTORY! All corporate subnets secured and threats eliminated!'); awardWaitingBonus('threatgen', 'ThreatGEN Defense');
      SFX.round();
    } else {
      showToast('💀 DEFEAT! Blue team sealed all perimeter gaps.');
      SFX.miss();
    }
  }
}



/* ---- DYNAMIC CIRCUIT DRAWING WITH ELECTRIC FLOW ANIMATIONS ---- */
function drawTgCircuitLines(){
  const svg = $('tgSvgCircuit');
  if (!svg || !svg.parentElement) return;
  const wrap = svg.parentElement.getBoundingClientRect();
  if (wrap.width === 0 || wrap.height === 0) return;
  
  let paths = '';
  tg.nodes.forEach(n => {
    const el1 = document.querySelector('.tg-v3-node[onclick*="' + n.id + '"]');
    if (!el1) return;
    const r1 = el1.getBoundingClientRect();
    const x1 = Math.round(r1.left + r1.width / 2 - wrap.left);
    const y1 = Math.round(r1.top + r1.height / 2 - wrap.top);

    n.links.forEach(lid => {
      if (n.id > lid) return; // avoid duplicates
      const el2 = document.querySelector('.tg-v3-node[onclick*="' + lid + '"]');
      if (!el2) return;
      const r2 = el2.getBoundingClientRect();
      const x2 = Math.round(r2.left + r2.width / 2 - wrap.left);
      const y2 = Math.round(r2.top + r2.height / 2 - wrap.top);

      const targetN = tg.nodes.find(node => node.id === lid);
      const isBreached = (n.status === 'compromised' || (targetN && targetN.status === 'compromised'));
      const col = isBreached ? '#fb4570' : '#22c55e';
      const opac = isBreached ? '0.85' : '0.5';
      const midX = Math.round((x1 + x2) / 2);

      // 90-degree circuit board elbow path with flow animation
      paths += '<path d="M ' + x1 + ' ' + y1 + ' L ' + midX + ' ' + y1 + ' L ' + midX + ' ' + y2 + ' L ' + x2 + ' ' + y2 + '" fill="none" stroke="' + col + '" stroke-width="2" stroke-opacity="' + opac + '" stroke-dasharray="6,4" class="tg-circuit-active" />' +
               '<circle cx="' + midX + '" cy="' + Math.round((y1 + y2) / 2) + '" r="3.5" fill="' + col + '" opacity="' + opac + '" />';
    });
  });
  svg.innerHTML = paths;
}
window.addEventListener('resize', () => { if (tg) setTimeout(drawTgCircuitLines, 50); });

/* ---- FLOATING COMBAT BADGES OVER TARGET NODE ---- */
function tgSpawnFloatFx(nodeId, text, color){
  const el = document.querySelector('.tg-v3-node[onclick*="' + nodeId + '"]');
  if (!el) return;
  const board = document.querySelector('.tg-v3-board');
  if (!board) return;

  const r = el.getBoundingClientRect();
  const b = board.getBoundingClientRect();
  const x = r.left + r.width / 2 - b.left;
  const y = r.top - b.top;

  const fx = document.createElement('div');
  fx.className = 'tg-float-fx';
  fx.style.color = color || '#38bdf8';
  fx.style.left = x + 'px';
  fx.style.top = y + 'px';
  fx.textContent = text;
  board.appendChild(fx);

  setTimeout(() => fx.remove(), 1600);
}





/* ============================================================
   LIVE ROSTER & REAL-TIME PROCTORING ENGINE (Tab-Switch Watcher)
   ============================================================ */
const ROSTER_STORE_KEY = "cyberarena_live_roster_v1";
const ADMIN_DIRECT_MSG_KEY = "cyberarena_admin_direct_msgs_v1";
let proctorViewMode = 'grid'; // 'grid' | 'table'
let adminSimActive = false;

function getLiveRoster(){
  try { return JSON.parse(localStorage.getItem(ROSTER_STORE_KEY) || '{}'); } catch(e){ return {}; }
}
function saveLiveRoster(roster){
  try { localStorage.setItem(ROSTER_STORE_KEY, JSON.stringify(roster)); } catch(e){}
}

function broadcastParticipantHeartbeat(){
  if (!S || !S.player || !S.player.name || S.status === 'COMPLETED') return;
  const roster = getLiveRoster();
  
  const isLocked = !!S.is_locked;

  let curQ = S.round;
  let qTitle = '';
  let qOptions = [];
  let selectedOptionIdx = null;
  let inputText = null;

  if (isLocked) {
    curQ = '⛔ Terminal Locked (Proctor Review Required)';
    qTitle = 'Session locked due to focus violations. Re-entry requires proctor unlock.';
  } else if (S.round === 'R1') {
    const qObj = R1[S.r1.idx] || {};
    curQ = 'Round 1 · Q' + (S.r1.idx + 1) + '/' + R1.length;
    qTitle = (S.r1.idx + 1) + '. ' + (qObj.q || '');
    qOptions = qObj.opts || [];
    selectedOptionIdx = (S.r1.answers && S.r1.answers[S.r1.idx] != null) ? S.r1.answers[S.r1.idx] : null;
  } else if (S.round === 'R2') {
    const pObj = R2[S.r2.idx] || {};
    curQ = 'Round 2 · P' + (S.r2.idx + 1) + '/' + R2.length + ' (' + (pObj.type || '') + ')';
    qTitle = 'Puzzle ' + (S.r2.idx + 1) + ': ' + (pObj.q || pObj.prompt || '');
    inputText = (S.r2.answers && S.r2.answers[S.r2.idx]) || '';
  } else if (S.round === 'R3') {
    const qObj = (R3.questions && R3.questions[S.r3.idx]) || {};
    curQ = 'Round 3 · Investigation Q' + (S.r3.idx + 1) + '/' + (R3.questions ? R3.questions.length : 5);
    qTitle = (S.r3.idx + 1) + '. ' + (qObj.q || '');
    inputText = (S.r3.answers && S.r3.answers[S.r3.idx]) || '';
  } else if (S.round === 'WAITING') {
    curQ = 'Waiting Room (Mini-Games Lounge)';
    qTitle = 'ThreatGEN & Cryptographic Mini-Games Training';
  } else if (S.round === 'INSTR') {
    curQ = 'Reading Round Instructions';
    qTitle = 'Rules and Briefing Brief';
  }
  
  const existing = roster[S.sid] || {};
  const history = existing.history || [];

  roster[S.sid] = {
    sid: S.sid,
    name: S.player.name,
    dept: S.player.dept,
    year: S.player.year,
    round: S.round,
    currentLocation: curQ,
    qTitle: qTitle,
    qOptions: qOptions,
    selectedOptionIdx: selectedOptionIdx,
    inputText: inputText,
    qStartTime: existing.qStartTime || Date.now() - 25000,
    score: (S.scores.r1 || 0) + (S.scores.r2 || 0) + (S.scores.r3 || 0) + (S.scores.bonus || 0),
    r1: S.scores.r1 || 0,
    r2: S.scores.r2 || 0,
    r3: S.scores.r3 || 0,
    bonus: S.scores.bonus || 0,
    violations: S.strikes_count || S.violations || 0,
    strikes_count: S.strikes_count || S.violations || 0,
    lifetime_violations: S.lifetime_violations || S.totalViolations || 0,
    is_locked: isLocked,
    lock_reason: S.lock_reason || '',
    pardon_history: S.pardon_history || existing.pardon_history || [],
    disqualified: false,
    status: isLocked ? 'LOCKED' : (existing.status || 'IN_PROGRESS'),
    lastViolationTime: S.lastViolationTime || 0,
    isTabHidden: document.hidden,
    lastSeen: Date.now(),
    isSim: false,
    history: history
  };
  saveLiveRoster(roster);
}

// Broadcast heartbeat every 2 seconds & on key events
let participantHeartbeatIv = setInterval(broadcastParticipantHeartbeat, 2000);
document.addEventListener('visibilitychange', () => {
  if (S) {
    if (document.hidden) {
      if (!isInternalModalOpen && !isAnyModalActive()) {
        S.lastViolationTime = Date.now();
        adminLogSecurityEvent('warn', 'TAB SWITCH DETECTED: ' + S.player.name + ' switched away from test window!');
      }
    } else {
      adminLogSecurityEvent('info', 'WINDOW FOCUSED: ' + S.player.name + ' returned to challenge window.');
    }
    broadcastParticipantHeartbeat();
  }
});

/* ============================================================
   ADMIN SOC DASHBOARD: TABS, AUDIT LOG & DEMO SIMULATION
   ============================================================ */
let activeInspectedSid = null;
let inspectRefreshInterval = null;
let adminSimTimer = null;
proctorViewMode = 'grid';

const CYBERARENA_UNLOCK_DISPATCH_KEY = 'cyberarena_unlock_events_v1';

function adminSwitchTab(tabName){
  const tabs = ['proctor', 'hints', 'leaderboard', 'audit'];
  tabs.forEach(t => {
    const btn = $('atab-' + t);
    const pane = $('apane-' + t);
    if (btn) btn.classList.toggle('active', t === tabName);
    if (pane) pane.style.display = (t === tabName ? 'block' : 'none');
  });
  if (tabName === 'proctor') renderAdminProctorConsole();
  else if (tabName === 'hints') renderAdminHintConsole();
  else if (tabName === 'leaderboard') refreshLeaderboard();
}

function toggleProctorViewMode(){
  proctorViewMode = (proctorViewMode === 'grid') ? 'table' : 'grid';
  const grid = $('adminStudentsCardsGrid');
  const table = $('adminProctorTableView');
  const btn = $('proctorViewModeBtn');
  if (grid) grid.style.display = (proctorViewMode === 'grid') ? 'grid' : 'none';
  if (table) table.style.display = (proctorViewMode === 'table') ? 'block' : 'none';
  if (btn) btn.textContent = (proctorViewMode === 'grid') ? 'Switch to Table View' : 'Switch to Cards Grid';
}

function adminToggleSimulation(){
  adminSimActive = !adminSimActive;
  const btn = $('adminSimBtn');
  if (btn) {
    btn.textContent = adminSimActive ? '🛑 Stop Demo Simulation' : '🧪 Simulate Live Students (Demo)';
    btn.style.background = adminSimActive ? '#e11d48' : '#0284c7';
    btn.style.borderColor = adminSimActive ? '#f43f5e' : '#38bdf8';
  }

  if (adminSimActive) {
    seedSimulatedStudents();
    startAdminSimulationLoop();
    adminLogSecurityEvent('info', 'Demonstration mode activated. 5 simulated candidate terminals online.');
    showToast('🧪 Live Student Simulation started! 5 active test-takers loaded.');
  } else {
    stopAdminSimulationLoop();
    clearSimulatedStudents();
    adminLogSecurityEvent('info', 'Demonstration mode deactivated.');
    showToast('Demo simulation stopped.');
  }
  renderAdminProctorConsole();
  renderAdminHintConsole();
  refreshLeaderboard();
}

function seedSimulatedStudents(){
  const roster = getLiveRoster();
  const now = Date.now();
  
  // 1. Clean Candidate (0 Strikes)
  roster['sim_sharma'] = {
    sid: 'sim_sharma',
    name: 'A. Sharma',
    dept: 'CSBS',
    year: 'III',
    round: 'R3',
    currentLocation: 'Round 3 · Investigation Q3: Web Access Logs',
    qStartTime: now - 42000,
    qTitle: '3. What IP address is associated with the brute force authentication attempt?',
    qOptions: [],
    selectedOptionIdx: null,
    inputText: '192.168.1.105',
    score: 39,
    r1: 24,
    r2: 11,
    r3: 4,
    bonus: 0,
    violations: 0,
    strikes_count: 0,
    lifetime_violations: 0,
    is_locked: false,
    pardon_history: [],
    lastViolationTime: 0,
    isTabHidden: false,
    lastSeen: now - 800,
    isSim: true,
    history: [
      { time: now - 480000, desc: 'Candidate authenticated · Entered Arena' },
      { time: now - 320000, desc: 'Completed Round 1 (24 pts)' },
      { time: now - 140000, desc: 'Completed Round 2 (11 pts)' },
      { time: now - 42000, desc: 'Analyzing Apache access.log for IP brute force traces' },
      { time: now - 15000, desc: 'Drafted hypothesis: "192.168.1.105" (54 attempts)' }
    ]
  };

  // 2. Candidate with 1 Strike (Tab Switch Warning)
  roster['sim_iyer'] = {
    sid: 'sim_iyer',
    name: 'R. Iyer',
    dept: 'CSE',
    year: 'II',
    round: 'R2',
    currentLocation: 'Round 2 · Password Hash #5 (Rainbow Table)',
    qStartTime: now - 58000,
    qTitle: 'Decode this pre-computed MD5 digest using rainbow attack analysis:',
    qOptions: [],
    selectedOptionIdx: null,
    inputText: 'rainbow',
    score: 38,
    r1: 22,
    r2: 13,
    r3: 3,
    bonus: 0,
    violations: 1,
    strikes_count: 1,
    lifetime_violations: 1,
    is_locked: false,
    pardon_history: [],
    lastViolationTime: now - 14000,
    isTabHidden: true,
    lastSeen: now - 14000,
    isSim: true,
    history: [
      { time: now - 450000, desc: 'Entered Arena' },
      { time: now - 220000, desc: 'Finished Round 1 (22 pts)' },
      { time: now - 58000, desc: 'Solving Password Challenge #5' },
      { time: now - 14000, desc: '⚠️ TAB SWITCH DETECTED: Window blurred to external application! (Strike 1/3 logged)' }
    ]
  };

  // 3. Candidate with Pending Hint Request
  roster['sim_menon'] = {
    sid: 'sim_menon',
    name: 'P. Menon',
    dept: 'CSBS',
    year: 'IV',
    round: 'R1',
    currentLocation: 'Round 1 · Q14: Ransomware Vector Analysis',
    qStartTime: now - 45000,
    qTitle: 'Which of the following is the most prevalent vector for corporate ransomware delivery in 2026?',
    qOptions: [
      'Encrypted Malicious Email Attachment (Phishing)',
      'Direct physical bad-USB insertion',
      'Tampered open-source HDMI cable',
      'Satellite dish signal interception'
    ],
    selectedOptionIdx: 0,
    inputText: null,
    score: 30,
    r1: 19,
    r2: 9,
    r3: 2,
    bonus: 0,
    violations: 0,
    strikes_count: 0,
    lifetime_violations: 0,
    is_locked: false,
    pardon_history: [],
    lastViolationTime: 0,
    isTabHidden: false,
    lastSeen: now - 1200,
    isSim: true,
    history: [
      { time: now - 350000, desc: 'Identity verified · Started Round 1' },
      { time: now - 180000, desc: 'Solving network hygiene questions' },
      { time: now - 45000, desc: 'Reading Q14: Ransomware vectors' },
      { time: now - 22000, desc: 'Selected Option A: "Encrypted Malicious Email Attachment"' },
      { time: now - 10000, desc: '🙋 Pledged 10 Trust Points for Admin Clue on R1_Q14' }
    ]
  };

  // 4. Candidate Locked Out (3/3 Strikes - Demonstrating Lockdown & Proctor Unlock Flow)
  roster['sim_das'] = {
    sid: 'sim_das',
    name: 'S. Das',
    dept: 'CSBS',
    year: 'IV',
    round: 'R1',
    currentLocation: '⛔ Terminal Locked (Proctor Review Required)',
    qStartTime: now - 110000,
    qTitle: 'Packet Header Tampering Investigation',
    qOptions: [],
    selectedOptionIdx: null,
    inputText: null,
    score: 16,
    r1: 16,
    r2: 0,
    r3: 0,
    bonus: 0,
    violations: 3,
    strikes_count: 3,
    lifetime_violations: 3,
    is_locked: true,
    lock_reason: 'Tab switch or unauthorized window change (3/3 strikes)',
    pardon_history: [],
    status: 'LOCKED',
    lastViolationTime: now - 28000,
    isTabHidden: false,
    lastSeen: now - 28000,
    isSim: true,
    history: [
      { time: now - 380000, desc: 'Candidate authenticated · Entered Round 1' },
      { time: now - 210000, desc: '⚠️ TAB SWITCH 1: Browser minimized during exam (Strike 1/3)' },
      { time: now - 120000, desc: '⚠️ TAB SWITCH 2: External browser tab opened (Strike 2/3)' },
      { time: now - 28000, desc: '🔒 STRIKE 3/3: Maximum focus violations reached. Terminal locked out.' }
    ]
  };

  // 5. Waiting Room Mini-Games Player
  roster['sim_nair'] = {
    sid: 'sim_nair',
    name: 'Priya Nair',
    dept: 'IT',
    year: 'III',
    round: 'WAITING',
    currentLocation: 'Waiting Room · ThreatGEN: Red vs Blue (Turn 6)',
    qStartTime: now - 95000,
    qTitle: 'ThreatGEN Simulation: Active Infiltration of Industrial SCADA Zone',
    qOptions: [],
    selectedOptionIdx: null,
    inputText: null,
    score: 20,
    r1: 0,
    r2: 0,
    r3: 0,
    bonus: 20,
    violations: 0,
    strikes_count: 0,
    lifetime_violations: 0,
    is_locked: false,
    pardon_history: [],
    lastViolationTime: 0,
    isTabHidden: false,
    lastSeen: now - 1800,
    isSim: true,
    history: [
      { time: now - 200000, desc: 'Entered Waiting Room early' },
      { time: now - 110000, desc: 'Won ThreatGEN Infiltration (+10 Bonus Trust Points)' },
      { time: now - 35000, desc: 'Won ThreatGEN Defense (+10 Bonus Trust Points, Total 20/50 Pts)' }
    ]
  };

  // 6. Completed Candidate (Demonstrating Completed Lifecycle & Leaderboard State)
  roster['sim_varma'] = {
    sid: 'sim_varma',
    name: 'Dr. S. Varma',
    dept: 'CSE',
    year: 'IV',
    round: 'R3',
    currentLocation: '🏁 Exam Completed & Submitted',
    qStartTime: now - 1710000,
    qTitle: 'Final Submission Verified · Total Score: 48 pts',
    qOptions: [],
    selectedOptionIdx: null,
    inputText: null,
    score: 48,
    r1: 25,
    r2: 15,
    r3: 5,
    bonus: 3,
    violations: 0,
    strikes_count: 0,
    lifetime_violations: 0,
    durationSeconds: 1710,
    completedAt: now - 300000,
    completedTimeStr: '28:30',
    is_locked: false,
    pardon_history: [],
    status: 'COMPLETED',
    lastViolationTime: 0,
    isTabHidden: false,
    lastSeen: now - 300000,
    isSim: true,
    history: [
      { time: now - 1710000, desc: 'Candidate authenticated · Entered Arena' },
      { time: now - 1200000, desc: 'Finished Round 1: Cyber Quiz Master (25/25 pts)' },
      { time: now - 700000, desc: 'Finished Round 2: Cyber Arcade (15/15 pts)' },
      { time: now - 300000, desc: '🏁 Final Case Study submitted. Total Score: 48 pts (Duration: 28:30)' }
    ]
  };

  saveLiveRoster(roster);
  const hints = getHintRequests();
  if (!hints.find(h => h.sid === 'sim_menon' && h.qId === 'R1_Q14')) {
    hints.push({
      id: 'req_sim_menon',
      sid: 'sim_menon',
      name: 'P. Menon',
      dept: 'CSBS',
      year: 'IV',
      round: 'Round 1',
      qId: 'R1_Q14',
      qLabel: 'Q14: Ransomware Vectors',
      cost: 10,
      status: 'PENDING',
      hintText: '',
      time: now - 10000
    });
    saveHintRequests(hints);
  }
}

function clearSimulatedStudents(){
  const roster = getLiveRoster();
  Object.keys(roster).forEach(k => { if (roster[k].isSim) delete roster[k]; });
  saveLiveRoster(roster);

  const hints = getHintRequests().filter(h => !h.sid.startsWith('sim_'));
  saveHintRequests(hints);
}

function startAdminSimulationLoop(){
  if (adminSimTimer) clearInterval(adminSimTimer);
  adminSimTimer = setInterval(() => {
    if (!adminSimActive) return;
    const roster = getLiveRoster();
    const now = Date.now();
    
    if (roster['sim_iyer']) {
      if (roster['sim_iyer'].isTabHidden && (now - roster['sim_iyer'].lastViolationTime > 16000)) {
        roster['sim_iyer'].isTabHidden = false;
        roster['sim_iyer'].history.push({ time: now, desc: '🟢 Candidate returned and focused challenge window.' });
        adminLogSecurityEvent('info', 'FOCUS RESTORED: R. Iyer returned to challenge window.');
      }
      roster['sim_iyer'].lastSeen = now;
    }

    if (roster['sim_menon']) roster['sim_menon'].lastSeen = now;
    if (roster['sim_sharma']) roster['sim_sharma'].lastSeen = now;
    if (roster['sim_nair']) roster['sim_nair'].lastSeen = now;
    if (roster['sim_das']) roster['sim_das'].lastSeen = now;

    saveLiveRoster(roster);

    if (currentScreenIs('screen-admin')) {
      renderAdminProctorConsole();
      if (activeInspectedSid && roster[activeInspectedSid]) {
        renderStudentInspectContent(roster[activeInspectedSid]);
      }
    }
  }, 3500);
}

function stopAdminSimulationLoop(){
  if (adminSimTimer) clearInterval(adminSimTimer);
  adminSimTimer = null;
}

function adminLogSecurityEvent(type, text){
  const box = $('adminAuditLogBox');
  if (!box) return;
  const entry = document.createElement('div');
  entry.className = 'audit-log-entry ' + (type || 'info');
  const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  entry.innerHTML = '<span class="audit-ts">[' + timeStr + ']</span><span>' + escapeHtml(text) + '</span>';
  box.insertBefore(entry, box.firstChild);
  while (box.children.length > 100) box.removeChild(box.lastChild);
}

function adminClearAuditLog(){
  const box = $('adminAuditLogBox');
  if (box) box.innerHTML = '<div class="audit-log-entry info"><span class="audit-ts">[SYSTEM]</span><span>Audit log cleared by System Admin.</span></div>';
}

function refreshAllAdminConsoles(){
  refreshLeaderboard();
  renderAdminProctorConsole();
  renderAdminHintConsole();
  showToast('Surveillance radar & all consoles refreshed.');
  SFX.click();
}

/* ============================================================
   ADMIN PROCTOR SURVEILLANCE CONSOLE (Cards + Detailed Table)
   ============================================================ */
/* ============================================================
   ADMIN PROCTOR SURVEILLANCE CONSOLE (Cards + Detailed Table + Quick Filters)
   ============================================================ */
let proctorFilter = 'all';
let proctorSearchTerm = '';
let proctorSortBy = 'strikes';

function adminSetFilter(filterMode){
  proctorFilter = filterMode;
  ['all', 'attention', 'inprogress', 'completed'].forEach(m => {
    const btn = $('pfilter-' + m);
    if (btn) btn.classList.toggle('active', m === filterMode);
  });
  renderAdminProctorConsole();
  SFX.click();
}

function adminApplyFilters(){
  const sInp = $('proctorSearchInput');
  if (sInp) {
    proctorSearchTerm = sInp.value.trim().toLowerCase();
    const clearBtn = $('proctorSearchClear');
    if (clearBtn) clearBtn.style.display = proctorSearchTerm ? 'inline-block' : 'none';
  }
  const sortSel = $('proctorSortSelect');
  if (sortSel) proctorSortBy = sortSel.value;
  renderAdminProctorConsole();
}

function adminClearSearch(){
  const sInp = $('proctorSearchInput');
  if (sInp) sInp.value = '';
  proctorSearchTerm = '';
  const clearBtn = $('proctorSearchClear');
  if (clearBtn) clearBtn.style.display = 'none';
  renderAdminProctorConsole();
}

function adminResetFilters(){
  proctorFilter = 'all';
  proctorSearchTerm = '';
  proctorSortBy = 'strikes';
  const sInp = $('proctorSearchInput');
  if (sInp) sInp.value = '';
  const sortSel = $('proctorSortSelect');
  if (sortSel) sortSel.value = 'strikes';
  const clearBtn = $('proctorSearchClear');
  if (clearBtn) clearBtn.style.display = 'none';
  ['all', 'attention', 'inprogress', 'completed'].forEach(m => {
    const btn = $('pfilter-' + m);
    if (btn) btn.classList.toggle('active', m === 'all');
  });
  renderAdminProctorConsole();
}

function renderAdminProctorConsole(){
  const grid = $('adminStudentsCardsGrid');
  const body = $('adminProctorTableBody');
  const roster = getLiveRoster();
  const hints = getHintRequests();
  const now = Date.now();

  const students = Object.values(roster).filter(s => (s.status === 'COMPLETED' || s.status === 'FINISHED' || s.status === 'SUBMITTED') || ((now - s.lastSeen) < 10 * 60 * 1000));

  // Update KPI Metrics
  const totalStudents = students.length;
  const totalViolations = students.reduce((acc, s) => acc + (s.violations || 0), 0);
  const pendingHintsCount = hints.filter(h => h.status === 'PENDING').length;
  const topScore = students.reduce((max, s) => Math.max(max, s.score || 0), 0);

  if ($('kpiActiveStudents')) $('kpiActiveStudents').textContent = totalStudents + ' Active';
  if ($('kpiViolationsCount')) $('kpiViolationsCount').textContent = totalViolations + ' Strike' + (totalViolations === 1 ? '' : 's');
  if ($('kpiPendingHints')) $('kpiPendingHints').textContent = pendingHintsCount + ' Pending';
  if ($('kpiPendingHintsChip')) $('kpiPendingHintsChip').classList.toggle('admin-badge-pulse', pendingHintsCount > 0);
  if ($('kpiTopScore')) $('kpiTopScore').textContent = topScore + ' Pts';

  if ($('atabBadgeStudents')) $('atabBadgeStudents').textContent = totalStudents;
  if ($('atabBadgeHints')) {
    $('atabBadgeHints').textContent = pendingHintsCount;
    $('atabBadgeHints').style.display = pendingHintsCount > 0 ? 'inline-flex' : 'none';
    $('atabBadgeHints').classList.toggle('pulse', pendingHintsCount > 0);
  }

  // Calculate segmented filter counts
  const countAll = students.length;
  const countAttention = students.filter(s => {
    const isComp = (s.status === 'COMPLETED' || s.status === 'FINISHED' || s.status === 'SUBMITTED');
    return !isComp && (s.is_locked || s.isTabHidden || (s.violations > 0) || (s.status === 'LOCKED'));
  }).length;
  const countInProgress = students.filter(s => {
    const isComp = (s.status === 'COMPLETED' || s.status === 'FINISHED' || s.status === 'SUBMITTED');
    const isLock = !isComp && (s.is_locked || (s.violations >= 3) || (s.status === 'LOCKED'));
    return !isComp && !isLock;
  }).length;
  const countCompleted = students.filter(s => (s.status === 'COMPLETED' || s.status === 'FINISHED' || s.status === 'SUBMITTED')).length;

  if ($('pfilterCntAll')) $('pfilterCntAll').textContent = countAll;
  if ($('pfilterCntAttention')) {
    $('pfilterCntAttention').textContent = countAttention;
    $('pfilterCntAttention').classList.toggle('pfilter-pulse', countAttention > 0);
  }
  if ($('pfilterCntInProgress')) $('pfilterCntInProgress').textContent = countInProgress;
  if ($('pfilterCntCompleted')) $('pfilterCntCompleted').textContent = countCompleted;

  // Filter candidates based on active search & category filter
  let filtered = students.filter(s => {
    if (proctorSearchTerm) {
      const target = (s.name + ' ' + s.sid + ' ' + (s.dept || '') + ' ' + (s.year || '') + ' ' + (s.currentLocation || '')).toLowerCase();
      if (!target.includes(proctorSearchTerm)) return false;
    }
    const isComp = (s.status === 'COMPLETED' || s.status === 'FINISHED' || s.status === 'SUBMITTED');
    const isLock = !isComp && (s.is_locked || (s.violations >= 3) || (s.status === 'LOCKED'));
    const hasAttention = !isComp && (isLock || s.isTabHidden || (s.violations > 0));

    if (proctorFilter === 'attention') return hasAttention;
    if (proctorFilter === 'inprogress') return !isComp && !isLock;
    if (proctorFilter === 'completed') return isComp;
    return true;
  });

  // Sort candidates based on proctorSortBy
  filtered.sort((a, b) => {
    if (proctorSortBy === 'score') {
      const sA = Number(a.score) || 0, sB = Number(b.score) || 0;
      if (sB !== sA) return sB - sA;
      return (b.violations || 0) - (a.violations || 0);
    } else if (proctorSortBy === 'activity') {
      return (b.lastSeen || 0) - (a.lastSeen || 0);
    } else if (proctorSortBy === 'duration') {
      const dA = Number(a.durationSeconds) || 1800, dB = Number(b.durationSeconds) || 1800;
      return dA - dB;
    } else {
      // Default: Strikes (High to Low)
      const aComp = (a.status === 'COMPLETED' || a.status === 'FINISHED' || a.status === 'SUBMITTED') ? 1 : 0;
      const bComp = (b.status === 'COMPLETED' || b.status === 'FINISHED' || b.status === 'SUBMITTED') ? 1 : 0;
      if (aComp !== bComp) return aComp - bComp;
      const vA = Number(a.violations) || 0, vB = Number(b.violations) || 0;
      if (vB !== vA) return vB - vA;
      return (b.score || 0) - (a.score || 0);
    }
  });

  // Render Surveillance Cards Grid
  if (grid) {
    if (students.length === 0) {
      grid.innerHTML = '<div style="grid-column:1/-1; text-align:center; padding:36px 18px; background:rgba(15,23,42,0.6); border:1px dashed #334155; border-radius:12px;">' +
        '<div style="font-size:32px; margin-bottom:8px;">📡</div>' +
        '<b style="color:#94a3b8; font-size:13px;">No active operatives detected on the radar.</b><br>' +
        '<small style="color:#64748b;">Click <b>"🧪 Simulate Live Students (Demo)"</b> above to load candidate surveillance terminals.</small>' +
      '</div>';
    } else if (filtered.length === 0) {
      grid.innerHTML = '<div style="grid-column:1/-1; text-align:center; padding:36px 18px; background:rgba(15,23,42,0.6); border:1px dashed #334155; border-radius:12px;">' +
        '<div style="font-size:28px; margin-bottom:8px;">🔍</div>' +
        '<b style="color:#94a3b8; font-size:13px;">No operative terminals match your active filter criteria.</b><br>' +
        '<small style="color:#64748b;">Active Filter: <b>' + escapeHtml(proctorFilter.toUpperCase()) + '</b>' + (proctorSearchTerm ? ' · Search: <b>"' + escapeHtml(proctorSearchTerm) + '"</b>' : '') + '</small><br>' +
        '<button class="threat-btn-sm" style="margin-top:12px; color:#38bdf8; border-color:rgba(56,189,248,0.4);" onclick="adminResetFilters()">↻ Reset Filters &amp; Search</button>' +
      '</div>';
    } else {
      grid.innerHTML = filtered.map(s => {
        const isCompleted = (s.status === 'COMPLETED' || s.status === 'FINISHED' || s.status === 'SUBMITTED');
        const isOnline = (now - s.lastSeen) < 15000;
        const isLocked = !isCompleted && (s.is_locked || (s.violations >= 3) || (s.status === 'LOCKED'));
        const hasSwitched = !isLocked && !isCompleted && (s.isTabHidden || (s.lastViolationTime && (now - s.lastViolationTime < 45000)));

        let cardCls = 'admin-student-card';
        if (isCompleted) cardCls += ' completed';
        else if (isLocked) cardCls += ' locked';
        else if (s.isTabHidden || hasSwitched) cardCls += ' tab-away';

        let statusTag = '<span class="status-tag-active" title="Candidate active inside test window">🟢 IN WINDOW</span>';
        if (isCompleted) {
          statusTag = '<span class="status-tag-completed" title="Exam completed and submitted to leaderboard">🏁 COMPLETED</span>';
        } else if (isLocked) {
          statusTag = '<span class="status-tag-locked" title="Terminal locked due to proctoring violation. Requires proctor unlock.">🔒 LOCKED</span>';
        } else if (s.isTabHidden) {
          statusTag = '<span class="status-tag-switch" title="Candidate window minimized or switched away">⚠️ AWAY FROM TAB!</span>';
        } else if (hasSwitched) {
          statusTag = '<span class="status-tag-switch" title="Focus violation recently logged">⚠️ RECENT TAB SWITCH</span>';
        } else if (!isOnline) {
          statusTag = '<span class="status-tag-offline" title="Candidate terminal offline">⚪ OFFLINE</span>';
        }

        let localTag = '';
        if (!s.isSim) {
          if (isCompleted) localTag = '<span class="status-pill-completed">FINISHED LOCAL</span>';
          else if (isLocked) localTag = '<span class="status-pill-disq">LOCKED LOCAL</span>';
          else localTag = '<span class="status-pill-local">LIVE LOCAL</span>';
        } else if (isCompleted) {
          localTag = '<span class="status-pill-completed">FINISHED</span>';
        } else if (isLocked) {
          localTag = '<span class="status-pill-disq">LOCKED</span>';
        }

        const dots = [1, 2, 3].map(i => '<span class="strike-dot' + (s.violations >= i ? ' lit' : '') + '"></span>').join('');
        const timeAgo = Math.max(0, Math.round((now - s.lastSeen) / 1000)) + 's ago';

        const displayLoc = isCompleted 
          ? '🏁 Exam Completed & Submitted' 
          : (isLocked ? '⛔ Terminal Locked (Proctor Review Required)' : escapeHtml(s.currentLocation));

        const durationDisplay = fmtTime(s.durationSeconds || (s.duration ? Number(s.duration) : 0));
        const currentActionSnippet = isCompleted
          ? 'Test Completed — Final Score: ' + s.score + ' pts · Duration: ' + durationDisplay
          : (isLocked 
            ? 'Session locked. Timer halted. Waiting for administrator authorization.'
            : (s.inputText ? 'Drafting answer: "' + escapeHtml(s.inputText) + '"'
              : (s.selectedOptionIdx != null && s.qOptions && s.qOptions[s.selectedOptionIdx]) ? 'Selected: ' + escapeHtml(s.qOptions[s.selectedOptionIdx].slice(0, 32)) + '...'
              : 'Inspecting challenge requirements...'));

        // Standardized Uniform 3-Slot Footer
        let actionsHtml = '';
        if (isCompleted) {
          actionsHtml = 
            '<button data-sid="' + s.sid + '" class="threat-btn-sm" style="color:#38bdf8; border-color:rgba(56,189,248,0.4);" onclick="openAnswerSheetModal(this.dataset.sid)" title="View multi-round verified answer audit report">📄 Report</button>' +
            '<button class="threat-btn-sm disabled" disabled title="Participant has completed the test: alerts disabled">⚠️ Alert</button>' +
            '<button class="threat-btn-sm disabled" disabled style="color:#6ee7b7; border-color:rgba(110,231,183,0.3); background:rgba(16,185,129,0.08);" title="Exam completed: no active strikes">🏁 Finished</button>';
        } else if (isLocked) {
          actionsHtml = 
            '<button data-sid="' + s.sid + '" class="threat-btn-sm" style="color:#38bdf8; border-color:rgba(56,189,248,0.4);" onclick="openStudentInspectModal(this.dataset.sid)" title="Audit candidate session and verify reason">👁️ Screen</button>' +
            '<button class="threat-btn-sm disabled" disabled title="Alerts disabled while terminal is locked">⚠️ Alert</button>' +
            '<button data-sid="' + s.sid + '" class="threat-btn-sm" style="color:#4ade80; border-color:rgba(74,222,128,0.6); background:rgba(34,197,94,0.18); font-weight:800;" onclick="adminPardonStrike(this.dataset.sid)" title="Pardon candidate, unlock terminal, and reset active strikes to 0/3">🔓 Unlock &amp; Reset</button>';
        } else if (s.violations > 0) {
          actionsHtml = 
            '<button data-sid="' + s.sid + '" class="threat-btn-sm" style="color:#38bdf8; border-color:rgba(56,189,248,0.4);" onclick="openStudentInspectModal(this.dataset.sid)" title="Watch candidate virtual terminal in real-time">👁️ Screen</button>' +
            '<button data-sid="' + s.sid + '" data-name="' + escapeHtml(s.name) + '" class="threat-btn-sm" style="color:#fb7185; border-color:rgba(251,69,112,0.35);" onclick="adminSendWarning(this.dataset.sid, this.dataset.name)" title="Dispatch custom warning alert to candidate screen">⚠️ Alert</button>' +
            '<button data-sid="' + s.sid + '" class="threat-btn-sm" style="color:#4ade80; border-color:rgba(74,222,128,0.45); background:rgba(34,197,94,0.08);" onclick="adminPardonStrike(this.dataset.sid)" title="Pardon 1 strike (-1 violation)">🔄 Pardon</button>';
        } else {
          actionsHtml = 
            '<button data-sid="' + s.sid + '" class="threat-btn-sm" style="color:#38bdf8; border-color:rgba(56,189,248,0.4);" onclick="openStudentInspectModal(this.dataset.sid)" title="Watch candidate virtual terminal in real-time">👁️ Screen</button>' +
            '<button data-sid="' + s.sid + '" data-name="' + escapeHtml(s.name) + '" class="threat-btn-sm" style="color:#fb7185; border-color:rgba(251,69,112,0.35);" onclick="adminSendWarning(this.dataset.sid, this.dataset.name)" title="Dispatch custom warning alert to candidate screen">⚠️ Alert</button>' +
            '<button class="threat-btn-sm disabled" disabled title="Clean record: 0 active strikes">🛡️ Clean</button>';
        }

        return '<div class="' + cardCls + '">' +
          '<div class="admin-student-top">' +
            '<div class="admin-student-meta-wrap">' +
              '<div class="admin-student-avatar">' + (s.isSim ? '🤖' : '👤') + '</div>' +
              '<div class="admin-student-identity">' +
                '<div class="admin-student-name" title="' + escapeHtml(s.name) + '">' + escapeHtml(s.name) + '</div>' +
                '<div class="admin-student-sub">' + escapeHtml(s.dept) + ' · Yr ' + escapeHtml(s.year) + ' · <span class="student-sid-pill">' + escapeHtml(s.sid) + '</span></div>' +
              '</div>' +
            '</div>' +
            '<div class="admin-student-status-wrap">' +
              statusTag +
              (localTag ? '<div>' + localTag + '</div>' : '') +
            '</div>' +
          '</div>' +

          '<div class="admin-student-activity-box">' +
            '<div class="admin-student-loc"><i class="ico"><svg viewBox="0 0 512 512" aria-hidden="true"><use href="#i-terminal"/></svg></i> <span>' + displayLoc + '</span></div>' +
            '<div style="font-family:var(--font-mono); font-size:10px; color:#cbd5e1; margin-top:2px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="' + escapeHtml(currentActionSnippet) + '">' + currentActionSnippet + '</div>' +
            '<div class="admin-student-scores" style="margin-top:4px;">' +
              '<span>Live: <b style="color:var(--cyan); font-size:12px;">' + s.score + ' pts</b> ' + (s.bonus ? '<small style="color:#f59e0b;">(Bonus: +' + s.bonus + ')</small>' : '') + '</span>' +
              (isCompleted ? '<span style="color:#34d399; font-weight:700;">⏱️ Duration: ' + durationDisplay + '</span>' : '<span style="color:#94a3b8;">Ping: ' + timeAgo + '</span>') +
            '</div>' +
          '</div>' +

          '<div style="display:flex; justify-content:space-between; align-items:center; font-family:var(--font-mono); font-size:11px;">' +
            '<div class="admin-strike-gauge">' +
              (isCompleted ? '<span style="color:#94a3b8;">Final Strikes:</span> ' + dots + ' <b style="color:#94a3b8; margin-left:4px;">' + (s.violations || 0) + '/3 (Finished)</b>' : '<span style="color:#94a3b8;">Focus Strikes:</span> ' + dots + ' <b style="color:' + (isLocked ? '#fb7185' : (s.violations > 0 ? '#fbbf24' : '#4ade80')) + '; margin-left:4px;">' + s.violations + '/3' + (isLocked ? ' (LOCKED)' : '') + '</b>') +
            '</div>' +
          '</div>' +

          '<div class="admin-student-actions">' +
            actionsHtml +
          '</div>' +
        '</div>';
      }).join('');
    }
  }

  // Render Detailed Table View
  if (body) {
    if (students.length === 0) {
      body.innerHTML = '<tr><td colspan="7" style="text-align:center; color:#64748b; padding:24px;">No active students detected on the network.</td></tr>';
      return;
    }
    if (filtered.length === 0) {
      body.innerHTML = '<tr><td colspan="7" style="text-align:center; color:#94a3b8; padding:24px;">No operatives matching filter criteria.</td></tr>';
      return;
    }

    body.innerHTML = filtered.map(s => {
      const isCompleted = (s.status === 'COMPLETED' || s.status === 'FINISHED' || s.status === 'SUBMITTED');
      const isOnline = (now - s.lastSeen) < 15000;
      const isLocked = !isCompleted && (s.is_locked || (s.violations >= 3) || (s.status === 'LOCKED'));
      const hasSwitched = !isLocked && !isCompleted && (s.isTabHidden || (s.lastViolationTime && (now - s.lastViolationTime < 45000)));

      let statusTag = '<span class="status-tag-active" title="Candidate in challenge window">🟢 In Window</span>';
      if (isCompleted) statusTag = '<span class="status-tag-completed" title="Exam finished and submitted">🏁 Completed</span>';
      else if (isLocked) statusTag = '<span class="status-tag-locked" title="Terminal locked due to violations">🔒 LOCKED</span>';
      else if (s.isTabHidden) statusTag = '<span class="status-tag-switch" title="Candidate away from test tab">⚠️ AWAY FROM TAB!</span>';
      else if (hasSwitched) statusTag = '<span class="status-tag-switch" title="Recent focus violation">⚠️ RECENT TAB SWITCH</span>';
      else if (!isOnline) statusTag = '<span class="status-tag-offline" title="Candidate offline">⚪ Offline</span>';

      const timeAgo = Math.max(0, Math.round((now - s.lastSeen) / 1000)) + 's ago';
      const durationDisplay = fmtTime(s.durationSeconds || (s.duration ? Number(s.duration) : 0));
      const timeColHtml = isCompleted 
        ? '<span style="color:#34d399; font-weight:700;">' + durationDisplay + '</span>'
        : timeAgo;

      let tableActions = '';
      if (isCompleted) {
        tableActions = '<button data-sid="' + s.sid + '" class="threat-btn-sm" style="color:#38bdf8; width:auto; padding:3px 10px; height:28px;" onclick="openAnswerSheetModal(this.dataset.sid)" title="View multi-round verified answer audit report">📄 Report</button>';
      } else if (isLocked) {
        tableActions = 
          '<button data-sid="' + s.sid + '" class="threat-btn-sm" style="color:#38bdf8; width:auto; padding:3px 8px; height:28px;" onclick="openStudentInspectModal(this.dataset.sid)" title="Audit session transcript">👁️ Screen</button> ' +
          '<button data-sid="' + s.sid + '" class="threat-btn-sm" style="color:#4ade80; width:auto; padding:3px 10px; height:28px; margin-left:4px;" onclick="adminPardonStrike(this.dataset.sid)" title="Unlock terminal and reset active strikes to 0/3">🔓 Unlock &amp; Reset</button>';
      } else if (s.violations > 0) {
        tableActions = 
          '<button data-sid="' + s.sid + '" class="threat-btn-sm" style="color:#38bdf8; width:auto; padding:3px 8px; height:28px;" onclick="openStudentInspectModal(this.dataset.sid)">👁️ Screen</button> ' +
          '<button data-sid="' + s.sid + '" data-name="' + escapeHtml(s.name) + '" class="threat-btn-sm" style="color:#fb7185; width:auto; padding:3px 8px; height:28px; margin-left:4px;" onclick="adminSendWarning(this.dataset.sid, this.dataset.name)">⚠️ Alert</button> ' +
          '<button data-sid="' + s.sid + '" class="threat-btn-sm" style="color:#4ade80; width:auto; padding:3px 8px; height:28px; margin-left:4px;" onclick="adminPardonStrike(this.dataset.sid)">🔄 Pardon</button>';
      } else {
        tableActions = 
          '<button data-sid="' + s.sid + '" class="threat-btn-sm" style="color:#38bdf8; width:auto; padding:3px 8px; height:28px;" onclick="openStudentInspectModal(this.dataset.sid)">👁️ Screen</button> ' +
          '<button data-sid="' + s.sid + '" data-name="' + escapeHtml(s.name) + '" class="threat-btn-sm" style="color:#fb7185; width:auto; padding:3px 8px; height:28px; margin-left:4px;" onclick="adminSendWarning(this.dataset.sid, this.dataset.name)">⚠️ Alert</button>';
      }

      return '<tr>' +
        '<td><b>' + escapeHtml(s.name) + '</b><br><small style="color:#94a3b8;">' + escapeHtml(s.dept) + ' · Yr ' + escapeHtml(s.year) + (s.isSim ? ' (SIM)' : ' (LIVE)') + '</small></td>' +
        '<td><span class="threat-badge badge-secure">' + escapeHtml(s.currentLocation) + '</span></td>' +
        '<td><b style="color:var(--cyan);">' + s.score + ' pts</b><br><small style="color:#64748b;">(Bonus: ' + (s.bonus || 0) + ')</small></td>' +
        '<td>' +
          (isCompleted ? '<span style="color:#94a3b8;">' + (s.violations || 0) + ' (Finished)</span>' : (isLocked ? '<b style="color:#fb7185; font-size:12px;">🔒 3 / 3 (LOCKED)</b>' : (s.violations > 0 ? '<b style="color:#fbbf24; font-size:12px;">⚠️ ' + s.violations + ' / 3</b>' : '<span style="color:#4ade80;">0 (Clean)</span>'))) +
        '</td>' +
        '<td>' + statusTag + '</td>' +
        '<td style="color:#94a3b8; font-size:11px;">' + timeColHtml + '</td>' +
        '<td>' + tableActions + '</td>' +
      '</tr>';
    }).join('');
  }
}

/* ============================================================
   LIVE SCREEN SURVEILLANCE & VIRTUAL MIRROR MODAL
   ============================================================ */
function openStudentInspectModal(sid){
  const roster = getLiveRoster();
  const s = roster[sid];
  if (!s) { showToast('Participant not found on radar.'); return; }
  activeInspectedSid = sid;

  const modal = $('modalStudentInspect');
  const content = $('modalStudentInspectContent');
  if (!modal || !content) return;

  renderStudentInspectContent(s);
  modal.classList.add('active');
  SFX.click();

  if (inspectRefreshInterval) clearInterval(inspectRefreshInterval);
  inspectRefreshInterval = setInterval(() => {
    if (!activeInspectedSid) return;
    const r = getLiveRoster();
    if (r[activeInspectedSid]) renderStudentInspectContent(r[activeInspectedSid]);
  }, 1500);
}

function closeStudentInspectModal(){
  activeInspectedSid = null;
  if (inspectRefreshInterval) clearInterval(inspectRefreshInterval);
  const m = $('modalStudentInspect');
  if (m) m.classList.remove('active');
}

function renderStudentInspectContent(s){
  const content = $('modalStudentInspectContent');
  if (!content) return;

  const isCompleted = (s.status === 'COMPLETED' || s.status === 'FINISHED' || s.status === 'SUBMITTED');
  const isLocked = !isCompleted && (s.is_locked || (s.violations >= 3) || (s.status === 'LOCKED'));
  const durationDisplay = fmtTime(s.durationSeconds || (s.duration ? Number(s.duration) : 0));
  const dots = [1, 2, 3].map(i => '<span class="strike-dot' + (s.violations >= i ? ' lit' : '') + '"></span>').join('');
  const timeSpentSec = Math.max(0, Math.round((Date.now() - (s.qStartTime || (Date.now() - 40000))) / 1000));
  const timeSpentFmt = fmtTime(timeSpentSec);

  // Focus Status Alert (Resolving Terminal Conflicts)
  let focusBanner = '';
  if (isCompleted) {
    focusBanner = '<div style="background:rgba(16,185,129,0.18); border:1.5px solid #10b981; color:#34d399; padding:10px 14px; border-radius:8px; font-family:var(--font-mono); font-size:11.5px; font-weight:700; box-shadow:0 0 15px rgba(16,185,129,0.25);">' +
      '🏁 EXAM COMPLETED: Candidate submitted all rounds. Final Score: ' + s.score + ' pts · Duration: ' + durationDisplay + ' · Integrity Verified.' +
    '</div>';
  } else if (isLocked) {
    focusBanner = '<div style="background:rgba(239,68,68,0.25); border:1.5px solid #ef4444; color:#fca5a5; padding:12px 14px; border-radius:8px; font-family:var(--font-mono); font-size:11.5px; font-weight:700; box-shadow:0 0 15px rgba(239,68,68,0.3);">' +
      '🔒 TERMINAL LOCKED: Candidate violated test integrity rules (' + (s.lock_reason || '3/3 focus violations') + '). Test inputs & timer are halted. Review activity history and authorize re-entry below.' +
    '</div>';
  } else if (s.isTabHidden) {
    focusBanner = '<div style="background:rgba(239,68,68,0.25); border:1.5px solid #ef4444; color:#fca5a5; padding:8px 12px; border-radius:8px; font-family:var(--font-mono); font-size:11px; font-weight:700; animation:tabSwitchBlink 1.5s infinite ease-in-out;">' +
      '⚠️ CRITICAL FOCUS ALARM: Student is currently AWAY from the test window! Tab switched / window minimized.' +
    '</div>';
  } else {
    focusBanner = '<div style="background:rgba(34,197,94,0.15); border:1px solid rgba(34,197,94,0.4); color:#4ade80; padding:6px 12px; border-radius:8px; font-family:var(--font-mono); font-size:11px;">' +
      '🟢 FOCUSED: Student is active inside the challenge window.' +
    '</div>';
  }

  // Question & Options Live Mirror
  let virtualScreenBody = '';
  if (isCompleted) {
    virtualScreenBody = '<div class="virtual-screen-qtitle" style="margin-bottom:10px; color:#34d399;">🏁 Final Exam Submission Verified</div>' +
      '<div style="background:rgba(15,23,42,0.9); border:1px solid rgba(16,185,129,0.4); border-radius:8px; padding:14px; font-family:var(--font-mono); font-size:12px; color:#cbd5e1; line-height:1.7;">' +
        '<div><span style="color:#94a3b8;">Participant:</span> <b>' + escapeHtml(s.name) + '</b> (' + escapeHtml(s.dept) + ' · Year ' + escapeHtml(s.year) + ')</div>' +
        '<div><span style="color:#94a3b8;">Final Score:</span> <b style="color:var(--cyan); font-size:14px;">' + s.score + ' pts</b> (R1: ' + (s.r1 || 0) + ' | R2: ' + (s.r2 || 0) + ' | R3: ' + (s.r3 || 0) + ' | Bonus: ' + (s.bonus || 0) + ')</div>' +
        '<div><span style="color:#94a3b8;">Total Duration:</span> <b>' + durationDisplay + '</b></div>' +
        '<div><span style="color:#94a3b8;">Focus Strikes Logged:</span> <b>' + (s.violations || 0) + ' / 3</b></div>' +
        '<div><span style="color:#94a3b8;">Audit Status:</span> <span style="color:#34d399; font-weight:700;">VERIFIED SUBMISSION</span></div>\n        <div style="margin-top:10px;"><button data-sid="' + s.sid + '" class="threat-btn-sm" style="color:#38bdf8; border-color:rgba(56,189,248,0.4);" onclick="openAnswerSheetModal(this.dataset.sid)">📄 Open Full Answer Sheet</button></div>' +
      '</div>';
  } else if (isLocked) {
    virtualScreenBody = '<div class="virtual-screen-qtitle" style="margin-bottom:10px; color:#f87171;">⛔ Exam Terminal Locked (Proctor Authorization Pending)</div>' +
      '<div style="background:rgba(15,23,42,0.9); border:1px solid #ef4444; border-radius:8px; padding:14px; font-family:var(--font-mono); font-size:12px; color:#cbd5e1;">' +
        'Candidate accumulated 3 focus violation strikes. The testing interface has been locked and the round countdown timer halted. Click "Unlock Terminal & Reset Strikes" below to grant re-entry.' +
      '</div>';
  } else if (s.qOptions && s.qOptions.length > 0) {
    // MCQ Options
    const optRows = s.qOptions.map((optText, idx) => {
      const isChosen = (s.selectedOptionIdx === idx);
      return '<div class="virtual-opt-row' + (isChosen ? ' student-selected' : '') + '">' +
        '<div><b>' + String.fromCharCode(65 + idx) + '.</b> ' + escapeHtml(optText) + '</div>' +
        (isChosen ? '<span style="color:#00ff88; font-size:10px; font-weight:800; font-family:var(--font-mono); letter-spacing:0.04em;">✔ SELECTED BY STUDENT</span>' : '') +
      '</div>';
    }).join('');

    virtualScreenBody = '<div class="virtual-screen-qtitle" style="margin-bottom:10px;">' + escapeHtml(s.qTitle || 'Question prompt loading...') + '</div>' +
      '<div class="virtual-screen-options">' + optRows + '</div>';
  } else if (s.inputText != null) {
    // Round 2 or Round 3 Input Mirror
    virtualScreenBody = '<div class="virtual-screen-qtitle" style="margin-bottom:10px;">' + escapeHtml(s.qTitle || 'Challenge in progress...') + '</div>' +
      '<div class="virtual-screen-input-box">' +
        '<div style="font-size:10px; color:#94a3b8; margin-bottom:4px;">LIVE KEYSTROKE INPUT MIRROR:</div>' +
        '<div style="font-size:15px; color:#38bdf8; font-weight:700; font-family:var(--font-mono);">' + (s.inputText ? escapeHtml(s.inputText) : '<span style="color:#64748b; font-style:italic;">(Student has not typed any characters yet)</span>') + '</div>' +
      '</div>';
  } else {
    // Waiting room or generic
    virtualScreenBody = '<div class="virtual-screen-qtitle">' + escapeHtml(s.qTitle || s.currentLocation) + '</div>' +
      '<div style="background:rgba(15,23,42,0.8); border:1px solid #334155; border-radius:8px; padding:14px; margin-top:10px; font-family:var(--font-mono); font-size:12px; color:#94a3b8;">' +
        'Active in Waiting Room Mini-Games. Practice training session in progress.' +
      '</div>';
  }

  // Chronological History
  const historyList = (s.history && s.history.length > 0)
    ? s.history.map(h => {
        const t = new Date(h.time).toLocaleTimeString();
        return '<li style="margin-bottom:6px; color:#cbd5e1;"><span style="color:#64748b; font-size:10.5px;">[' + t + ']</span> ' + escapeHtml(h.desc) + '</li>';
      }).join('')
    : '<li style="color:#64748b;">No previous security incidents recorded.</li>';

  // Pardon History Log
  let pardonLogHtml = '';
  if (s.pardon_history && s.pardon_history.length > 0) {
    pardonLogHtml = '<div style="margin-top:12px; padding-top:10px; border-top:1px dashed #334155; font-family:var(--font-mono); font-size:10.5px;">' +
      '<b style="color:#4ade80; display:block; margin-bottom:4px;">LIFETIME PROCTOR PARDONS (' + s.pardon_history.length + '):</b>' +
      s.pardon_history.map(p => '<div style="color:#cbd5e1; margin-bottom:2px;">✔ ' + new Date(p.pardoned_at).toLocaleTimeString() + ' — Prior Strikes: ' + p.prior_strikes + ' (' + escapeHtml(p.pardoned_by) + ')</div>').join('') +
    '</div>';
  }

  // Bottom Intervention Bar (Terminal State Awareness)
  let modalIntervention = '';
  if (isCompleted) {
    modalIntervention = 
      '<button class="btn disabled small" disabled style="opacity:0.4; cursor:not-allowed;" title="Exam completed: warnings disabled">⚠️ Alert (Finished)</button>' +
      '<button class="btn disabled small" disabled style="opacity:0.4; cursor:not-allowed;" title="Exam completed: clues disabled">💡 Clue (Finished)</button>' +
      '<button class="btn ghost small" onclick="closeStudentInspectModal(); adminSwitchTab(\'leaderboard\');">🏆 View on Leaderboard</button>';
  } else if (isLocked) {
    modalIntervention = 
      '<button data-sid="' + s.sid + '" class="btn solid small" style="background:#22c55e; border-color:#22c55e; font-weight:800;" onclick="adminPardonStrike(this.dataset.sid); openStudentInspectModal(this.dataset.sid);">🔓 Unlock Terminal & Reset Strikes (0/3)</button>' +
      '<button class="btn disabled small" disabled style="opacity:0.4; cursor:not-allowed;" title="Session locked: warnings disabled">⚠️ Alert (Locked)</button>' +
      '<button class="btn disabled small" disabled style="opacity:0.4; cursor:not-allowed;" title="Cannot grant clues to a locked terminal">💡 Clue (Locked)</button>';
  } else {
    modalIntervention = 
      '<button data-sid="' + s.sid + '" data-name="' + escapeHtml(s.name) + '" class="btn solid small" style="background:#0284c7; border-color:#38bdf8;" onclick="adminSendWarning(this.dataset.sid, this.dataset.name)">⚠️ Dispatch Warning Alert</button>' +
      (s.violations > 0 ? '<button data-sid="' + s.sid + '" class="btn ghost small" onclick="adminPardonStrike(this.dataset.sid); openStudentInspectModal(this.dataset.sid);">🔄 Pardon 1 Strike</button>' : '') +
      '<button data-sid="' + s.sid + '" class="btn ghost small" style="color:#38bdf8;" onclick="adminQuickGrantClue(this.dataset.sid)">💡 Grant Clue</button>';
  }

  content.innerHTML = '<div class="surveillance-dual-grid">' +
    '<!-- LEFT PANE: VIRTUAL SCREEN MIRROR -->' +
    '<div class="virtual-screen-frame">' +
      '<div class="virtual-screen-hud">' +
        '<span style="color:#38bdf8; font-weight:700;">📺 VIRTUAL TERMINAL MIRROR</span>' +
        '<span style="color:#fbbf24;">⏱️ Time on Question: <b>' + timeSpentFmt + '</b></span>' +
      '</div>' +
      focusBanner +
      '<div style="margin-top:6px;">' +
        '<div style="font-family:var(--font-mono); font-size:10.5px; color:#38bdf8; margin-bottom:4px;">📍 CURRENT LOCATION: <b>' + escapeHtml(s.currentLocation) + '</b></div>' +
        virtualScreenBody +
      '</div>' +
    '</div>' +

    '<!-- RIGHT PANE: TELEMETRY & TIMELINE -->' +
    '<div class="surveillance-side-panel">' +
      '<div style="background:rgba(8,18,34,0.9); border:1.5px solid #1e3a5f; border-radius:12px; padding:12px;">' +
        '<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">' +
          '<div>' +
            '<div style="font-family:var(--font-display); font-size:15px; font-weight:800; color:#fff;">' + escapeHtml(s.name) + '</div>' +
            '<div style="font-family:var(--font-mono); font-size:10.5px; color:#94a3b8;">' + escapeHtml(s.dept) + ' · Year ' + escapeHtml(s.year) + ' · SID: ' + escapeHtml(s.sid) + '</div>' +
          '</div>' +
          '<div style="text-align:right;">' +
            '<div style="font-size:16px; font-weight:800; color:var(--cyan);">' + s.score + ' pts</div>' +
            '<div style="font-size:10px; color:#f59e0b;">(Bonus: +' + (s.bonus || 0) + ')</div>' +
          '</div>' +
        '</div>' +
        '<div style="font-family:var(--font-mono); font-size:11px; display:flex; align-items:center; gap:6px;">' +
          '<span style="color:#94a3b8;">Active Strikes:</span> ' + dots + ' <b style="color:' + (isLocked ? '#fb7185' : (s.violations > 0 ? '#fbbf24' : '#4ade80')) + '; margin-left:4px;">' + s.violations + '/3' + (isLocked ? ' (LOCKED)' : '') + '</b>' +
        '</div>' +
        pardonLogHtml +
      '</div>' +

      '<div style="background:rgba(8,18,34,0.9); border:1.5px solid #1e3a5f; border-radius:12px; padding:12px; flex:1; max-height:260px; overflow-y:auto;">' +
        '<div style="font-family:var(--font-display); font-size:11px; color:#fbbf24; margin-bottom:8px; letter-spacing:0.04em;">CHRONOLOGICAL AUDIT TIMELINE</div>' +
        '<ul style="margin:0; padding-left:16px; font-family:var(--font-mono); font-size:10.5px;">' + historyList + '</ul>' +
      '</div>' +
    '</div>' +
  '</div>' +

  '<!-- BOTTOM INTERVENTION BAR -->' +
  '<div style="display:flex; justify-content:space-between; align-items:center; gap:8px; flex-wrap:wrap; border-top:1px solid #1e3a5f; padding-top:14px;">' +
    '<div style="display:flex; gap:8px; flex-wrap:wrap;">' +
      modalIntervention +
    '</div>' +
    '<button class="btn rose small" onclick="closeStudentInspectModal()">✕ Close Surveillance</button>' +
  '</div>';
}

function adminQuickGrantClue(sid){
  const roster = getLiveRoster();
  const s = roster[sid];
  if (!s) return;
  if (s.is_locked || (s.violations >= 3)) {
    showToast('Cannot grant clues to a locked terminal.');
    return;
  }
  showAppModal({
    mode: 'prompt',
    title: 'DISPATCH DIRECT CLUE',
    icon: '💡',
    message: 'Enter custom direct clue to dispatch to candidate ' + s.name + ' (' + (s.dept || 'Candidate') + '):',
    inputLabel: 'Direct Clue / Hint Text:',
    defaultValue: 'System Clue: Verify standard protocols and double-check target identifiers.',
    confirmText: 'Approve & Dispatch Clue',
    cancelText: 'Cancel',
    onConfirm: (clue) => {
      if (!clue || clue.trim() === '') return;
      const hints = getHintRequests();
      hints.push({
        id: 'req_direct_' + Date.now(),
        sid: s.sid,
        name: s.name,
        dept: s.dept,
        year: s.year,
        round: s.round,
        qId: 'DIRECT_CLUE',
        qLabel: s.currentLocation,
        cost: 0,
        status: 'GRANTED',
        hintText: clue.trim(),
        time: Date.now()
      });
      saveHintRequests(hints);
      showToast('✔ Dispatched direct clue to ' + s.name + '!');
      renderAdminHintConsole();
    }
  });
}

function adminSendWarning(sid, name){
  const roster = getLiveRoster();
  const s = roster[sid];
  if (s && (s.is_locked || (s.violations >= 3))) {
    showToast('Cannot send warnings to a locked terminal.');
    return;
  }
  showAppModal({
    mode: 'prompt',
    title: 'DISPATCH PROCTOR WARNING',
    icon: '🚨',
    message: 'Enter warning alert to display on ' + name + '\'s terminal screen:',
    inputLabel: 'Warning Message:',
    defaultValue: 'System Admin Warning: Focus violations detected! Stay on the challenge window.',
    confirmText: '⚠️ Send Warning Alert',
    cancelText: 'Cancel',
    onConfirm: (msg) => {
      if (!msg || msg.trim() === '') return;
      const trimmed = msg.trim();
      const msgs = JSON.parse(localStorage.getItem(ADMIN_DIRECT_MSG_KEY) || '{}');
      msgs[sid] = { text: trimmed, time: Date.now() };
      localStorage.setItem(ADMIN_DIRECT_MSG_KEY, JSON.stringify(msgs));
      adminLogSecurityEvent('warn', 'ADMIN DISPATCH: Warning sent to ' + name + ' ("' + trimmed + '")');
      showToast('⚠️ Warning dispatched directly to ' + name + '!');
      SFX.warn();
    }
  });
}

function adminPardonStrike(sid){
  const roster = getLiveRoster();
  if (!roster[sid]) return;
  const s = roster[sid];
  const prevStrikes = s.violations || s.strikes_count || 0;
  
  // UNLOCK TERMINAL & RESET ACTIVE STRIKES TO 0/3
  s.is_locked = false;
  s.violations = 0;
  s.strikes_count = 0;
  s.disqualified = false;
  s.status = 'IN_PROGRESS';
  delete s.lock_reason;
  s.currentLocation = 'Round ' + (s.round || '1') + ' · Re-entry Authorized by Proctor';

  if (!Array.isArray(s.pardon_history)) s.pardon_history = [];
  s.pardon_history.push({
    pardoned_at: Date.now(),
    pardoned_by: 'System Admin (0769)',
    prior_strikes: prevStrikes || 3,
    reason: 'Proctor re-entry authorization granted'
  });

  // Synchronize local session if this is the active browser participant
  if (typeof dismissCandidateLockout === 'function' && S && S.sid === sid) {
    dismissCandidateLockout({
      pardoned_at: Date.now(),
      pardoned_by: 'System Admin (0769)',
      prior_strikes: prevStrikes || 3
    });
  }

  // Dispatch real-time unlock event across browser tabs / sockets
  const unlockPayload = {
    event: 'ADMIN_PARDON_UNLOCKED',
    sid: sid,
    isLocked: false,
    strikes: 0,
    prior_strikes: prevStrikes || 3,
    pardoned_at: Date.now(),
    pardoned_by: 'System Admin (0769)',
    ts: Date.now()
  };
  localStorage.setItem(CYBERARENA_UNLOCK_DISPATCH_KEY, JSON.stringify(unlockPayload));

  adminLogSecurityEvent('success', 'PARDON & UNLOCK: System Admin unlocked terminal for ' + s.name + ' and reset active strikes (0/3). Lifetime pardons: ' + s.pardon_history.length);
  showToast('🔓 Terminal unlocked! Active strikes reset to 0/3 for ' + s.name + '.');

  Object.values(roster).forEach(s => { if (!s.audit_sheet) s.audit_sheet = generateParticipantAuditSheet(s); });
  saveLiveRoster(roster);
  renderAdminProctorConsole();
}

// Student side: Listen for direct Admin warnings
function showAdminDirectAlert(text) {
  const box = $('modalAdminDirectAlert'), txt = $('adminDirectAlertText');
  if (txt) txt.textContent = text;
  if (box) {
    isInternalModalOpen = true;
    box.classList.add('active');
  }
}
function closeAdminDirectAlertModal() {
  const box = $('modalAdminDirectAlert');
  if (box) box.classList.remove('active');
  isInternalModalOpen = false;
}

setInterval(() => {
  if (!S) return;
  try {
    const msgs = JSON.parse(localStorage.getItem(ADMIN_DIRECT_MSG_KEY) || '{}');
    if (msgs[S.sid]) {
      const msg = msgs[S.sid];
      delete msgs[S.sid];
      localStorage.setItem(ADMIN_DIRECT_MSG_KEY, JSON.stringify(msgs));
      SFX.warn();
      showAdminDirectAlert(msg.text);
    }
  } catch(e){}
}, 1500);

/* ============================================================
   WAITING ROOM 50-PT BONUS SYSTEM (10 PTS / WIN, MAX 50 PTS PER GAME)
   ============================================================ */
function updateWaitingBonusDisplay(){
  if (!S) return;
  const wb = S.waitingBonus || { threatgen: 0, flip: 0, term: 0 };
  const tgWins = Math.min(5, Math.floor((wb.threatgen || 0) / 10));
  const flipWins = Math.min(5, Math.floor((wb.flip || 0) / 10));
  const termWins = Math.min(5, Math.floor((wb.term || 0) / 10));

  // Main Lounge pill
  const disp = $('waitingBonusDisplay');
  if (disp) {
    const totalBonus = (S.scores && S.scores.bonus) || 0;
    disp.textContent = '+' + totalBonus + ' Bonus Pts (TG: ' + (wb.threatgen||0) + '/50 | Flip: ' + (wb.flip||0) + '/50 | Term: ' + (wb.term||0) + '/50)';
  }

  // ThreatGEN Cockpit pill
  const tgVal = $('tgPointsVal');
  const tgPill = $('tgBonusPill');
  if (tgVal) {
    if ((wb.threatgen || 0) >= 50) {
      tgVal.innerHTML = '<span style="color:#f59e0b;">50/50 PTS (LIMIT OVER - 0 PTS)</span>';
      if (tgPill) tgPill.style.borderColor = '#f59e0b';
    } else {
      tgVal.innerHTML = '<span style="color:#00ff88;">' + (wb.threatgen || 0) + '/50 PTS (' + (5 - tgWins) + ' wins left)</span>';
      if (tgPill) tgPill.style.borderColor = '#00ff88';
    }
  }

  // Flip Match pill
  const flipPill = $('flipBonusPill');
  if (flipPill) {
    if ((wb.flip || 0) >= 50) {
      flipPill.innerHTML = 'Limit Over: 50/50 Pts (Practice Mode)';
      flipPill.style.borderColor = '#f59e0b';
      flipPill.style.color = '#f59e0b';
    } else {
      flipPill.innerHTML = 'Bonus: ' + (wb.flip || 0) + '/50 Pts (' + (5 - flipWins) + ' wins left)';
      flipPill.style.borderColor = '#00ff88';
      flipPill.style.color = '#00ff88';
    }
  }

  // Terminal pill
  const termPill = $('termBonusPill');
  if (termPill) {
    if ((wb.term || 0) >= 50) {
      termPill.innerHTML = 'Limit Over: 50/50 Pts (Practice Mode)';
      termPill.style.borderColor = '#f59e0b';
      termPill.style.color = '#f59e0b';
    } else {
      termPill.innerHTML = 'Reward: ' + (wb.term || 0) + '/50 Pts (' + (5 - termWins) + ' wins left)';
      termPill.style.borderColor = '#00ff88';
      termPill.style.color = '#00ff88';
    }
  }
}

function awardWaitingBonus(gameId, reason){
  if (!S) return;
  if (!S.waitingBonus) S.waitingBonus = { threatgen: 0, flip: 0, term: 0 };
  
  if (typeof gameId === 'number') gameId = 'threatgen';
  if (!gameId) gameId = 'threatgen';

  const GAME_NAMES = { threatgen: 'ThreatGEN: Red vs Blue', flip: 'Memory Flip Match', term: 'Hack The Terminal' };
  const gName = GAME_NAMES[gameId] || 'Mini-Game';
  const curEarned = S.waitingBonus[gameId] || 0;

  if (curEarned >= 50) {
    showToast('⚠️ Limit reached for ' + gName + ' (50/50 Pts earned). You can continue playing for practice, but 0 further points are awarded.');
    updateWaitingBonusDisplay();
    return;
  }

  const ptsToAdd = Math.min(10, 50 - curEarned);
  S.waitingBonus[gameId] = curEarned + ptsToAdd;
  S.scores.bonus = (S.scores.bonus || 0) + ptsToAdd;
  save();
  updateRank();
  broadcastParticipantHeartbeat();
  updateWaitingBonusDisplay();

  const currentWins = Math.round(S.waitingBonus[gameId] / 10);
  const remainingWins = 5 - currentWins;
  if (remainingWins > 0) {
    showToast('🌟 VICTORY! +' + ptsToAdd + ' Trust Points earned! [' + gName + ': ' + S.waitingBonus[gameId] + '/50 Pts • ' + remainingWins + ' win' + (remainingWins === 1 ? '' : 's') + ' left]');
  } else {
    showToast('🏆 50/50 PTS CAP REACHED for ' + gName + '! +' + ptsToAdd + ' Trust Points earned. (Future plays in this game will award 0 points).');
  }
  SFX.success();
}

/* ============================================================
   HINT ACCESS WITH POINT DEDUCTION (-10 PTS) & ADMIN-ONLY ACCEPT
   ============================================================ */
const HINT_REQUESTS_KEY = "cyberarena_hint_requests_v1";

function getHintRequests(){
  try { return JSON.parse(localStorage.getItem(HINT_REQUESTS_KEY) || '[]'); } catch(e){ return []; }
}
function saveHintRequests(list){
  try { localStorage.setItem(HINT_REQUESTS_KEY, JSON.stringify(list)); } catch(e){}
}

function checkAdminHint(qId){
  if (!S) return null;
  const list = getHintRequests();
  const found = list.find(r => r.sid === S.sid && r.qId === qId && r.status === 'GRANTED');
  return found ? found.hintText : null;
}

function getDefaultHint(qId){
  try {
    if (qId && qId.startsWith('R1_Q')) {
      const idx = parseInt(qId.replace('R1_Q', '')) - 1;
      const q = R1 && R1[idx];
      if (q && q.options && q.answer != null) {
        const correctOpt = q.options[q.answer];
        const keyword = correctOpt.split(' ')[0].replace(/[^a-zA-Z0-9]/g, '');
        return "Clue: Focus on terms relating to '" + keyword + "' and industry standards.";
      }
    } else if (qId && qId.startsWith('R2_P')) {
      const idx = parseInt(qId.replace('R2_P', '')) - 1;
      const p = R2 && R2[idx];
      if (p) {
        const ans = (p.answers && p.answers[0]) || '';
        return "Clue: " + p.type + ". Starts with '" + ans.slice(0, 3) + "...' (" + ans.length + " chars)";
      }
    } else if (qId && qId.startsWith('R3_Q')) {
      const idx = parseInt(qId.replace('R3_Q', '')) - 1;
      const q = R3 && R3.questions && R3.questions[idx];
      if (q) {
        const ans = (q.answers && q.answers[0]) || '';
        return "Clue: Check Evidence Card. Value begins with '" + ans.slice(0, 4) + "...'";
      }
    }
  } catch(e){}
  return "System Clue: Verify standard cybersecurity protocol and inspect details.";
}

const CLUE_COST = 10;

/**
 * Server-side / Handler verification for clue requests
 * Enforces strict point validation and rejects requests when current balance < 10
 */
function handleClueRequestPayload(payload) {
  const currentScore = Number(payload.currentScore || 0);
  const cost = Number(payload.cost || CLUE_COST);

  if (currentScore < cost) {
    return {
      status: 400,
      ok: false,
      code: 'INSUFFICIENT_POINTS',
      error: 'INSUFFICIENT_POINTS',
      message: 'Insufficient points: Request requires ' + cost + ' Trust Points, but current score is ' + currentScore + ' pts.'
    };
  }
  return {
    status: 200,
    ok: true,
    code: 'APPROVED',
    cost: cost,
    remainingBalance: currentScore - cost
  };
}

let pendingClueRequest = null;

function openClueConfirmModal(roundName, qId, qLabel){
  if (!S || S.is_locked) return;
  const curScore = (S.scores.r1 || 0) + (S.scores.r2 || 0) + (S.scores.r3 || 0) + (S.scores.bonus || 0);
  if (curScore < CLUE_COST) {
    showToast('❌ Insufficient points (Requires 10 Trust Points · Balance: ' + curScore + ' pts)');
    renderCurrentHintBox(roundName, qId);
    return;
  }

  if (!qLabel) {
    if (qId.startsWith('R1_Q')) qLabel = 'Question #' + qId.replace('R1_Q', '');
    else if (qId.startsWith('R2_P')) qLabel = 'Crypto Challenge #' + qId.replace('R2_P', '');
    else if (qId.startsWith('R3_Q')) qLabel = 'Forensic Case #' + qId.replace('R3_Q', '');
    else qLabel = qId;
  }

  pendingClueRequest = { roundName, qId, qLabel };

  const bodyEl = $('clueConfirmBody');
  if (bodyEl) {
    bodyEl.innerHTML = 
      '<div style="background:rgba(15,23,42,0.85); border:1px solid rgba(56,189,248,0.25); border-radius:8px; padding:14px; margin-bottom:14px; font-size:12px;">' +
        '<div style="display:flex; justify-content:space-between; margin-bottom:8px;">' +
          '<span style="color:#94a3b8;">Challenge:</span>' +
          '<b style="color:var(--cyan);">' + escapeHtml(qLabel) + ' (' + escapeHtml(roundName) + ')</b>' +
        '</div>' +
        '<div style="display:flex; justify-content:space-between; margin-bottom:8px;">' +
          '<span style="color:#94a3b8;">Clue Cost:</span>' +
          '<b style="color:#f59e0b;">' + CLUE_COST + ' Trust Points</b>' +
        '</div>' +
        '<div style="display:flex; justify-content:space-between; margin-bottom:8px;">' +
          '<span style="color:#94a3b8;">Current Balance:</span>' +
          '<span style="color:#e2e8f0; font-weight:600;">' + curScore + ' pts</span>' +
        '</div>' +
        '<div style="display:flex; justify-content:space-between; border-top:1px dashed #334155; padding-top:8px; margin-top:8px;">' +
          '<span style="color:#94a3b8;">Balance After Request:</span>' +
          '<b style="color:#34d399; font-size:13px;">' + (curScore - CLUE_COST) + ' pts</b>' +
        '</div>' +
      '</div>' +
      '<p style="color:#94a3b8; font-size:11px; margin:0; line-height:1.5;">' +
        '• Your request will be queued in the SOC Proctor console.<br>' +
        '• Once approved by the proctor, the direct clue will be revealed in this terminal.<br>' +
        '• If declined by the proctor, your 10 points will be automatically refunded.' +
      '</p>';
  }

  isInternalModalOpen = true;
  const modal = $('modalClueConfirm');
  if (modal) modal.classList.add('active');
}

function closeClueConfirmModal(){
  const modal = $('modalClueConfirm');
  if (modal) modal.classList.remove('active');
  pendingClueRequest = null;
  isInternalModalOpen = false;
}

function confirmAndSendClueRequest(){
  if (!pendingClueRequest) {
    closeClueConfirmModal();
    return;
  }
  const { roundName, qId, qLabel } = pendingClueRequest;
  closeClueConfirmModal();
  requestAdminHint(roundName, qId, qLabel);
}

function requestAdminHint(roundName, qId, qLabel){
  if (!S || S.is_locked) return { status: 403, ok: false, error: 'SESSION_LOCKED' };
  const list = getHintRequests();
  const existing = list.find(r => r.sid === S.sid && r.qId === qId);
  if (existing) {
    if (existing.status === 'PENDING') {
      showToast('⏳ Hint request is already pending System Admin approval.');
      return { status: 409, ok: false, error: 'ALREADY_PENDING' };
    } else if (existing.status === 'GRANTED') {
      showToast('💡 Hint is already granted for this question.');
      return { status: 409, ok: false, error: 'ALREADY_GRANTED' };
    }
  }

  if (!qLabel) {
    if (qId.startsWith('R1_Q')) qLabel = 'Question #' + qId.replace('R1_Q', '');
    else if (qId.startsWith('R2_P')) qLabel = 'Crypto Challenge #' + qId.replace('R2_P', '');
    else if (qId.startsWith('R3_Q')) qLabel = 'Forensic Case #' + qId.replace('R3_Q', '');
    else qLabel = qId;
  }

  const curScore = (S.scores.r1 || 0) + (S.scores.r2 || 0) + (S.scores.r3 || 0) + (S.scores.bonus || 0);

  // SERVER-SIDE / HANDLER STRICT VALIDATION CHECK
  const check = handleClueRequestPayload({
    sid: S.sid,
    qId: qId,
    currentScore: curScore,
    cost: CLUE_COST
  });

  if (!check.ok || check.status === 400) {
    showToast('❌ ' + check.message);
    renderCurrentHintBox(roundName, qId);
    return check;
  }

  // Only deduct points and forward request if validation passes and score >= 10
  S.scores.bonus = (S.scores.bonus || 0) - CLUE_COST;
  save();
  updateRank();

  // Clear previous rejected request for same question if any
  const cleanList = list.filter(r => !(r.sid === S.sid && r.qId === qId));
  cleanList.push({
    id: 'req_' + Date.now(),
    sid: S.sid,
    name: S.player.name,
    dept: S.player.dept,
    year: S.player.year,
    round: roundName,
    qId: qId,
    qLabel: qLabel || qId,
    cost: CLUE_COST,
    status: 'PENDING',
    hintText: '',
    time: Date.now()
  });
  saveHintRequests(cleanList);
  broadcastParticipantHeartbeat();
  SFX.click();
  showToast('🙋 Request sent to System Admin (-10 Points deducted). Awaiting approval...');
  renderCurrentHintBox(roundName, qId);
  return { status: 200, ok: true, code: 'REQUEST_FORWARDED' };
}

function renderCurrentHintBox(roundName, qId, containerId){
  if (!containerId) {
    if ((roundName && roundName.indexOf('1') !== -1) || (S && S.round === 'R1')) containerId = 'r1HintSlot';
    else if ((roundName && roundName.indexOf('2') !== -1) || (S && S.round === 'R2')) containerId = 'r2HintSlot';
    else if ((roundName && roundName.indexOf('3') !== -1) || (S && S.round === 'R3')) containerId = 'r3HintSlot';
    else containerId = 'r1HintSlot';
  }
  const el = $(containerId);
  if (!el) return;
  const granted = checkAdminHint(qId);
  if (granted) {
    el.innerHTML = '<div class="hint-granted-box">' +
      '<div class="hint-granted-head"><span>🛡️ SYSTEM ADMIN CLUE DISPATCH</span><span>&bull; ACCESS APPROVED (-10 PTS)</span></div>' +
      '<div class="hint-granted-text">' + escapeHtml(granted) + '</div>' +
    '</div>';
    return;
  }

  const curScore = (S && S.scores) 
    ? ((Number(S.scores.r1) || 0) + (Number(S.scores.r2) || 0) + (Number(S.scores.r3) || 0) + (Number(S.scores.bonus) || 0))
    : 0;
  const hasEnoughPoints = curScore >= CLUE_COST;

  const list = getHintRequests();
  const req = S && list.find(r => r.sid === S.sid && r.qId === qId);
  if (req && req.status === 'PENDING') {
    el.innerHTML = '<div class="hint-req-card" style="border-color:#f59e0b; background:rgba(44,30,16,0.65);">' +
      '<div><b style="color:#fbbf24;">⏳ Hint Request Pending:</b> <span style="color:#cbd5e1;">You pledged 10 points. Waiting for System Admin to accept and dispatch clue...</span></div>' +
      '<button class="hint-req-btn" disabled style="opacity:0.6; cursor:not-allowed;">⏳ Pending Admin Approval</button>' +
    '</div>';
    return;
  } else if (req && req.status === 'REJECTED') {
    const btnHtml = hasEnoughPoints
      ? '<button class="hint-req-btn" onclick="openClueConfirmModal(\'' + escapeHtml(roundName) + '\', \'' + escapeHtml(qId) + '\')">Request Again (-10 Pts)</button>'
      : '<div style="display:flex; flex-direction:column; align-items:flex-end; gap:4px;">' +
          '<button class="hint-req-btn disabled" disabled style="opacity:0.45; cursor:not-allowed; background:rgba(30,41,59,0.5); border-color:rgba(239,68,68,0.3); color:#94a3b8;" title="Insufficient points (Requires 10 Trust Points)">🔒 Request Again (-10 Pts)</button>' +
          '<small style="color:#f87171; font-size:11px; font-weight:600;">⚠️ Insufficient points (Requires 10 Trust Points)</small>' +
        '</div>';
    el.innerHTML = '<div class="hint-req-card" style="border-color:#ef4444; background:rgba(40,10,20,0.65);">' +
      '<div><b style="color:#f87171;">✖ Request Declined:</b> <span style="color:#cbd5e1;">Admin declined clue (10 points refunded).</span></div>' +
      btnHtml +
    '</div>';
    return;
  }

  let actionHtml;
  if (hasEnoughPoints) {
    actionHtml = '<button class="hint-req-btn" onclick="openClueConfirmModal(\'' + escapeHtml(roundName) + '\', \'' + escapeHtml(qId) + '\')">🙋 Request Admin Clue (-10 Pts)</button>';
  } else {
    actionHtml = '<div style="display:flex; flex-direction:column; align-items:flex-end; gap:4px;">' +
      '<button class="hint-req-btn disabled" disabled style="opacity:0.45; cursor:not-allowed; background:rgba(30,41,59,0.5); border-color:rgba(239,68,68,0.3); color:#94a3b8;" title="Insufficient points (Requires 10 Trust Points)">🔒 Request Admin Clue (-10 Pts)</button>' +
      '<small style="color:#f87171; font-size:11px; font-weight:600;">⚠️ Insufficient points (Requires 10 Trust Points)</small>' +
    '</div>';
  }

  el.innerHTML = '<div class="hint-req-card">' +
    '<div><b style="color:#38bdf8;">💡 Need a Clue?</b> <span style="color:#94a3b8;">Spend 10 points to request a direct hint. Only System Admin can grant access.</span></div>' +
    actionHtml +
  '</div>';
}

function renderAdminHintConsole(){
  const body = $('adminHintTableBody');
  if (!body) return;
  const list = getHintRequests();
  if (list.length === 0) {
    body.innerHTML = '<tr><td colspan="5" style="text-align:center; color:#64748b; padding:18px;">No hint requests submitted by students yet.</td></tr>';
    return;
  }

  const sorted = list.map((r, i) => ({ ...r, origIdx: i })).sort((a, b) => {
    if (a.status === 'PENDING' && b.status !== 'PENDING') return -1;
    if (b.status === 'PENDING' && a.status !== 'PENDING') return 1;
    return b.time - a.time;
  });

  body.innerHTML = sorted.map(r => {
    const isGranted = r.status === 'GRANTED';
    const isPending = r.status === 'PENDING';
    const isRejected = r.status === 'REJECTED';

    let badge = '<span class="status-tag-switch" style="animation:none; background:rgba(245,158,11,0.2); color:#fbbf24; border-color:#f59e0b;" title="Awaiting Admin Review & Approval">⏳ PENDING</span>';
    if (isGranted) badge = '<span class="status-tag-active" title="Clue granted and revealed to candidate">🟢 GRANTED</span>';
    else if (isRejected) badge = '<span class="status-tag-disq" title="Request declined and 10 points refunded">🔴 DECLINED</span>';

    const defaultClue = r.hintText || getDefaultHint(r.qId);

    let clueBox = '';
    let actionBtns = '';

    if (isPending) {
      clueBox = '<div style="display:flex; flex-direction:column; gap:4px;">' +
        '<input type="text" id="adminHintInput_' + r.origIdx + '" class="threat-input-sm" style="width:100%; background:rgba(15,23,42,0.9); color:#f8fafc; border:1px solid #0284c7; padding:6px 8px; border-radius:4px; font-size:12px;" value="' + escapeHtml(defaultClue) + '" placeholder="Type or adjust clue for student...">' +
        '<small style="color:#94a3b8; font-size:10px;">Suggested hint pre-filled above. Edit as desired before granting.</small>' +
      '</div>';

      actionBtns = '<div style="display:flex; gap:6px;">' +
        '<button class="btn solid small" style="background:#22c55e; border-color:#22c55e; padding:5px 12px; font-weight:700;" onclick="adminGrantHint(' + r.origIdx + ')">✔ Accept & Grant</button>' +
        '<button class="btn rose small" style="padding:5px 10px;" onclick="adminRejectHint(' + r.origIdx + ')">✖ Decline</button>' +
      '</div>';
    } else if (isGranted) {
      clueBox = '<div style="font-size:12px; color:#4ade80; background:rgba(34,197,94,0.1); border:1px solid rgba(34,197,94,0.3); padding:6px 10px; border-radius:4px;">' +
        '<b>Dispatched Clue:</b> ' + escapeHtml(r.hintText) +
      '</div>';

      actionBtns = '<div style="display:flex; gap:6px;">' +
        '<button class="btn ghost small" style="padding:4px 8px;" onclick="adminEditGrantedHint(' + r.origIdx + ')">✏ Edit Clue</button>' +
        '<button class="btn rose small" style="padding:4px 8px;" onclick="adminRevokeHint(' + r.origIdx + ')">Revoke</button>' +
      '</div>';
    } else {
      clueBox = '<span style="color:#94a3b8; font-size:12px;">Request was declined (cost refunded).</span>';
      actionBtns = '<button class="btn ghost small" style="padding:4px 8px;" onclick="adminGrantHint(' + r.origIdx + ')">🔄 Re-Approve</button>';
    }

    const timeStr = new Date(r.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

    return '<tr>' +
      '<td><b>' + escapeHtml(r.name) + '</b><br><small style="color:#94a3b8;">' + escapeHtml(r.dept) + ' · Yr ' + escapeHtml(r.year) + '</small><br><span style="font-size:10px; color:#64748b;">' + timeStr + '</span></td>' +
      '<td><span class="threat-badge badge-secure">' + escapeHtml(r.round) + '</span><br><b style="font-size:12px; color:var(--cyan);">' + escapeHtml(r.qLabel) + '</b></td>' +
      '<td>' + badge + '<br><small style="color:#f59e0b; font-size:10px;">Cost: 10 Pts Deducted</small></td>' +
      '<td>' + clueBox + '</td>' +
      '<td>' + actionBtns + '</td>' +
    '</tr>';
  }).join('');
}

function adminGrantHint(idx){
  const list = getHintRequests();
  const r = list[idx];
  if (!r) return;
  const input = $('adminHintInput_' + idx);
  let clue = (input && input.value != null && input.value !== '') ? String(input.value).trim() : '';

  const executeGrant = (clueText) => {
    if (!clueText || clueText.trim() === '') return;
    r.status = 'GRANTED';
    r.hintText = clueText.trim();
    r.grantedAt = Date.now();
    saveHintRequests(list);

    const msgs = JSON.parse(localStorage.getItem(ADMIN_DIRECT_MSG_KEY) || '{}');
    msgs[r.sid] = { text: "System Admin approved your clue request for " + r.qLabel + "! Your hint is now unlocked on screen.", time: Date.now() };
    localStorage.setItem(ADMIN_DIRECT_MSG_KEY, JSON.stringify(msgs));

    showToast('✔ Clue approved and granted to ' + r.name + '!');
    SFX.success();
    renderAdminHintConsole();
  };

  if (clue) {
    executeGrant(clue);
  } else {
    showAppModal({
      mode: 'prompt',
      title: 'GRANT CLUE APPROVAL',
      icon: '💡',
      message: 'Enter specific clue to reveal to ' + r.name + ' (' + (r.dept || 'Candidate') + ') for ' + r.qLabel + ' (' + r.round + '):',
      inputLabel: 'Predefined / Custom Clue Text:',
      defaultValue: getDefaultHint(r.qId),
      confirmText: '✔ Approve & Dispatch',
      cancelText: 'Cancel',
      onConfirm: (customClue) => {
        executeGrant(customClue);
      }
    });
  }
}

function adminRejectHint(idx){
  const list = getHintRequests();
  const r = list[idx];
  if (!r) return;
  r.status = 'REJECTED';
  r.rejectedAt = Date.now();
  saveHintRequests(list);

  if (S && S.sid === r.sid) {
    S.scores.bonus = (S.scores.bonus || 0) + 10;
    save();
    updateRank();
  }

  showToast('Declined clue request for ' + r.name + ' (10 points refunded).');
  renderAdminHintConsole();
}

function adminRevokeHint(idx){
  const list = getHintRequests();
  const r = list[idx];
  if (!r) return;
  r.status = 'REJECTED';
  saveHintRequests(list);
  showToast('Revoked clue access for ' + r.name + '.');
  renderAdminHintConsole();
}

function adminEditGrantedHint(idx){
  const list = getHintRequests();
  const r = list[idx];
  if (!r) return;
  showAppModal({
    mode: 'prompt',
    title: 'UPDATE GRANTED CLUE',
    icon: '✏️',
    message: 'Update clue text for ' + r.name + ' (' + r.qLabel + '):',
    inputLabel: 'Clue Text:',
    defaultValue: r.hintText || '',
    confirmText: 'Save & Update',
    cancelText: 'Cancel',
    onConfirm: (newClue) => {
      if (newClue != null && newClue.trim() !== '') {
        r.hintText = newClue.trim();
        saveHintRequests(list);
        showToast('Updated clue for ' + r.name + '.');
        renderAdminHintConsole();
      }
    }
  });
}

// Student side: Dynamically update hint slot if admin grants hint
setInterval(() => {
  if (!S) return;
  if (S.round === 'R1') {
    renderCurrentHintBox('Round 1', 'R1_Q' + (S.r1.idx + 1), 'r1HintSlot');
  } else if (S.round === 'R2') {
    renderCurrentHintBox('Round 2', 'R2_P' + (S.r2.idx + 1), 'r2HintSlot');
  } else if (S.round === 'R3') {
    renderCurrentHintBox('Round 3', 'R3_Q' + (S.r3.idx + 1), 'r3HintSlot');
  }
}, 2500);


/* ============================================================
   VIDEO TUTORIAL BRIEFING ENGINE (Interactive Canvas + Video)
   ============================================================ */
let vState = {
  activeGame: 'threatgen',
  source: 'sim', // 'sim' | 'yt'
  playing: false,
  duration: 60, // seconds
  currentSec: 0,
  raf: 0,
  lastTs: 0
};

const V_CAPTIONS = {
  threatgen: [
    { start: 0, end: 14, title: "1. FACTIONS & OBJECTIVES", text: "Welcome Operative. ThreatGEN: Red vs. Blue is a turn-based cyber confrontation. Choose Blue (SecOps Defender) or Red (Cyber Adversary). Each turn you get 3 Action Points and $35,000 budget." },
    { start: 15, end: 29, title: "2. THE 3 SUBNETS", text: "The board models 3 zones: Zone A (Internet & DMZ Gateway), Zone B (Corporate IT, Workstations & AD Server), and Zone C (Industrial SCADA & Pipeline Valve)." },
    { start: 30, end: 44, title: "3. BLUE TEAM SECOPS", text: "Blue Team Tactics: Click any host to inspect. Run Deep Traffic Scan ($1.5k) to detect recon, Patch Vulnerabilities ($2k) to add +30% defense, or deploy EDR Sensors to block breaches." },
    { start: 45, end: 54, title: "4. RED TEAM ATTACK", text: "Red Team Tactics: Probe open ports, weaponize CVEs to spawn shells, pivot laterally through corporate switches, and extort ransom to grow your budget." },
    { start: 55, end: 60, title: "5. INDUSTRIAL VALVE & VICTORY", text: "Zone C Crown Jewel: The Pipeline Valve. Red wins by sabotaging the valve or taking 5+ hosts. Blue wins by maintaining hygiene & holding out for 15 turns!" }
  ],
  flip: [
    { start: 0, end: 30, title: "ENCRYPTION FLIP MATCH", text: "Flip matching cyber encryption symbols (Locks, Shields, Keys, Bugs, and Detectives). Clear all 8 pairs in the fewest moves while waiting!" },
    { start: 31, end: 60, title: "STRATEGY TIP", text: "Remember card locations as they flip. Matching pairs stay revealed. Use New Game to refresh anytime." }
  ],
  term: [
    { start: 0, end: 30, title: "HACK THE TERMINAL", text: "An encrypted military transmission was intercepted. Use Caesar cipher subtraction to decode the hidden cybersecurity term." },
    { start: 31, end: 60, title: "COMMANDS", text: "Commands: type 'hint' for a free clue or letter reveal, 'skip' to bypass, or enter the decrypted word to gain root access!" }
  ]
};

const YT_URLS = {
  threatgen: "https://www.youtube.com/embed/wzX_rC0W2kY?autoplay=1&mute=0",
  flip: "https://www.youtube.com/embed/dQw4w9WgXcQ",
  term: "https://www.youtube.com/embed/dQw4w9WgXcQ"
};

function openVideoTutorialModal(game){
  $('modalVideoTutorial').classList.add('active');
  selectVideoGame(game || 'threatgen');
  if (vState.source === 'sim') startVideoSimulation();
  SFX.success();
}

function closeVideoTutorialModal(){
  $('modalVideoTutorial').classList.remove('active');
  pauseVideoSimulation();
  const ifr = $('videoIframe');
  if (ifr) ifr.src = "";
}

function selectVideoGame(game){
  vState.activeGame = game;
  ['threatgen', 'flip', 'term'].forEach(g => {
    const b = $('vtab-' + g);
    if (b) b.classList.toggle('active', g === game);
  });
  vState.currentSec = 0;
  updateVideoCaptions();
  if (vState.source === 'yt') loadYtVideo();
  else restartVideo();
}

function switchVideoSource(src){
  vState.source = src;
  $('vsrcSim').classList.toggle('active', src === 'sim');
  $('vsrcYt').classList.toggle('active', src === 'yt');
  $('vsourceBadge').textContent = src === 'sim' ? 'OFFLINE ANIMATED' : 'ONLINE YOUTUBE';
  $('vframeSim').style.display = src === 'sim' ? 'flex' : 'none';
  $('vframeYt').style.display = src === 'yt' ? 'block' : 'none';
  
  if (src === 'yt') {
    pauseVideoSimulation();
    loadYtVideo();
  } else {
    const ifr = $('videoIframe');
    if (ifr) ifr.src = "";
    startVideoSimulation();
  }
}

function loadYtVideo(){
  const ifr = $('videoIframe');
  if (ifr) ifr.src = YT_URLS[vState.activeGame] || YT_URLS.threatgen;
}

function toggleVideoPlay(){
  if (vState.playing) pauseVideoSimulation();
  else startVideoSimulation();
}

function startVideoSimulation(){
  vState.playing = true;
  $('vPlayBtn').textContent = '⏸';
  vState.lastTs = performance.now();
  cancelAnimationFrame(vState.raf);
  vState.raf = requestAnimationFrame(videoLoop);
}

function pauseVideoSimulation(){
  vState.playing = false;
  $('vPlayBtn').textContent = '▶';
  cancelAnimationFrame(vState.raf);
}

function restartVideo(){
  vState.currentSec = 0;
  startVideoSimulation();
}

function seekVideo(e){
  const rect = e.currentTarget.getBoundingClientRect();
  const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
  vState.currentSec = ratio * vState.duration;
  updateVideoUI();
}

function jumpVideoChapter(sec){
  vState.currentSec = sec;
  updateVideoUI();
  if (!vState.playing) startVideoSimulation();
}

function videoLoop(ts){
  if (!vState.playing) return;
  const delta = (ts - vState.lastTs) / 1000;
  vState.lastTs = ts;
  vState.currentSec += delta;
  if (vState.currentSec >= vState.duration) vState.currentSec = 0; // loop
  
  renderVideoFrame(vState.currentSec);
  updateVideoUI();
  vState.raf = requestAnimationFrame(videoLoop);
}

function updateVideoUI(){
  const s = Math.floor(vState.currentSec);
  const m = Math.floor(s / 60), sec = s % 60;
  $('vTimeDisp').textContent = String(m).padStart(2,'0') + ':' + String(sec).padStart(2,'0') + ' / 01:00';
  const pct = (vState.currentSec / vState.duration) * 100;
  $('vProgressFill').style.width = pct + '%';
  updateVideoCaptions();

  // Highlight chapter
  const cIdx = vState.currentSec < 15 ? 0 : vState.currentSec < 30 ? 1 : vState.currentSec < 45 ? 2 : vState.currentSec < 55 ? 3 : 4;
  for(let i=0; i<5; i++){
    const el = $('vchap' + i);
    if (el) el.classList.toggle('active', i === cIdx);
  }
}

function updateVideoCaptions(){
  const list = V_CAPTIONS[vState.activeGame] || V_CAPTIONS.threatgen;
  const match = list.find(c => vState.currentSec >= c.start && vState.currentSec <= c.end) || list[0];
  if (match) {
    $('videoSubtitles').innerHTML = '<b>[' + match.title + ']</b> &nbsp;' + escapeHtml(match.text);
  }
}

function renderVideoFrame(time){
  const cv = $('videoCanvas');
  if (!cv) return;
  const ctx = cv.getContext('2d');
  const w = cv.width, h = cv.height;

  // Background
  ctx.fillStyle = '#040912'; ctx.fillRect(0, 0, w, h);

  // High-tech cyber grid
  ctx.strokeStyle = 'rgba(56,189,248,0.06)'; ctx.lineWidth = 1;
  for(let x=0; x<w; x+=30){ ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,h); ctx.stroke(); }
  for(let y=0; y<h; y+=30){ ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(w,y); ctx.stroke(); }

  // Draw 3 Subnet Zones
  // Zone A: DMZ (Left Top)
  ctx.fillStyle = 'rgba(14,31,54,0.6)'; ctx.strokeStyle = 'rgba(56,189,248,0.4)'; ctx.lineWidth = 1.5;
  ctx.fillRect(30, 40, 220, 160); ctx.strokeRect(30, 40, 220, 160);
  ctx.fillStyle = '#38bdf8'; ctx.font = 'bold 11px Orbitron, sans-serif';
  ctx.fillText('ZONE A: INTERNET DMZ', 40, 60);

  // Zone B: Corporate IT (Right Top)
  ctx.fillStyle = 'rgba(23,20,45,0.6)'; ctx.strokeStyle = 'rgba(168,85,247,0.4)';
  ctx.fillRect(270, 40, 230, 160); ctx.strokeRect(270, 40, 230, 160);
  ctx.fillStyle = '#c084fc'; ctx.fillText('ZONE B: CORPORATE IT', 280, 60);

  // Zone C: Industrial OT (Full Bottom)
  ctx.fillStyle = 'rgba(44,30,16,0.65)'; ctx.strokeStyle = 'rgba(242,178,59,0.45)';
  ctx.fillRect(30, 220, 470, 150); ctx.strokeRect(30, 220, 470, 150);
  ctx.fillStyle = '#fbbf24'; ctx.fillText('ZONE C: INDUSTRIAL SCADA (OT)', 40, 240);

  // Circuit Bus Lines
  const pulse = (Math.sin(time * 4) + 1) / 2;
  ctx.strokeStyle = `rgba(34,197,94,${0.3 + pulse * 0.4})`; ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(140, 120); ctx.lineTo(140, 180); ctx.lineTo(380, 180); ctx.lineTo(380, 120);
  ctx.moveTo(380, 180); ctx.lineTo(380, 290); ctx.lineTo(440, 290);
  ctx.stroke();

  // Nodes
  drawMockNode(ctx, 80, 110, '🧱', 'Gateway', '#38bdf8');
  drawMockNode(ctx, 170, 110, '🌐', 'Web Portal', '#38bdf8');
  drawMockNode(ctx, 330, 110, '💻', 'Workstation', time > 45 ? '#fb4570' : '#c084fc');
  drawMockNode(ctx, 430, 110, '🖥️', 'AD Server', '#c084fc');
  drawMockNode(ctx, 110, 290, '📟', 'SCADA Host', '#fbbf24');
  drawMockNode(ctx, 270, 290, '🎛️', 'HMI Panel', '#fbbf24');
  drawMockNode(ctx, 420, 290, '🚰', 'Pipeline Valve', time > 55 ? '#fb4570' : '#4ade80');

  // Simulated Operator Pointer / Cursor
  let curX = 140, curY = 120, label = "SCANNING";
  if (time < 15) { curX = 80 + Math.sin(time)*15; curY = 110 + Math.cos(time)*10; label = "INSPECTING GATEWAY"; }
  else if (time < 30) { curX = 330 + Math.sin(time)*10; curY = 110; label = "CHECKING WORKSTATION"; }
  else if (time < 45) { curX = 170; curY = 110; label = "APPLYING PATCH (+30% DEF)"; }
  else if (time < 55) { curX = 330; curY = 110; label = "BREACH DETECTED - ISOLATING"; }
  else { curX = 420; curY = 290; label = "PROTECTING PIPELINE VALVE"; }

  // Draw Cursor
  ctx.fillStyle = '#38bdf8'; ctx.beginPath();
  ctx.arc(curX, curY, 8 + pulse * 4, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = 'rgba(56,189,248,0.2)'; ctx.fill();

  // Cursor Tooltip Label
  ctx.fillStyle = 'rgba(2,6,23,0.9)'; ctx.strokeStyle = '#38bdf8'; ctx.lineWidth = 1;
  ctx.fillRect(curX + 14, curY - 14, ctx.measureText(label).width + 16, 22);
  ctx.strokeRect(curX + 14, curY - 14, ctx.measureText(label).width + 16, 22);
  ctx.fillStyle = '#fff'; ctx.font = '9.5px ui-monospace, monospace';
  ctx.fillText(label, curX + 22, curY + 1);

  // Right Side Tactical HUD Mockup
  ctx.fillStyle = 'rgba(15,23,42,0.85)'; ctx.strokeStyle = '#1e3a5f';
  ctx.fillRect(520, 40, 250, 330); ctx.strokeRect(520, 40, 250, 330);

  ctx.fillStyle = '#38bdf8'; ctx.font = 'bold 11px Orbitron, sans-serif';
  ctx.fillText('TACTICAL COMMAND DECK', 535, 65);

  ctx.fillStyle = '#94a3b8'; ctx.font = '10px ui-monospace, monospace';
  ctx.fillText('BUDGET: $35,000', 535, 90);
  ctx.fillText('OPERATIVES: 3 / 3 AP', 535, 108);
  ctx.fillText('TURN: 1 / 15', 535, 126);

  // Action Cards Mockup
  drawMockAct(ctx, 535, 145, '📡 Deep Traffic Scan', '$1,500 · 1 AP', '#38bdf8');
  drawMockAct(ctx, 535, 195, '🛡️ Patch Vulnerabilities', '$2,000 · 1 AP', '#4ade80');
  drawMockAct(ctx, 535, 245, '🚨 Deploy EDR Sensor', '$3,000 · 1 AP', '#38bdf8');
  drawMockAct(ctx, 535, 295, '⚡ Air-Gap Subnet', '$4,500 · 2 AP', '#fbbf24');
}

function drawMockNode(ctx, x, y, icon, name, col){
  ctx.fillStyle = 'rgba(9,19,34,0.9)'; ctx.strokeStyle = col; ctx.lineWidth = 1.5;
  ctx.fillRect(x-28, y-22, 56, 44); ctx.strokeRect(x-28, y-22, 56, 44);
  ctx.font = '16px sans-serif'; ctx.fillText(icon, x-8, y-2);
  ctx.fillStyle = '#fff'; ctx.font = '8px ui-monospace, monospace';
  ctx.textAlign = 'center'; ctx.fillText(name, x, y+15); ctx.textAlign = 'left';
}

function drawMockAct(ctx, x, y, title, cost, col){
  ctx.fillStyle = 'rgba(4,9,18,0.85)'; ctx.strokeStyle = col; ctx.lineWidth = 1;
  ctx.fillRect(x, y, 220, 40); ctx.strokeRect(x, y, 220, 40);
  ctx.fillStyle = '#fff'; ctx.font = 'bold 9.5px sans-serif';
  ctx.fillText(title, x+8, y+16);
  ctx.fillStyle = '#94a3b8'; ctx.font = '8.5px ui-monospace, monospace';
  ctx.fillText(cost, x+8, y+30);
}


/* ============================================================
   ROUND 3 — THE FINAL INVESTIGATION (evidence cards + stepper)
   ============================================================ */
function initRound3UI(){
  $('r3CaseTitle').textContent = R3.caseTitle;
  $('r3CaseIntro').textContent = R3.caseIntro;
  renderEvidence(); renderR3Stepper(); renderR3Field();
}
function renderEvidence(){
  $('evidenceGrid').innerHTML = R3.evidence.map((e, i) => {
    const flagged = S.r3.flags.includes(e.id);
    return '<div class="ev-card ' + (flagged ? 'flagged' : '') + '" id="evc-' + e.id + '">' +
      '<div class="ev-head" onclick="toggleEvidence(\'' + e.id + '\')">' +
        '<span class="ev-num">EV-' + String(i + 1).padStart(2, '0') + '</span><span class="ev-title">' + escapeHtml(e.label) + '</span>' +
        '<button class="ev-flag ' + (flagged ? 'on' : '') + '" title="Flag as suspicious" aria-label="Flag as suspicious" onclick="event.stopPropagation();flagEvidence(\'' + e.id + '\')">' +
          '<i class="ico"><svg viewBox="0 0 448 512" aria-hidden="true"><use href="#i-flag"/></svg></i></button>' +
        '<i class="ico ev-chev"><svg viewBox="0 0 512 512" aria-hidden="true"><use href="#i-chevron-down"/></svg></i>' +
      '</div>' +
      '<div class="ev-body"><div class="mono-box">' + e.lines.map(escapeHtml).join('<br>') + '</div>' +
      (e.note ? '<p class="ev-note">' + escapeHtml(e.note) + '</p>' : '') + '</div></div>';
  }).join('');
}
function toggleEvidence(id){ $('evc-' + id).classList.toggle('collapsed'); }
function flagEvidence(id){
  if (!S || S.is_locked) return;
  const f = S.r3.flags, i = f.indexOf(id);
  if (i >= 0) f.splice(i, 1); else f.push(id);
  save();
  const on = f.includes(id);
  $('evc-' + id).classList.toggle('flagged', on);
  $('evc-' + id).querySelector('.ev-flag').classList.toggle('on', on);
}
function renderR3Stepper(){
  $('r3Stepper').innerHTML = R3.questions.map((f, i) =>
    '<div class="step-dot ' + (i === S.r3.idx ? 'current' : '') + ' ' + (String(S.r3.answers[i]).trim() ? 'answered' : '') + '" onclick="jumpR3(' + i + ')">Q' + (i + 1) + '</div>').join('');
}
function jumpR3(i){ if (!S || S.is_locked) return; S.r3.idx = i; save(); renderR3Stepper(); renderR3Field(); }
function renderR3Field(){
  const f = R3.questions[S.r3.idx];
  $('r3FieldSlot').innerHTML = '<div class="field"><label>' + escapeHtml(f.label) + '</label>' +
    '<input type="text" id="r3Input" autocomplete="off" value="' + escapeHtml(S.r3.answers[S.r3.idx]) + '" oninput="r3Type(this.value)"></div>';
  const last = S.r3.idx === R3.questions.length - 1;
  $('r3Prev').style.display = S.r3.idx === 0 ? 'none' : 'inline-flex';
  $('r3Next').style.display = last ? 'none' : 'inline-flex';
  $('r3Submit').style.display = last ? 'inline-flex' : 'none';
  renderCurrentHintBox('Round 3', 'R3_Q' + (S.r3.idx + 1), 'r3HintSlot');           // submit ONLY on the final question
}
function r3Type(v){
  if (!S || S.is_locked) return;
  S.r3.answers[S.r3.idx] = v; save(); updateRank();
  const dot = $('r3Stepper').children[S.r3.idx];
  if (dot) dot.classList.toggle('answered', v.trim() !== '');
}
function r3Nav(dir){
  if (!S || S.is_locked) return;
  S.r3.idx = Math.min(Math.max(S.r3.idx + dir, 0), R3.questions.length - 1); save();
  renderR3Stepper(); renderR3Field();
}
function gradeRound3(spread){
  let c = 0; R3.questions.forEach((q, i) => { if (matchesAny(S.r3.answers[i], q.answers)) c++; });
  S.scores.r3 = c; S.r3.submitted = true; S.audit_sheet = generateParticipantAuditSheet(S); save();
  // the final FINISHED packet is sent by finishCompetition()
}

/* ============================================================
   FINISH  — final sync, then clear the saved session
   ============================================================ */
function finishCompetition(expired){
  stopMasterTimer();
  gameActive = false;
  if (typeof participantHeartbeatIv !== 'undefined' && participantHeartbeatIv) clearInterval(participantHeartbeatIv);

  updateRank(true);
  const rankName = RANKS[rankFor(countCompleted())].name;
  const s = S.scores;
  const totalScore = (s.r1 || 0) + (s.r2 || 0) + (s.r3 || 0) + (s.bonus || 0);

  $('resR1').textContent = s.r1;
  $('resR2').textContent = s.r2;
  $('resR3').textContent = s.r3;
  $('resultsScore').textContent = totalScore;
  if ($('resBonus')) $('resBonus').textContent = s.bonus || 0;
  $('resRank').textContent = 'FINAL RANK · ' + rankName.toUpperCase();

  // Calculate duration
  const startTime = S.startedAt || S.savedAt || (Date.now() - 1800000);
  const durationSec = Math.max(1, Math.round((Date.now() - startTime) / 1000));
  S.durationSeconds = durationSec;
  S.completedAt = Date.now();
  S.status = 'COMPLETED';
  S.audit_sheet = generateParticipantAuditSheet(S);

  // Update live roster with COMPLETED state
  const roster = getLiveRoster();
  if (roster && S && S.sid) {
    const existing = roster[S.sid] || {};
    const hist = existing.history || [];
    hist.push({ time: Date.now(), desc: '🏁 Final exam submitted and verified. Total Score: ' + totalScore + ' pts (' + fmtTime(durationSec) + ')' });
    roster[S.sid] = {
      ...existing,
      sid: S.sid,
      name: S.player.name,
      dept: S.player.dept,
      year: S.player.year,
      status: 'COMPLETED',
      currentLocation: '🏁 Exam Completed & Submitted',
      qTitle: 'Final Submission Verified · Total Score: ' + totalScore + ' pts',
      score: totalScore,
      r1: s.r1 || 0,
      r2: s.r2 || 0,
      r3: s.r3 || 0,
      bonus: s.bonus || 0,
      durationSeconds: durationSec,
      completedAt: S.completedAt,
      completedTimeStr: fmtTime(durationSec),
      violations: S.strikes_count || S.violations || 0,
      lifetime_violations: S.lifetime_violations || S.totalViolations || 0,
      is_locked: false,
      isTabHidden: false,
      lastSeen: Date.now(),
      isSim: false,
      history: hist,
      audit_sheet: S.audit_sheet
    };
    saveLiveRoster(roster);
  }

  // Push to server
  syncProgress(expired ? 20000 : 8000, 4, 'FINISHED');

  // Emit cross-tab leaderboard update
  broadcastLeaderboardUpdate(S.sid);

  clearSession();                          // ONLY here (or via Admin) is the saved session removed
  SFX.round();
  go('screen-results');
}

/* ============================================================
   BOOT — restore a saved session if there is one
   ============================================================ */
function restoreSession(){
  const o = loadSession();
  if (!o) { if (store.get(STORAGE_KEY)) store.del(STORAGE_KEY); return false; }
  S = o; sessionCleared = false;
  setHeader(); updateRank(true);
  const welcome = 'Session restored — welcome back, ' + S.player.name + '. Your timer kept running.';
  switch (S.round) {
    case 'INSTR':
      if (Date.now() >= S.readEndsAt) beginCountdown();
      else { showInstructions(S.instrRound); runReadTimer(); }
      break;
    case 'COUNTDOWN': beginCountdown(); break;
    case 'R1': case 'R2': case 'R3': {
      const n = Number(S.round[1]);
      if (remainingNow() <= 0) handleRoundExpire(n);
      else { showRound(n); gameActive = true; runMasterTimer(() => handleRoundExpire(n)); }
      break;
    }
    case 'WAITING': {
      const j = S.waiting.just;
      if (remainingNow() <= 0) handleRoundExpire(j);
      else { showWaiting(); runMasterTimer(() => handleRoundExpire(j)); }
      break;
    }
  }
  showToast(welcome);
  return true;
}
syncMuteIcon();
restoreSession();

