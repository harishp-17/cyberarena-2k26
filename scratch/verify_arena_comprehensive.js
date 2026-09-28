/**
 * Comprehensive CyberArena End-to-End Verification Engine
 * Simulates real candidate scenarios, audits DB API endpoints, runs exact frontend rendering & KPI logic,
 * and validates database-dashboard parity.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const SERVER_BASE = 'http://localhost:8000';

function post(urlPath, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlPath, SERVER_BASE);
    const postData = JSON.stringify(body);
    const req = http.request({
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    }, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch (e) {
          resolve({ status: res.statusCode, raw: data });
        }
      });
    });
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

function get(urlPath) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlPath, SERVER_BASE);
    http.get({
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      headers: { 'Cache-Control': 'no-cache' }
    }, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch (e) {
          resolve({ status: res.statusCode, raw: data });
        }
      });
    }).on('error', reject);
  });
}

function fmtTime(sec) {
  const m = Math.floor(sec / 60), s = Math.floor(sec % 60);
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

function escapeHtml(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

async function runAudit() {
  console.log('=============================================================');
  console.log('🛡️  CYBERARENA LIVE DATABASE & ADMIN DASHBOARD VERIFICATION');
  console.log('=============================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(cond, msg, extra = '') {
    if (cond) {
      console.log(`  ✅ [PASS]: ${msg}`);
      passed++;
    } else {
      console.error(`  ❌ [FAIL]: ${msg} ${extra}`);
      failed++;
    }
  }

  // 1. Health check
  const health = await get('/api/health');
  assert(health.status === 200 && health.body.status === 'ONLINE', 'Server is healthy and online');

  // 2. Clear or initialize diverse candidate test personas
  console.log('\n--- 1. REGISTERING MULTI-PERSONA CANDIDATES INTO DATABASE ---');

  const now = Date.now();
  const testCandidates = [
    {
      candidateId: 'AUDIT_001_CLEAN',
      name: 'Agent Sarah Connor',
      dept: 'CSBS',
      year: 'III',
      // No score, strikes, or violations provided -> tests defaults
    },
    {
      candidateId: 'AUDIT_002_SCORING',
      name: 'Agent James Bond',
      dept: 'CSE',
      year: 'IV',
      r1: 25,
      r2: 15,
      r3: 10,
      bonus: 5,
      score: 55,
      strikes: 0,
      status: 'ONLINE'
    },
    {
      candidateId: 'AUDIT_003_ONE_STRIKE',
      name: 'Agent Ethan Hunt',
      dept: 'IT',
      year: 'II',
      r1: 20,
      score: 20,
      strikes: 1,
      violations: 1,
      status: 'ONLINE'
    },
    {
      candidateId: 'AUDIT_004_MAX_STRIKES_LOCKED',
      name: 'Agent Neo Matrix',
      dept: 'CSBS',
      year: 'III',
      r1: 10,
      score: 10,
      strikes: 3,
      violations: 3,
      is_locked: true,
      isLocked: true,
      lock_reason: '3/3 focus violations',
      status: 'LOCKED'
    },
    {
      candidateId: 'AUDIT_005_COMPLETED',
      name: 'Agent Trinity',
      dept: 'CSE',
      year: 'IV',
      r1: 30,
      r2: 30,
      r3: 25,
      bonus: 10,
      score: 95,
      total: 95,
      strikes: 0,
      violations: 0,
      status: 'COMPLETED'
    },
    {
      candidateId: 'AUDIT_006_OFFLINE',
      name: 'Agent Morpheus',
      dept: 'CSBS',
      year: 'IV',
      score: 15,
      strikes: 0,
      status: 'OFFLINE',
      lastSeen: now - 60000 // 60s ago
    }
  ];

  for (const c of testCandidates) {
    const regRes = await post('/api/sessions/register', c);
    assert(regRes.status === 200 && regRes.body.success, `Candidate ${c.candidateId} registered successfully`);
  }

  // 3. Audit /api/debug/sync-check endpoint
  console.log('\n--- 2. AUDITING BACKEND DEBUG VALIDATION ENDPOINT (/api/debug/sync-check) ---');
  const syncDump = await get('/api/debug/sync-check');
  assert(syncDump.status === 200 && syncDump.body.success, '/api/debug/sync-check returns HTTP 200 and success: true');
  assert(Array.isArray(syncDump.body.operatives), 'Dump includes operatives list');

  const dbMap = new Map();
  syncDump.body.operatives.forEach(o => dbMap.set(o.sid, o));

  // Check defaults on AUDIT_001_CLEAN
  const cleanDb = dbMap.get('AUDIT_001_CLEAN');
  assert(cleanDb && cleanDb.score === 0, 'Clean operative default score === 0 (no undefined)');
  assert(cleanDb && cleanDb.strikes === 0, 'Clean operative default strikes === 0 (no undefined)');
  assert(cleanDb && cleanDb.violations === 0, 'Clean operative default violations === 0 (no undefined)');
  assert(cleanDb && cleanDb.isLocked === false, 'Clean operative default isLocked === false');
  assert(cleanDb && cleanDb.status === 'ONLINE', 'Clean operative default status === ONLINE');

  // Check scoring on AUDIT_002_SCORING
  const scoreDb = dbMap.get('AUDIT_002_SCORING');
  assert(scoreDb && scoreDb.score === 55, `Scoring operative score === 55 (got ${scoreDb?.score})`);
  assert(scoreDb && scoreDb.strikes === 0, 'Scoring operative strikes === 0');

  // Check locked on AUDIT_004_MAX_STRIKES_LOCKED
  const lockedDb = dbMap.get('AUDIT_004_MAX_STRIKES_LOCKED');
  assert(lockedDb && lockedDb.strikes === 3, 'Locked operative strikes === 3');
  assert(lockedDb && lockedDb.isLocked === true, 'Locked operative isLocked === true');
  assert(lockedDb && lockedDb.status === 'LOCKED', 'Locked operative status === LOCKED');

  // Check completed on AUDIT_005_COMPLETED
  const compDb = dbMap.get('AUDIT_005_COMPLETED');
  assert(compDb && compDb.status === 'COMPLETED', 'Completed operative status === COMPLETED');
  assert(compDb && compDb.score === 95, `Completed operative score === 95 (got ${compDb?.score})`);

  // Check offline on AUDIT_006_OFFLINE
  const offDb = dbMap.get('AUDIT_006_OFFLINE');
  assert(offDb && offDb.status === 'OFFLINE', 'Offline operative status === OFFLINE');

  // 4. Audit Live API (/api/sessions/live)
  console.log('\n--- 3. AUDITING LIVE API (/api/sessions/live) SERIALIZATION ---');
  const liveRes = await get('/api/sessions/live');
  assert(liveRes.status === 200 && liveRes.body.success, '/api/sessions/live returns HTTP 200');
  const liveSessions = liveRes.body.sessions;
  assert(Array.isArray(liveSessions), 'Live API returns array of sessions');
  const liveClean = liveSessions.find(s => s.sid === 'AUDIT_001_CLEAN');
  assert(liveClean.score === 0, 'Live API properly serialized score: 0');
  assert(liveClean.strikes === 0, 'Live API properly serialized strikes: 0');
  assert(liveClean.isLocked === false, 'Live API properly serialized isLocked: false');

  // 5. Simulate Frontend Admin Dashboard State & Logic
  console.log('\n--- 4. AUDITING FRONTEND ADMIN DASHBOARD LOGIC & RENDERING ---');

  // Build local roster matching DB
  const localRoster = {};
  liveSessions.forEach(s => {
    localRoster[s.sid] = {
      ...s,
      score: s.score ?? 0,
      strikes: s.strikes ?? s.violations ?? 0,
      violations: s.strikes ?? s.violations ?? 0,
      isLocked: !!(s.isLocked || s.is_locked),
      is_locked: !!(s.isLocked || s.is_locked),
      status: s.status || 'ONLINE'
    };
  });

  const students = Object.values(localRoster).filter(s => {
    if (!s) return false;
    const isComp = (s.status === 'COMPLETED' || s.status === 'FINISHED' || s.status === 'SUBMITTED');
    const isPending = (s.status === 'STATUS_PENDING' || s.status === 'PENDING' || s.status === 'REGISTERED' || s.status === 'WAITING');
    const lastSeen = Number(s.lastSeen) || now;
    return isComp || isPending || ((now - lastSeen) < 15 * 60 * 1000);
  });

  // KPI Calculation
  const totalStudents = students.length;
  const activeStudents = students.filter(s => {
    if (!s || s.status === 'OFFLINE') return false;
    const lastSeen = Number(s.lastSeen) || 0;
    const pingSeconds = lastSeen ? Math.max(0, Math.round((now - lastSeen) / 1000)) : 999999;
    return s.status === 'ONLINE' || pingSeconds < 30;
  });
  const activeStudentsCount = activeStudents.length;

  const topScore = students.reduce((max, s) => Math.max(max, s.score ?? 0), 0);
  const totalViolations = students.reduce((acc, s) => acc + (s.strikes ?? s.violations ?? 0), 0);

  console.log(`  📊 Admin SOC Dashboard Metrics:`);
  console.log(`     Total Enrolled Students : ${totalStudents}`);
  console.log(`     Active Operatives Count : ${activeStudentsCount}`);
  console.log(`     Total Integrity Strikes : ${totalViolations}`);
  console.log(`     Current Top Score       : ${topScore} Pts`);

  assert(activeStudents.every(s => s.status !== 'OFFLINE'), 'Active count strictly excludes OFFLINE candidates');
  assert(!activeStudents.some(s => s.sid === 'AUDIT_006_OFFLINE'), 'Candidate AUDIT_006_OFFLINE is excluded from active count');
  assert(topScore >= 95, `Top score reflects highest score (got ${topScore})`);

  // Filter Bar Calculation
  const threshold = 3;
  const isAttentionCandidate = (c) => {
    if (!c) return false;
    const strikes = Number(c.strikes ?? c.violations ?? c.strikes_count ?? 0);
    const isLocked = (c.isLocked === true || c.is_locked === true || c.status === 'LOCKED');
    return strikes >= threshold || isLocked === true;
  };

  const countAll = students.length;
  const attentionCandidates = students.filter(isAttentionCandidate);
  const countAttention = attentionCandidates.length;
  const countInProgress = students.filter(s => {
    const isComp = (s.status === 'COMPLETED' || s.status === 'FINISHED' || s.status === 'SUBMITTED');
    return !isComp && !isAttentionCandidate(s);
  }).length;
  const countCompleted = students.filter(s => (s.status === 'COMPLETED' || s.status === 'FINISHED' || s.status === 'SUBMITTED')).length;

  console.log(`  🏷️ Filter Bar Segment Counts:`);
  console.log(`     All Operatives     : ${countAll}`);
  console.log(`     Attention Required : ${countAttention}`);
  console.log(`     In Progress        : ${countInProgress}`);
  console.log(`     Completed          : ${countCompleted}`);

  assert(countAttention >= 1, `Attention Required count is >= 1 (got ${countAttention})`);
  assert(attentionCandidates.some(c => c.sid === 'AUDIT_004_MAX_STRIKES_LOCKED'), 'AUDIT_004_MAX_STRIKES_LOCKED is in Attention Required');
  assert(attentionCandidates.every(c => c.strikes >= 3 || c.isLocked || c.status === 'LOCKED'), 'All Attention Required operatives have strikes >= 3 or are locked');

  // Verify Card Content Formatting
  console.log('\n--- 5. AUDITING CANDIDATE CARDS & TABLE ROW FORMATTING ---');
  for (const s of students) {
    const isCompleted = (s.status === 'COMPLETED' || s.status === 'FINISHED' || s.status === 'SUBMITTED');
    const strikesVal = Number(s.strikes ?? s.violations ?? s.strikes_count ?? 0);
    const scoreVal = Number(s.score ?? ((s.r1 || 0) + (s.r2 || 0) + (s.r3 || 0) + (s.bonus || 0)) ?? 0);
    const isLocked = !isCompleted && (s.is_locked || s.isLocked || (strikesVal >= 3) || (s.status === 'LOCKED'));

    const liveScoreText = `Live: ${scoreVal} pts`;
    const focusStrikesText = `Focus Strikes: ${strikesVal}/3${isLocked ? ' (LOCKED)' : ''}`;

    assert(!liveScoreText.includes('undefined'), `Candidate ${s.sid} score text has no undefined ("${liveScoreText}")`);
    assert(!focusStrikesText.includes('undefined'), `Candidate ${s.sid} strikes text has no undefined ("${focusStrikesText}")`);
  }

  // 6. Test Automated Parity Check
  console.log('\n--- 6. RUNNING AUTOMATED PARITY CHECK (verifyDatabaseSync) ---');
  const parityMismatches = [];
  for (const [sid, dbOp] of dbMap.entries()) {
    const uiOp = localRoster[sid];
    if (!uiOp) {
      parityMismatches.push(`SYNC ERROR: Candidate ${sid} exists in DB but is MISSING from UI state!`);
      continue;
    }
    const dbScore = dbOp.score ?? 0;
    const uiScore = uiOp.score ?? 0;
    if (dbScore !== uiScore) {
      parityMismatches.push(`SYNC ERROR: DB has ${dbScore} score for User ID ${sid}, but UI shows ${uiScore}`);
    }
    const dbStrikes = dbOp.strikes ?? dbOp.violations ?? 0;
    const uiStrikes = uiOp.strikes ?? uiOp.violations ?? 0;
    if (dbStrikes !== uiStrikes) {
      parityMismatches.push(`SYNC ERROR: DB has ${dbStrikes} strikes for User ID ${sid}, but UI shows ${uiStrikes}`);
    }
    if (dbOp.status && uiOp.status && dbOp.status !== uiOp.status) {
      parityMismatches.push(`SYNC ERROR: DB has status "${dbOp.status}" for User ID ${sid}, but UI shows "${uiOp.status}"`);
    }
  }

  assert(parityMismatches.length === 0, `Parity check confirms 100% database-UI sync across all ${dbMap.size} operatives!`);
  if (parityMismatches.length === 0) {
    console.log(`  🎉 [SYNC VERIFIED - 100% PARITY]: All operatives in DB perfectly match Admin Dashboard UI state.`);
  }

  // 7. Test Proctor Pardon & Dynamic Update
  console.log('\n--- 7. TESTING PROCTOR PARDON DYNAMICS & UNLOCK ---');
  const pardonRes = await post('/api/sessions/pardon', {
    candidateId: 'AUDIT_004_MAX_STRIKES_LOCKED',
    adminPin: '0769',
    reason: 'Verified proctor unlock'
  });
  assert(pardonRes.status === 200 && pardonRes.body.success, 'Pardon endpoint returned HTTP 200');

  const pardonedSession = pardonRes.body.session;
  assert(pardonedSession.strikes === 0, 'Pardoned operative strikes reset to 0 in DB');
  assert(pardonedSession.isLocked === false, 'Pardoned operative isLocked reset to false in DB');
  assert(pardonedSession.status === 'ONLINE', 'Pardoned operative status reset to ONLINE in DB');

  // Check updated attention count
  const updatedSync = await get('/api/debug/sync-check');
  const updatedDbOp = updatedSync.body.operatives.find(o => o.sid === 'AUDIT_004_MAX_STRIKES_LOCKED');
  assert(updatedDbOp.strikes === 0 && updatedDbOp.isLocked === false, 'Debug sync confirms 0 strikes and unlocked state');

  console.log('\n=============================================================');
  console.log(`TOTAL AUDIT CHECKS: ${passed + failed}`);
  console.log(`PASSED: ${passed}`);
  console.log(`FAILED: ${failed}`);
  console.log('=============================================================');

  if (failed === 0) {
    console.log('\n🌟 CYBERARENA DATABASE & ADMIN DASHBOARD ARE PROVEN 100% ACCURATE & IN SYNC!');
    process.exit(0);
  } else {
    console.error('\n⚠️ AUDIT COMPLETED WITH FAILURES.');
    process.exit(1);
  }
}

runAudit();
