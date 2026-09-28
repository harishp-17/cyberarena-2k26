/**
 * Automated Verification Suite for Two-Tiered Clue System & Database Schema
 * Tests:
 * 1. Database schema and validation model (models/Question.js)
 * 2. API endpoints: /api/questions/schema and /api/questions
 * 3. 50/50 Questions verified for strict level_1 (nudge) and level_2 (walkthrough) clues
 * 4. Backend clue request & dispatch lifecycle (Tier 1 & Tier 2)
 * 5. HTML parsing & client-side getDefaultHint parity
 * 6. Strict SHA-256 byte parity between index.html and index (2).html
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { QuestionSchema, validateQuestion, validateQuestionsDataset } = require('../models/Question');

const BASE_URL = 'http://localhost:8000';
const indexPath = path.join(__dirname, '..', 'index.html');
const index2Path = path.join(__dirname, '..', 'index (2).html');

let passedTests = 0;
let totalTests = 0;

function assert(condition, message) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  ✔ PASS: ${message}`);
  } else {
    console.error(`  ✖ FAIL: ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
}

function requestHttp(url, options = {}, body = null) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
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
        try { json = JSON.parse(data); } catch(e) {}
        resolve({ status: res.statusCode, headers: res.headers, body: data, json });
      });
    });

    req.on('error', reject);
    if (body) {
      if (typeof body === 'object') {
        req.setHeader('Content-Type', 'application/json');
        req.write(JSON.stringify(body));
      } else {
        req.write(body);
      }
    }
    req.end();
  });
}

async function runTests() {
  console.log('===============================================================');
  console.log('🧪 RUNNING TWO-TIERED CLUE SYSTEM & QUESTION SCHEMA TEST SUITE');
  console.log('===============================================================\n');

  // TEST 1: Question Model & Schema Structure
  console.log('TEST 1: Question Model & Schema Validation Rules');
  assert(QuestionSchema && typeof QuestionSchema === 'object', 'QuestionSchema is exported as an object');
  assert(QuestionSchema.clues && QuestionSchema.clues.level_1 && QuestionSchema.clues.level_2, 'Schema specifies clues.level_1 and clues.level_2');
  assert(QuestionSchema.clues.level_1.required === true, 'clues.level_1 is required');
  assert(QuestionSchema.clues.level_2.required === true, 'clues.level_2 is required');
  assert(typeof QuestionSchema.clues.level_1.description === 'string', 'clues.level_1 contains descriptive guidance');
  assert(typeof QuestionSchema.clues.level_2.description === 'string', 'clues.level_2 contains descriptive guidance');

  // Negative validation tests
  let caught1 = false, caught2 = false, caught3 = false;
  try { validateQuestion({ id: 'bad1' }); } catch(e) { caught1 = true; }
  try { validateQuestion({ id: 'bad2', clues: { level_1: 'only 1' } }); } catch(e) { caught2 = true; }
  try { validateQuestion({ id: 'bad3', clues: { level_2: 'only 2' } }); } catch(e) { caught3 = true; }
  assert(caught1, 'validateQuestion rejects question missing clues object');
  assert(caught2, 'validateQuestion rejects question missing level_2');
  assert(caught3, 'validateQuestion rejects question missing level_1');

  // TEST 2: API GET /api/questions/schema
  console.log('\nTEST 2: GET /api/questions/schema Endpoint');
  const schemaRes = await requestHttp(`${BASE_URL}/api/questions/schema`);
  assert(schemaRes.status === 200, 'GET /api/questions/schema returns 200 OK');
  assert(schemaRes.json && schemaRes.json.success === true, 'Schema response contains success: true');
  assert(schemaRes.json.schema.clues.level_1.required === true, 'Schema endpoint mandates level_1 required');
  assert(schemaRes.json.schema.clues.level_2.required === true, 'Schema endpoint mandates level_2 required');

  // TEST 3: API GET /api/questions
  console.log('\nTEST 3: GET /api/questions Endpoint & Dataset Completeness');
  const qRes = await requestHttp(`${BASE_URL}/api/questions`);
  assert(qRes.status === 200, 'GET /api/questions returns 200 OK');
  assert(qRes.json && qRes.json.success === true, 'Questions response has success: true');
  assert(qRes.json.totalQuestions === 50, 'Total questions count equals 50 (30 R1 + 15 R2 + 5 R3)');

  const ds = qRes.json.data;
  assert(Array.isArray(ds.round1) && ds.round1.length === 30, 'Round 1 contains 30 questions');
  assert(Array.isArray(ds.round2) && ds.round2.length === 15, 'Round 2 contains 15 puzzles');
  assert(Array.isArray(ds.round3.questions) && ds.round3.questions.length === 5, 'Round 3 contains 5 forensic questions');

  // TEST 4: Full Validation of all 50 questions
  console.log('\nTEST 4: Schema Compliance Across All 50 Questions');
  const report = validateQuestionsDataset(ds);
  assert(report.valid === true, 'validateQuestionsDataset reports valid: true');
  assert(report.errors.length === 0, 'Zero schema errors detected');
  assert(report.totalQuestions === 50, 'Exactly 50 questions validated');

  // Verify non-empty, detailed plain text in every single clue
  let allCluesValid = true;
  const allItems = [...ds.round1, ...ds.round2, ...ds.round3.questions];
  for (const item of allItems) {
    if (!item.clues || typeof item.clues.level_1 !== 'string' || item.clues.level_1.trim().length < 20) {
      allCluesValid = false;
      console.error(`Invalid level_1 clue for ${item.id}`);
    }
    if (!item.clues || typeof item.clues.level_2 !== 'string' || item.clues.level_2.trim().length < 20) {
      allCluesValid = false;
      console.error(`Invalid level_2 clue for ${item.id}`);
    }
  }
  assert(allCluesValid, 'All 50 questions contain substantial, plain-text level_1 and level_2 clues');

  // TEST 5: Backend Clue Request & Dispatch Lifecycle
  console.log('\nTEST 5: Clue Request & Dispatch Lifecycle (Tier 1 & Tier 2)');
  
  // Request Tier 1 for R1_Q1
  const req1 = await requestHttp(`${BASE_URL}/api/clues/request`, { method: 'POST' }, {
    candidateId: 'test_cand_audit',
    candidateName: 'Audit Candidate',
    dept: 'CSBS',
    year: 'III',
    round: 'Round 1',
    qId: 'R1_Q1',
    qLabel: 'Question #1',
    tier: 1,
    cost: 10
  });
  assert(req1.status === 200, 'POST /api/clues/request (Tier 1) returns 200');
  assert(req1.json && req1.json.hint && req1.json.hint.tier === 1, 'Hint tier is 1');
  assert(req1.json.hint.suggestedClue.includes('deception rather than brute'), 'Suggested clue for Tier 1 matches R1_Q1 level_1');

  // Dispatch Tier 1
  const disp1 = await requestHttp(`${BASE_URL}/api/clues/dispatch`, { method: 'POST' }, {
    id: req1.json.hint.id,
    action: 'grant',
    hintText: req1.json.hint.suggestedClue
  });
  assert(disp1.status === 200, 'POST /api/clues/dispatch (Grant Tier 1) returns 200');
  assert(disp1.json.hint.status === 'GRANTED', 'Hint status is GRANTED');
  assert(disp1.json.hint.hintText === req1.json.hint.suggestedClue, 'Dispatched hintText matches level_1 clue');

  // Request Tier 2 for R1_Q1
  const req2 = await requestHttp(`${BASE_URL}/api/clues/request`, { method: 'POST' }, {
    candidateId: 'test_cand_audit',
    candidateName: 'Audit Candidate',
    dept: 'CSBS',
    year: 'III',
    round: 'Round 1',
    qId: 'R1_Q1',
    qLabel: 'Question #1',
    tier: 2,
    cost: 10
  });
  assert(req2.status === 200, 'POST /api/clues/request (Tier 2) returns 200');
  assert(req2.json && req2.json.hint && req2.json.hint.tier === 2, 'Hint tier is 2');
  assert(req2.json.hint.suggestedClue.includes('Fraudulent attempt to obtain sensitive data'), 'Suggested clue for Tier 2 matches R1_Q1 level_2');

  // Dispatch Tier 2
  const disp2 = await requestHttp(`${BASE_URL}/api/clues/dispatch`, { method: 'POST' }, {
    id: req2.json.hint.id,
    action: 'grant',
    hintText: req2.json.hint.suggestedClue
  });
  assert(disp2.status === 200, 'POST /api/clues/dispatch (Grant Tier 2) returns 200');
  assert(disp2.json.hint.status === 'GRANTED', 'Hint status is GRANTED');
  assert(disp2.json.hint.hintText === req2.json.hint.suggestedClue, 'Dispatched hintText matches level_2 walkthrough');

  // TEST 6: HTML Client-side Functionality & Mirror Parity
  console.log('\nTEST 6: HTML Client-side Implementation & SHA-256 Parity');
  const htmlContent = fs.readFileSync(indexPath, 'utf8');
  const html2Content = fs.readFileSync(index2Path, 'utf8');

  const hash1 = crypto.createHash('sha256').update(htmlContent).digest('hex');
  const hash2 = crypto.createHash('sha256').update(html2Content).digest('hex');

  assert(hash1 === hash2, `index.html and index (2).html have identical SHA-256: ${hash1}`);
  assert(htmlContent.includes('.hint-granted-box.tier-1'), 'CSS defines .hint-granted-box.tier-1 styling');
  assert(htmlContent.includes('.hint-granted-box.tier-2'), 'CSS defines .hint-granted-box.tier-2 styling');
  assert(htmlContent.includes('white-space: pre-line'), 'CSS defines white-space: pre-line for readability');
  assert(htmlContent.includes('Level 1: Conceptual Nudge') || htmlContent.includes('Level 1 Clue: Conceptual Nudge'), 'UI text specifies Level 1 Conceptual Nudge');
  assert(htmlContent.includes('Level 2: Direct Walkthrough') || htmlContent.includes('Level 2 Clue: Direct Walkthrough'), 'UI text specifies Level 2 Direct Walkthrough');

  console.log('\n===============================================================');
  console.log(`🎉 ALL CHECKS PASSED: ${passedTests} / ${totalTests} assertions verified!`);
  console.log('===============================================================\n');
}

runTests().catch(err => {
  console.error('\n❌ TEST SUITE FAILED:', err);
  process.exit(1);
});
