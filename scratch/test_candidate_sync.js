const http = require('http');
const crypto = require('crypto');

function sendWsFrame(socket, message) {
  const payload = Buffer.from(message, 'utf8');
  const length = payload.length;
  let header;
  if (length <= 125) {
    header = Buffer.from([0x81, length | 0x80]);
  } else if (length <= 65535) {
    header = Buffer.alloc(4);
    header[0] = 0x81;
    header[1] = 126 | 0x80;
    header.writeUInt16BE(length, 2);
  }
  const maskingKey = crypto.randomBytes(4);
  const maskedPayload = Buffer.alloc(payload.length);
  for (let i = 0; i < payload.length; i++) {
    maskedPayload[i] = payload[i] ^ maskingKey[i % 4];
  }
  socket.write(Buffer.concat([header, maskingKey, maskedPayload]));
}

function parseWsFrames(buffer) {
  const frames = [];
  let offset = 0;
  while (offset < buffer.length) {
    if (buffer.length - offset < 2) break;
    const byte1 = buffer[offset++];
    const byte2 = buffer[offset++];
    const opcode = byte1 & 0x0f;
    let payloadLength = byte2 & 0x7f;
    if (payloadLength === 126) {
      if (buffer.length - offset < 2) break;
      payloadLength = buffer.readUInt16BE(offset);
      offset += 2;
    }
    const isMasked = (byte2 & 0x80) !== 0;
    let maskingKey = null;
    if (isMasked) {
      if (buffer.length - offset < 4) break;
      maskingKey = buffer.slice(offset, offset + 4);
      offset += 4;
    }
    if (buffer.length - offset < payloadLength) break;
    let payload = buffer.slice(offset, offset + payloadLength);
    offset += payloadLength;
    if (isMasked && maskingKey) {
      const unmasked = Buffer.alloc(payload.length);
      for (let i = 0; i < payload.length; i++) {
        unmasked[i] = payload[i] ^ maskingKey[i % 4];
      }
      payload = unmasked;
    }
    frames.push({ opcode, payload });
  }
  return frames;
}

function createWsClient(url) {
  return new Promise((resolve, reject) => {
    const key = crypto.randomBytes(16).toString('base64');
    const req = http.request({
      hostname: 'localhost',
      port: 8000,
      path: '/ws',
      headers: {
        'Connection': 'Upgrade',
        'Upgrade': 'websocket',
        'Sec-WebSocket-Key': key,
        'Sec-WebSocket-Version': 13
      }
    });

    req.on('upgrade', (res, socket) => {
      resolve(socket);
    });
    req.on('error', reject);
    req.end();
  });
}

function postJson(path, body) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const req = http.request({
      hostname: 'localhost',
      port: 8000,
      path: path,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      }
    }, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        resolve({ statusCode: res.statusCode, headers: res.headers, body: JSON.parse(data) });
      });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

function getJson(path) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: 'localhost',
      port: 8000,
      path: path,
      method: 'GET'
    }, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        resolve({ statusCode: res.statusCode, headers: res.headers, body: JSON.parse(data) });
      });
    });
    req.on('error', reject);
    req.end();
  });
}

async function runTest() {
  console.log('🧪 Starting Candidate Registration & Admin Sync Test...');

  // 1. Check Initial Live Sessions GET endpoint & Caching headers
  const initial = await getJson('/api/sessions/live');
  console.log('✓ GET /api/sessions/live Status:', initial.statusCode);
  console.log('✓ Cache-Control header:', initial.headers['cache-control']);
  if (!initial.headers['cache-control'] || !initial.headers['cache-control'].includes('no-cache')) {
    throw new Error('Missing no-cache in /api/sessions/live headers');
  }

  // 2. Connect Admin WebSocket
  const adminSocket = await createWsClient('/ws');
  console.log('✓ Admin WebSocket connected');

  const receivedEvents = [];
  adminSocket.on('data', buf => {
    const frames = parseWsFrames(buf);
    for (const frame of frames) {
      if (frame.opcode === 1) {
        try {
          const msg = JSON.parse(frame.payload.toString('utf8'));
          receivedEvents.push(msg);
        } catch (e) { }
      }
    }
  });

  // Join surveillance room
  sendWsFrame(adminSocket, JSON.stringify({ type: 'JOIN_SURVEILLANCE' }));
  await new Promise(r => setTimeout(r, 200));

  const hasSnapshot = receivedEvents.some(e => e.type === 'SURVEILLANCE_SNAPSHOT');
  console.log('✓ Admin received SURVEILLANCE_SNAPSHOT:', hasSnapshot);
  if (!hasSnapshot) throw new Error('Failed to receive SURVEILLANCE_SNAPSHOT');

  // 3. Register a student via REST API
  const newStudent1 = {
    candidateId: 'cand_test_001',
    candidateName: 'Priya Patel',
    dept: 'CSBS',
    year: 'III',
    status: 'STATUS_PENDING'
  };

  const regRes = await postJson('/api/sessions/register', newStudent1);
  console.log('✓ POST /api/sessions/register status:', regRes.statusCode);
  console.log('✓ Registration response candidate:', regRes.body.candidate.name);

  // Wait for WebSocket delivery
  await new Promise(r => setTimeout(r, 300));

  const cand1Registered = receivedEvents.find(e => e.type === 'CANDIDATE_REGISTERED' && (e.data?.candidate?.sid === 'cand_test_001' || e.data?.sid === 'cand_test_001'));
  console.log('✓ Admin received CANDIDATE_REGISTERED via WebSocket for REST registration:', !!cand1Registered);
  if (!cand1Registered) throw new Error('Admin did not receive CANDIDATE_REGISTERED for REST candidate');

  // 4. Register a student via WebSocket
  const studentSocket = await createWsClient('/ws');
  const newStudent2 = {
    candidateId: 'cand_test_002',
    candidateName: 'Rahul Verma',
    dept: 'CSE',
    year: 'II',
    status: 'STATUS_PENDING'
  };
  sendWsFrame(studentSocket, JSON.stringify({ type: 'CANDIDATE_REGISTERED', data: newStudent2 }));

  await new Promise(r => setTimeout(r, 300));

  const cand2Registered = receivedEvents.find(e => e.type === 'CANDIDATE_REGISTERED' && (e.data?.candidate?.sid === 'cand_test_002' || e.data?.sid === 'cand_test_002'));
  console.log('✓ Admin received CANDIDATE_REGISTERED via WebSocket for Socket registration:', !!cand2Registered);
  if (!cand2Registered) throw new Error('Admin did not receive CANDIDATE_REGISTERED for WebSocket candidate');

  // 5. Verify both candidates in database
  const liveCheck = await getJson('/api/sessions/live');
  const found1 = liveCheck.body.sessions.some(s => s.sid === 'cand_test_001');
  const found2 = liveCheck.body.sessions.some(s => s.sid === 'cand_test_002');
  console.log('✓ Candidate 1 persisted in database:', found1);
  console.log('✓ Candidate 2 persisted in database:', found2);

  if (!found1 || !found2) throw new Error('Candidates not found in live database');

  adminSocket.destroy();
  studentSocket.destroy();
  console.log('\n🎉 ALL SYNCHRONIZATION TESTS PASSED SUCCESSFULLY!');
}

runTest().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
