const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const indexPath = path.join(__dirname, '..', 'index.html');
const index2Path = path.join(__dirname, '..', 'index (2).html');

let html = fs.readFileSync(indexPath, 'utf8');

// Replacement 1: getDefaultHint
const startHint = '    function getDefaultHint(qId, tier = 1) {';
const endHint = '    function getGrantedHintsForQuestion(qId) {';

const idxStartHint = html.indexOf(startHint);
const idxEndHint = html.indexOf(endHint);

if (idxStartHint === -1 || idxEndHint === -1) {
  throw new Error("Could not find getDefaultHint boundaries");
}

const newGetDefaultHintCode = `    function getDefaultHint(qId, tier = 1) {
      try {
        let q = null;
        if (qId && qId.startsWith('R1_Q')) {
          const idx = parseInt(qId.replace('R1_Q', '')) - 1;
          q = R1 && R1[idx];
        } else if (qId && qId.startsWith('R2_P')) {
          const idx = parseInt(qId.replace('R2_P', '')) - 1;
          q = R2 && R2[idx];
        } else if (qId && qId.startsWith('R3_Q')) {
          const idx = parseInt(qId.replace('R3_Q', '')) - 1;
          q = R3 && R3.questions && R3.questions[idx];
        }
        if (q && q.clues) {
          if (Number(tier) === 2 && q.clues.level_2) return q.clues.level_2;
          if (q.clues.level_1) return q.clues.level_1;
        }
      } catch (e) { console.error("[SURVEILLANCE_PIPE_ERROR]:", e); }
      return Number(tier) === 2
        ? "System Clue 2: Follow standard forensic protocols and inspect challenge parameters."
        : "System Clue 1: Review foundational security architecture and inspect challenge parameters.";
    }

`;

html = html.substring(0, idxStartHint) + newGetDefaultHintCode + html.substring(idxEndHint);

// Replacement 2: openClueConfirmModal down to adminRejectHint
const startModal = '    function openClueConfirmModal(roundName, qId, qLabel) {';
const endModal = '    function adminRejectHint(idx) {';

const idxStartModal = html.indexOf(startModal);
const idxEndModal = html.indexOf(endModal);

if (idxStartModal === -1 || idxEndModal === -1) {
  throw new Error("Could not find modal / admin hint boundaries");
}

