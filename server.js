/**
 * CyberArena Production Real-Time Proctor & Candidate Server
 * Zero-dependency Node.js HTTP, REST API, Server-Sent Events (SSE), and RFC 6455 WebSocket Server.
 * Port: 8000
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 8000;
const ROOT_DIR = path.resolve(__dirname);

// In-Memory Real-Time Stores
const liveSessions = new Map(); // candidateId -> sessionObj
const hintRequests = new Map(); // requestId -> hintObj
const securityAuditLog = [];
let leaderboardCache = [];

// Arena Tournament Round Orchestration State
let arenaTournamentState = {
  currentRound: 1,
  roundDuration: 1800,
  durationSeconds: 1800,
  roundStartedAt: Date.now(),
  roundStatus: 'ACTIVE', // 'ACTIVE' | 'ALL_FINISHED' | 'FINAL_ROUND_ENDED'
  maxRounds: 3,
  isConcluded: false
};

function getTournamentMetrics() {
  const curRound = arenaTournamentState.currentRound;
  const sessions = Array.from(liveSessions.values()).filter(s =>
    (s.role !== 'ADMIN' && s.role !== 'PROCTOR' && s.sid !== 'admin' && s.sid !== 'proctor') &&
    ((Date.now() - (s.lastSeen || 0)) < 15 * 60 * 1000 || s.status === 'COMPLETED')
  );

  const totalConnected = sessions.length;
  let activeTestingCount = 0;
  let waitingLoungeCount = 0;

  for (const s of sessions) {
    const isCompleted = s.status === 'COMPLETED' || (s.r3 != null && s.r3 > 0);
    const loc = (s.currentLocation || '').toLowerCase();
    const inLounge = s.round === 'WAITING' || loc.includes('waiting') || loc.includes('lounge');

    if (curRound === 1) {
      if (isCompleted || (s.r1 != null && s.r1 > 0) || s.round === 'R2' || s.round === 'R3' || inLounge) {
        waitingLoungeCount++;
      } else {
        activeTestingCount++;
      }
    } else if (curRound === 2) {
      if (isCompleted || (s.r2 != null && s.r2 > 0) || s.round === 'R3' || inLounge) {
        waitingLoungeCount++;
      } else {
        activeTestingCount++;
      }
    } else {
      if (isCompleted || (s.r3 != null && s.r3 > 0)) {
        waitingLoungeCount++;
      } else {
        activeTestingCount++;
      }
    }
  }

  if (arenaTournamentState.isConcluded || curRound > 3) {
    arenaTournamentState.roundStatus = 'FINAL_ROUND_ENDED';
  } else if (totalConnected > 0 && activeTestingCount === 0) {
    arenaTournamentState.roundStatus = 'ALL_FINISHED';
  } else {
    arenaTournamentState.roundStatus = 'ACTIVE';
  }

  return {
    currentRound: curRound,
    roundDuration: arenaTournamentState.roundDuration || arenaTournamentState.durationSeconds,
    durationSeconds: arenaTournamentState.durationSeconds,
    roundStartedAt: arenaTournamentState.roundStartedAt,
    roundStatus: arenaTournamentState.roundStatus,
    activeTestingCount,
    waitingLoungeCount,
    totalConnected
  };
}

// Seed default simulated participants if empty
function initDefaultSessions() {
  const now = Date.now();
  const demoList = [
    {
      sid: 'sim_sharma',
      name: 'A. Sharma',
      dept: 'CSBS',
      year: 'III',
      round: 'R1',
      currentLocation: 'Round 1 · Q5: Network Topologies',
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
      lastSeen: now - 1200,
      status: 'IN_PROGRESS',
      isSim: true,
      durationSeconds: 1920,
      accuracy_rate: 86.7,
      history: [
        { time: now - 480000, desc: 'Candidate authenticated · Entered Arena' },
        { time: now - 320000, desc: 'Completed Round 1 (24 pts)' },
        { time: now - 140000, desc: 'Completed Round 2 (11 pts)' }
      ]
    },
    {
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
      lastSeen: now - 2500,
      status: 'IN_PROGRESS',
      isSim: true,
      durationSeconds: 2040,
      accuracy_rate: 84.4,
      history: [
        { time: now - 450000, desc: 'Entered Arena' },
        { time: now - 220000, desc: 'Finished Round 1 (22 pts)' },
        { time: now - 14000, desc: 'TAB SWITCH DETECTED: Window blurred (Strike 1/3 logged)' }
      ]
    },
    {
      sid: 'sim_menon',
      name: 'P. Menon',
      dept: 'CSBS',
      year: 'IV',
      round: 'R1',
      currentLocation: 'Round 1 · Q14: Ransomware Vector Analysis',
      qStartTime: now - 45000,
      qTitle: 'Which of the following is the most prevalent vector for corporate ransomware delivery?',
      qOptions: ['Encrypted Malicious Email Attachment', 'Direct bad-USB insertion', 'Tampered HDMI cable', 'Satellite interception'],
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
      lastSeen: now - 3100,
      status: 'IN_PROGRESS',
      isSim: true,
      durationSeconds: 2200,
      accuracy_rate: 66.7,
      history: [
        { time: now - 400000, desc: 'Candidate authenticated · Entered Arena' },
        { time: now - 45000, desc: 'Solving Round 1 Q14' }
      ]
    },
    {
      sid: 'sim_das',
      name: 'S. Das',
      dept: 'ECE',
      year: 'III',
      round: 'R2',
      currentLocation: 'Round 2 · Cipher Challenge #8 (Base64)',
      qStartTime: now - 65000,
      qTitle: 'Decode Base64 payload',
      qOptions: [],
      selectedOptionIdx: null,
      inputText: '',
      score: 18,
      r1: 18,
      r2: 0,
      r3: 0,
      bonus: 0,
      violations: 3,
      strikes_count: 3,
      lifetime_violations: 3,
      is_locked: true,
      lock_reason: 'Maximum focus violations exceeded (3/3). Terminal locked by surveillance system.',
      pardon_history: [],
      lastViolationTime: now - 18000,
      isTabHidden: false,
      lastSeen: now - 4000,
      status: 'LOCKED',
      isSim: true,
      durationSeconds: 1500,
      accuracy_rate: 60.0,
      history: [
        { time: now - 350000, desc: 'Entered Arena' },
        { time: now - 18000, desc: 'TERMINAL LOCKED: 3 Strikes accumulated. Awaiting proctor pardon.' }
      ]
    },
    {
      sid: 'sim_varma',
      name: 'Dr. S. Varma',
      dept: 'CSE',
      year: 'IV',
      round: 'R1',
      currentLocation: 'Exam Completed & Submitted',
      qStartTime: now - 300000,
      qTitle: 'Final Case Study Completed',
      qOptions: [],
      selectedOptionIdx: null,
      inputText: 'COMPLETED',
      score: 48,
      r1: 25,
      r2: 15,
      r3: 5,
      bonus: 3,
      violations: 0,
      strikes_count: 0,
      lifetime_violations: 0,
      is_locked: false,
      pardon_history: [],
      lastViolationTime: 0,
      isTabHidden: false,
      lastSeen: now - 300000,
      status: 'COMPLETED',
      isSim: true,
      durationSeconds: 1710,
      accuracy_rate: 100.0,
      history: [
        { time: now - 1710000, desc: 'Candidate authenticated · Entered Arena' },
        { time: now - 1200000, desc: 'Finished Round 1: Cyber Quiz Master (25/25 pts)' },
        { time: now - 700000, desc: 'Finished Round 2: Cyber Arcade (15/15 pts)' },
        { time: now - 300000, desc: '🏁 Final Case Study submitted. Total Score: 48 pts (Duration: 28:30)' }
      ]
    }
  ];

  demoList.forEach(s => liveSessions.set(s.sid, s));

  // Seed pending hint
  hintRequests.set('req_sim_menon', {
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

  recalculateLeaderboard();
}

function recalculateLeaderboard() {
  const sessions = Array.from(liveSessions.values());
  sessions.forEach(s => {
    s.total = (s.r1 || 0) + (s.r2 || 0) + (s.r3 || 0) + (s.bonus || 0);
  });

  sessions.sort((a, b) => {
    if (b.total !== a.total) return b.total - a.total;
    const durA = Number(a.durationSeconds) || 1800;
    const durB = Number(b.durationSeconds) || 1800;
    if (durA !== durB) return durA - durB;
    const accA = Number(a.accuracy_rate != null ? a.accuracy_rate : 0);
    const accB = Number(b.accuracy_rate != null ? b.accuracy_rate : 0);
    if (accB !== accA) return accB - accA;
    const violA = Number(a.violations) || 0;
    const violB = Number(b.violations) || 0;
    return violA - violB;
  });

  leaderboardCache = sessions.map((s, idx) => ({
    rank: idx + 1,
    sid: s.sid,
    name: s.name,
    dept: s.dept,
    year: s.year,
    r1: s.r1 || 0,
    r2: s.r2 || 0,
    r3: s.r3 || 0,
    bonus: s.bonus || 0,
    total: s.total,
    violations: s.violations || 0,
    status: s.status || 'IN_PROGRESS',
    durationSeconds: s.durationSeconds || 1800,
    accuracy_rate: s.accuracy_rate || 0
  }));
}

// WebSocket Rooms & Connected Clients
const socketRooms = {
  proctor_surveillance_channel: new Set(),
  candidates: new Map() // sid -> Set<socket>
};

const sseClients = new Set(); // Set of res objects for Server-Sent Events fallback

function broadcastToProctors(event, data) {
  const payload = JSON.stringify({ type: event, data, timestamp: Date.now() });

  // 1. WebSocket Proctors
  for (const client of socketRooms.proctor_surveillance_channel) {
    if (client.writable && !client.destroyed) {
      try { sendWsFrame(client, payload); } catch (err) { console.error('[SURVEILLANCE_PIPE_ERROR]: Ws send failed:', err); }
    }
  }

  // 2. SSE Clients Fallback
  const sseMsg = `event: ${event}\ndata: ${payload}\n\n`;
  for (const res of sseClients) {
    try { res.write(sseMsg); } catch (err) { sseClients.delete(res); }
  }
}

function sendToCandidate(sid, event, data) {
  const payload = JSON.stringify({ type: event, data, timestamp: Date.now() });
  const clientSet = socketRooms.candidates.get(sid);
  if (clientSet) {
    for (const client of clientSet) {
      if (client.writable && !client.destroyed) {
        try { sendWsFrame(client, payload); } catch (err) { console.error('[SURVEILLANCE_PIPE_ERROR]: Candidate ws send failed:', err); }
      }
    }
  }

  // Also broadcast to SSE with candidateId targeted
  const sseMsg = `event: ${event}\ndata: ${payload}\n\n`;
  for (const res of sseClients) {
    try { res.write(sseMsg); } catch (err) { sseClients.delete(res); }
  }
}

function broadcastToAllCandidates(event, data) {
  const payload = JSON.stringify({ type: event, data, timestamp: Date.now() });
  for (const clientSet of socketRooms.candidates.values()) {
    for (const client of clientSet) {
      if (client.writable && !client.destroyed) {
        try { sendWsFrame(client, payload); } catch (err) { console.error('[SURVEILLANCE_PIPE_ERROR]: Candidate ws broadcast failed:', err); }
      }
    }
  }

  const sseMsg = `event: ${event}\ndata: ${payload}\n\n`;
  for (const res of sseClients) {
    try { res.write(sseMsg); } catch (err) { sseClients.delete(res); }
  }
}

function broadcastToEntireArena(event, data) {
  broadcastToProctors(event, data);
  broadcastToAllCandidates(event, data);
}

function handleAdvanceRound(fromRound, toRound, proctorName, forceSubmitActive) {
  fromRound = Number(fromRound || arenaTournamentState.currentRound || 1);
  toRound = Number(toRound || (fromRound + 1));
  proctorName = proctorName || 'Admin SOC Command';

  const roundDurations = { 1: 1800, 2: 1800, 3: 3600 };
  const newDuration = roundDurations[toRound] || 1800;

  arenaTournamentState.currentRound = toRound;
  arenaTournamentState.roundDuration = newDuration;
  arenaTournamentState.durationSeconds = newDuration;
  arenaTournamentState.roundStartedAt = Date.now();
  if (toRound > (arenaTournamentState.maxRounds || 3)) {
    arenaTournamentState.isConcluded = true;
    arenaTournamentState.roundStatus = 'FINAL_ROUND_ENDED';
  } else {
    arenaTournamentState.roundStatus = 'ACTIVE';
  }

  // Auto-submit, flush and advance lingering candidate sessions
  for (const [sid, session] of liveSessions.entries()) {
    if (session.role === 'ADMIN' || session.role === 'PROCTOR') continue;
    session.currentRound = toRound;
    if (session.status !== 'COMPLETED') {
      const wasTesting = (session.round !== 'WAITING' && session.round !== 'R' + toRound);
      if (wasTesting && forceSubmitActive) {
        session.submissionType = 'AUTO_SUBMITTED_BY_ADMIN';
      }
      session.status = 'ROUND_START';
      session.round = 'R' + toRound;
      session.currentLocation = `Round ${toRound} Active`;
      session.lastSeen = Date.now();
      if (!Array.isArray(session.history)) session.history = [];
      session.history.push({
        time: Date.now(),
        desc: `⚡ Proctor advanced arena to Round ${toRound}. Answers auto-submitted & synchronized.`
      });
    }
  }
  recalculateLeaderboard();

  const auditEntry = {
    time: Date.now(),
    type: 'ARENA_ROUND_ADVANCED',
    desc: `🚀 Proctor ${proctorName} advanced arena to Round ${toRound}. All candidates synchronized.`
  };
  securityAuditLog.push(auditEntry);

  const metrics = getTournamentMetrics();

  const payload = {
    fromRound,
    newRound: toRound,
    targetRound: toRound,
    durationSeconds: newDuration,
    roundDuration: newDuration,
    startedAt: arenaTournamentState.roundStartedAt,
    roundStartedAt: arenaTournamentState.roundStartedAt,
    proctorName,
    forceSubmitActive: true,
    tournamentState: {
      ...arenaTournamentState,
      ...metrics
    }
  };


  // Broadcast ROUND_ADVANCED, ARENA_ROUND_ADVANCED, and ROUND_FORCE_ADVANCED
  broadcastToEntireArena('ROUND_ADVANCED', payload);
  broadcastToEntireArena('ARENA_ROUND_ADVANCED', payload);
  broadcastToEntireArena('ROUND_FORCE_ADVANCED', payload);
  broadcastToProctors('LEADERBOARD_UPDATED', { leaderboard: leaderboardCache });
  broadcastToProctors('SURVEILLANCE_SNAPSHOT', {
    sessions: Array.from(liveSessions.values()),
    hints: Array.from(hintRequests.values()),
    count: liveSessions.size,
    tournamentState: {
      ...arenaTournamentState,
      ...metrics
    }
  });

  return payload;
}

// HTTP Static File Server & REST Endpoints
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.md': 'text/markdown; charset=utf-8'
};

function setCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, DELETE');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, X-Session-Id');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
}

function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch (err) {
        try {
          // Handle URL-encoded or raw form
          const parsed = Object.fromEntries(new URLSearchParams(body));
          resolve(parsed);
        } catch (e) {
          resolve({});
        }
      }
    });
    req.on('error', err => reject(err));
  });
}

const server = http.createServer(async (req, res) => {
  setCorsHeaders(res);

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost:8000'}`);
  const pathname = parsedUrl.pathname;

  // -------------------------------------------------------------
  // REST API ENDPOINTS
  // -------------------------------------------------------------

  // 1. Health Check
  if (pathname === '/api/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ONLINE', timestamp: Date.now(), activeSessions: liveSessions.size }));
    return;
  }

  // 2. Fetch All Live Sessions (Immediate Proctor Mount/Refresh)
  if (pathname === '/api/sessions/live' && req.method === 'GET') {
    const list = Array.from(liveSessions.values());
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, count: list.length, sessions: list, timestamp: Date.now() }));
    return;
  }

  // 3. Register Candidate Handshake
  if (pathname === '/api/sessions/register' && req.method === 'POST') {
    try {
      const data = await parseJsonBody(req);
      const sid = data.candidateId || data.sid || ('CA' + Date.now().toString(36));
      const now = Date.now();

      const session = {
        sid: sid,
        name: data.candidateName || data.name || 'Anonymous Operative',
        dept: data.dept || 'CSBS',
        year: data.year || 'III',
        round: data.round || 'INSTR',
        currentLocation: data.currentLocation || 'Reading Round Instructions',
        qTitle: data.qTitle || '',
        qOptions: data.qOptions || [],
        selectedOptionIdx: data.selectedOptionIdx != null ? data.selectedOptionIdx : null,
        inputText: data.inputText || '',
        score: data.score || 0,
        r1: data.r1 || 0,
        r2: data.r2 || 0,
        r3: data.r3 || 0,
        bonus: data.bonus || 0,
        violations: data.violations || 0,
        strikes_count: data.strikes_count || 0,
        lifetime_violations: data.lifetime_violations || 0,
        is_locked: !!data.is_locked,
        lock_reason: data.lock_reason || '',
        pardon_history: data.pardon_history || [],
        isTabHidden: !!data.isTabHidden,
        lastSeen: now,
        status: data.status || 'IN_PROGRESS',
        isSim: false,
        durationSeconds: data.durationSeconds || 0,
        accuracy_rate: data.accuracy_rate || 0,
        history: [{ time: now, desc: 'Candidate authenticated · Entered Arena' }]
      };

      liveSessions.set(sid, session);
      recalculateLeaderboard();

      // Broadcast immediate handshake to all proctors
      broadcastToProctors('PARTICIPANT_REGISTERED', session);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, sid, session }));
    } catch (err) {
      console.error('[SURVEILLANCE_PIPE_ERROR]: Registration error:', err);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // 4. Heartbeat Telemetry & Focus Update
  if (pathname === '/api/sessions/heartbeat' && req.method === 'POST') {
    try {
      const data = await parseJsonBody(req);
      const sid = data.candidateId || data.sid;
      if (!sid) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'Missing sid' }));
        return;
      }

      let existing = liveSessions.get(sid) || {};
      const now = Date.now();

      const updated = {
        ...existing,
        ...data,
        sid: sid,
        lastSeen: now,
        history: existing.history || []
      };

      liveSessions.set(sid, updated);
      broadcastToProctors('HEARTBEAT_PING', updated);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, timestamp: now }));
    } catch (err) {
      console.error('[SURVEILLANCE_PIPE_ERROR]: Heartbeat error:', err);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // 5. Tab Focus Change & Violation Reporting
  if (pathname === '/api/sessions/tab-focus' && req.method === 'POST') {
    try {
      const data = await parseJsonBody(req);
      const sid = data.candidateId || data.sid;

      // Admin & Proctor Safety Guard: Reject all strikes/lockouts originating from admin sessions
      if (data.role === 'ADMIN' || data.role === 'PROCTOR' || data.is_admin || sid === 'admin' || sid === 'proctor') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, ignored: true, reason: 'Admin exempt from tab violations' }));
        return;
      }

      const session = liveSessions.get(sid);
      if (session && (session.role === 'ADMIN' || session.role === 'PROCTOR')) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, ignored: true, reason: 'Admin session exempt' }));
        return;
      }
      if (session) {
        session.isTabHidden = !!data.isTabHidden;
        if (data.violations != null) {
          session.violations = Number(data.violations);
          session.strikes_count = Number(data.violations);
        } else if (session.isTabHidden) {
          session.violations = Math.max(session.violations || 0, 1);
          session.strikes_count = session.violations;
        }
        if (data.is_locked != null) session.is_locked = data.is_locked;
        if (data.lock_reason) session.lock_reason = data.lock_reason;
        session.lastViolationTime = Date.now();
        session.lastSeen = Date.now();

        if (data.desc) {
          session.history = session.history || [];
          session.history.push({ time: Date.now(), desc: data.desc });
        }

        broadcastToProctors('TAB_FOCUS_CHANGED', session);
        broadcastToProctors('HEARTBEAT_PING', session);
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true }));
    } catch (err) {
      console.error('[SURVEILLANCE_PIPE_ERROR]: Tab focus error:', err);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // 6. Proctor Pardon / Unlock Endpoint
  if (pathname === '/api/sessions/pardon' && req.method === 'POST') {
    try {
      const data = await parseJsonBody(req);
      const sid = data.candidateId || data.sid;
      const session = liveSessions.get(sid);

      if (!session) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'Candidate session not found' }));
        return;
      }

      const pardonEntry = {
        time: Date.now(),
        proctorPin: data.adminPin || '0769',
        reason: data.reason || 'Proctor administrative pardon granted',
        strikesBefore: session.violations || session.strikes_count || 3
      };

      session.is_locked = false;
      session.lock_reason = '';
      session.violations = 0;
      session.strikes_count = 0;
      session.status = 'IN_PROGRESS';
      session.pardon_history = session.pardon_history || [];
      session.pardon_history.push(pardonEntry);
      session.history = session.history || [];
      session.history.push({ time: Date.now(), desc: 'PROCTOR PARDON: Strikes reset to 0/3 · Terminal unlocked.' });

      // Notify candidate directly to dismiss lockout and unfreeze
      sendToCandidate(sid, 'CANDIDATE_PARDONED', { sid, pardonEntry });

      // Notify all proctors
      broadcastToProctors('HEARTBEAT_PING', session);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, session }));
    } catch (err) {
      console.error('[SURVEILLANCE_PIPE_ERROR]: Pardon error:', err);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // 7. Clue Request & Dispatch Endpoints
  if (pathname === '/api/clues/request' && req.method === 'POST') {
    try {
      const data = await parseJsonBody(req);
      const reqId = data.id || ('req_' + Date.now().toString(36));
      const hintObj = {
        id: reqId,
        sid: data.candidateId || data.sid,
        name: data.candidateName || data.name,
        dept: data.dept || 'CSBS',
        year: data.year || 'III',
        round: data.round || 'Round 1',
        qId: data.qId,
        qLabel: data.qLabel,
        tier: data.tier || 1,
        cost: data.cost || 10,
        status: 'PENDING',
        hintText: '',
        time: Date.now()
      };

      hintRequests.set(reqId, hintObj);
      broadcastToProctors('CLUE_REQUESTED', hintObj);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, hint: hintObj }));
    } catch (err) {
      console.error('[SURVEILLANCE_PIPE_ERROR]: Clue request error:', err);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  if (pathname === '/api/clues/dispatch' && req.method === 'POST') {
    try {
      const data = await parseJsonBody(req);
      const reqId = data.id || data.requestId;
      const hint = hintRequests.get(reqId);

      if (!hint) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'Hint request not found' }));
        return;
      }

      hint.status = data.action === 'grant' ? 'GRANTED' : 'REJECTED';
      hint.hintText = data.hintText || '';
      hint.resolvedAt = Date.now();

      // Dispatch to candidate
      sendToCandidate(hint.sid, 'ADMIN_CLUE_DISPATCHED', hint);

      // Broadcast update to proctors
      broadcastToProctors('CLUE_DISPATCHED', hint);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, hint }));
    } catch (err) {
      console.error('[SURVEILLANCE_PIPE_ERROR]: Clue dispatch error:', err);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // 8. Test Submission & Leaderboard Calculation
  if (pathname === '/api/sessions/submit' && req.method === 'POST') {
    try {
      const data = await parseJsonBody(req);
      const sid = data.candidateId || data.sid;
      const session = liveSessions.get(sid) || {};

      const updated = {
        ...session,
        ...data,
        sid: sid,
        status: 'COMPLETED',
        completedAt: Date.now(),
        lastSeen: Date.now(),
        history: session.history || []
      };
      updated.history.push({ time: Date.now(), desc: '🏁 Final Case Study submitted. Total Score: ' + (data.total || data.score || 0) + ' pts' });

      liveSessions.set(sid, updated);
      recalculateLeaderboard();

      broadcastToProctors('TEST_SUBMITTED', updated);
      broadcastToProctors('LEADERBOARD_UPDATED', { leaderboard: leaderboardCache });

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, leaderboard: leaderboardCache }));
    } catch (err) {
      console.error('[SURVEILLANCE_PIPE_ERROR]: Submit error:', err);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // 9. Leaderboard Fetch
  if (pathname === '/api/leaderboard') {
    recalculateLeaderboard();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, count: leaderboardCache.length, rows: leaderboardCache }));
    return;
  }

  // 9b. Admin Proceed / Force Advance Round API
  if (pathname === '/api/admin/advance-round' && req.method === 'POST') {
    try {
      const data = await parseJsonBody(req);
      const targetRound = data.targetRound || data.toRound || (Number(data.fromRound || 1) + 1);
      const result = handleAdvanceRound(data.fromRound, targetRound, data.proctorName, data.forceSubmitActive !== false);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, ...result }));
    } catch (err) {
      console.error('[SURVEILLANCE_PIPE_ERROR]: Advance round error:', err);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // 9c. Query Global Arena Tournament State
  if (pathname === '/api/tournament-state') {
    const metrics = getTournamentMetrics();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, tournamentState: { ...arenaTournamentState, ...metrics } }));
    return;
  }

  // 10. Server-Sent Events (SSE) Fallback
  if (pathname === '/api/events') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*'
    });
    res.write(`data: ${JSON.stringify({ type: 'CONNECTED', timestamp: Date.now() })}\n\n`);
    sseClients.add(res);

    req.on('close', () => { sseClients.delete(res); });
    return;
  }

  // -------------------------------------------------------------
  // STATIC FILE SERVING
  // -------------------------------------------------------------
  let filePath = path.join(ROOT_DIR, pathname === '/' || pathname === '/admin' ? 'index.html' : pathname);

  // Security: prevent directory traversal
  if (!filePath.startsWith(ROOT_DIR)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('Forbidden');
    return;
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      // Fallback to index.html for SPA routing
      filePath = path.join(ROOT_DIR, 'index.html');
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    fs.readFile(filePath, (readErr, content) => {
      if (readErr) {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('Error loading ' + pathname);
        return;
      }
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content);
    });
  });
});

// -------------------------------------------------------------
// RFC 6455 WEBSOCKET PROTOCOL ENGINE (Zero-Dependency)
// -------------------------------------------------------------
server.on('upgrade', (req, socket, head) => {
  const upgradeHeader = (req.headers['upgrade'] || '').toLowerCase();
  if (upgradeHeader !== 'websocket') {
    socket.destroy();
    return;
  }

  const key = req.headers['sec-websocket-key'];
  if (!key) {
    socket.destroy();
    return;
  }

  const acceptKey = crypto
    .createHash('sha1')
    .update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11')
    .digest('base64');

  const headers = [
    'HTTP/1.1 101 Switching Protocols',
    'Upgrade: websocket',
    'Connection: Upgrade',
    'Sec-WebSocket-Accept: ' + acceptKey
  ];

  socket.write(headers.join('\r\n') + '\r\n\r\n');
  socket.readyState = 1; // Open

  let clientSid = null;
  let isProctor = false;

  // Handle Incoming WS Frames
  socket.on('data', buffer => {
    try {
      const frames = parseWsFrames(buffer);
      for (const frame of frames) {
        if (frame.opcode === 0x08) {
          // Close frame
          socket.end();
          return;
        }
        if (frame.opcode === 0x09) {
          // Ping frame -> send Pong
          socket.write(Buffer.from([0x8a, 0x00]));
          continue;
        }
        if (frame.opcode === 0x01) {
          // Text Frame
          const messageStr = frame.payload.toString('utf8');
          const msg = JSON.parse(messageStr);

          // Handle WebSocket Actions
          if (msg.type === 'JOIN_SURVEILLANCE') {
            isProctor = true;
            socketRooms.proctor_surveillance_channel.add(socket);
            // Send current live snapshot immediately
            const allSessions = Array.from(liveSessions.values());
            const allHints = Array.from(hintRequests.values());
            sendWsFrame(socket, JSON.stringify({
              type: 'SURVEILLANCE_SNAPSHOT',
              data: { sessions: allSessions, hints: allHints, count: allSessions.length },
              timestamp: Date.now()
            }));
          } else if (msg.type === 'JOIN_CANDIDATE') {
            clientSid = msg.data.candidateId || msg.data.sid;
            if (!socketRooms.candidates.has(clientSid)) {
              socketRooms.candidates.set(clientSid, new Set());
            }
            socketRooms.candidates.get(clientSid).add(socket);

            // Save session and notify proctors
            const candidateSession = {
              ...(liveSessions.get(clientSid) || {}),
              ...msg.data,
              sid: clientSid,
              lastSeen: Date.now(),
              status: msg.data.status || 'IN_PROGRESS'
            };
            liveSessions.set(clientSid, candidateSession);
            broadcastToProctors('PARTICIPANT_REGISTERED', candidateSession);
          } else if (msg.type === 'HEARTBEAT_PING') {
            const sid = msg.data.candidateId || msg.data.sid;
            if (sid) {
              const current = liveSessions.get(sid) || {};
              const updated = { ...current, ...msg.data, sid, lastSeen: Date.now() };
              liveSessions.set(sid, updated);
              broadcastToProctors('HEARTBEAT_PING', updated);
            }
          } else if (msg.type === 'TAB_FOCUS_CHANGED') {
            const sid = msg.data.candidateId || msg.data.sid;
            // Admin & Proctor Safety Guard: Reject all strikes/lockouts originating from admin sessions
            if (msg.data.role === 'ADMIN' || msg.data.role === 'PROCTOR' || msg.data.is_admin || sid === 'admin' || sid === 'proctor') {
              // Ignore proctor tab switches
              continue;
            }
            const session = liveSessions.get(sid);
            if (session && (session.role === 'ADMIN' || session.role === 'PROCTOR')) {
              continue;
            }
            if (session) {
              session.isTabHidden = !!msg.data.isTabHidden;
              if (msg.data.violations != null) {
                session.violations = Number(msg.data.violations);
                session.strikes_count = Number(msg.data.violations);
              } else if (session.isTabHidden) {
                session.violations = Math.max(session.violations || 0, 1);
                session.strikes_count = session.violations;
              }
              if (msg.data.is_locked != null) session.is_locked = msg.data.is_locked;
              if (msg.data.lock_reason) session.lock_reason = msg.data.lock_reason;
              session.lastViolationTime = Date.now();
              session.lastSeen = Date.now();
              broadcastToProctors('TAB_FOCUS_CHANGED', session);
              broadcastToProctors('HEARTBEAT_PING', session);
            }
          } else if (msg.type === 'QUESTION_PROGRESS' || msg.type === 'DRAFT_UPDATE') {
            const sid = msg.data.candidateId || msg.data.sid;
            const session = liveSessions.get(sid);
            if (session) {
              Object.assign(session, msg.data);
              session.lastSeen = Date.now();
              broadcastToProctors('QUESTION_PROGRESS', session);
            }
          } else if (msg.type === 'CLUE_REQUESTED') {
            const reqId = msg.data.id || ('req_' + Date.now().toString(36));
            const hintObj = {
              id: reqId,
              sid: msg.data.candidateId || msg.data.sid,
              name: msg.data.candidateName || msg.data.name,
              dept: msg.data.dept || 'CSBS',
              year: msg.data.year || 'III',
              round: msg.data.round || 'Round 1',
              qId: msg.data.qId,
              qLabel: msg.data.qLabel,
              tier: msg.data.tier || 1,
              cost: msg.data.cost || 10,
              status: 'PENDING',
              hintText: '',
              time: Date.now()
            };
            hintRequests.set(reqId, hintObj);
            broadcastToProctors('CLUE_REQUESTED', hintObj);
          } else if (msg.type === 'ADMIN_CLUE_DISPATCHED' || msg.type === 'CLUE_DISPATCHED') {
            const reqId = msg.data.id || msg.data.requestId;
            const hint = hintRequests.get(reqId) || msg.data;
            hint.status = msg.data.action === 'grant' ? 'GRANTED' : 'REJECTED';
            hint.hintText = msg.data.hintText || '';
            hint.resolvedAt = Date.now();
            hintRequests.set(reqId, hint);
            sendToCandidate(hint.sid, 'ADMIN_CLUE_DISPATCHED', hint);
            broadcastToProctors('CLUE_DISPATCHED', hint);
          } else if (msg.type === 'CANDIDATE_PARDONED') {
            const sid = msg.data.candidateId || msg.data.sid;
            const session = liveSessions.get(sid);
            if (session) {
              session.is_locked = false;
              session.lock_reason = '';
              session.violations = 0;
              session.strikes_count = 0;
              session.status = 'IN_PROGRESS';
              sendToCandidate(sid, 'CANDIDATE_PARDONED', msg.data);
              broadcastToProctors('HEARTBEAT_PING', session);
            }
          } else if (msg.type === 'TEST_SUBMITTED') {
            const sid = msg.data.candidateId || msg.data.sid;
            const session = liveSessions.get(sid) || {};
            const updated = { ...session, ...msg.data, status: 'COMPLETED', completedAt: Date.now(), lastSeen: Date.now() };
            liveSessions.set(sid, updated);
            recalculateLeaderboard();
            broadcastToProctors('TEST_SUBMITTED', updated);
            broadcastToProctors('LEADERBOARD_UPDATED', { leaderboard: leaderboardCache });
          } else if (msg.type === 'ADMIN_ADVANCE_ROUND') {
            const fromR = msg.data?.fromRound || arenaTournamentState.currentRound;
            const toR = msg.data?.targetRound || msg.data?.toRound || (Number(fromR) + 1);
            const forceSubmit = msg.data?.forceSubmitActive !== false;
            handleAdvanceRound(fromR, toR, msg.data?.proctorName || 'Admin SOC Command', forceSubmit);
          }
        }
      }
    } catch (err) {
      console.error('[SURVEILLANCE_PIPE_ERROR]: Frame processing error:', err);
    }
  });

  socket.on('close', () => {
    socket.readyState = 3;
    if (isProctor) {
      socketRooms.proctor_surveillance_channel.delete(socket);
    }
    if (clientSid && socketRooms.candidates.has(clientSid)) {
      socketRooms.candidates.get(clientSid).delete(socket);
    }
  });

  socket.on('error', err => {
    console.error('[SURVEILLANCE_PIPE_ERROR]: Socket error:', err.message);
  });
});

function parseWsFrames(buffer) {
  const frames = [];
  let offset = 0;

  while (offset < buffer.length) {
    if (buffer.length - offset < 2) break;

    const firstByte = buffer[offset];
    const opcode = firstByte & 0x0f;
    const secondByte = buffer[offset + 1];
    const isMasked = (secondByte & 0x80) !== 0;
    let payloadLength = secondByte & 0x7f;
    offset += 2;

    if (payloadLength === 126) {
      if (buffer.length - offset < 2) break;
      payloadLength = buffer.readUInt16BE(offset);
      offset += 2;
    } else if (payloadLength === 127) {
      if (buffer.length - offset < 8) break;
      payloadLength = Number(buffer.readBigUInt64BE(offset));
      offset += 8;
    }

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

function sendWsFrame(socket, message) {
  const payload = Buffer.from(message, 'utf8');
  const length = payload.length;
  let header;

  if (length <= 125) {
    header = Buffer.from([0x81, length]);
  } else if (length <= 65535) {
    header = Buffer.alloc(4);
    header[0] = 0x81;
    header[1] = 126;
    header.writeUInt16BE(length, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x81;
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(length), 2);
  }

  socket.write(Buffer.concat([header, payload]));
}

// Initialize seed sessions & launch server
initDefaultSessions();

server.listen(PORT, () => {
  console.log(`=============================================================`);
  console.log(`🛡️  CYBERARENA PROCTOR & CANDIDATE REAL-TIME SERVER ONLINE`);
  console.log(`📡  HTTP & REST API : http://localhost:${PORT}`);
  console.log(`⚡  WebSocket Engine : ws://localhost:${PORT}/ws`);
  console.log(`🕹️  Candidate Portal : http://localhost:${PORT}`);
  console.log(`🕵️  Proctor SOC Room : http://localhost:${PORT}/?admin=true`);
  console.log(`=============================================================`);
});
