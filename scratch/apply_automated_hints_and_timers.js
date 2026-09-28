const fs = require('fs');
const path = require('path');

const targetPath = path.join(__dirname, '..', 'index.html');
let content = fs.readFileSync(targetPath, 'utf8');

console.log('Original content length:', content.length);

// 1. Header Hint Wallet Pill in HTML
const oldHeaderPill = `<div class="status-pill">
            <span class="ping"></span>
            <span id="playerTag">SYSTEM ONLINE • LIVE PORTAL</span>
          </div>`;

const newHeaderPill = `<div class="status-pill hint-wallet-pill" id="headerHintWallet" style="display:none; background:rgba(245,158,11,0.12); border:1px solid rgba(245,158,11,0.4); color:#fbbf24; font-family:var(--font-mono); font-weight:700; font-size:12px; padding:3px 10px; border-radius:20px;">
            <span>🪙</span> <span id="headerHintPoints">10 Hint Pts</span>
          </div>
          <div class="status-pill">
            <span class="ping"></span>
            <span id="playerTag">SYSTEM ONLINE • LIVE PORTAL</span>
          </div>`;

if (content.includes(oldHeaderPill)) {
  content = content.replace(oldHeaderPill, newHeaderPill);
  console.log('✔ Replaced header pill with hint wallet badge');
} else {
  console.warn('⚠ Could not find exact oldHeaderPill match');
}

// 2. Round Timers in HTML
// Round 2 timer: 30:00 -> 45:00
const oldR2Timer = `<div class="timer roundTimerDisplay" id="r2Timer">30:00</div>`;
const newR2Timer = `<div class="timer roundTimerDisplay" id="r2Timer">45:00</div>`;
if (content.includes(oldR2Timer)) {
  content = content.replace(oldR2Timer, newR2Timer);
  console.log('✔ Updated r2Timer to 45:00');
}

// Round 3 timer: 60:00 -> 45:00
const oldR3Timer = `<div class="timer roundTimerDisplay" id="r3Timer">60:00</div>`;
const newR3Timer = `<div class="timer roundTimerDisplay" id="r3Timer">45:00</div>`;
if (content.includes(oldR3Timer)) {
  content = content.replace(oldR3Timer, newR3Timer);
  console.log('✔ Updated r3Timer to 45:00');
}

// 3. Modal Clue Confirm Title & Button
const oldClueModalHeader = `<span>💡</span> REQUEST ADMIN CLUE`;
const newClueModalHeader = `<span>💡</span> INSTANT CLUE REVEAL · HINT WALLET`;
if (content.includes(oldClueModalHeader)) {
  content = content.replace(oldClueModalHeader, newClueModalHeader);
  console.log('✔ Updated modalClueConfirm header');
}

const oldClueModalBtn = `<button class="btn solid" id="clueConfirmSubmitBtn"
          style="flex:1; background:linear-gradient(135deg,#0284c7,#0369a1); border-color:#38bdf8;"
          onclick="confirmAndSendClueRequest()">Confirm &amp; Deduct 10 Pts</button>`;
const newClueModalBtn = `<button class="btn solid" id="clueConfirmSubmitBtn"
          style="flex:1; background:linear-gradient(135deg,#0284c7,#0369a1); border-color:#38bdf8;"
          onclick="confirmAndSendClueRequest()">Instant Unlock (-10 Pts)</button>`;
if (content.includes(oldClueModalBtn)) {
  content = content.replace(oldClueModalBtn, newClueModalBtn);
  console.log('✔ Updated modalClueConfirm button text');
}

// 4. Admin Clues Tab Header & KPI Chip
const oldAtabHints = `<button class="admin-tab-btn" id="atab-hints" onclick="adminSwitchTab('hints')">
                  <span>🙋 Clue Requests</span>
                  <span class="admin-tab-badge warn" id="atabBadgeHints" style="display: none;">0</span>
                </button>`;
const newAtabHints = `<button class="admin-tab-btn" id="atab-hints" onclick="adminSwitchTab('hints')">
                  <span>⚡ Automated Hint Audit</span>
                  <span class="admin-tab-badge info" id="atabBadgeHints" style="display: none;">0</span>
                </button>`;
if (content.includes(oldAtabHints)) {
  content = content.replace(oldAtabHints, newAtabHints);
  console.log('✔ Updated atab-hints button text');
}

const oldKpiHintsChip = `<div class="admin-kpi-chip kpi-hints" id="kpiPendingHintsChip"
                  title="Pending clue requests awaiting dispatch">
                  <span>🙋</span>
                  <span class="kpi-chip-lbl">Pending Clues:</span>
                  <b class="kpi-chip-val" id="kpiPendingHints">0 Pending</b>
                </div>`;
const newKpiHintsChip = `<div class="admin-kpi-chip kpi-hints" id="kpiPendingHintsChip"
                  title="Automated hints unlocked by students (Self-Service)">
                  <span>💡</span>
                  <span class="kpi-chip-lbl">Hints Used:</span>
                  <b class="kpi-chip-val" id="kpiPendingHints">0 Unlocked</b>
                </div>`;
if (content.includes(oldKpiHintsChip)) {
  content = content.replace(oldKpiHintsChip, newKpiHintsChip);
  console.log('✔ Updated kpiPendingHintsChip');
}

const oldApaneTitle = `<span>Live Student Hint Requests &amp; Access Control (-10 Trust Points Per Clue)</span>`;
const newApaneTitle = `<span>Automated Student Hint Wallet &amp; Clue Access Audit (Instant Unlock · 10 Pts Per Clue)</span>`;
if (content.includes(oldApaneTitle)) {
  content = content.replace(oldApaneTitle, newApaneTitle);
  console.log('✔ Updated apane-hints title');
}

