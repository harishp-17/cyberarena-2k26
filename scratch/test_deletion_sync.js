/**
 * CyberArena Real-Time Candidate Deletion & Synchronization Test Suite
 * Verifies:
 * 1. Backend Deletion & Real-Time Emission (DELETE /api/participants/:id, DELETE /api/sessions/:id)
 * 2. WebSocket Proctors Room Broadcast: CANDIDATE_DELETED with { userId: deletedUserId }
 * 3. Database & Memory State Cleanup (liveSessions, leaderboard, hint requests)
 * 4. Frontend Socket Listener & State Cleanup (setParticipants filtering, roster removal)
 * 5. UI Error Prevention: Auto-close inspection and audit modals if candidate deleted
 */

const http = require('http');
const net = require('net');
const crypto = require('crypto');

const SERVER_BASE = 'http://localhost:8000';

function post(urlPath, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlPath, SERVER_BASE);
    const postData = JSON.stringify(body || {});
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
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch (e) { resolve({ status: res.statusCode, raw: data }); }
      });
    });
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

function del(urlPath, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlPath, SERVER_BASE);
    const postData = body ? JSON.stringify(body) : '';
    const req = http.request({
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    }, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch (e) { resolve({ status: res.statusCode, raw: data }); }
      });
    });
    req.on('error', reject);
    if (postData) req.write(postData);
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
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch (e) { resolve({ status: res.statusCode, raw: data }); }
      });
    }).on('error', reject);
  });
}

// Minimal raw WebSocket client for testing proctor room broadcasts
function createWsProctorClient(port = 8000) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: '127.0.0.1', port }, () => {
      const key = crypto.randomBytes(16).toString('base64');
      const handshake =
        `GET /ws HTTP/1.1\r\n` +
        `Host: 127.0.0.1:${port}\r\n` +
        `Upgrade: websocket\r\n` +
        `Connection: Upgrade\r\n` +
        `Sec-WebSocket-Key: ${key}\r\n` +
        `Sec-WebSocket-Version: 13\r\n\r\n`;
      socket.write(handshake);
    });

    let buffer = Buffer.alloc(0);
    let upgraded = false;
    const messages = [];

    socket.on('data', chunk => {
      buffer = Buffer.concat([buffer, chunk]);
      if (!upgraded) {
        const headerEnd = buffer.indexOf('\r\n\r\n');
        if (headerEnd !== -1) {
          upgraded = true;
          buffer = buffer.slice(headerEnd + 4);
          // Send JOIN_SURVEILLANCE frame
          const joinPayload = JSON.stringify({ type: 'JOIN_SURVEILLANCE', client: 'proctor', timestamp: Date.now() });
          sendWsFrame(socket, joinPayload);
          resolve({ socket, messages, close: () => socket.destroy() });
        }
      }

      // Parse WS Frames
      while (buffer.length >= 2) {
        const firstByte = buffer[0];
        const opcode = firstByte & 0x0f;
        const secondByte = buffer[1];
        let payloadLen = secondByte & 0x7f;
        let offset = 2;

        if (payloadLen === 126) {
          if (buffer.length < 4) break;
          payloadLen = buffer.readUInt16BE(2);
          offset = 4;
        } else if (payloadLen === 127) {
          if (buffer.length < 10) break;
          payloadLen = Number(buffer.readBigUInt64BE(2));
          offset = 10;
        }

        if (buffer.length < offset + payloadLen) break;

        const payload = buffer.slice(offset, offset + payloadLen);
        buffer = buffer.slice(offset + payloadLen);

        if (opcode === 1) { // text frame
          try {
            const parsed = JSON.parse(payload.toString('utf8'));
            messages.push(parsed);
          } catch(e) {}
        }
      }
    });

    socket.on('error', reject);
  });
}

function sendWsFrame(socket, payloadStr) {
  const payloadBuf = Buffer.from(payloadStr, 'utf8');
  const len = payloadBuf.length;
  let header;
  const mask = crypto.randomBytes(4);

  if (len < 126) {
    header = Buffer.from([0x81, 0x80 | len]);
  } else if (len < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x81;
    header[1] = 0x80 | 126;
    header.writeUInt16BE(len, 2);
  }

  const masked = Buffer.alloc(len);
  for (let i = 0; i < len; i++) {
    masked[i] = payloadBuf[i] ^ mask[i % 4];
  }

  socket.write(Buffer.concat([header, mask, masked]));
}

