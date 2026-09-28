/**
 * Script to enrich all 50 questions in cyber_data.json with strict two-tiered clues:
 * - level_1: Slightly easier (gentle nudge / conceptual hint)
 * - level_2: Completely easier (direct walkthrough / explicit instruction)
 */

const fs = require('fs');
const path = require('path');
const { validateQuestionsDataset } = require('../models/Question');

const dataPath = path.join(__dirname, 'cyber_data.json');
const rawData = JSON.parse(fs.readFileSync(dataPath, 'utf8'));

// 30 Round 1 Clues
const r1Clues = [
  // 1: Phishing
  {
    level_1: "Consider how cybercriminals use deception rather than brute computational force. Look for the definition centered on fraudulent impersonation and tricking individuals into disclosing credentials or private records.",
    level_2: "Select option D ('Fraudulent attempt to obtain sensitive data by impersonating a trustworthy entity'). Phishing relies on masquerading as a legitimate organization (like a bank or IT team) to induce victims to hand over sensitive information."
  },
  // 2: HTTPS
  {
    level_1: "Think about what the 'S' in HTTPS stands for. It focuses on transport layer security and preventing eavesdroppers from reading data transmitted between the browser and the web server.",
    level_2: "Choose option A ('Encryption via TLS/SSL'). Standard HTTP sends data in plain text across the network; HTTPS establishes a cryptographic tunnel using TLS/SSL protocols so network snoops cannot view or tamper with traffic."
  },
  // 3: Zero-day
  {
    level_1: "Focus on the timeline between when a vulnerability is discovered in the wild and when developers first become aware of it to write a defensive update.",
    level_2: "Select option A ('A flaw unknown to the vendor with no patch available'). The term 'zero-day' signifies that software developers have had zero days to issue a fix or security patch because they were unaware of the flaw prior to its exploitation."
  },
  // 4: Strongest password
  {
    level_1: "Evaluate password entropy. High complexity requires substantial length, a mixture of uppercase and lowercase letters, numbers, and special symbols rather than common words or basic sequences.",
    level_2: "Choose option C ('Tr0ub4dor&3xplor3!Zn'). This password resists dictionary and brute-force attacks due to its length, pseudo-random character substitutions, mixed case, and punctuation symbols, unlike 'qwerty' or 'password123'."
  },
  // 5: Social engineering
  {
    level_1: "This attack vector targets the human element of an organization rather than exploiting software vulnerabilities, network ports, or firewalls.",
    level_2: "Select the option stating 'Manipulating people into revealing confidential information'. Social engineering exploits human psychology, trust, fear, or helpfulness to bypass technical controls."
  },
  // 6: 2FA
  {
    level_1: "Think about what happens if an attacker compromises your credentials. What primary defense does having a second, independent factor (such as an authenticator app code or security key) provide?",
    level_2: "Choose the option stating 'Unauthorized access even if a password is stolen'. Even if an adversary acquires your password through a leak or phishing page, they cannot authenticate without possessing your second factor."
  },
  // 7: DDoS
  {
    level_1: "Break down the four letters: 'Distributed' refers to attacks originating from multiple compromised devices (botnets), while 'DoS' is the standard term for flooding a service until it becomes unreachable.",
    level_2: "Select 'Distributed Denial of Service'. In a DDoS attack, thousands of distributed systems overwhelm a target server, website, or network pipe with bogus traffic to deny service to legitimate users."
  },
  // 8: Ransomware
  {
    level_1: "Reflect on the root word 'ransom'. What does this specific strain of extortion malware do to the victim's critical files before issuing an ultimatum?",
    level_2: "Select the option stating 'Encrypts files and demands payment for the key'. Ransomware scrambles documents and databases using strong cryptography and demands cryptocurrency payments in exchange for the decryption tool."
  },
  // 9: VPN
  {
    level_1: "A Virtual Private Network establishes an encrypted communications channel over an untrusted public network like the internet.",
    level_2: "Choose 'An encrypted tunnel for network traffic'. A VPN encapsulates and encrypts your packets so that intermediate ISPs, public Wi-Fi hotspots, or eavesdroppers cannot inspect or tamper with your connection."
  },
  // 10: Malware example
  {
    level_1: "Recall the mythological Greek strategy where a hostile force concealed itself inside a deceptive gift. Look for the malicious software disguised as legitimate software.",
    level_2: "Select 'Trojan horse'. Unlike standard utilities, a Trojan disguises itself as legitimate or harmless software to trick users into executing it, thereby establishing a backdoor or downloading malicious payloads."
  },
  // 11: Brute-force
  {
    level_1: "Consider an attack method that relies on sheer persistence and exhaustive mathematical trial and error without relying on insider knowledge.",
    level_2: "Choose 'Systematically trying all possible password combinations'. Brute-force attacks cycle through combinations of characters until finding the correct match."
  },
  // 12: SQL Injection
  {
    level_1: "SQL stands for Structured Query Language. What backend data tier does SQL communicate with, and how do unescaped user inputs alter commands?",
    level_2: "Select 'Databases via malicious input in queries'. SQLi occurs when untrusted user input is directly concatenated into database queries, allowing attackers to read, alter, or dump table contents."
  },
  // 13: CIA triad
  {
    level_1: "This foundational cybersecurity model represents the three core pillars: keeping secrets private, ensuring data is accurate and untampered, and keeping systems accessible.",
    level_2: "Select 'Confidentiality, Integrity, Availability'. These three goals form the bedrock of information security policy and architecture."
  },
  // 14: Firewall
  {
    level_1: "Think of a firewall as an automated security checkpoint stationed at the boundary between internal trust zones and external networks.",
    level_2: "Choose 'Monitor and control incoming/outgoing network traffic'. Firewalls filter packets based on defined security rules, permitting or blocking traffic by IP address, protocol, or port."
  },
  // 15: Spoofing
  {
    level_1: "Focus on identity impersonation at the protocol level, such as altering caller ID, sender headers, MAC addresses, or IP headers to masquerade as someone else.",
    level_2: "Select 'Disguising a communication to appear from a trusted source'. Spoofing tricks recipients or systems into accepting rogue packets or emails by forging headers to impersonate trusted entities."
  },
  // 16: Reduces risk from data breach
  {
    level_1: "Most security incidents exploit known weaknesses for which remediations already exist. What routine operational practice eliminates these vulnerabilities?",
    level_2: "Choose 'Regularly updating software and patching vulnerabilities'. Prompt patch management closes known security holes before automated threat actors can scan and exploit them."
  },
  // 17: Man-in-the-middle
  {
    level_1: "Visualize two communicating parties who believe they are speaking directly to each other, unaware that an eavesdropper sits between them relaying and altering messages.",
    level_2: "Select 'An attacker intercepting communication between two parties'. In a MitM attack, the adversary secretly intercepts, reads, and potentially alters messages exchanged between two endpoints."
  },
  // 18: PII
  {
    level_1: "This privacy acronym covers sensitive data that can uniquely identify a specific human being, such as Social Security numbers, full names, biometric records, and home addresses.",
    level_2: "Select 'Personally Identifiable Information'. Regulatory frameworks like GDPR and CCPA mandate strict safeguarding for PII to prevent identity theft."
  },
  // 19: Suspicious email attachment
  {
    level_1: "When encountering an unsolicited or dubious attachment, avoid executing or inspecting the file locally. Alert the specialized incident response team instead.",
    level_2: "Choose 'Do not open it and report it to IT/security'. Opening or running suspicious attachments can trigger payload execution. Prompt reporting allows the SOC team to quarantine and analyze the threat."
  },
  // 20: Encryption
  {
    level_1: "Think about the mathematical transformation of plain text into unreadable cipher text so only individuals with the authorized cryptographic key can decipher it.",
    level_2: "Select 'Converting data into a coded form to prevent unauthorized access'. Encryption guarantees confidentiality by rendering information unintelligible to unauthorized parties."
  },
  // 21: Honeypot
  {
    level_1: "Consider a deliberate trap designed to look like an appetizing, vulnerable target in order to lure intruders away from legitimate production assets and analyze their tactics.",
    level_2: "Choose 'A decoy system to attract and detect attackers'. A honeypot acts as intentional bait, logging adversary reconnaissance, tools, and exploitation behaviors in an isolated environment."
  },
  // 22: Public Wi-Fi risk
  {
    level_1: "Open or shared wireless networks lack link-layer isolation between connected stations. What can other clients listening on the same airwaves do to unencrypted packets?",
    level_2: "Select 'Data can be intercepted by others on the network'. Unprotected public Wi-Fi enables malicious actors on the local subnet to perform packet sniffing, ARP poisoning, and credential theft."
  },
  // 23: MFA combines
  {
    level_1: "Recall the three traditional authentication factor categories: knowledge (e.g., password), possession (e.g., hardware token), and inherence (e.g., fingerprint).",
    level_2: "Select 'Something you know, have, and/or are'. Effective multi-factor authentication requires combining distinct categories rather than multiple instances of the same factor."
  },
  // 24: Patch management
  {
    level_1: "Software code regularly develops security bugs that vendors fix with updates. What is the formal term for tracking, testing, and applying these updates across an organization?",
    level_2: "Choose 'Systematically updating software to fix vulnerabilities'. Patch management involves systematically acquiring, testing, and deploying updates to maintain system integrity and compliance."
  },
  // 25: Keylogger
  {
    level_1: "Analyze the compound word 'key' + 'logger'. What physical input device does this spyware monitor to covertly harvest credentials?",
    level_2: "Select 'Records keystrokes to steal information like passwords'. Keyloggers log every physical or virtual key pressed, allowing attackers to capture credentials, credit card numbers, and confidential chats."
  },
  // 26: Least privilege principle
  {
    level_1: "Consider access control hygiene: an employee should never be granted administrative or widespread permissions if their daily role only requires basic read access.",
    level_2: "Choose 'Granting users only the access necessary to perform their job'. The Principle of Least Privilege limits access rights for users, accounts, and computing processes to only what is strictly essential."
  },
  // 27: Sign of phishing email
  {
    level_1: "Look for behavioral manipulation tactics designed to induce panic, such as threats of account closure, vague salutations like 'Dear Customer', and mismatched URLs.",
    level_2: "Select 'Urgent threats, generic greetings, and suspicious links'. Phishers rely on psychological urgency, impersonated sender domains, and deceptive hyperlinks to trap victims."
  },
  // 28: Incident response
  {
    level_1: "When a security incident or intrusion occurs, organizations follow a formal lifecycle: preparation, identification, containment, eradication, recovery, and lessons learned.",
    level_2: "Choose 'A structured approach to handling and recovering from security breaches'. Incident response defines the coordinated protocol and methodologies for managing and mitigating security compromises."
  },
  // 29: Strong practice for account security
  {
    level_1: "Identify the industry-standard control that adds a second layer of verification, rendering leaked or compromised passwords useless on their own.",
    level_2: "Select 'Enabling multi-factor authentication'. MFA provides the strongest defense against credential stuffing and credential theft by requiring secondary verification."
  },
  // 30: Digital trust
  {
    level_1: "Think about the overarching confidence users, consumers, and organizations place in electronic infrastructure, cryptography, and platforms to safeguard their transactions and data.",
    level_2: "Select 'Confidence that digital systems, data, and identities are secure and reliable'. Digital trust is the measure of confidence consumers and enterprises place in cybersecurity, privacy, and integrity of digital ecosystems."
  }
];