// 5. ROUND_SECONDS Definition (30m, 45m, 45m)
const oldRoundSeconds = `const ROUND_SECONDS = { 1: 30 * 60, 2: 30 * 60, 3: 60 * 60 };`;
const newRoundSeconds = `const ROUND_SECONDS = { 1: 30 * 60, 2: 45 * 60, 3: 45 * 60 };`;
if (content.includes(oldRoundSeconds)) {
  content = content.replace(oldRoundSeconds, newRoundSeconds);
  console.log('✔ Updated ROUND_SECONDS to { 1: 30*60, 2: 45*60, 3: 45*60 }');
}

// 6. Round Rules (30m, 45m, 45m)
const oldR2Rule = `'The round timer runs for 30 minutes.',`;
const newR2Rule = `'The round timer runs for 45 minutes.',
          'Hint Wallet: Instant clue reveal available for 10 hint points. Zero admin approval needed.',`;
// Be careful to replace only in roundMeta
const roundMetaStart = content.indexOf('const roundMeta = {');
const roundMetaEnd = content.indexOf('let readIv = null;', roundMetaStart);
if (roundMetaStart !== -1 && roundMetaEnd !== -1) {
  let metaChunk = content.slice(roundMetaStart, roundMetaEnd);
  metaChunk = metaChunk.replace(`'The round timer runs for 30 minutes.',`, `'The round timer runs for 30 minutes.',
          'Hint Wallet: You begin with 10 Hint Points. Unlocking a clue deducts 10 points instantly with zero admin waiting.',`);
  metaChunk = metaChunk.replace(`'The round timer runs for 30 minutes.',`, `'The round timer runs for 45 minutes.',
          'Hint Wallet: Instant clue reveal available for 10 hint points. Zero admin approval needed.',`);
  metaChunk = metaChunk.replace(`'You have 60 minutes for this final round.',`, `'You have 45 minutes for this final round.',
          'Hint Wallet: Instant forensic clues available for 10 hint points.',`);
  content = content.slice(0, roundMetaStart) + metaChunk + content.slice(roundMetaEnd);
  console.log('✔ Updated roundMeta rules');
}

// 7. Update blankSession and loadSession
const oldBlankSession = `    function blankSession(player) {
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
        r2: { idx: 0, answers: new Array(R2.length).fill(''), submitted: false },
        r3: { idx: 0, answers: new Array(R3.questions.length).fill(''), submitted: false, flags: [] },
        startedAt: Date.now(), savedAt: Date.now()
      };
    }`;

const newBlankSession = `    function blankSession(player) {
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
        roundRemaining: { r1: null, r2: null, r3: null },
        hintWallet: 10,                 // 10 initial Hint Points (Automated Hint System)
        hintsUsed: 0,
        startedAt: Date.now(), completedAt: null, durationSeconds: 0, status: "IN_PROGRESS", violations: 0, totalViolations: 0, strikes_count: 0, lifetime_violations: 0, is_locked: false, lock_reason: "", pardon_history: [],
        seq: 0, rank: 0,
        scores: { r1: 0, r2: 0, r3: 0, bonus: 0 },
        r1: { idx: 0, answers: new Array(R1.length).fill(null), submitted: false },
        r2: { idx: 0, answers: new Array(R2.length).fill(''), submitted: false },
        r3: { idx: 0, answers: new Array(R3.questions.length).fill(''), submitted: false, flags: [] },
        waitingBonus: { threatgen: 0, flip: 0, term: 0 },
        startedAt: Date.now(), savedAt: Date.now()
      };
    }`;

if (content.includes(oldBlankSession)) {
  content = content.replace(oldBlankSession, newBlankSession);
  console.log('✔ Updated blankSession with hintWallet: 10, hintsUsed: 0, roundRemaining');
} else {
  console.warn('⚠ Could not find exact oldBlankSession');
}

// 8. Update loadSession to hydrate hintWallet and roundRemaining
const oldLoadSession = `        if (!o || o.v !== 1 || !o.player || !o.player.name || !o.sid) return null;
        if (!['INSTR', 'COUNTDOWN', 'R1', 'R2', 'R3', 'WAITING'].includes(o.round)) return null;
        if (Date.now() - (o.savedAt || 0) > SESSION_TTL_MS) return null;
        if (!o.r1 || !o.r2 || !o.r3 || !o.scores) return null;
        if (o.round === 'WAITING' && (!o.waiting || !o.waiting.just)) return null;
        if (o.r1.answers.length !== R1.length || o.r2.answers.length !== R2.length || o.r3.answers.length !== R3.questions.length) return null;
        if (!Array.isArray(o.r3.flags)) o.r3.flags = [];
        return o;`;

const newLoadSession = `        if (!o || o.v !== 1 || !o.player || !o.player.name || !o.sid) return null;
        if (!['INSTR', 'COUNTDOWN', 'R1', 'R2', 'R3', 'WAITING'].includes(o.round)) return null;
        if (Date.now() - (o.savedAt || 0) > SESSION_TTL_MS) return null;
        if (!o.r1 || !o.r2 || !o.r3 || !o.scores) return null;
        if (o.round === 'WAITING' && (!o.waiting || !o.waiting.just)) return null;
        if (o.r1.answers.length !== R1.length || o.r2.answers.length !== R2.length || o.r3.answers.length !== R3.questions.length) return null;
        if (!Array.isArray(o.r3.flags)) o.r3.flags = [];
        if (o.hintWallet == null) o.hintWallet = 10;
        if (o.hintsUsed == null) o.hintsUsed = 0;
        if (!o.roundRemaining) o.roundRemaining = { r1: null, r2: null, r3: null };
        if (!o.scores.bonus) o.scores.bonus = 0;
        if (!o.waitingBonus) o.waitingBonus = { threatgen: 0, flip: 0, term: 0 };
        return o;`;

