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
const GOOGLE_DATABASE_URL = process.env.DATABASE_URL || 'https://script.google.com/macros/s/AKfycbzXXkdjKyfUmXbh03nSqLhF4c53ahnCkFWsjWimzxOLxl-WmjHAwLdqi9a4O4YiKk4F5w/exec';

// Question Model Schema & Dataset Validation
const { QuestionSchema, validateQuestionsDataset } = require('./models/Question');
let questionsDataset = null;
try {
  questionsDataset = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'scratch', 'cyber_data.json'), 'utf8'));
  const report = validateQuestionsDataset(questionsDataset);
  if (report.valid) {
    console.log(`[QUESTION_DB]: Loaded and validated ${report.totalQuestions} questions with two-tiered clues.`);
  } else {
    console.warn(`[QUESTION_DB_WARN]: Question schema errors:`, report.errors);
  }
} catch (e) {
  console.warn(`[QUESTION_DB_WARN]: Could not load cyber_data.json:`, e.message);
}

function getQuestionClue(qId, tier = 1) {
  if (!questionsDataset || !qId) return null;
  let q = null;
  if (qId.startsWith('R1_Q')) {
    const idx = parseInt(qId.replace('R1_Q', '')) - 1;
    q = questionsDataset.round1 && questionsDataset.round1[idx];
  } else if (qId.startsWith('R2_P')) {
    const idx = parseInt(qId.replace('R2_P', '')) - 1;
    q = questionsDataset.round2 && questionsDataset.round2[idx];
  } else if (qId.startsWith('R3_Q')) {
    const idx = parseInt(qId.replace('R3_Q', '')) - 1;
    const r3q = questionsDataset.round3 && (questionsDataset.round3.questions || questionsDataset.round3);
    q = r3q && r3q[idx];
  }
  if (!q || !q.clues) return null;
  return Number(tier) === 2 ? q.clues.level_2 : q.clues.level_1;
}

// Google Apps Script Cloud Database Sync
async function syncCandidateToGoogleDb(session) {
  if (!GOOGLE_DATABASE_URL) return;
  try {
    const strikes = session.strikes != null ? Number(session.strikes) : (session.violations != null ? Number(session.violations) : (session.strikes_count != null ? Number(session.strikes_count) : 0));
    const score = session.score != null ? Number(session.score) : ((session.r1 || 0) + (session.r2 || 0) + (session.r3 || 0) + (session.bonus || 0));
    const payload = {
      sid: session.sid || session.candidateId,
      name: session.name || session.candidateName,
      dept: session.dept || 'CSBS',
      year: session.year || 'III',
      r1: session.r1 || 0,
      r2: session.r2 || 0,
      r3: session.r3 || 0,
      bonus: session.bonus || 0,
      score: score,
      total: score,
      status: session.status || 'ONLINE',
      violations: strikes,
      strikes: strikes,
      durationSeconds: session.durationSeconds || 0,
      accuracy_rate: session.accuracy_rate || 0
    };
    const res = await fetch(GOOGLE_DATABASE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload)
    });
    const resJson = await res.json().catch(() => null);
    console.log(`[GOOGLE_DB_SYNC]: Synced candidate ${payload.sid} ->`, resJson ? resJson.success : 'ok');
  } catch(err) {
    console.warn(`[GOOGLE_DB_SYNC_WARN]: Failed to sync ${session.sid}:`, err.message);
  }
}

async function syncCandidateDeletionToGoogleDb(sid) {
  if (!GOOGLE_DATABASE_URL || !sid) return;
  try {
    const payload = {
      action: 'delete',
      sid: sid,
      candidateId: sid
    };
    await fetch(GOOGLE_DATABASE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload)
    }).catch(() => null);
    console.log(`[GOOGLE_DB_SYNC]: Synced deletion for candidate ${sid}`);
  } catch (err) {
    console.warn(`[GOOGLE_DB_SYNC_WARN]: Failed to sync deletion of ${sid}:`, err.message);
  }
}

