const fs = require('fs');
const vm = require('vm');

const html = fs.readFileSync('index.html', 'utf8');
const regex = /<script(?![^>]*type=["']application\/json["'])[^>]*>([\s\S]*?)<\/script>/gi;
let match;
let idx = 0;
let errors = 0;

while ((match = regex.exec(html)) !== null) {
  idx++;
  const code = match[1];
  console.log(`Checking script tag #${idx} (length: ${code.length} chars)...`);
  try {
    new vm.Script(code);
    console.log(`  ✔ Script #${idx} syntax OK!`);
  } catch(err) {
    errors++;
    console.error(`  ✖ SYNTAX ERROR in script #${idx}:`, err.message);
    if (err.stack) {
      console.error(err.stack.split('\n').slice(0, 5).join('\n'));
    }
  }
}

if (errors === 0) {
  console.log(`\n🎉 All ${idx} script tags parsed with 0 syntax errors!`);
} else {
  console.log(`\n❌ Found ${errors} syntax errors in HTML scripts!`);
}