if (content.includes(oldLoadSession)) {
  content = content.replace(oldLoadSession, newLoadSession);
  console.log('✔ Updated loadSession with hintWallet and roundRemaining hydration');
}

// 9. Update setHeader and add updateHintWalletDisplay
const oldSetHeader = `    function setHeader() {
      const p = S.player;
      $('playerTag').textContent = p.name + ' · ' + p.dept + ' · Yr ' + p.year;
      $('rankBadge').classList.add('show');
    }`;

const newSetHeader = `    function updateHintWalletDisplay() {
      if (!S) return;
      const pts = S.hintWallet != null ? S.hintWallet : 10;
      const el = $('headerHintPoints');
      const wrap = $('headerHintWallet');
      if (el) el.textContent = pts + ' Hint Pts';
      if (wrap) wrap.style.display = 'inline-flex';
    }
    function setHeader() {
      const p = S.player;
      $('playerTag').textContent = p.name + ' · ' + p.dept + ' · Yr ' + p.year;
      $('rankBadge').classList.add('show');
      updateHintWalletDisplay();
    }`;

if (content.includes(oldSetHeader)) {
  content = content.replace(oldSetHeader, newSetHeader);
  console.log('✔ Updated setHeader and added updateHintWalletDisplay');
}

// 10. Update payload(status) to sync hintWallet, hintsUsed, remainingSeconds, and roundRemaining
const oldPayload = `    function payload(status) {
      S.seq = (S.seq || 0) + 1; save();
      return {
        action: 'sync', key: API_KEY, sid: S.sid, seq: S.seq, name: S.player.name, dept: S.player.dept, year: S.player.year,
        r1: S.scores.r1, r2: S.scores.r2, r3: S.scores.r3, round: S.round, status: status || 'IN_PROGRESS',
        violations: S.totalViolations || 0, ts: Date.now()
      };
    }`;

const newPayload = `    function payload(status) {
      S.seq = (S.seq || 0) + 1; save();
      const curRemaining = remainingNow();
      const hintsCount = S.hintsUsed != null ? S.hintsUsed : (getHintRequests().filter(r => r.sid === S.sid && r.status === 'GRANTED').length);
      const hintPoints = S.hintWallet != null ? S.hintWallet : 10;
      return {
        action: 'sync', key: API_KEY, sid: S.sid, seq: S.seq, name: S.player.name, dept: S.player.dept, year: S.player.year,
        r1: S.scores.r1, r2: S.scores.r2, r3: S.scores.r3, bonus: S.scores.bonus || 0,
        score: (S.scores.r1 || 0) + (S.scores.r2 || 0) + (S.scores.r3 || 0) + (S.scores.bonus || 0),
        total: (S.scores.r1 || 0) + (S.scores.r2 || 0) + (S.scores.r3 || 0) + (S.scores.bonus || 0),
        round: S.round, status: status || (S.completedAt ? 'FINISHED' : 'IN_PROGRESS'),
        violations: S.totalViolations || 0, strikes: S.strikes_count || S.violations || 0,
        remainingSeconds: curRemaining,
        remainingTime: fmtTime(curRemaining),
        roundRemaining: S.roundRemaining || {},
        r1Remaining: S.roundRemaining ? S.roundRemaining.r1 : null,
        r2Remaining: S.roundRemaining ? S.roundRemaining.r2 : null,
        r3Remaining: S.roundRemaining ? S.roundRemaining.r3 : null,
        hintsCount: hintsCount,
        hintsUsed: hintsCount,
        hintPoints: hintPoints,
        hintWallet: hintPoints,
        durationSeconds: S.durationSeconds || Math.round((Date.now() - (S.startedAt || Date.now())) / 1000),
        ts: Date.now()
      };
    }`;

if (content.includes(oldPayload)) {
  content = content.replace(oldPayload, newPayload);
  console.log('✔ Updated payload() with hint wallet and round timing metrics');
}

// 11. Update handleRoundExpire(n) and finalizeRound(n)
const oldHandleRoundExpire = `    function handleRoundExpire(n) {
      gameActive = false;
      const spread = 20000;                       // everyone expires together -> spread the DB writes
      SFX.round();
      if (n === 1) { if (!S.r1.submitted) { showToast('Time is up — Round 1 auto-submitted.'); gradeRound1(spread); } startRoundFlow(2); }
      else if (n === 2) { if (!S.r2.submitted) { showToast('Time is up — Round 2 auto-submitted.'); gradeRound2(spread); } startRoundFlow(3); }
      else { if (!S.r3.submitted) { showToast('Time is up — final report auto-submitted.'); gradeRound3(spread); } finishCompetition(true); }
    }`;