async function loadFromGoogleDb() {
  if (!GOOGLE_DATABASE_URL) return;
  try {
    const res = await fetch(`${GOOGLE_DATABASE_URL}?action=leaderboard`);
    const data = await res.json();
    if (data && data.success && Array.isArray(data.rows)) {
      console.log(`[GOOGLE_DB_SYNC]: Hydrated ${data.rows.length} candidates from Google Apps Script DB`);
      for (const r of data.rows) {
        if (!r.sid) continue;
        if (!liveSessions.has(r.sid)) {
          const strikes = Number(r.strikes || r.violations || 0);
          const score = Number(r.total || r.score || ((r.r1||0)+(r.r2||0)+(r.r3||0)) || 0);
          const isLocked = !!(r.is_locked || r.isLocked || strikes >= 3 || r.status === 'LOCKED');
          liveSessions.set(r.sid, {
            sid: r.sid,
            candidateId: r.sid,
            name: r.name || 'Anonymous Operative',
            dept: r.dept || 'CSBS',
            year: r.year || 'III',
            r1: Number(r.r1) || 0,
            r2: Number(r.r2) || 0,
            r3: Number(r.r3) || 0,
            bonus: Number(r.bonus) || 0,
            score: score,
            total: score,
            violations: strikes,
            strikes: strikes,
            strikes_count: strikes,
            is_locked: isLocked,
            isLocked: isLocked,
            status: r.status || (isLocked ? 'LOCKED' : 'ONLINE'),
            durationSeconds: Number(r.durationSeconds) || 0,
            accuracy_rate: Number(r.accuracy_rate) || 0,
            lastSeen: Date.now(),
            isSim: !!r.isSim
          });
        }
      }
      recalculateLeaderboard();
      broadcastToProctors('LEADERBOARD_UPDATED', { leaderboard: leaderboardCache });
    }
  } catch(err) {
    console.warn('[GOOGLE_DB_SYNC_WARN]: Failed to hydrate from Google DB:', err.message);
  }
}

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
  // Clean Production State: Zero dummy/mock participants
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

  const roundDurations = { 1: 1800, 2: 2700, 3: 2700 };
  const newDuration = roundDurations[toRound] || 2700;

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

  // 1b. Debug Validation Endpoint for Raw Database Operatives Sync Parity
  if (pathname === '/api/debug/sync-check' && req.method === 'GET') {
    const list = Array.from(liveSessions.values()).map(s => {
      const strikes = s.strikes != null ? Number(s.strikes) : (s.violations != null ? Number(s.violations) : (s.strikes_count != null ? Number(s.strikes_count) : 0));
      const score = s.score != null ? Number(s.score) : 0;
      const isLocked = !!(s.isLocked || s.is_locked || strikes >= 3 || s.status === 'LOCKED');
      return {
        sid: s.sid || s.candidateId,
        candidateId: s.sid || s.candidateId,
        name: s.name || 'Anonymous Operative',
        dept: s.dept || 'CSBS',
        year: s.year || 'III',
        score: score,
        strikes: strikes,
        violations: strikes,
        strikes_count: strikes,
        status: s.status || (isLocked ? 'LOCKED' : 'ONLINE'),
        isLocked: isLocked,
        is_locked: isLocked,
        lastSeen: Number(s.lastSeen) || Date.now()
      };
    });

    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0'
    });
    res.end(JSON.stringify({
      success: true,
      timestamp: Date.now(),
      count: list.length,
      operatives: list,
      sessions: list
    }));
    return;
  }

  // 2. Fetch All Live Sessions (Immediate Proctor Mount/Refresh)
  if ((pathname === '/api/sessions/live' || pathname === '/api/candidates' || pathname === '/api/participants') && req.method === 'GET') {
    const list = Array.from(liveSessions.values()).map(s => {
      const strikes = s.strikes != null ? Number(s.strikes) : (s.violations != null ? Number(s.violations) : (s.strikes_count != null ? Number(s.strikes_count) : 0));
      const score = s.score != null ? Number(s.score) : 0;
      const isLocked = !!(s.isLocked || s.is_locked || strikes >= 3 || s.status === 'LOCKED');
      return {
        ...s,
        score,
        strikes,
        violations: strikes,
        strikes_count: strikes,
        isLocked,
        is_locked: isLocked,
        status: s.status || (isLocked ? 'LOCKED' : 'ONLINE')
      };
    });
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0'
    });
    res.end(JSON.stringify({ success: true, count: list.length, sessions: list, candidates: list, timestamp: Date.now() }));
    return;
  }

  // 3. Register Candidate Handshake
  if ((pathname === '/api/sessions/register' || pathname === '/api/register' || pathname === '/api/candidate/register' || pathname === '/api/candidates/register') && req.method === 'POST') {
    try {
      const data = await parseJsonBody(req);
      const sid = data.candidateId || data.sid || ('CA' + Date.now().toString(36));
      const now = Date.now();
      const strikes = data.strikes != null ? Number(data.strikes) : (data.strikes_count != null ? Number(data.strikes_count) : (data.violations != null ? Number(data.violations) : 0));
      const score = data.score != null ? Number(data.score) : 0;
      const isLocked = !!(data.is_locked || data.isLocked || strikes >= 3);

      const session = {
        sid: sid,
        candidateId: sid,
        name: data.candidateName || data.name || 'Anonymous Operative',
        dept: data.dept || 'CSBS',
        year: data.year || 'III',
        round: data.round || 'INSTR',
        currentLocation: data.currentLocation || 'Reading Round Instructions',
        qTitle: data.qTitle || '',
        qOptions: data.qOptions || [],
        selectedOptionIdx: data.selectedOptionIdx != null ? data.selectedOptionIdx : null,
        inputText: data.inputText || '',
        score: score,
        strikes: strikes,
        violations: strikes,
        strikes_count: strikes,
        r1: data.r1 != null ? Number(data.r1) : 0,
        r2: data.r2 != null ? Number(data.r2) : 0,
        r3: data.r3 != null ? Number(data.r3) : 0,
        bonus: data.bonus != null ? Number(data.bonus) : 0,
        lifetime_violations: data.lifetime_violations != null ? Number(data.lifetime_violations) : 0,
        is_locked: isLocked,
        isLocked: isLocked,
        lock_reason: data.lock_reason || (isLocked ? '3/3 focus violations' : ''),
        pardon_history: data.pardon_history || [],
        isTabHidden: !!data.isTabHidden,
        lastSeen: now,
        status: data.status || (isLocked ? 'LOCKED' : 'ONLINE'),
        isSim: false,
        durationSeconds: data.durationSeconds != null ? Number(data.durationSeconds) : 0,
        accuracy_rate: data.accuracy_rate != null ? Number(data.accuracy_rate) : 0,
        history: [{ time: now, desc: 'Candidate authenticated · Entered Arena' }]
      };

      // In-Memory Database Save
      liveSessions.set(sid, session);
      recalculateLeaderboard();

      // Dual Cloud Database Sync (Google Apps Script Web App)
      syncCandidateToGoogleDb(session);

      // Broadcast immediate real-time emissions specifically targeting proctors
      const broadcastPayload = {
        candidate: session,
        newCandidate: session,
        session: session,
        sid: session.sid,
        timestamp: now
      };
      broadcastToProctors('CANDIDATE_REGISTERED', broadcastPayload);
      broadcastToProctors('PARTICIPANT_REGISTERED', session);

      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      });
      res.end(JSON.stringify({ success: true, sid, session, candidate: session }));
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
        if (data.violations != null || data.strikes != null) {
          const val = Number(data.strikes != null ? data.strikes : data.violations);
          session.violations = val;
          session.strikes = val;
          session.strikes_count = val;
        } else if (session.isTabHidden) {
          const val = Math.max(session.strikes || session.violations || 0, 1);
          session.violations = val;
          session.strikes = val;
          session.strikes_count = val;
        }
        if (session.strikes >= 3) {
          session.is_locked = true;
          session.isLocked = true;
          session.status = 'LOCKED';
          session.lock_reason = session.lock_reason || '3/3 focus violations';
        }
        if (data.is_locked != null || data.isLocked != null) {
          const lk = !!(data.is_locked || data.isLocked);
          session.is_locked = lk;
          session.isLocked = lk;
          if (lk) session.status = 'LOCKED';
        }
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
        strikesBefore: session.strikes || session.violations || session.strikes_count || 3
      };

      session.is_locked = false;
      session.isLocked = false;
      session.lock_reason = '';
      session.violations = 0;
      session.strikes = 0;
      session.strikes_count = 0;
      session.status = 'ONLINE';
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

  // 6b. Participant / Session Deletion Controller (DELETE /api/participants/:id)
  const isDeleteParticipantRoute =
    (req.method === 'DELETE' && (pathname.startsWith('/api/participants/') || pathname.startsWith('/api/sessions/'))) ||
    (req.method === 'DELETE' && (pathname === '/api/participants' || pathname === '/api/sessions')) ||
    (req.method === 'POST' && (pathname === '/api/participants/delete' || pathname === '/api/sessions/delete'));

  if (isDeleteParticipantRoute) {
    try {
      let targetId = '';
      if (pathname.startsWith('/api/participants/')) {
        targetId = decodeURIComponent(pathname.replace('/api/participants/', '').trim());
      } else if (pathname.startsWith('/api/sessions/')) {
        targetId = decodeURIComponent(pathname.replace('/api/sessions/', '').trim());
      }

      if (!targetId || targetId === 'delete') {
        targetId = parsedUrl.searchParams.get('id') || parsedUrl.searchParams.get('userId') || parsedUrl.searchParams.get('sid') || '';
      }

      if (!targetId) {
        const body = await parseJsonBody(req).catch(() => ({}));
        targetId = body.id || body.userId || body.candidateId || body.sid || '';
      }

      if (!targetId) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'Missing participant / user ID to delete' }));
        return;
      }

      const deletedUserId = targetId;
      const existedInDb = liveSessions.has(deletedUserId);
      const deletedSession = liveSessions.get(deletedUserId);

      // 1. Delete from in-memory database
      liveSessions.delete(deletedUserId);

      // 2. Clean up associated hint requests
      for (const [reqId, hint] of hintRequests.entries()) {
        if (hint.sid === deletedUserId || hint.candidateId === deletedUserId) {
          hintRequests.delete(reqId);
        }
      }

      // 3. Recalculate leaderboard
      recalculateLeaderboard();

      // 4. Terminate candidate WebSocket connection if active
      if (socketRooms.candidates.has(deletedUserId)) {
        const sockets = socketRooms.candidates.get(deletedUserId);
        for (const sock of sockets) {
          try {
            sendWsFrame(sock, JSON.stringify({ type: 'TERMINAL_SESSION_TERMINATED', message: 'Candidate account deleted by administrator.' }));
            sock.destroy();
          } catch(e) {}
        }
        socketRooms.candidates.delete(deletedUserId);
      }

      // 5. Cloud Database sync
      syncCandidateDeletionToGoogleDb(deletedUserId);

      // 6. Real-Time Emission to admin room containing deleted user's unique ID
      const deletionPayload = {
        userId: deletedUserId,
        candidateId: deletedUserId,
        sid: deletedUserId,
        name: deletedSession?.name || deletedUserId,
        deletedAt: Date.now()
      };

      // io.to('admin_room').emit('CANDIDATE_DELETED', { userId: deletedUserId });
      broadcastToProctors('CANDIDATE_DELETED', deletionPayload);

      console.log(`[PARTICIPANT_DELETED]: Removed candidate ${deletedUserId} and broadcasted CANDIDATE_DELETED to admin room`);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        message: `Candidate ${deletedUserId} deleted successfully`,
        userId: deletedUserId,
        existed: existedInDb
      }));
    } catch (err) {
      console.error('[SURVEILLANCE_PIPE_ERROR]: Delete error:', err);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // Questions Schema & Dataset API
  if (pathname === '/api/questions/schema' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: true,
      schema: QuestionSchema,
      description: "Mandatory two-tiered plain-text clue system: level_1 (conceptual nudge), level_2 (direct walkthrough)"
    }));
    return;
  }

  if (pathname === '/api/questions' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: true,
      data: questionsDataset,
      totalQuestions: (questionsDataset?.round1?.length || 0) + (questionsDataset?.round2?.length || 0) + (questionsDataset?.round3?.questions?.length || 0)
    }));
    return;
  }

  // 7. Clue Request & Dispatch Endpoints
  if ((pathname === '/api/clues/pending' || pathname === '/api/clues/requests') && req.method === 'GET') {
    const list = Array.from(hintRequests.values());
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, count: list.length, clues: list, hints: list }));
    return;
  }

  if (pathname === '/api/clues/request' && req.method === 'POST') {
    try {
      const data = await parseJsonBody(req);
      const reqId = data.id || ('req_' + Date.now().toString(36));
      const tier = Number(data.tier || 1);
      const suggested = getQuestionClue(data.qId, tier) || '';
      const hintObj = {
        id: reqId,
        sid: data.candidateId || data.sid,
        name: data.candidateName || data.name,
        dept: data.dept || 'CSBS',
        year: data.year || 'III',
        round: data.round || 'Round 1',
        qId: data.qId,
        qLabel: data.qLabel,
        tier: tier,
        cost: data.cost || 10,
        status: data.status || (data.autoGranted ? 'GRANTED' : 'PENDING'),
        autoGranted: data.autoGranted ?? (data.status === 'GRANTED'),
        walletBalance: data.walletBalance,
        suggestedClue: suggested,
        hintText: data.hintText || suggested,
        time: data.time || Date.now(),
        grantedAt: data.grantedAt || (data.status === 'GRANTED' ? Date.now() : null)
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
      hint.hintText = data.hintText || (data.action === 'grant' ? (getQuestionClue(hint.qId, hint.tier) || 'Clue Approved') : '');
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

      // Dual Cloud Database Sync (Google Apps Script Web App)
      syncCandidateToGoogleDb(updated);

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
    res.end(JSON.stringify({ success: true, count: leaderboardCache.length, rows: leaderboardCache, leaderboard: leaderboardCache }));
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
          } else if (msg.type === 'JOIN_CANDIDATE' || msg.type === 'CANDIDATE_REGISTERED') {
            const candidateData = msg.data || msg.candidate || msg;
            clientSid = candidateData.candidateId || candidateData.sid || ('CA' + Date.now().toString(36));
            if (!socketRooms.candidates.has(clientSid)) {
              socketRooms.candidates.set(clientSid, new Set());
            }
            socketRooms.candidates.get(clientSid).add(socket);

            // Save session and notify proctors
            const now = Date.now();
            const existing = liveSessions.get(clientSid) || {};
            const strikes = candidateData.strikes != null ? Number(candidateData.strikes) : (candidateData.violations != null ? Number(candidateData.violations) : (candidateData.strikes_count != null ? Number(candidateData.strikes_count) : (existing.strikes != null ? Number(existing.strikes) : (existing.violations != null ? Number(existing.violations) : 0))));
            const score = candidateData.score != null ? Number(candidateData.score) : (existing.score != null ? Number(existing.score) : 0);
            const isLocked = !!(candidateData.is_locked || candidateData.isLocked || existing.is_locked || existing.isLocked || strikes >= 3);
            const candidateSession = {
              ...existing,
              ...candidateData,
              sid: clientSid,
              candidateId: clientSid,
              name: candidateData.candidateName || candidateData.name || existing.name || 'Anonymous Operative',
              dept: candidateData.dept || existing.dept || 'CSBS',
              year: candidateData.year || existing.year || 'III',
              score: score,
              strikes: strikes,
              violations: strikes,
              strikes_count: strikes,
              is_locked: isLocked,
              isLocked: isLocked,
              lastSeen: now,
              status: candidateData.status || existing.status || (isLocked ? 'LOCKED' : 'ONLINE')
            };
            liveSessions.set(clientSid, candidateSession);
            recalculateLeaderboard();

            // Dual Cloud Database Sync (Google Apps Script Web App)
            syncCandidateToGoogleDb(candidateSession);

            const broadcastPayload = {
              candidate: candidateSession,
              newCandidate: candidateSession,
              session: candidateSession,
              sid: clientSid,
              timestamp: now
            };
            broadcastToProctors('CANDIDATE_REGISTERED', broadcastPayload);
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
              if (msg.data.violations != null || msg.data.strikes != null) {
                const val = Number(msg.data.strikes != null ? msg.data.strikes : msg.data.violations);
                session.violations = val;
                session.strikes = val;
                session.strikes_count = val;
              } else if (session.isTabHidden) {
                const val = Math.max(session.strikes || session.violations || 0, 1);
                session.violations = val;
                session.strikes = val;
                session.strikes_count = val;
              }
              if (session.strikes >= 3) {
                session.is_locked = true;
                session.isLocked = true;
                session.status = 'LOCKED';
                session.lock_reason = session.lock_reason || '3/3 focus violations';
              }
              if (msg.data.is_locked != null || msg.data.isLocked != null) {
                const lk = !!(msg.data.is_locked || msg.data.isLocked);
                session.is_locked = lk;
                session.isLocked = lk;
                if (lk) session.status = 'LOCKED';
              }
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
            const tier = Number(msg.data.tier || 1);
            const suggested = getQuestionClue(msg.data.qId, tier) || '';
            const hintObj = {
              id: reqId,
              sid: msg.data.candidateId || msg.data.sid,
              name: msg.data.candidateName || msg.data.name,
              dept: msg.data.dept || 'CSBS',
              year: msg.data.year || 'III',
              round: msg.data.round || 'Round 1',
              qId: msg.data.qId,
              qLabel: msg.data.qLabel,
              tier: tier,
              cost: msg.data.cost || 10,
              status: msg.data.status || (msg.data.autoGranted ? 'GRANTED' : 'PENDING'),
              autoGranted: msg.data.autoGranted ?? (msg.data.status === 'GRANTED'),
              walletBalance: msg.data.walletBalance,
              suggestedClue: suggested,
              hintText: msg.data.hintText || suggested,
              time: msg.data.time || Date.now(),
              grantedAt: msg.data.grantedAt || (msg.data.status === 'GRANTED' ? Date.now() : null)
            };
            hintRequests.set(reqId, hintObj);
            broadcastToProctors('CLUE_REQUESTED', hintObj);
          } else if (msg.type === 'ADMIN_CLUE_DISPATCHED' || msg.type === 'CLUE_DISPATCHED') {
            const reqId = msg.data.id || msg.data.requestId;
            const hint = hintRequests.get(reqId) || msg.data;
            hint.status = msg.data.action === 'grant' ? 'GRANTED' : 'REJECTED';
            hint.hintText = msg.data.hintText || (msg.data.action === 'grant' ? (getQuestionClue(hint.qId, hint.tier) || 'Clue Approved') : '');
            hint.resolvedAt = Date.now();
            hintRequests.set(reqId, hint);
            sendToCandidate(hint.sid, 'ADMIN_CLUE_DISPATCHED', hint);
            broadcastToProctors('CLUE_DISPATCHED', hint);
          } else if (msg.type === 'CANDIDATE_PARDONED') {
            const sid = msg.data.candidateId || msg.data.sid;
            const session = liveSessions.get(sid);
            if (session) {
              session.is_locked = false;
              session.isLocked = false;
              session.lock_reason = '';
              session.violations = 0;
              session.strikes = 0;
              session.strikes_count = 0;
              session.status = 'ONLINE';
              sendToCandidate(sid, 'CANDIDATE_PARDONED', msg.data);
              broadcastToProctors('HEARTBEAT_PING', session);
            }
          } else if (msg.type === 'TEST_SUBMITTED') {
            const sid = msg.data.candidateId || msg.data.sid;
            const session = liveSessions.get(sid) || {};
            const score = Number(msg.data.total || msg.data.score || session.score || 0);
            const strikes = session.strikes != null ? Number(session.strikes) : (session.violations != null ? Number(session.violations) : 0);
            const updated = {
              ...session,
              ...msg.data,
              score: score,
              total: score,
              strikes: strikes,
              violations: strikes,
              strikes_count: strikes,
              status: 'COMPLETED',
              completedAt: Date.now(),
              lastSeen: Date.now()
            };
            liveSessions.set(sid, updated);
            recalculateLeaderboard();
            broadcastToProctors('TEST_SUBMITTED', updated);
            broadcastToProctors('LEADERBOARD_UPDATED', { leaderboard: leaderboardCache });
          } else if (msg.type === 'ADMIN_ADVANCE_ROUND') {
            const fromR = msg.data?.fromRound || arenaTournamentState.currentRound;
            const toR = msg.data?.targetRound || msg.data?.toRound || (Number(fromR) + 1);
            const forceSubmit = msg.data?.forceSubmitActive !== false;
            handleAdvanceRound(fromR, toR, msg.data?.proctorName || 'Admin SOC Command', forceSubmit);
          } else if (msg.type === 'DELETE_CANDIDATE' || msg.type === 'CANDIDATE_DELETED') {
            const sid = msg.data?.userId || msg.data?.candidateId || msg.data?.sid || msg.data?.id;
            if (sid) {
              const session = liveSessions.get(sid);
              liveSessions.delete(sid);
              for (const [reqId, hint] of hintRequests.entries()) {
                if (hint.sid === sid || hint.candidateId === sid) {
                  hintRequests.delete(reqId);
                }
              }
              recalculateLeaderboard();
              syncCandidateDeletionToGoogleDb(sid);
              broadcastToProctors('CANDIDATE_DELETED', {
                userId: sid,
                candidateId: sid,
                sid: sid,
                name: session?.name || sid,
                deletedAt: Date.now()
              });
            }
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

// Initialize seed sessions, hydrate from cloud DB, & launch server
initDefaultSessions();
loadFromGoogleDb();

server.listen(PORT, () => {
  console.log(`=============================================================`);
  console.log(`🛡️  CYBERARENA PROCTOR & CANDIDATE REAL-TIME SERVER ONLINE`);
  console.log(`📡  HTTP & REST API : http://localhost:${PORT}`);
  console.log(`⚡  WebSocket Engine : ws://localhost:${PORT}/ws`);
  console.log(`🕹️  Candidate Portal : http://localhost:${PORT}`);
  console.log(`🕵️  Proctor SOC Room : http://localhost:${PORT}/?admin=true`);
  console.log(`=============================================================`);
});
