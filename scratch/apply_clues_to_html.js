const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const indexPath = path.join(__dirname, '..', 'index.html');
const index2Path = path.join(__dirname, '..', 'index (2).html');
const cyberDataPath = path.join(__dirname, 'cyber_data.json');

const cyberDataRaw = fs.readFileSync(cyberDataPath, 'utf8');
let html = fs.readFileSync(indexPath, 'utf8');

// 1. Replace cyberData JSON inside <script type="application/json" id="cyberData">
const scriptOpen = '<script type="application/json" id="cyberData">';
const scriptClose = '</script>';

const openIdx = html.indexOf(scriptOpen);
if (openIdx === -1) throw new Error("Could not find cyberData open tag");
const closeIdx = html.indexOf(scriptClose, openIdx);
if (closeIdx === -1) throw new Error("Could not find cyberData close tag");

html = html.substring(0, openIdx + scriptOpen.length) + '\n' + cyberDataRaw.trim() + '\n' + html.substring(closeIdx);

// 2. Enhance CSS for .hint-granted-box
const oldCssMarker = `.hint-granted-box {
      background: rgba(6, 28, 18, 0.9);
      border: 1.5px solid #22c55e;
      border-radius: 10px;
      padding: 12px 16px;
      margin-top: 12px;
      box-shadow: 0 0 25px rgba(34, 197, 94, 0.25);
      animation: grantedClueGlow 2.5s infinite ease-in-out;
    }`;

const newCss = `.hint-granted-box {
      background: rgba(6, 28, 18, 0.92);
      border: 1.5px solid #22c55e;
      border-radius: 10px;
      padding: 14px 18px;
      margin-top: 12px;
      box-shadow: 0 0 25px rgba(34, 197, 94, 0.25);
      animation: grantedClueGlow 2.5s infinite ease-in-out;
    }

    .hint-granted-box.tier-1 {
      background: rgba(8, 25, 45, 0.92);
      border-color: #38bdf8;
      box-shadow: 0 0 25px rgba(56, 189, 248, 0.25);
    }

    .hint-granted-box.tier-2 {
      background: rgba(6, 28, 18, 0.92);
      border-color: #22c55e;
      box-shadow: 0 0 25px rgba(34, 197, 94, 0.25);
    }

    .hint-granted-box.tier-1 .hint-granted-head {
      color: #38bdf8;
      border-bottom-color: rgba(56, 189, 248, 0.35);
    }

    .hint-granted-box.tier-2 .hint-granted-head {
      color: #4ade80;
      border-bottom-color: rgba(34, 197, 94, 0.35);
    }`;

if (html.includes(oldCssMarker)) {
  html = html.replace(oldCssMarker, newCss);
} else {
  console.warn("oldCssMarker not found, checking alternate line endings...");
  const normHtml = html.replace(/\r\n/g, '\n');
  const normOld = oldCssMarker.replace(/\r\n/g, '\n');
  if (normHtml.includes(normOld)) {
    html = normHtml.replace(normOld, newCss);
  }
}

// Ensure .hint-granted-text supports standard text formatting (paragraphs, newlines, word wrapping)
const oldTextCss = `.hint-granted-text {
      font-family: var(--font-mono);
      font-size: 12.5px;
      color: #f0fdf4;
      line-height: 1.55;
      font-weight: 500;
    }`;

const newTextCss = `.hint-granted-text {
      font-family: var(--font-mono);
      font-size: 13px;
      color: #f0fdf4;
      line-height: 1.65;
      font-weight: 500;
      white-space: pre-line;
      word-break: break-word;
    }

    .hint-granted-box.tier-1 .hint-granted-text {
      color: #f0f9ff;
    }`;

if (html.includes(oldTextCss)) {
  html = html.replace(oldTextCss, newTextCss);
} else {
  const normHtml = html.replace(/\r\n/g, '\n');
  const normOld = oldTextCss.replace(/\r\n/g, '\n');
  if (normHtml.includes(normOld)) {
    html = normHtml.replace(normOld, newTextCss);
  }
}

// Write temporarily to index.html and index (2).html
fs.writeFileSync(indexPath, html, 'utf8');
fs.writeFileSync(index2Path, html, 'utf8');

const hash1 = crypto.createHash('sha256').update(fs.readFileSync(indexPath)).digest('hex');
const hash2 = crypto.createHash('sha256').update(fs.readFileSync(index2Path)).digest('hex');

console.log("HTML JSON & CSS Updated successfully!");
console.log("index.html SHA-256:    ", hash1);
console.log("index (2).html SHA-256:", hash2);
console.log("Equal:                 ", hash1 === hash2);