const newHandleRoundExpire = `    function handleRoundExpire(n) {
      gameActive = false;
      const spread = 20000;                       // everyone expires together -> spread the DB writes
      SFX.round();
      if (!S.roundRemaining) S.roundRemaining = {};
      S.roundRemaining['r' + n] = 0;
      save();
      if (n === 1) {
        if (!S.r1.submitted) { gradeRound1(spread); }
        showToast('⏰ Round 1 time expired! Answers auto-submitted. Advancing to Round 2...');
        syncProgress(1500, 3, 'R1_EXPIRED');
        startRoundFlow(2);
      } else if (n === 2) {
        if (!S.r2.submitted) { gradeRound2(spread); }
        showToast('⏰ Round 2 time expired! Answers auto-submitted. Advancing to Round 3...');
        syncProgress(1500, 3, 'R2_EXPIRED');
        startRoundFlow(3);
      } else {
        if (!S.r3.submitted) { gradeRound3(spread); }
        showToast('⏰ Final Investigation time expired! Answers auto-submitted.');
        syncProgress(1500, 4, 'FINISHED');
        finishCompetition(true);
      }
    }`;

if (content.includes(oldHandleRoundExpire)) {
  content = content.replace(oldHandleRoundExpire, newHandleRoundExpire);
  console.log('✔ Updated handleRoundExpire with strict round transitions and backend sync');
}

// 12. Update finalizeRound(n) to store roundRemaining
const oldFinalizeRound = `    function finalizeRound(n) {
      if (!S) return;
      if (n === 1) { if (S.r1.submitted) return; gradeRound1(); SFX.success(); enterWaitingRoom(1, 2); }
      else if (n === 2) { if (S.r2.submitted) return; gradeRound2(); SFX.success(); enterWaitingRoom(2, 3); }
      else { if (S.r3.submitted) return; gradeRound3(8000); finishCompetition(false); }
    }`;

const newFinalizeRound = `    function finalizeRound(n) {
      if (!S) return;
      if (!S.roundRemaining) S.roundRemaining = {};
      S.roundRemaining['r' + n] = Math.max(0, S.remainingSeconds || remainingNow());
      save();
      if (n === 1) { if (S.r1.submitted) return; gradeRound1(); SFX.success(); syncProgress(1000, 3, 'R1_COMPLETED'); enterWaitingRoom(1, 2); }
      else if (n === 2) { if (S.r2.submitted) return; gradeRound2(); SFX.success(); syncProgress(1000, 3, 'R2_COMPLETED'); enterWaitingRoom(2, 3); }
      else { if (S.r3.submitted) return; gradeRound3(8000); syncProgress(2000, 4, 'FINISHED'); finishCompetition(false); }
    }`;

if (content.includes(oldFinalizeRound)) {
  content = content.replace(oldFinalizeRound, newFinalizeRound);
  console.log('✔ Updated finalizeRound with roundRemaining persistence');
}

// 13. Update awardWaitingBonus to award bonus hint points up to 50 cap without admin approval
const oldAwardWaitingBonus = `      const ptsToAdd = Math.min(10, 50 - curEarned);
      S.waitingBonus[gameId] = curEarned + ptsToAdd;
      S.scores.bonus = (S.scores.bonus || 0) + ptsToAdd;
      save();
      updateRank();
      broadcastParticipantHeartbeat();
      updateWaitingBonusDisplay();`;

const newAwardWaitingBonus = `      const ptsToAdd = Math.min(10, 50 - curEarned);
      S.waitingBonus[gameId] = curEarned + ptsToAdd;
      S.scores.bonus = (S.scores.bonus || 0) + ptsToAdd;
      if (S.hintWallet == null) S.hintWallet = 10;
      S.hintWallet = Math.min(50, S.hintWallet + ptsToAdd);
      save();
      updateRank();
      updateHintWalletDisplay();
      broadcastParticipantHeartbeat();
      updateWaitingBonusDisplay();`;

if (content.includes(oldAwardWaitingBonus)) {
  content = content.replace(oldAwardWaitingBonus, newAwardWaitingBonus);
  console.log('✔ Updated awardWaitingBonus to automatically add hint points up to 50 cap');
}

// 14. Update broadcastParticipantHeartbeat telemetry
const oldHeartbeatBonus = `        score: (S.scores.r1 || 0) + (S.scores.r2 || 0) + (S.scores.r3 || 0) + (S.scores.bonus || 0),
        r1: S.scores.r1 || 0,
        r2: S.scores.r2 || 0,
        r3: S.scores.r3 || 0,
        bonus: S.scores.bonus || 0,`;

const newHeartbeatBonus = `        score: (S.scores.r1 || 0) + (S.scores.r2 || 0) + (S.scores.r3 || 0) + (S.scores.bonus || 0),
        r1: S.scores.r1 || 0,
        r2: S.scores.r2 || 0,
        r3: S.scores.r3 || 0,
        bonus: S.scores.bonus || 0,
        hintWallet: S.hintWallet != null ? S.hintWallet : 10,
        hintsUsed: S.hintsUsed || (getHintRequests().filter(r => r.sid === S.sid && r.status === 'GRANTED').length),
        remainingSeconds: remainingNow(),
        remainingTime: fmtTime(remainingNow()),
        roundRemaining: S.roundRemaining || {},`;

if (content.includes(oldHeartbeatBonus)) {
  content = content.replace(oldHeartbeatBonus, newHeartbeatBonus);
  console.log('✔ Updated broadcastParticipantHeartbeat telemetry');
}

