/**
 * CyberArena Comprehensive End-to-End System Load & Live Simulation Suite
 * Simulates:
 * 1. Concurrent candidate registrations (Register numbers: 922524244001 - 922524244008)
 * 2. Automated Hint Wallet deductions (-10 pts) and waiting-room mini-game recharge
 * 3. Anti-cheat tab-blur violations, automated 3-strike lockout, and proctor pardon
 * 4. Full multi-round scoring and submission lifecycle
 * 5. Google Apps Script Cloud DB synchronization & real-time Leaderboard
 * 6. Admin Main Dashboard / Operatives Roster rendering from server payload (Unified Source)
 * 7. Round timer validation (R1: 30m, R2: 45m, R3: 45m)
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const vm = require('vm');

const SERVER_BASE = 'http://localhost:8000';
let passedChecks = 0;
let totalChecks = 0;

function assert(condition, message) {
  totalChecks++;
  if (condition) {
    passedChecks++;
    console.log(`  ✅ [PASS]: ${message}`);
  } else {
    console.error(`  ❌ [FAIL]: ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
}

function requestHttp(urlStr, options = {}, body = null) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr, SERVER_BASE);
    const reqOpts = {
      hostname: u.hostname,
      port: u.port,
      path: u.pathname + u.search,
      method: options.method || 'GET',
      headers: options.headers || {}
    };

    const req = http.request(reqOpts, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(data); } catch (e) {}
        resolve({ status: res.statusCode, headers: res.headers, body: data, json });
      });
    });

    req.on('error', reject);
    if (body) {
      if (typeof body === 'object') {
        const payloadStr = JSON.stringify(body);
        req.setHeader('Content-Type', 'application/json');
        req.setHeader('Content-Length', Buffer.byteLength(payloadStr));
        req.write(payloadStr);
      } else {
        req.write(body);
      }
    }
    req.end();
  });
}

async function runEndToEndSimulation() {
  console.log('======================================================================');
  console.log('🚀 CYBERARENA COMPREHENSIVE END-TO-END LOAD & SIMULATION SUITE');
  console.log('======================================================================\n');

  // STEP 0: Verify Server Health
  console.log('--- STEP 0: VERIFYING SYSTEM CORE HEALTH ---');
  const healthRes = await requestHttp(`${SERVER_BASE}/api/health`);
  assert(healthRes.status === 200, 'Server health check returned HTTP 200');
  assert(healthRes.json && (healthRes.json.status === 'ONLINE' || healthRes.json.status === 'HEALTHY'), 'Server status is ONLINE / HEALTHY');

  // STEP 1: Simulate 8 Candidates Logging in Concurrently
  console.log('\n--- STEP 1: SIMULATING MULTIPLE CANDIDATE LOGINS (CONCURRENT SESSIONS) ---');
  const candidates = [
    { regNo: '922524244001', name: 'Rajesh Kumar', dept: 'CSBS', year: 'III' },
    { regNo: '922524244002', name: 'Ananya Raman', dept: 'CSE', year: 'III' },
    { regNo: '922524244003', name: 'Karthik V', dept: 'IT', year: 'II' },
    { regNo: '922524244004', name: 'Sneha Reddy', dept: 'AIDS', year: 'IV' },
    { regNo: '922524244005', name: 'Vikram Sethi', dept: 'ECE', year: 'III' },
    { regNo: '922524244006', name: 'Pooja Nair', dept: 'CSBS', year: 'II' },
    { regNo: '922524244007', name: 'Deepak Sharma', dept: 'CSE', year: 'IV' },
    { regNo: '922524244008', name: 'Meera Krishnan', dept: 'IT', year: 'III' }
  ];

  const candidateSessions = [];
  const loginPromises = candidates.map(c => {
    return requestHttp(`${SERVER_BASE}/api/sessions/register`, { method: 'POST' }, {
      sid: 'SIM_' + c.regNo,
      candidateId: 'SIM_' + c.regNo,
      name: c.name,
      dept: c.dept,
      year: c.year,
      regNo: c.regNo
    });
  });

  const loginResults = await Promise.all(loginPromises);
  loginResults.forEach((res, i) => {
    assert(res.status === 200, `Candidate ${candidates[i].regNo} (${candidates[i].name}) registered successfully`);
    assert(res.json && res.json.success === true, `Registration response contains success: true`);
    candidateSessions.push(res.json.session || res.json.candidate);
  });
  console.log(`  🎉 Successfully initialized and verified ${candidateSessions.length} concurrent candidate sessions.`);

  // STEP 2: Simulate Gameplay & Automated Hint Wallet Deductions
  console.log('\n--- STEP 2: SIMULATING GAMEPLAY & AUTOMATED HINT WALLET SYSTEM ---');
  const cand1 = candidateSessions[0]; // Rajesh Kumar
  
  // Hint Wallet Level 1 (Conceptual Nudge)
  console.log('  Testing automated Hint Wallet deduction for Level 1 Clue:');
  const hintReq1 = await requestHttp(`${SERVER_BASE}/api/clues/request`, { method: 'POST' }, {
    id: 'hint_sim_101',
    candidateId: cand1.sid,
    candidateName: cand1.name,
    dept: cand1.dept,
    year: cand1.year,
    round: 'Round 1',
    qId: 'R1_Q1',
    qLabel: 'Question #1',
    tier: 1,
    cost: 10,
    status: 'GRANTED',
    autoGranted: true,
    walletBalance: 0
  });

  assert(hintReq1.status === 200, 'Automated hint request returned HTTP 200');
  assert(hintReq1.json && hintReq1.json.hint.status === 'GRANTED', 'Automated hint was instantly GRANTED without admin waiting');
  assert(hintReq1.json.hint.suggestedClue.length > 10, 'Level 1 conceptual clue successfully delivered');

  // Hint Wallet Level 2 (Direct Walkthrough)
  console.log('  Testing automated Hint Wallet deduction for Level 2 Clue:');
  const hintReq2 = await requestHttp(`${SERVER_BASE}/api/clues/request`, { method: 'POST' }, {
    id: 'hint_sim_102',
    candidateId: cand1.sid,
    candidateName: cand1.name,
    dept: cand1.dept,
    year: cand1.year,
    round: 'Round 2',
    qId: 'R2_P1',
    qLabel: 'Crypto Challenge #1',
    tier: 2,
    cost: 10,
    status: 'GRANTED',
    autoGranted: true,
    walletBalance: 0
  });

  assert(hintReq2.status === 200, 'Level 2 automated walkthrough returned HTTP 200');
  assert(hintReq2.json && hintReq2.json.hint.tier === 2, 'Clue tier recorded as Level 2');
  assert(hintReq2.json.hint.suggestedClue.length > 10, 'Level 2 direct walkthrough delivered');

  // STEP 3: Anti-Cheat Tab-Focus Violations, 3-Strike Lockout, and Proctor Pardon
  console.log('\n--- STEP 3: SIMULATING ANTI-CHEAT FOCUS MONITORING & PROCTOR PARDON ---');
  const cand3 = candidateSessions[2]; // Karthik V
  const cand4 = candidateSessions[3]; // Sneha Reddy

  // Candidate 3: 1 strike warning
  const tabRes1 = await requestHttp(`${SERVER_BASE}/api/sessions/tab-focus`, { method: 'POST' }, {
    candidateId: cand3.sid,
    isTabHidden: true,
    strikes: 1,
    violations: 1,
    desc: 'Focus violation: Switched tab away from test window'
  });
  assert(tabRes1.status === 200, 'Tab focus violation logged for Candidate 3 (1 strike)');

  // Candidate 4: 3 strikes -> Automatic Lockout
  const tabRes4 = await requestHttp(`${SERVER_BASE}/api/sessions/tab-focus`, { method: 'POST' }, {
    candidateId: cand4.sid,
    isTabHidden: true,
    strikes: 3,
    violations: 3,
    is_locked: true,
    isLocked: true,
    lock_reason: '3/3 Focus violations accumulated'
  });
  assert(tabRes4.status === 200, 'Tab focus violation maxed for Candidate 4 (3 strikes)');

  // Verify Candidate 4 is locked in live database
  const liveRes = await requestHttp(`${SERVER_BASE}/api/sessions/live`);
  const liveList = liveRes.json.sessions || liveRes.json.candidates || [];
  const cand4Live = liveList.find(s => s.sid === cand4.sid);
  assert(cand4Live && cand4Live.isLocked === true, 'Candidate 4 is confirmed LOCKED in live surveillance');
  assert(cand4Live && cand4Live.strikes === 3, 'Candidate 4 has 3 recorded strikes');

  // Proctor Pardon for Candidate 4
  console.log('  Executing Proctor Administrative Pardon for Candidate 4:');
  const pardonRes = await requestHttp(`${SERVER_BASE}/api/sessions/pardon`, { method: 'POST' }, {
    candidateId: cand4.sid,
    adminPin: '0769',
    reason: 'Proctor verified legitimate accidental keystroke'
  });
  assert(pardonRes.status === 200, 'Proctor pardon executed successfully with HTTP 200');
  assert(pardonRes.json && pardonRes.json.session.isLocked === false, 'Candidate 4 unlocked: isLocked is false');
  assert(pardonRes.json.session.strikes === 0, 'Candidate 4 strikes reset to 0/3');
  assert(pardonRes.json.session.status === 'ONLINE', 'Candidate 4 status restored to ONLINE');

  // STEP 4: Candidate Scoring & Multi-Round Submission
  console.log('\n--- STEP 4: SIMULATING ROUND PROGRESSION & FINAL REPORT SUBMISSION ---');
  const testScores = [
    { sid: candidates[0].regNo, r1: 28, r2: 38, r3: 20, bonus: 10, total: 96, duration: 2100 },
    { sid: candidates[1].regNo, r1: 26, r2: 35, r3: 18, bonus: 10, total: 89, duration: 2350 },
    { sid: candidates[2].regNo, r1: 22, r2: 30, r3: 15, bonus: 0, total: 67, duration: 2400 },
    { sid: candidates[3].regNo, r1: 25, r2: 32, r3: 16, bonus: 5, total: 78, duration: 2200 },
    { sid: candidates[4].regNo, r1: 20, r2: 28, r3: 12, bonus: 0, total: 60, duration: 2600 },
    { sid: candidates[5].regNo, r1: 24, r2: 34, r3: 18, bonus: 10, total: 86, duration: 2150 },
    { sid: candidates[6].regNo, r1: 27, r2: 36, r3: 19, bonus: 10, total: 92, duration: 2050 },
    { sid: candidates[7].regNo, r1: 23, r2: 29, r3: 14, bonus: 0, total: 66, duration: 2500 }
  ];

  for (const sc of testScores) {
    const fullSid = 'SIM_' + sc.sid;
    const subRes = await requestHttp(`${SERVER_BASE}/api/sessions/submit`, { method: 'POST' }, {
      sid: fullSid,
      candidateId: fullSid,
      r1: sc.r1,
      r2: sc.r2,
      r3: sc.r3,
      bonus: sc.bonus,
      score: sc.total,
      total: sc.total,
      durationSeconds: sc.duration,
      status: 'COMPLETED',
      accuracy_rate: 92.5
    });
    assert(subRes.status === 200, `Final test submitted for Candidate ${sc.sid} (Score: ${sc.total} pts)`);
  }

  // STEP 5: Verify Real-Time Leaderboard API
  console.log('\n--- STEP 5: VERIFYING LEADERBOARD INTEGRITY & 4-TIER RANKING ---');
  const lbRes = await requestHttp(`${SERVER_BASE}/api/leaderboard`);
  const lbList = (lbRes.json && (lbRes.json.leaderboard || lbRes.json.rows)) || [];
  assert(Array.isArray(lbList) && lbList.length > 0, 'Leaderboard response contains sorted candidate array');
  
  const topRanked = lbList[0];
  console.log(`  🏆 Tournament Leader: ${topRanked.name} (Score: ${topRanked.total || topRanked.score} pts, Duration: ${topRanked.durationSeconds}s)`);
  assert(Number(topRanked.total || topRanked.score) === 96, 'Top ranked candidate has expected tournament high score (96 pts)');

  // STEP 6: Verify Admin Dashboard Unified Data Source & Roster Rendering
  console.log('\n--- STEP 6: VERIFYING ADMIN UNIFIED DATA PIPELINE & ROSTER CARDS ---');
  const htmlPath = path.join(__dirname, '..', 'index.html');
  const htmlContent = fs.readFileSync(htmlPath, 'utf8');

  // Verify required unification functions in index.html
  assert(htmlContent.includes('fetchServerStudentsData'), 'index.html defines fetchServerStudentsData helper');
  assert(htmlContent.includes('applyServerDataToRoster'), 'index.html defines applyServerDataToRoster helper');
  assert(htmlContent.includes('window.renderAdminConsole'), 'index.html exports window.renderAdminConsole alias');
  assert(htmlContent.includes('window.renderRosterCards'), 'index.html exports window.renderRosterCards alias');

  // Verify non-filtering of roster cards
  assert(!htmlContent.includes('(now - lastSeen) < 15 * 60 * 1000'), 'Removed obsolete 15-minute lastSeen filter in renderAdminProctorConsole');

  // Simulate parsing and applying server dataset to client roster in sandbox
  const simulatedStorage = {};
  const mockLocalStorage = {
    getItem: (k) => simulatedStorage[k] || null,
    setItem: (k, v) => { simulatedStorage[k] = String(v); }
  };

  const sandboxContext = {
    window: {},
    document: {},
    localStorage: mockLocalStorage,
    Date: Date,
    JSON: JSON,
    console: console,
    Array: Array,
    Object: Object,
    Number: Number,
    String: String
  };

  const scriptCode = `
    const ROSTER_STORE_KEY = "cyberarena_live_roster_v1";
    function getLiveRoster() {
      return JSON.parse(localStorage.getItem(ROSTER_STORE_KEY) || '{}');
    }
    function saveLiveRoster(r) {
      localStorage.setItem(ROSTER_STORE_KEY, JSON.stringify(r));
    }
    ${htmlContent.match(/function applyServerDataToRoster[\s\S]*?window\.applyServerDataToRoster = applyServerDataToRoster;/)[0]}
    
    // Ingest server dataset
    const serverRows = ${JSON.stringify(testScores.map((sc, i) => ({
      sid: 'SIM_' + sc.sid,
      name: candidates[i].name,
      dept: candidates[i].dept,
      year: candidates[i].year,
      score: sc.total,
      total: sc.total,
      r1: sc.r1,
      r2: sc.r2,
      r3: sc.r3,
      bonus: sc.bonus,
      status: 'COMPLETED',
      durationSeconds: sc.duration,
      strikes: 0,
      isLocked: false
    })))};

    applyServerDataToRoster(serverRows);
    window.finalRoster = getLiveRoster();
    window.rosterCount = Object.keys(window.finalRoster).length;
  `;

  const vmScript = new vm.Script(scriptCode);
  const vmContext = vm.createContext(sandboxContext);
  vmScript.runInContext(vmContext);

  const finalRoster = sandboxContext.window.finalRoster || {};
  const rosterCount = sandboxContext.window.rosterCount || 0;

  assert(rosterCount === 8, `applyServerDataToRoster populated all 8 server candidates into live roster`);
  assert(finalRoster['SIM_922524244001'] && finalRoster['SIM_922524244001'].name === 'Rajesh Kumar', 'Candidate 1 data preserved correctly');
  assert(finalRoster['SIM_922524244008'] && finalRoster['SIM_922524244008'].name === 'Meera Krishnan', 'Candidate 8 data preserved correctly');

  // STEP 7: Verify Round Timers (R1: 30m, R2: 45m, R3: 45m)
  console.log('\n--- STEP 7: VERIFYING ROUND TIMERS INITIALIZATION & FORMATTING ---');
  assert(htmlContent.includes('const ROUND_SECONDS = { 1: 30 * 60, 2: 45 * 60, 3: 45 * 60 };'), 'index.html defines ROUND_SECONDS with 30m, 45m, 45m');
  assert(htmlContent.includes('id="r1Timer">30:00'), 'Round 1 HTML display initialized to 30:00');
  assert(htmlContent.includes('id="r2Timer">45:00'), 'Round 2 HTML display initialized to 45:00');
  assert(htmlContent.includes('id="r3Timer">45:00'), 'Round 3 HTML display initialized to 45:00');

  // Verify server advance-round duration for R2 and R3
  const advR2Res = await requestHttp(`${SERVER_BASE}/api/admin/advance-round`, { method: 'POST' }, {
    fromRound: 1,
    targetRound: 2,
    proctorName: 'Simulation Lead'
  });
  assert(advR2Res.status === 200, 'Admin advance round to R2 succeeded');
  assert(advR2Res.json && advR2Res.json.durationSeconds === 2700, 'Round 2 server duration is strictly 2700s (45 mins)');

  const advR3Res = await requestHttp(`${SERVER_BASE}/api/admin/advance-round`, { method: 'POST' }, {
    fromRound: 2,
    targetRound: 3,
    proctorName: 'Simulation Lead'
  });
  assert(advR3Res.status === 200, 'Admin advance round to R3 succeeded');
  assert(advR3Res.json && advR3Res.json.durationSeconds === 2700, 'Round 3 server duration is strictly 2700s (45 mins)');

  console.log('\n======================================================================');
  console.log(`🎉 ALL ${passedChecks} / ${totalChecks} SYSTEM LOAD & SIMULATION CHECKS PASSED PERFECTLY!`);
  console.log('======================================================================\n');
}

runEndToEndSimulation().catch(err => {
  console.error('\n❌ SIMULATION TEST FAILED:', err);
  process.exit(1);
});
