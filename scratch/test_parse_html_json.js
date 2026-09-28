const fs = require('fs');
const html = fs.readFileSync('index.html', 'utf8');
const tagOpen = '<script type="application/json" id="cyberData">';
const tagClose = '</script>';
const start = html.indexOf(tagOpen) + tagOpen.length;
const end = html.indexOf(tagClose, start);
const jsonStr = html.substring(start, end).trim();
const parsed = JSON.parse(jsonStr);
console.log('Successfully parsed cyberData JSON from index.html! R1:', parsed.round1.length, 'R2:', parsed.round2.length, 'R3:', parsed.round3.questions.length);