// 15. Update renderAdminProctorConsole KPI and badge counters
const oldAdminProctorKpi = `      const pendingHintsCount = hints.filter(h => h.status === 'PENDING').length;
      const topScore = students.reduce((max, s) => Math.max(max, s.score ?? 0), 0);

      if ($('kpiActiveStudents')) $('kpiActiveStudents').textContent = activeStudentsCount + ' Active';
      if ($('kpiViolationsCount')) $('kpiViolationsCount').textContent = totalViolations + ' Strike' + (totalViolations === 1 ? '' : 's');
      if ($('kpiPendingHints')) $('kpiPendingHints').textContent = pendingHintsCount + ' Pending';
      if ($('kpiPendingHintsChip')) $('kpiPendingHintsChip').classList.toggle('admin-badge-pulse', pendingHintsCount > 0);
      if ($('kpiTopScore')) $('kpiTopScore').textContent = topScore + ' Pts';

      if (typeof adminUpdateRoundControlBand === 'function') adminUpdateRoundControlBand();
      if ($('atabBadgeStudents')) $('atabBadgeStudents').textContent = totalStudents;
      if ($('atabBadgeHints')) {
        $('atabBadgeHints').textContent = pendingHintsCount;
        $('atabBadgeHints').style.display = pendingHintsCount > 0 ? 'inline-block' : 'none';
      }`;

const newAdminProctorKpi = `      const grantedHintsCount = hints.filter(h => h.status === 'GRANTED').length;
      const topScore = students.reduce((max, s) => Math.max(max, s.score ?? 0), 0);

      if ($('kpiActiveStudents')) $('kpiActiveStudents').textContent = activeStudentsCount + ' Active';
      if ($('kpiViolationsCount')) $('kpiViolationsCount').textContent = totalViolations + ' Strike' + (totalViolations === 1 ? '' : 's');
      if ($('kpiPendingHints')) $('kpiPendingHints').textContent = grantedHintsCount + ' Unlocked';
      if ($('kpiPendingHintsChip')) $('kpiPendingHintsChip').classList.toggle('admin-badge-pulse', false);
      if ($('kpiTopScore')) $('kpiTopScore').textContent = topScore + ' Pts';

      if (typeof adminUpdateRoundControlBand === 'function') adminUpdateRoundControlBand();
      if ($('atabBadgeStudents')) $('atabBadgeStudents').textContent = totalStudents;
      if ($('atabBadgeHints')) {
        $('atabBadgeHints').textContent = grantedHintsCount;
        $('atabBadgeHints').style.display = grantedHintsCount > 0 ? 'inline-block' : 'none';
      }`;

if (content.includes(oldAdminProctorKpi)) {
  content = content.replace(oldAdminProctorKpi, newAdminProctorKpi);
  console.log('✔ Updated renderAdminProctorConsole KPI and badge counters');
}

// 16. Replace Clue Request logic with 100% Automated Hint Wallet System
const clueLogicStart = content.indexOf('function openClueConfirmModal(roundName, qId, qLabel) {');
const clueLogicEnd = content.indexOf('function adminEditGrantedHint(idx) {');

