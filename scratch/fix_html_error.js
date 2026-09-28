const fs = require('fs');
const crypto = require('crypto');

let html = fs.readFileSync('index.html', 'utf8');

const targetStr = `        actionHtml = '<button class="hint-req-btn" onclick="openClueConfirmModal(\\'\\' + escapeHtml(roundName) + \\'\\', \\'\\' + escapeHtml(qId) + \\'\\')">' + btnText + '</button>';`;
const cleanReplacement = `        actionHtml = '<button class="hint-req-btn" data-round="' + escapeHtml(roundName) + '" data-qid="' + escapeHtml(qId) + '" onclick="openClueConfirmModal(this.dataset.round, this.dataset.qid)">' + btnText + '</button>';`;

// Check if string matches or replace line by line
const lines = html.split('\n');
let replaced = false;
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('openClueConfirmModal(') && lines[i].includes('btnText')) {
    console.log(`Found line ${i+1}:`, lines[i]);
    lines[i] = cleanReplacement;
    replaced = true;
    break;
  }
}

if (!replaced) {
  throw new Error("Could not find line with openClueConfirmModal and btnText");
}

html = lines.join('\n');
fs.writeFileSync('index.html', html, 'utf8');
fs.writeFileSync('index (2).html', html, 'utf8');

const h1 = crypto.createHash('sha256').update(fs.readFileSync('index.html')).digest('hex');
const h2 = crypto.createHash('sha256').update(fs.readFileSync('index (2).html')).digest('hex');

console.log("Fixed line 13867 successfully!");
console.log("index.html SHA-256:    ", h1);
console.log("index (2).html SHA-256:", h2);
console.log("Equal:                 ", h1 === h2);