// 15 Round 2 Clues
const r2Clues = [
  // 1: CAESAR CIPHER · Shift 3 ('ZDWFK RXW IRU SKLVKLQJ')
  {
    level_1: "This is a Caesar Cipher with a backwards shift of 3. For each letter, count 3 steps backward in the alphabet (e.g., D becomes A, W becomes T, Z wraps around to W).",
    level_2: "Step-by-step decoding:\n• Z->w, D->a, W->t, F->c, K->h (WATCH)\n• R->o, X->u, W->t (OUT)\n• I->f, R->o, U->r (FOR)\n• S->p, K->h, L->i, V->s, K->h, L->i, Q->n, J->g (PHISHING)\nType the exact answer: 'watch out for phishing'."
  },
  // 2: SCAM DETECTION ('Your account will be suspended in 1 hour!')
  {
    level_1: "Social engineers use high-pressure emotional triggers to force victims to act impulsively before thinking critically. What word describes imposing strict, imminent time limits?",
    level_2: "The single-word red flag is 'urgency' (or 'urgent'). Attackers manufacture an artificial sense of urgency (e.g., '1 hour suspension!') to panic victims into submitting credentials without verification."
  },
  // 3: EMOJI DECODE (🔑 + 📝 + 👁️)
  {
    level_1: "Combine the concepts behind each emoji: Key (🔑) + Write/Note/Log (📝) + Surveillance/Watcher (👁️). Think of a specific category of credential-stealing spyware.",
    level_2: "Combine 'key' and 'logger' to get 'keylogger'. This surveillance malware covertly records every key pressed by the user on their keyboard to harvest credentials and secret messages."
  },
  // 4: BASE64 DECODE ('U0VDVVJJVFk=')
  {
    level_1: "Base64 encodes 8-bit binary data into ASCII characters, ending in '=' as padding. Decode the bytes or recognize the common 8-letter cybersecurity buzzword starting with 'sec'.",
    level_2: "Decoding 'U0VDVVJJVFk=' yields ASCII: U0='S', VD='E', VV='C', JJ='U', VF='R', k9='ITY'. Type the plain-text word: 'security'."
  },
  // 5: CRYPTOGRAPHY · Binary ('01000011 01011001 01000010 01000101 01010010')
  {
    level_1: "Each 8-bit byte represents one ASCII character. Convert binary to decimal, or note that 01000011 is 67 ('C'). Follow the 5-letter prefix of our event name.",
    level_2: "Byte conversion walkthrough:\n• 01000011 = 67 ('c')\n• 01011001 = 89 ('y')\n• 01000010 = 66 ('b')\n• 01000101 = 69 ('e')\n• 01010010 = 82 ('r')\nType the word: 'cyber'."
  },
  // 6: SCAM DETECTION (Phone call from bank's IT department asking for OTP)
  {
    level_1: "Phishing conducted specifically through voice telephone calls or automated voice systems has a dedicated portmanteau term starting with 'v'.",
    level_2: "The term is 'vishing' (short for Voice Phishing). Attackers spoof official caller ID phone numbers and use vocal social engineering to trick victims into sharing OTPs."
  },
  // 7: EMOJI DECODE (🎣 + 📧)
  {
    level_1: "Inspect the symbols: a fishing hook (🎣) plus an electronic mail envelope (📧). What classic email scam sounds like 'fishing'?",
    level_2: "Combine fishing with email to get 'phishing' (or 'phishing email'). Attackers cast malicious lure emails hoping recipients will bite and disclose sensitive credentials or payment data."
  },
  // 8: CAESAR CIPHER · Shift 3 ('XVH VWURQJ SDVVZRUGV')
  {
    level_1: "Shift each letter back by 3 in the alphabet: X-3 = U, V-3 = S, H-3 = E. Continue this pattern across all three words.",
    level_2: "Letter-by-letter decryption:\n• XVH -> 'use'\n• VWURQJ -> 'strong'\n• SDVVZRUGV -> 'passwords'\nType the complete phrase: 'use strong passwords'."
  },
  // 9: ACRONYM PUZZLE (VPN)
  {
    level_1: "Spell out the 3 words representing an encrypted networking technology that establishes a secure, private connection over the public internet.",
    level_2: "Expand VPN into: 'virtual private network'. It masks the user's IP address and encrypts network traffic to ensure privacy and secure data transit across untrusted networks."
  },
  // 10: SCAM DETECTION ('You've won a free iPhone! Enter your card details')
  {
    level_1: "Think about the bait: promising an unearned high-value reward, lottery payout, or free gadget in exchange for credit card details or fee payments.",
    level_2: "This technique is classified as a 'prize scam' (or 'lottery scam' / 'giveaway scam'). Fraudsters lure targets with fake prizes or giveaways to steal payment card data or advance fees."
  },
  // 11: CRYPTOGRAPHY · Reverse ('TAERHT REDISNI')
  {
    level_1: "Read the entire string backward from the very last letter ('I') to the first letter ('T'). Notice two distinct English words relating to internal security risks.",
    level_2: "Reverse the letters from end to beginning:\n• REDISNI reversed is 'INSIDER'\n• TAERHT reversed is 'THREAT'\nType the combined phrase: 'insider threat'."
  },
  // 12: EMOJI DECODE (🧱 + 🔥)
  {
    level_1: "Identify the two physical icons: a brick wall (🧱) and an open fire flame (🔥). What ubiquitous perimeter network security device does this combine into?",
    level_2: "Combine 'fire' and 'wall' to form 'firewall'. A firewall inspects and regulates incoming and outgoing network traffic based on predetermined security policies."
  },
  // 13: ACRONYM PUZZLE (OTP)
  {
    level_1: "Expand the acronym for the temporary, dynamic security code sent via SMS or authenticator apps that expires after a single use or brief time window.",
    level_2: "Type the full phrase: 'one time password' (or 'one-time password'). OTP provides dynamic single-use authentication codes to safeguard accounts against unauthorized logins."
  },
  // 14: SCAM DETECTION (SMS from unknown number with shortened delivery link)
  {
    level_1: "This is a portmanteau combining 'SMS' (text messaging) and 'phishing'. What single word describes phishing attacks delivered via SMS?",
    level_2: "The attack is called 'smishing' (short for SMS phishing). Attackers send deceptive text messages with urgent links claiming delivery delays or account locks to harvest credentials."
  },
  // 15: CAESAR CIPHER · Shift 5 ('LZFWI DTZW UFXXBTWI')
  {
    level_1: "Shift each letter back 5 positions in the alphabet. For instance, L (12th letter) minus 5 becomes G (7th letter); Z wraps back to U.",
    level_2: "Letter-by-letter decryption (shift back by 5):\n• LZFWI -> 'guard'\n• DTZW -> 'your'\n• UFXXBTWI -> 'password'\nType the complete decrypted phrase: 'guard your password'."
  }
];