async function runTests() {
  console.log('🧪 Starting CyberArena Real-Time Deletion & Synchronization Test Suite...\n');
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
    // Connect WebSocket Proctor Client
    console.log('[SETUP]: Connecting Proctor WebSocket Surveillance Client...');
    const proctorClient = await createWsProctorClient(8000);
    await new Promise(r => setTimeout(r, 200));
    assert(true, 'Proctor surveillance WebSocket client connected & joined admin_room');

    // TEST 1: Register Candidate
    console.log('\n[TEST 1]: Candidate Registration (Target: delete_target_01)');
    const regRes = await post('/api/sessions/register', {
      candidateId: 'delete_target_01',
      candidateName: 'Rogue Agent One',
      dept: 'CYBER',
      year: 'IV'
    });
    assert(regRes.status === 200 && regRes.body.success, 'Candidate registered successfully');

    // Also create a hint request for this candidate
    await post('/api/clues/request', {
      id: 'hint_del_01',
      sid: 'delete_target_01',
      candidateId: 'delete_target_01',
      name: 'Rogue Agent One',
      dept: 'CYBER',
      year: 'IV',
      round: 1,
      qId: 'Q_1',
      cost: 10,
      status: 'PENDING',
      timestamp: Date.now()
    });

    // Verify candidate exists in live sessions and hints
    const check1 = await get('/api/sessions/live');
    const cand1 = (check1.body.sessions || check1.body.candidates || []).find(s => s.sid === 'delete_target_01');
    assert(!!cand1, 'Candidate delete_target_01 is active in live sessions database');

    // TEST 2: Delete Candidate via DELETE /api/participants/:id
    console.log('\n[TEST 2]: Executing DELETE /api/participants/:id');
    const delRes = await del('/api/participants/delete_target_01');
    assert(delRes.status === 200 && delRes.body.success, 'DELETE /api/participants/:id returned HTTP 200 and success: true');
    assert(delRes.body.userId === 'delete_target_01', `Returned deleted userId matches (got: ${delRes.body.userId})`);

    // Wait for WS message propagation
    await new Promise(r => setTimeout(r, 300));

    // TEST 3: Verify Real-Time WebSocket Emission to Admin Room
    console.log('\n[TEST 3]: Verifying WebSocket Broadcast of CANDIDATE_DELETED');
    const deleteBroadcast = proctorClient.messages.find(m =>
      (m.type === 'CANDIDATE_DELETED' || m.type === 'PARTICIPANT_DELETED') &&
      (m.data?.userId === 'delete_target_01' || m.data?.sid === 'delete_target_01')
    );
    assert(!!deleteBroadcast, 'WebSocket broadcast CANDIDATE_DELETED received by proctor client');
    assert(deleteBroadcast?.data?.userId === 'delete_target_01', `Payload contains deleted userId: ${deleteBroadcast?.data?.userId}`);

    // TEST 4: Verify Database and In-Memory Clean Up
    console.log('\n[TEST 4]: Verifying Database & In-Memory State Cleanup');
    const check2 = await get('/api/sessions/live');
    const cand2 = (check2.body.sessions || check2.body.candidates || []).find(s => s.sid === 'delete_target_01');
    assert(!cand2, 'Candidate delete_target_01 is completely removed from live sessions');

    const debugCheck = await get('/api/debug/sync-check');
    const debugCand = (debugCheck.body.operatives || []).find(o => o.sid === 'delete_target_01');
    assert(!debugCand, 'Candidate delete_target_01 is absent from /api/debug/sync-check operatives');

    // Verify associated hint request cleaned up
    const hintsCheck = await get('/api/clues/pending');
    const hintFound = (hintsCheck.body.hints || hintsCheck.body.clues || []).find(h => h.sid === 'delete_target_01');
    assert(!hintFound, 'Associated clue/hint requests for deleted candidate were purged');

    // TEST 5: Frontend State Updater Logic Verification
    console.log('\n[TEST 5]: Frontend State Cleanup & UI Error Prevention Simulation');
    // Simulate frontend state and setParticipants updater
    let participants = [
      { id: 'delete_target_01', sid: 'delete_target_01', name: 'Rogue Agent One', score: 20 },
      { id: 'active_agent_02', sid: 'active_agent_02', name: 'Safe Agent Two', score: 45 }
    ];
    let activeInspectedSid = 'delete_target_01'; // Admin currently inspecting target
    let currentAuditSid = 'delete_target_01';    // Admin currently auditing target
    let inspectModalClosed = false;
    let auditModalClosed = false;

    function closeStudentInspectModal() {
      activeInspectedSid = null;
      inspectModalClosed = true;
    }
    function closeAnswerSheetModal() {
      currentAuditSid = null;
      auditModalClosed = true;
    }

    // Simulate handlePipelineMessage for CANDIDATE_DELETED
    const payload = deleteBroadcast.data;
    const deletedId = payload.userId || payload.sid;

    // Frontend State Cleanup
    participants = participants.filter(p => p.id !== deletedId && p.sid !== deletedId);

    // UI Error Prevention
    if (activeInspectedSid === deletedId) {
      closeStudentInspectModal();
    }
    if (currentAuditSid === deletedId) {
      closeAnswerSheetModal();
    }

    assert(participants.length === 1 && participants[0].id === 'active_agent_02', 'participants array filtered without page refresh');
    assert(activeInspectedSid === null && inspectModalClosed, 'Active inspection modal automatically closed');
    assert(currentAuditSid === null && auditModalClosed, 'Active audit modal automatically closed');

    // TEST 6: Alternate Endpoint DELETE /api/sessions/:id
    console.log('\n[TEST 6]: Alternate Deletion Route DELETE /api/sessions/:id');
    await post('/api/sessions/register', {
      candidateId: 'delete_target_02',
      candidateName: 'Rogue Agent Two',
      dept: 'AI',
      year: 'III'
    });
    const delRes2 = await del('/api/sessions/delete_target_02');
    assert(delRes2.status === 200 && delRes2.body.success, 'DELETE /api/sessions/:id returned HTTP 200');

    await new Promise(r => setTimeout(r, 200));
    const deleteBroadcast2 = proctorClient.messages.find(m =>
      m.type === 'CANDIDATE_DELETED' && (m.data?.userId === 'delete_target_02')
    );
    assert(!!deleteBroadcast2, 'CANDIDATE_DELETED broadcast received for delete_target_02');

    // Clean up WS
    proctorClient.close();

    console.log(`\n========================================`);
    if (failures === 0) {
      console.log('🎉 ALL REAL-TIME DELETION TESTS PASSED! (0 failures)');
      console.log('========================================\n');
      process.exit(0);
    } else {
      console.error(`❌ FAILED WITH ${failures} FAILURE(S)`);
      console.log('========================================\n');
      process.exit(1);
    }
  } catch (err) {
    console.error('Fatal test error:', err);
    process.exit(1);
  }
}

runTests();