const newModalAndRenderCode = `    function openClueConfirmModal(roundName, qId, qLabel) {
      if (!S || S.is_locked) return;
      const curScore = (S.scores.r1 || 0) + (S.scores.r2 || 0) + (S.scores.r3 || 0) + (S.scores.bonus || 0);
      if (curScore < CLUE_COST) {
        showToast('❌ Insufficient points (Requires 10 Trust Points · Balance: ' + curScore + ' pts)');
        renderCurrentHintBox(roundName, qId);
        return;
      }

      if (!qLabel) {
        if (qId.startsWith('R1_Q')) qLabel = 'Question #' + qId.replace('R1_Q', '');
        else if (qId.startsWith('R2_P')) qLabel = 'Crypto Challenge #' + qId.replace('R2_P', '');
        else if (qId.startsWith('R3_Q')) qLabel = 'Forensic Case #' + qId.replace('R3_Q', '');
        else qLabel = qId;
      }

      const list = getHintRequests();
      const grantedList = list.filter(r => r.sid === S.sid && r.qId === qId && r.status === 'GRANTED');
      const requestedTier = grantedList.length + 1;
      const isTier2 = (requestedTier === 2);

      const tierBadge = isTier2
        ? '<span style="background:rgba(34,197,94,0.2); color:#4ade80; border:1px solid #22c55e; padding:3px 8px; border-radius:4px; font-weight:700;">🔑 Clue 2: Direct Walkthrough (Completely Easier)</span>'
        : '<span style="background:rgba(56,189,248,0.2); color:#38bdf8; border:1px solid #38bdf8; padding:3px 8px; border-radius:4px; font-weight:700;">💡 Clue 1: Conceptual Nudge (Slightly Easier)</span>';

      const tierDesc = isTier2
        ? '• <b>Clue 2: Direct Walkthrough</b> provides explicit step-by-step instructions so you can easily understand exactly how to solve this challenge.<br>' +
          '• Once approved by the proctor, the direct walkthrough will be unlocked in your terminal.<br>' +
          '• If declined by the proctor, your 10 points will be automatically refunded.'
        : '• <b>Clue 1: Conceptual Nudge</b> points you in the right direction without revealing the exact solution.<br>' +
          '• Once approved by the proctor, the conceptual clue will be unlocked in your terminal.<br>' +
          '• If declined by the proctor, your 10 points will be automatically refunded.';

      pendingClueRequest = { roundName, qId, qLabel, tier: requestedTier };

      const bodyEl = $('clueConfirmBody');
      if (bodyEl) {
        bodyEl.innerHTML =
          '<div style="background:rgba(15,23,42,0.85); border:1px solid rgba(56,189,248,0.25); border-radius:8px; padding:14px; margin-bottom:14px; font-size:12px;">' +
          '<div style="display:flex; justify-content:space-between; margin-bottom:8px;">' +
          '<span style="color:#94a3b8;">Challenge:</span>' +
          '<b style="color:var(--cyan);">' + escapeHtml(qLabel) + ' (' + escapeHtml(roundName) + ')</b>' +
          '</div>' +
          '<div style="display:flex; justify-content:space-between; margin-bottom:8px; align-items:center;">' +
          '<span style="color:#94a3b8;">Clue Tier:</span>' +
          tierBadge +
          '</div>' +
          '<div style="display:flex; justify-content:space-between; margin-bottom:8px;">' +
          '<span style="color:#94a3b8;">Clue Cost:</span>' +
          '<b style="color:#f59e0b;">' + CLUE_COST + ' Trust Points</b>' +
          '</div>' +
          '<div style="display:flex; justify-content:space-between; margin-bottom:8px;">' +
          '<span style="color:#94a3b8;">Current Balance:</span>' +
          '<span style="color:#e2e8f0; font-weight:600;">' + curScore + ' pts</span>' +
          '</div>' +
          '<div style="display:flex; justify-content:space-between; border-top:1px dashed #334155; padding-top:8px; margin-top:8px;">' +
          '<span style="color:#94a3b8;">Balance After Request:</span>' +
          '<b style="color:#34d399; font-size:13px;">' + (curScore - CLUE_COST) + ' pts</b>' +
          '</div>' +
          '</div>' +
          '<p style="color:#94a3b8; font-size:11px; margin:0; line-height:1.5;">' +
          tierDesc +
          '</p>';
      }

      isInternalModalOpen = true;
      const modal = $('modalClueConfirm');
      if (modal) modal.classList.add('active');
    }

    function closeClueConfirmModal() {
      const modal = $('modalClueConfirm');
      if (modal) modal.classList.remove('active');
      pendingClueRequest = null;
      isInternalModalOpen = false;
    }

    function confirmAndSendClueRequest() {
      if (!pendingClueRequest) {
        closeClueConfirmModal();
        return;
      }
      const { roundName, qId, qLabel } = pendingClueRequest;
      closeClueConfirmModal();
      requestAdminHint(roundName, qId, qLabel);
    }

    function requestAdminHint(roundName, qId, qLabel) {
      if (!S || S.is_locked) return { status: 403, ok: false, error: 'SESSION_LOCKED' };
      const list = getHintRequests();
      const grantedList = list.filter(r => r.sid === S.sid && r.qId === qId && r.status === 'GRANTED');
      const pendingReq = list.find(r => r.sid === S.sid && r.qId === qId && r.status === 'PENDING');

      if (pendingReq) {
        showToast('⏳ Clue request is already pending System Admin approval.');
        return { status: 409, ok: false, error: 'ALREADY_PENDING' };
      }
      if (grantedList.length >= 2) {
        showToast('💡 Maximum clues reached (2/2) for this challenge.');
        return { status: 409, ok: false, error: 'MAX_CLUES_REACHED' };
      }

      const requestedTier = grantedList.length + 1;
      const tierTitle = requestedTier === 2 ? 'Clue 2: Direct Walkthrough' : 'Clue 1: Conceptual Nudge';

      if (!qLabel) {
        if (qId.startsWith('R1_Q')) qLabel = 'Question #' + qId.replace('R1_Q', '');
        else if (qId.startsWith('R2_P')) qLabel = 'Crypto Challenge #' + qId.replace('R2_P', '');
        else if (qId.startsWith('R3_Q')) qLabel = 'Forensic Case #' + qId.replace('R3_Q', '');
        else qLabel = qId;
      }

      const curScore = (S.scores.r1 || 0) + (S.scores.r2 || 0) + (S.scores.r3 || 0) + (S.scores.bonus || 0);

      // SERVER-SIDE / HANDLER STRICT VALIDATION CHECK
      const check = handleClueRequestPayload({
        sid: S.sid,
        qId: qId,
        tier: requestedTier,
        currentScore: curScore,
        cost: CLUE_COST
      });

      if (!check.ok || check.status === 400) {
        showToast('❌ ' + check.message);
        renderCurrentHintBox(roundName, qId);
        return check;
      }

      // Only deduct points and forward request if validation passes and score >= 10
      S.scores.bonus = (S.scores.bonus || 0) - CLUE_COST;
      save();
      updateRank();

      // Clear previous rejected request for same question if any
      const cleanList = list.filter(r => !(r.sid === S.sid && r.qId === qId && r.status === 'PENDING'));
      cleanList.push({
        id: 'req_' + Date.now(),
        sid: S.sid,
        name: S.player.name,
        dept: S.player.dept,
        year: S.player.year,
        round: roundName,
        qId: qId,
        qLabel: (qLabel || qId) + ' (' + tierTitle + ')',
        tier: requestedTier,
        cost: CLUE_COST,
        status: 'PENDING',
        hintText: '',
        time: Date.now()
      });
      saveHintRequests(cleanList);
      broadcastParticipantHeartbeat();
      SFX.click();
      showToast('🙋 ' + tierTitle + ' requested (-10 Points). Awaiting Admin approval...');
      renderCurrentHintBox(roundName, qId);
      return { status: 200, ok: true, code: 'REQUEST_FORWARDED' };
    }

    function renderCurrentHintBox(roundName, qId, containerId) {
      if (!containerId) {
        if ((roundName && roundName.indexOf('1') !== -1) || (S && S.round === 'R1')) containerId = 'r1HintSlot';
        else if ((roundName && roundName.indexOf('2') !== -1) || (S && S.round === 'R2')) containerId = 'r2HintSlot';
        else if ((roundName && roundName.indexOf('3') !== -1) || (S && S.round === 'R3')) containerId = 'r3HintSlot';
        else containerId = 'r1HintSlot';
      }
      const el = $(containerId);
      if (!el) return;

      const curScore = (S && S.scores)
        ? ((Number(S.scores.r1) || 0) + (Number(S.scores.r2) || 0) + (Number(S.scores.r3) || 0) + (Number(S.scores.bonus) || 0))
        : 0;
      const hasEnoughPoints = curScore >= CLUE_COST;

      const list = getHintRequests();
      const grantedList = S ? list.filter(r => r.sid === S.sid && r.qId === qId && r.status === 'GRANTED') : [];
      const pendingReq = S ? list.find(r => r.sid === S.sid && r.qId === qId && r.status === 'PENDING') : null;

      let grantedHtml = '';
      if (grantedList.length > 0) {
        grantedHtml = grantedList.map((g, idx) => {
          const tierNum = Number(g.tier || (idx + 1));
          const isTier2 = (tierNum === 2);
          const badgeClass = isTier2 ? 'tier-2' : 'tier-1';
          const title = isTier2
            ? '🔑 CLUE 2 · DIRECT WALKTHROUGH (Completely Easier)'
            : '💡 CLUE 1 · CONCEPTUAL NUDGE (Slightly Easier)';
          return '<div class="hint-granted-box ' + badgeClass + '" style="margin-bottom:10px;">' +
            '<div class="hint-granted-head"><span>' + title + '</span><span>• ACCESS GRANTED (-10 PTS)</span></div>' +
            '<div class="hint-granted-text">' + escapeHtml(g.hintText) + '</div>' +
            '</div>';
        }).join('');
      }

      // If 2 clues already granted, no more requests allowed
      if (grantedList.length >= 2) {
        el.innerHTML = grantedHtml +
          '<div class="hint-req-card" style="border-color:#334155; background:rgba(15,23,42,0.6);">' +
          '<div><b style="color:#38bdf8;">💡 All Clues Unlocked (2/2):</b> <span style="color:#94a3b8;">Both Clue 1 (Conceptual Nudge) and Clue 2 (Direct Walkthrough) are active above.</span></div>' +
          '<button class="hint-req-btn disabled" disabled style="opacity:0.5; cursor:not-allowed;">🔒 All Clues Unlocked (2/2)</button>' +
          '</div>';
        return;
      }

      if (pendingReq) {
        const pendingTier = Number(pendingReq.tier || (grantedList.length + 1));
        const pendingTitle = pendingTier === 2 ? 'Clue 2: Direct Walkthrough' : 'Clue 1: Conceptual Nudge';
        el.innerHTML = grantedHtml +
          '<div class="hint-req-card" style="border-color:#f59e0b; background:rgba(44,30,16,0.65);">' +
          '<div><b style="color:#fbbf24;">⏳ Hint Request Pending:</b> <span style="color:#cbd5e1;">You pledged 10 points for ' + escapeHtml(pendingTitle) + '. Waiting for System Admin approval...</span></div>' +
          '<button class="hint-req-btn" disabled style="opacity:0.6; cursor:not-allowed;">⏳ Pending Admin Approval</button>' +
          '</div>';
        return;
      }

      const nextTier = grantedList.length + 1;
      const isTier2Req = (nextTier === 2);
      const reqTitle = isTier2Req ? '🔑 Need Clue 2: Direct Walkthrough?' : '💡 Need Clue 1: Conceptual Nudge?';
      const reqDesc = isTier2Req
        ? 'Spend 10 points to unlock an explicit, step-by-step walkthrough explaining exactly how to solve this challenge.'
        : 'Spend 10 points for a gentle conceptual hint pointing in the right direction without revealing the exact solution.';
      const btnText = isTier2Req
        ? '🔑 Request Clue 2: Direct Walkthrough (-10 Pts)'
        : '💡 Request Clue 1: Conceptual Nudge (-10 Pts)';

      let actionHtml;
      if (hasEnoughPoints) {
        actionHtml = '<button class="hint-req-btn" onclick="openClueConfirmModal(\'' + escapeHtml(roundName) + '\', \'' + escapeHtml(qId) + '\')">' + btnText + '</button>';
      } else {
        actionHtml = '<div style="display:flex; flex-direction:column; align-items:flex-end; gap:4px;">' +
          '<button class="hint-req-btn disabled" disabled style="opacity:0.45; cursor:not-allowed; background:rgba(30,41,59,0.5); border-color:rgba(239,68,68,0.3); color:#94a3b8;" title="Insufficient points (Requires 10 Trust Points)">🔒 ' + btnText + '</button>' +
          '<small style="color:#f87171; font-size:11px; font-weight:600;">⚠️ Insufficient points (Requires 10 Trust Points)</small>' +
          '</div>';
      }

      el.innerHTML = grantedHtml +
        '<div class="hint-req-card">' +
        '<div><b style="color:#38bdf8;">' + reqTitle + '</b> <span style="color:#94a3b8;">' + reqDesc + '</span></div>' +
        actionHtml +
        '</div>';
    }

    function renderAdminHintConsole() {
      const body = $('adminHintTableBody');
      if (!body) return;
      const list = getHintRequests();
      if (list.length === 0) {
        body.innerHTML = '<tr><td colspan="5" style="text-align:center; color:#64748b; padding:18px;">No hint requests submitted by students yet.</td></tr>';
        return;
      }

      const sorted = list.map((r, i) => ({ ...r, origIdx: i })).sort((a, b) => {
        if (a.status === 'PENDING' && b.status !== 'PENDING') return -1;
        if (b.status === 'PENDING' && a.status !== 'PENDING') return 1;
        return b.time - a.time;
      });

      body.innerHTML = sorted.map(r => {
        const isGranted = r.status === 'GRANTED';
        const isPending = r.status === 'PENDING';
        const isRejected = r.status === 'REJECTED';
        const tierNum = Number(r.tier || 1);
        const isTier2 = (tierNum === 2);

        let badge = '<span class="status-tag-switch" style="animation:none; background:rgba(245,158,11,0.2); color:#fbbf24; border-color:#f59e0b;" title="Awaiting Admin Review & Approval">⏳ PENDING</span>';
        if (isGranted) badge = '<span class="status-tag-active" title="Clue granted and revealed to candidate">🟢 GRANTED</span>';
        else if (isRejected) badge = '<span class="status-tag-disq" title="Request declined and 10 points refunded">🔴 DECLINED</span>';

        const tierBadge = isTier2
          ? '<span style="display:inline-block; font-size:10px; padding:2px 6px; border-radius:4px; background:rgba(34,197,94,0.15); color:#4ade80; border:1px solid #22c55e; margin-top:3px; font-weight:700;">🔑 Tier 2: Walkthrough</span>'
          : '<span style="display:inline-block; font-size:10px; padding:2px 6px; border-radius:4px; background:rgba(56,189,248,0.15); color:#38bdf8; border:1px solid #38bdf8; margin-top:3px; font-weight:700;">💡 Tier 1: Nudge</span>';

        const defaultClue = r.hintText || getDefaultHint(r.qId, tierNum);

        let clueBox = '';
        let actionBtns = '';

        if (isPending) {
          clueBox = '<div style="display:flex; flex-direction:column; gap:4px;">' +
            '<textarea id="adminHintInput_' + r.origIdx + '" class="threat-input-sm" rows="3" style="width:100%; background:rgba(15,23,42,0.9); color:#f8fafc; border:1px solid #0284c7; padding:6px 8px; border-radius:4px; font-size:12px; resize:vertical; line-height:1.45; font-family:var(--font-mono);">' + escapeHtml(defaultClue) + '</textarea>' +
            '<small style="color:#94a3b8; font-size:10px;">Pre-filled with predefined ' + (isTier2 ? 'Tier 2 Walkthrough' : 'Tier 1 Conceptual Nudge') + ' from database. Edit as desired before dispatching.</small>' +
            '</div>';

          actionBtns = '<div style="display:flex; gap:6px;">' +
            '<button class="btn solid small" style="background:#22c55e; border-color:#22c55e; padding:5px 12px; font-weight:700;" onclick="adminGrantHint(' + r.origIdx + ')">✔ Accept & Grant</button>' +
            '<button class="btn rose small" style="padding:5px 10px;" onclick="adminRejectHint(' + r.origIdx + ')">✖ Decline</button>' +
            '</div>';
        } else if (isGranted) {
          const grantedBg = isTier2 ? 'rgba(34,197,94,0.1)' : 'rgba(56,189,248,0.1)';
          const grantedBorder = isTier2 ? 'rgba(34,197,94,0.3)' : 'rgba(56,189,248,0.3)';
          const grantedColor = isTier2 ? '#4ade80' : '#38bdf8';
          clueBox = '<div style="font-size:12px; color:' + grantedColor + '; background:' + grantedBg + '; border:1px solid ' + grantedBorder + '; padding:8px 10px; border-radius:4px; white-space:pre-line; line-height:1.5;">' +
            '<b>Dispatched ' + (isTier2 ? 'Tier 2 (Walkthrough)' : 'Tier 1 (Nudge)') + ':</b><br>' + escapeHtml(r.hintText) +
            '</div>';

          actionBtns = '<div style="display:flex; gap:6px;">' +
            '<button class="btn ghost small" style="padding:4px 8px;" onclick="adminEditGrantedHint(' + r.origIdx + ')">✏ Edit Clue</button>' +
            '<button class="btn rose small" style="padding:4px 8px;" onclick="adminRevokeHint(' + r.origIdx + ')">Revoke</button>' +
            '</div>';
        } else {
          clueBox = '<span style="color:#94a3b8; font-size:12px;">Request was declined (cost refunded).</span>';
          actionBtns = '<button class="btn ghost small" style="padding:4px 8px;" onclick="adminGrantHint(' + r.origIdx + ')">🔄 Re-Approve</button>';
        }

        const timeStr = new Date(r.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

        return '<tr>' +
          '<td><b>' + escapeHtml(r.name) + '</b><br><small style="color:#94a3b8;">' + escapeHtml(r.dept) + ' · Yr ' + escapeHtml(r.year) + '</small><br><span style="font-size:10px; color:#64748b;">' + timeStr + '</span></td>' +
          '<td><span class="threat-badge badge-secure">' + escapeHtml(r.round) + '</span><br><b style="font-size:12px; color:var(--cyan);">' + escapeHtml(r.qLabel) + '</b><br>' + tierBadge + '</td>' +
          '<td>' + badge + '<br><small style="color:#f59e0b; font-size:10px;">Cost: 10 Pts Deducted</small></td>' +
          '<td>' + clueBox + '</td>' +
          '<td>' + actionBtns + '</td>' +
          '</tr>';
      }).join('');
    }

    function adminGrantHint(idx) {
      const list = getHintRequests();
      const r = list[idx];
      if (!r) return;
      const input = $('adminHintInput_' + idx);
      let clue = (input && input.value != null && input.value !== '') ? String(input.value).trim() : '';

      const executeGrant = (clueText) => {
        if (!clueText || clueText.trim() === '') return;
        r.status = 'GRANTED';
        r.hintText = clueText.trim();
        r.grantedAt = Date.now();
        saveHintRequests(list);

        const msgs = JSON.parse(localStorage.getItem(ADMIN_DIRECT_MSG_KEY) || '{}');
        msgs[r.sid] = { text: "System Admin approved your clue request for " + r.qLabel + "! Your hint is now unlocked on screen.", time: Date.now() };
        localStorage.setItem(ADMIN_DIRECT_MSG_KEY, JSON.stringify(msgs));

        showToast('✔ Clue approved and granted to ' + r.name + '!');
        SFX.success();
        renderAdminHintConsole();
      };

      if (clue) {
        executeGrant(clue);
      } else {
        const tierNum = Number(r.tier || 1);
        showAppModal({
          mode: 'prompt',
          title: 'GRANT CLUE APPROVAL (' + (tierNum === 2 ? 'TIER 2 WALKTHROUGH' : 'TIER 1 NUDGE') + ')',
          icon: '💡',
          message: 'Enter specific clue to reveal to ' + r.name + ' (' + (r.dept || 'Candidate') + ') for ' + r.qLabel + ' (' + r.round + '):',
          inputLabel: 'Predefined / Custom Clue Text:',
          defaultValue: getDefaultHint(r.qId, tierNum),
          confirmText: '✔ Approve & Dispatch',
          cancelText: 'Cancel',
          onConfirm: (customClue) => {
            executeGrant(customClue);
          }
        });
      }
    }

`;

html = html.substring(0, idxStartModal) + newModalAndRenderCode + html.substring(idxEndModal);

fs.writeFileSync(indexPath, html, 'utf8');
fs.writeFileSync(index2Path, html, 'utf8');

const hash1 = crypto.createHash('sha256').update(fs.readFileSync(indexPath)).digest('hex');
const hash2 = crypto.createHash('sha256').update(fs.readFileSync(index2Path)).digest('hex');

console.log("Updated clue functions in index.html & index (2).html successfully!");
console.log("index.html SHA-256:    ", hash1);
console.log("index (2).html SHA-256:", hash2);
console.log("Equal:                 ", hash1 === hash2);