// 5 Round 3 Clues
const r3Clues = [
  // 1: What IP address is associated with the attacker's successful login?
  {
    level_1: "Examine the 'Server Log' evidence card. Look for failed login attempts by user 'admin' that were immediately followed by a successful login timestamped at [02:17:02].",
    level_2: "In the Server Log, line [02:17:02] records: 'Login SUCCESS user=admin ip=41.203.88.19' following 14 failed attempts. Enter the exact IP address: '41.203.88.19'."
  },
  // 2: Decode the Caesar cipher note (shift -3). What does it say?
  {
    level_1: "Inspect the 'Caesar Cipher Note' evidence card. The cipher text is 'QEB XQQXZH TXP LOZEBPQOXQBA XQ 2:14XJ'. Shift each letter forward by 3 (or shift -3 as indicated) to recover plain English.",
    level_2: "Deciphering walkthrough:\n• QEB -> 'THE'\n• XQQXZH -> 'ATTACK'\n• TXP -> 'WAS'\n• LOZEBPQOXQBA -> 'ORCHESTRATED'\n• XQ -> 'AT'\n• 2:14XJ -> '2:14AM'\nType the full phrase: 'the attack was orchestrated at 2:14am'."
  },
  // 3: What was the initial attack vector used against the victim?
  {
    level_1: "Review the 'Phishing Email' evidence card. Notice the spoofed sender address ('security-alert@paypa1-verify.com') sent to finance.dept with an urgent link to steal credentials.",
    level_2: "The initial breach vector was a 'phishing email' (or 'spear phishing'). The attacker sent a fraudulent PayPal verification notice to trick the finance department into clicking a malicious credential harvesting link."
  },
  // 4: What dollar amount was transferred out during the breach?
  {
    level_1: "Look at the final entry in the 'Server Log' evidence card timestamped at [02:19:12] regarding the unauthorized outbound fund transfer.",
    level_2: "The Server Log at [02:19:12] states: 'Outbound transfer initiated: $48,200 -> ACC#7729-XX'. Enter the amount as '48200' or '$48,200'."
  },
  // 5: Based on the social profile, what is the suspect's username?
  {
    level_1: "Check the 'Social Profile' evidence card recovered by investigators. Look at the top line indicating the account handle/username.",
    level_2: "The Social Profile card clearly states: 'Username: n.volkov_88' with the bio 'Pentester | Night owl'. Type the exact username: 'n.volkov_88'."
  }
];

// Attach clues to Round 1
rawData.round1.forEach((q, i) => {
  q.clues = r1Clues[i];
});

// Attach clues to Round 2
rawData.round2.forEach((p, i) => {
  p.clues = r2Clues[i];
});

// Attach clues to Round 3
rawData.round3.questions.forEach((q, i) => {
  q.clues = r3Clues[i];
});

// Validate dataset
const report = validateQuestionsDataset(rawData);
if (!report.valid) {
  console.error("VALIDATION FAILED:", report.errors);
  process.exit(1);
}

console.log(`Successfully validated ${report.totalQuestions} questions across all 3 rounds!`);

// Write back to scratch/cyber_data.json
fs.writeFileSync(dataPath, JSON.stringify(rawData, null, 1), 'utf8');
console.log(`Saved updated cyber_data.json`);