if (clueLogicStart !== -1 && clueLogicEnd !== -1) {
  const newClueLogic = `function openClueConfirmModal(roundName, qId, qLabel) {
      if (!S || S.is_locked) return;
      const wallet = (S.hintWallet != null) ? S.hintWallet : 10;
      if (wallet < CLUE_COST) {
        showToast('❌ Insufficient Hint Points (Requires 10 Hint Pts · Balance: ' + wallet + ' pts)');
        renderCurrentHintBox(roundName, qId);
        return;
      }

      if (!qLabel) {
        if (qId.startsWith('R1_Q')) qLabel = 'Question #' + qId.replace('R1_Q', '');
        else if (qId.startsWith('R2_P')) qLabel = 'Crypto Challenge #' + qId.replace('R2_P', '');
        else if (qId.startsWith('R3_Q')) qLabel = 'Forensic Case #' + qId.replace('R3_Q', '');
        else qLabel = qId;
      }

      const list = getHintRequests();
      const grantedList = list.filter(r => r.sid === S.sid && r.qId === qId && r.status === 'GRANTED');
      const requestedTier = grantedList.length + 1;
      const isTier2 = (requestedTier === 2);

      const tierBadge = isTier2
        ? '<span style="background:rgba(34,197,94,0.2); color:#4ade80; border:1px solid #22c55e; padding:3px 8px; border-radius:4px; font-weight:700;">🔑 Level 2: Direct Walkthrough</span>'
        : '<span style="background:rgba(56,189,248,0.2); color:#38bdf8; border:1px solid #38bdf8; padding:3px 8px; border-radius:4px; font-weight:700;">💡 Level 1: Conceptual Nudge</span>';

      const tierDesc = isTier2
        ? '• <b>Level 2: Direct Walkthrough</b> instantly reveals explicit, step-by-step guidance directly in your panel.<br>' +
          '• Deducts 10 points immediately from your Hint Wallet (Zero waiting for admin approval).'
        : '• <b>Level 1: Conceptual Nudge</b> points you in the right direction without revealing the complete solution.<br>' +
          '• Deducts 10 points immediately from your Hint Wallet (Zero waiting for admin approval).';

      pendingClueRequest = { roundName, qId, qLabel, tier: requestedTier };

      const bodyEl = $('clueConfirmBody');
      if (bodyEl) {
        bodyEl.innerHTML =
          '<div style="background:rgba(15,23,42,0.85); border:1px solid rgba(56,189,248,0.25); border-radius:8px; padding:14px; margin-bottom:14px; font-size:12px;">' +
          '<div style="display:flex; justify-content:space-between; margin-bottom:8px;">' +
          '<span style="color:#94a3b8;">Challenge:</span>' +
          '<b style="color:var(--cyan);">' + escapeHtml(qLabel) + ' (' + escapeHtml(roundName) + ')</b>' +
          '</div>' +
          '<div style="display:flex; justify-content:space-between; margin-bottom:8px; align-items:center;">' +
          '<span style="color:#94a3b8;">Clue Level:</span>' +
          tierBadge +
          '</div>' +
          '<div style="display:flex; justify-content:space-between; margin-bottom:8px;">' +
          '<span style="color:#94a3b8;">Clue Cost:</span>' +
          '<b style="color:#f59e0b;">' + CLUE_COST + ' Hint Points</b>' +
          '</div>' +
          '<div style="display:flex; justify-content:space-between; margin-bottom:8px;">' +
          '<span style="color:#94a3b8;">Wallet Balance:</span>' +
          '<span style="color:#e2e8f0; font-weight:600;">' + wallet + ' pts</span>' +
          '</div>' +
          '<div style="display:flex; justify-content:space-between; border-top:1px dashed #334155; padding-top:8px; margin-top:8px;">' +
          '<span style="color:#94a3b8;">Balance After Unlock:</span>' +
          '<b style="color:#34d399; font-size:13px;">' + (wallet - CLUE_COST) + ' pts</b>' +
          '</div>' +
          '</div>' +
          '<p style="color:#94a3b8; font-size:11px; margin:0; line-height:1.5;">' +
          tierDesc +
          '</p>';
      }

      isInternalModalOpen = true;
      const modal = $('modalClueConfirm');
      if (modal) modal.classList.add('active');
    }

    function closeClueConfirmModal() {
      const modal = $('modalClueConfirm');
      if (modal) modal.classList.remove('active');
      pendingClueRequest = null;
      isInternalModalOpen = false;
    }

    function confirmAndSendClueRequest() {
      if (!pendingClueRequest) {
        closeClueConfirmModal();
        return;
      }
      const { roundName, qId, qLabel, tier } = pendingClueRequest;
      closeClueConfirmModal();
      useAutomatedHint(roundName, qId, tier, qLabel);
    }

    /**
     * 100% AUTOMATED HINT WALLET SYSTEM
     * Immediately deducts 10 hint points and displays Level 1 or Level 2 hint directly in student panel.
     * No admin approval needed.
     */
    function useAutomatedHint(roundName, qId, tier, qLabel) {
      if (!S || S.is_locked) {
        showToast('🔒 Terminal is locked. Re-entry requires proctor unlock.');
        return { status: 403, ok: false, error: 'SESSION_LOCKED' };
      }

      if (S.hintWallet == null) S.hintWallet = 10;
      const wallet = S.hintWallet;
      if (wallet < CLUE_COST) {
        showToast('❌ Insufficient Hint Points (Requires 10 Hint Pts · Balance: ' + wallet + ' pts). Play waiting room mini-games to recharge!');
        renderCurrentHintBox(roundName, qId);
        return { status: 400, ok: false, error: 'INSUFFICIENT_POINTS' };
      }

      const list = getHintRequests();
      const grantedList = list.filter(r => r.sid === S.sid && r.qId === qId && r.status === 'GRANTED');
      if (grantedList.length >= 2) {
        showToast('💡 Maximum clues (2/2) already unlocked for this challenge.');
        return { status: 409, ok: false, error: 'MAX_CLUES_REACHED' };
      }

      const requestedTier = Number(tier) || (grantedList.length + 1);
      const tierTitle = requestedTier === 2 ? 'Level 2 Clue: Direct Walkthrough' : 'Level 1 Clue: Conceptual Nudge';

      if (!qLabel) {
        if (qId.startsWith('R1_Q')) qLabel = 'Question #' + qId.replace('R1_Q', '');
        else if (qId.startsWith('R2_P')) qLabel = 'Crypto Challenge #' + qId.replace('R2_P', '');
        else if (qId.startsWith('R3_Q')) qLabel = 'Forensic Case #' + qId.replace('R3_Q', '');
        else qLabel = qId;
      }

      const clueText = getDefaultHint(qId, requestedTier);

      // Deduct 10 points immediately from Hint Wallet
      S.hintWallet -= CLUE_COST;
      S.hintsUsed = (S.hintsUsed || 0) + 1;
      save();
      updateHintWalletDisplay();

      // Record in Ledger as GRANTED (Automated)
      const cleanList = list.filter(r => !(r.sid === S.sid && r.qId === qId && r.tier === requestedTier));
      const record = {
        id: 'hint_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
        sid: S.sid,
        name: S.player.name,
        dept: S.player.dept,
        year: S.player.year,
        round: roundName,
        qId: qId,
        qLabel: (qLabel || qId) + ' (' + tierTitle + ')',
        tier: requestedTier,
        cost: CLUE_COST,
        walletBalance: S.hintWallet,
        status: 'GRANTED',
        autoGranted: true,
        hintText: clueText,
        time: Date.now(),
        grantedAt: Date.now()
      };
      cleanList.push(record);
      saveHintRequests(cleanList);

      // Dispatch to pipeline/radar
      try {
        if (typeof CyberArenaPipeline !== 'undefined' && CyberArenaPipeline.requestClue) {
          CyberArenaPipeline.requestClue(record);
        }
      } catch (err) {}

      broadcastParticipantHeartbeat();
      SFX.success();
      showToast('💡 ' + tierTitle + ' Unlocked! (-10 Hint Points · ' + S.hintWallet + ' pts remaining)');
      renderCurrentHintBox(roundName, qId);
      return { status: 200, ok: true, hintText: clueText, walletRemaining: S.hintWallet };
    }

    // Legacy shim for any direct invocations
    function requestAdminHint(roundName, qId, qLabel) {
      return useAutomatedHint(roundName, qId, null, qLabel);
    }

    function renderCurrentHintBox(roundName, qId, containerId) {
      if (!containerId) {
        if ((roundName && roundName.indexOf('1') !== -1) || (S && S.round === 'R1')) containerId = 'r1HintSlot';
        else if ((roundName && roundName.indexOf('2') !== -1) || (S && S.round === 'R2')) containerId = 'r2HintSlot';
        else if ((roundName && roundName.indexOf('3') !== -1) || (S && S.round === 'R3')) containerId = 'r3HintSlot';
        else containerId = 'r1HintSlot';
      }
      const el = $(containerId);
      if (!el) return;

      const wallet = (S && S.hintWallet != null) ? S.hintWallet : 10;
      const hasEnough = wallet >= CLUE_COST;

      const list = getHintRequests();
      const grantedList = S ? list.filter(r => r.sid === S.sid && r.qId === qId && r.status === 'GRANTED') : [];

      let grantedHtml = '';
      if (grantedList.length > 0) {
        grantedHtml = grantedList.map((g, idx) => {
          const tierNum = Number(g.tier || (idx + 1));
          const isTier2 = (tierNum === 2);
          const badgeClass = isTier2 ? 'tier-2' : 'tier-1';
          const title = isTier2
            ? '🔑 LEVEL 2 CLUE · DIRECT WALKTHROUGH'
            : '💡 LEVEL 1 CLUE · CONCEPTUAL NUDGE';
          return '<div class="hint-granted-box ' + badgeClass + '" style="margin-bottom:10px;">' +
            '<div class="hint-granted-head"><span>' + title + '</span><span>• UNLOCKED (-10 PTS)</span></div>' +
            '<div class="hint-granted-text">' + escapeHtml(g.hintText) + '</div>' +
            '</div>';
        }).join('');
      }

      if (grantedList.length >= 2) {
        el.innerHTML = grantedHtml +
          '<div class="hint-req-card" style="border-color:#334155; background:rgba(15,23,42,0.6);">' +
          '<div><b style="color:#38bdf8;">💡 All Clues Unlocked (2/2):</b> <span style="color:#94a3b8;">Both Level 1 (Nudge) and Level 2 (Walkthrough) are active above.</span></div>' +
          '<div style="font-size:11px; color:#fbbf24; font-family:var(--font-mono); font-weight:700;">🪙 Hint Wallet: ' + wallet + ' pts remaining</div>' +
          '</div>';
        return;
      }

      const nextTier = grantedList.length + 1;
      const isTier2 = (nextTier === 2);
      const clueTitle = isTier2 ? '🔑 Need Level 2 Clue: Direct Walkthrough?' : '💡 Need Level 1 Clue: Conceptual Nudge?';
      const clueDesc = isTier2
        ? 'Immediately deducts 10 Hint Points from your wallet to reveal explicit step-by-step guidance.'
        : 'Immediately deducts 10 Hint Points from your wallet to reveal conceptual guidance.';
      const btnText = isTier2
        ? '🔑 Use Hint / Reveal Level 2 Clue (-10 Pts)'
        : '💡 Use Hint / Reveal Level 1 Clue (-10 Pts)';

      let actionHtml;
      if (hasEnough) {
        actionHtml = '<button class="hint-req-btn" data-round="' + escapeHtml(roundName) + '" data-qid="' + escapeHtml(qId) + '" data-tier="' + nextTier + '" onclick="useAutomatedHint(this.dataset.round, this.dataset.qid, Number(this.dataset.tier))">' + btnText + '</button>';
      } else {
        actionHtml = '<div style="display:flex; flex-direction:column; align-items:flex-end; gap:4px;">' +
          '<button class="hint-req-btn disabled" disabled style="opacity:0.45; cursor:not-allowed; background:rgba(30,41,59,0.5); border-color:rgba(239,68,68,0.3); color:#94a3b8;">🔒 ' + btnText + '</button>' +
          '<small style="color:#f87171; font-size:11px; font-weight:600;">⚠️ Insufficient points (Wallet: ' + wallet + ' pts · Need 10 pts). Win waiting room mini-games to recharge!</small>' +
          '</div>';
      }

      el.innerHTML = grantedHtml +
        '<div class="hint-req-card">' +
        '<div>' +
        '<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">' +
        '<b style="color:#38bdf8;">' + clueTitle + '</b>' +
        '<span style="background:rgba(245,158,11,0.15); color:#fbbf24; border:1px solid #f59e0b; padding:2px 8px; border-radius:12px; font-size:11px; font-weight:700;">🪙 Wallet: ' + wallet + ' pts</span>' +
        '</div>' +
        '<span style="color:#94a3b8; font-size:12px;">' + clueDesc + '</span>' +
        '</div>' +
        actionHtml +
        '</div>';
    }

    function renderAdminHintConsole() {
      const body = $('adminHintsTableBody');
      if (!body) return;
      const list = getHintRequests();

      if (list.length === 0) {
        body.innerHTML = '<tr><td colspan="5" style="text-align:center; color:#64748b; padding:24px;">No clue requests recorded yet. Clues unlocked by students appear here automatically.</td></tr>';
        return;
      }

      const sorted = list.map((r, i) => ({ ...r, origIdx: i })).reverse();
      body.innerHTML = sorted.map(r => {
        const isGranted = (r.status === 'GRANTED');
        const isRejected = (r.status === 'REJECTED');
        const isPending = !isGranted && !isRejected;
        const tierNum = Number(r.tier || 1);
        const isTier2 = (tierNum === 2);

        let badge = '<span class="status-tag-active" style="background:rgba(16,185,129,0.15); color:#34d399; border:1px solid #10b981;" title="Clue automatically unlocked and revealed">🟢 AUTO-GRANTED</span>';
        if (isRejected) badge = '<span class="status-tag-disq" title="Request declined and 10 points refunded">🔴 DECLINED</span>';
        else if (isPending) badge = '<span class="status-tag-switch" style="animation:none; background:rgba(245,158,11,0.2); color:#fbbf24; border-color:#f59e0b;" title="Pending">⏳ PENDING</span>';

        const tierBadge = isTier2
          ? '<span style="display:inline-block; font-size:10px; padding:2px 6px; border-radius:4px; background:rgba(34,197,94,0.15); color:#4ade80; border:1px solid #22c55e; margin-top:3px; font-weight:700;">🔑 Level 2: Walkthrough</span>'
          : '<span style="display:inline-block; font-size:10px; padding:2px 6px; border-radius:4px; background:rgba(56,189,248,0.15); color:#38bdf8; border:1px solid #38bdf8; margin-top:3px; font-weight:700;">💡 Level 1: Nudge</span>';

        const clueContent = r.hintText || getDefaultHint(r.qId, tierNum);
        const grantedBg = isTier2 ? 'rgba(34,197,94,0.08)' : 'rgba(56,189,248,0.08)';
        const grantedBorder = isTier2 ? 'rgba(34,197,94,0.25)' : 'rgba(56,189,248,0.25)';
        const grantedColor = isTier2 ? '#4ade80' : '#38bdf8';

        const clueBox = '<div style="font-size:12px; color:' + grantedColor + '; background:' + grantedBg + '; border:1px solid ' + grantedBorder + '; padding:8px 10px; border-radius:4px; white-space:pre-line; line-height:1.5;">' +
          '<b>Revealed ' + (isTier2 ? 'Level 2 (Walkthrough)' : 'Level 1 (Nudge)') + ':</b><br>' + escapeHtml(clueContent) +
          '</div>';

        const actionBtns = '<div style="display:flex; gap:6px;">' +
          '<button class="btn ghost small" style="padding:4px 8px;" onclick="adminEditGrantedHint(' + r.origIdx + ')">✏ Edit Clue</button>' +
          '<button class="btn rose small" style="padding:4px 8px;" onclick="adminRevokeHint(' + r.origIdx + ')">Revoke</button>' +
          '</div>';

        const timeStr = new Date(r.time || r.grantedAt || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        const walletBal = r.walletBalance != null ? r.walletBalance + ' pts remaining' : '10 Pts Deducted';

        return '<tr>' +
          '<td><b>' + escapeHtml(r.name) + '</b><br><small style="color:#94a3b8;">' + escapeHtml(r.dept) + ' · Yr ' + escapeHtml(r.year) + ' · <span class="student-sid-pill">' + escapeHtml(r.sid) + '</span></small><br><span style="font-size:10px; color:#64748b;">' + timeStr + '</span></td>' +
          '<td><span class="threat-badge badge-secure">' + escapeHtml(r.round) + '</span><br><b style="font-size:12px; color:var(--cyan);">' + escapeHtml(r.qLabel) + '</b><br>' + tierBadge + '</td>' +
          '<td>' + badge + '<br><small style="color:#f59e0b; font-size:10px; font-weight:700;">🪙 ' + walletBal + '</small></td>' +
          '<td>' + clueBox + '</td>' +
          '<td>' + actionBtns + '</td>' +
          '</tr>';
      }).join('');
    }

    function adminGrantHint(idx) {
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
        const tierNum = Number(r.tier || 1);
        showAppModal({
          mode: 'prompt',
          title: 'CUSTOM CLUE DISPATCH (' + (tierNum === 2 ? 'LEVEL 2 WALKTHROUGH' : 'LEVEL 1 NUDGE') + ')',
          icon: '💡',
          message: 'Enter specific clue to reveal to ' + r.name + ' (' + (r.dept || 'Candidate') + ') for ' + r.qLabel + ' (' + r.round + '):',
          inputLabel: 'Predefined / Custom Clue Text:',
          defaultValue: getDefaultHint(r.qId, tierNum),
          confirmText: '✔ Dispatch Clue',
          cancelText: 'Cancel',
          onConfirm: (customClue) => {
            executeGrant(customClue);
          }
        });
      }
    }

    function adminRejectHint(idx) {
      const list = getHintRequests();
      const r = list[idx];
      if (!r) return;
      r.status = 'REJECTED';
      r.rejectedAt = Date.now();
      saveHintRequests(list);

      if (S && S.sid === r.sid) {
        S.hintWallet = (S.hintWallet || 0) + CLUE_COST;
        save();
        updateHintWalletDisplay();
      }

      showToast('Declined clue request for ' + r.name + ' (10 Hint Points refunded).');
      renderAdminHintConsole();
    }

    function adminRevokeHint(idx) {
      const list = getHintRequests();
      const r = list[idx];
      if (!r) return;
      r.status = 'REJECTED';
      saveHintRequests(list);
      showToast('Revoked clue access for ' + r.name + '.');
      renderAdminHintConsole();
    }
    
    `;

  content = content.slice(0, clueLogicStart) + newClueLogic + content.slice(clueLogicEnd);
  console.log('✔ Replaced clue request flow with 100% automated hint wallet system');
} else {
  console.error('✖ Could not locate clue logic boundaries');
}

// 17. Update executeAdminAdvanceRound broadcast durations
content = content.replace(/durationSeconds: toRound === 3 \? 3600 : 1800/g, 'durationSeconds: ROUND_SECONDS[toRound] || 2700');

// Write updated content back to index.html
fs.writeFileSync(targetPath, content, 'utf8');
console.log('✔ Updated index.html successfully! New length:', content.length);
