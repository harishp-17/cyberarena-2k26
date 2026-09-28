/**
 * CyberArena Database & Admin Dashboard Synchronization Parity Test Suite
 * Tests Part 1 (Defaults, active metrics, attention badge) & Part 2 (Debug sync endpoint, Parity checker)
 */

const http = require('http');

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

async function runTests() {
  console.log('🧪 Starting CyberArena DB & Admin Dashboard Parity Verification Test Suite...\n');
  let failures = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`  ✅ PASS: ${message}`);
    } else {
      console.error(`  ❌ FAIL: ${message}`);
      failures++;
    }
  }

  try {
    // Test 1: Register Candidate without score or strikes provided (defaults verification)
    console.log('[TEST 1]: Candidate Registration Defaults (score: 0, strikes: 0, status: ONLINE)');
    const regRes = await post('/api/sessions/register', {
      candidateId: 'test_cand_alpha',
      candidateName: 'John Operator',
      dept: 'CSBS',
      year: 'III'
      // Notice: No score, strikes, or violations provided
    });

    assert(regRes.status === 200 && regRes.body.success, 'Registration HTTP 200 and success: true');
    const session = regRes.body.session || regRes.body.candidate;
    assert(session.score === 0, `Database default score is 0 (got: ${session.score})`);
    assert(session.strikes === 0, `Database default strikes is 0 (got: ${session.strikes})`);
    assert(session.violations === 0, `Database default violations is 0 (got: ${session.violations})`);
    assert(session.isLocked === false && session.is_locked === false, 'Database isLocked is false by default');
    assert(session.status === 'ONLINE' || session.status === 'STATUS_PENDING', `Database status is ONLINE (got: ${session.status})`);

    // Test 2: Backend Validation Endpoint /api/debug/sync-check
    console.log('\n[TEST 2]: Validation Endpoint GET /api/debug/sync-check');
    const syncRes = await get('/api/debug/sync-check');
    assert(syncRes.status === 200 && syncRes.body.success, '/api/debug/sync-check returned HTTP 200');
    assert(Array.isArray(syncRes.body.operatives), 'Response contains operatives array');
    const dbOp = syncRes.body.operatives.find(o => o.sid === 'test_cand_alpha');
    assert(!!dbOp, 'Registered operative test_cand_alpha exists in debug sync dump');
    assert(dbOp.score === 0, `Operative raw DB score is 0 (got: ${dbOp.score})`);
    assert(dbOp.strikes === 0, `Operative raw DB strikes is 0 (got: ${dbOp.strikes})`);
    assert(dbOp.isLocked === false, `Operative raw DB isLocked is false (got: ${dbOp.isLocked})`);

    // Test 3: Tab Focus Violations & Lockout State Transition
    console.log('\n[TEST 3]: Tab Focus Violations & Max Strike Lockout');
    // First violation
    await post('/api/sessions/tab-focus', {
      sid: 'test_cand_alpha',
      violations: 1,
      strikes: 1,
      isTabHidden: true
    });
    let check1 = await get('/api/debug/sync-check');
    let op1 = check1.body.operatives.find(o => o.sid === 'test_cand_alpha');
    assert(op1.strikes === 1, `Operative strikes incremented to 1 (got: ${op1.strikes})`);
    assert(op1.isLocked === false, 'Operative terminal is not locked at strike 1');

    // Max out strikes to 3 (Threshold)
    await post('/api/sessions/tab-focus', {
      sid: 'test_cand_alpha',
      violations: 3,
      strikes: 3,
      isTabHidden: true,
      lock_reason: '3/3 focus violations'
    });
    let check2 = await get('/api/debug/sync-check');
    let op2 = check2.body.operatives.find(o => o.sid === 'test_cand_alpha');
    assert(op2.strikes === 3, `Operative strikes maxed to 3 (got: ${op2.strikes})`);
    assert(op2.isLocked === true, `Operative isLocked transitioned to true (got: ${op2.isLocked})`);
    assert(op2.status === 'LOCKED', `Operative status transitioned to LOCKED (got: ${op2.status})`);

    // Test 4: Frontend Parity Verification Logic Simulation
    console.log('\n[TEST 4]: Frontend Parity Verification Simulation');
    // Simulate UI local roster matching DB perfectly
    const uiLocalRosterMatching = {
      'test_cand_alpha': {
        sid: 'test_cand_alpha',
        name: 'John Operator',
        score: op2.score,
        strikes: op2.strikes,
        violations: op2.violations,
        isLocked: op2.isLocked,
        is_locked: op2.is_locked,
        status: op2.status
      }
    };

    function simulateVerifySync(dbList, uiRoster) {
      const mismatches = [];
      const dbMap = new Map();
      dbList.forEach(op => dbMap.set(op.sid, op));

      for (const [sid, dbO] of dbMap.entries()) {
        const uiO = uiRoster[sid];
        if (!uiO) {
          mismatches.push(`SYNC ERROR: Candidate ${sid} exists in DB but is MISSING from UI state!`);
          continue;
        }
        if ((dbO.score ?? 0) !== (uiO.score ?? 0)) {
          mismatches.push(`SYNC ERROR: DB has ${dbO.score ?? 0} score for User ID ${sid}, but UI shows ${uiO.score ?? 0}`);
        }
        if ((dbO.strikes ?? 0) !== (uiO.strikes ?? 0)) {
          mismatches.push(`SYNC ERROR: DB has ${dbO.strikes ?? 0} strikes for User ID ${sid}, but UI shows ${uiO.strikes ?? 0}`);
        }
        if (dbO.status && uiO.status && dbO.status !== uiO.status) {
          mismatches.push(`SYNC ERROR: DB has status "${dbO.status}" for User ID ${sid}, but UI shows "${uiO.status}"`);
        }
      }
      return mismatches;
    }

    const matchErrors = simulateVerifySync([op2], uiLocalRosterMatching);
    assert(matchErrors.length === 0, `Parity check confirms 100% in-sync state (0 errors)`);

    // Simulate intentional mismatch (e.g. DB has 3 strikes, UI shows 0)
    const uiLocalRosterMismatched = {
      'test_cand_alpha': {
        sid: 'test_cand_alpha',
        name: 'John Operator',
        score: 0,
        strikes: 0, // Mismatched!
        status: 'ONLINE'
      }
    };
    const diffErrors = simulateVerifySync([op2], uiLocalRosterMismatched);
    assert(diffErrors.length >= 1, `Parity check detects intentional divergence (${diffErrors.length} errors)`);
    assert(diffErrors[0].includes('SYNC ERROR: DB has 3 strikes for User ID test_cand_alpha, but UI shows 0'), `Exact expected error logged: "${diffErrors[0]}"`);

    // Test 5: Proctor Pardon & Unlock
    console.log('\n[TEST 5]: Proctor Pardon & Unlock Workflow');
    const pardonRes = await post('/api/sessions/pardon', {
      sid: 'test_cand_alpha',
      adminPin: '0769',
      reason: 'Proctor reset after inspection'
    });
    assert(pardonRes.status === 200 && pardonRes.body.success, 'Pardon endpoint returned HTTP 200');
    let check3 = await get('/api/debug/sync-check');
    let op3 = check3.body.operatives.find(o => o.sid === 'test_cand_alpha');
    assert(op3.strikes === 0, `Strikes reset to 0 after pardon (got: ${op3.strikes})`);
    assert(op3.isLocked === false, `isLocked reset to false after pardon (got: ${op3.isLocked})`);
    assert(op3.status === 'ONLINE', `Status reset to ONLINE after pardon (got: ${op3.status})`);

    console.log(`\n=============================================================`);
    if (failures === 0) {
      console.log('🎉 ALL DB & ADMIN DASHBOARD PARITY TESTS PASSED SUCCESSFULLY (0 Failures)');
      process.exit(0);
    } else {
      console.error(`💥 ${failures} TEST FAILURE(S) DETECTED`);
      process.exit(1);
    }
  } catch (err) {
    console.error('💥 Test suite execution error:', err);
    process.exit(1);
  }
}

runTests();
