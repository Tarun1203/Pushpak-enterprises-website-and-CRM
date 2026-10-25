// "Customer confirmation" block of the job-closure form (technician and
// service center). The customer confirms the work with a one-time
// completion code (shown in their My Service portal, and sent by SMS /
// WhatsApp when customer messaging is on) or signs on this screen.
// The server (checkLifecycle_* in functions/index.js) checks it and
// reverts the completion when it is missing (if required) or wrong.

export function validCode(v) { return /^\d{4}$/.test(String(v || '').trim()); }

// The form's state -> what to add to the "completed" write. Pure.
// Throws an Error with a user-facing message when the input is not usable.
export function confirmationFields({ mode, code, hasInk, signer, required }) {
  if (mode === 'code') {
    const c = String(code || '').trim();
    if (!c) { if (required) throw new Error('Enter the completion code the customer received, or switch to Signature.'); return null; }
    if (!validCode(c)) throw new Error('The completion code is 4 digits.');
    return { kind: 'code', closeOtp: c };
  }
  if (mode === 'signature') {
    if (!hasInk) { if (required) throw new Error('Ask the customer to sign in the box, or use the completion code.'); return null; }
    if (!String(signer || '').trim()) throw new Error('Type the name of the person who signed.');
    return { kind: 'signature', name: String(signer).trim().slice(0, 100) };
  }
  if (required) throw new Error('Closing needs the customer\'s confirmation: the completion code or their signature.');
  return null;
}

// api: { db, fs:{doc,getDoc}, storage, st:{ref,uploadBytes}, sendCode(coll,id) -> Promise<{sentVia}> , prefix }
export function mountCloseConfirm(formEl, anchorEl, api) {
  const p = api.prefix || '';
  const box = document.createElement('div');
  box.className = 'form-row close-confirm';
  box.innerHTML = `
    <label id="${p}cc-label">Customer confirmation <span class="cc-req" style="font-weight:400;color:var(--stone);"></span></label>
    <div role="radiogroup" aria-labelledby="${p}cc-label" style="display:flex;gap:14px;flex-wrap:wrap;margin:2px 0 8px;font-size:13px;">
      <label style="display:flex;gap:6px;align-items:center;font-weight:400;"><input type="radio" name="${p}cc-mode" value="code" checked> Completion code</label>
      <label style="display:flex;gap:6px;align-items:center;font-weight:400;"><input type="radio" name="${p}cc-mode" value="signature"> Customer signature</label>
    </div>
    <div class="cc-code">
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
        <button type="button" class="btn-secondary cc-send">Send code to customer</button>
        <input type="text" class="cc-otp" id="${p}cc-otp" inputmode="numeric" autocomplete="one-time-code" maxlength="4" placeholder="4-digit code" aria-label="Completion code from the customer" style="width:130px;letter-spacing:4px;">
      </div>
      <div class="cc-status" role="status" aria-live="polite" style="font-size:12px;color:var(--stone);margin-top:6px;">Send the code when the work is done; the customer reads it out to you.</div>
    </div>
    <div class="cc-sign" style="display:none;">
      <canvas class="cc-canvas" width="600" height="180" role="img" aria-label="Signature box — the customer signs here with a finger or mouse" style="width:100%;height:150px;border:1px dashed var(--hairline);border-radius:4px;background:#fff;touch-action:none;cursor:crosshair;"></canvas>
      <div style="display:flex;gap:8px;align-items:center;margin-top:6px;flex-wrap:wrap;">
        <input type="text" class="cc-signer" id="${p}cc-signer" placeholder="Name of the person signing" aria-label="Name of the person signing" style="flex:1;min-width:160px;">
        <button type="button" class="btn-secondary cc-clear">Clear</button>
      </div>
    </div>`;
  anchorEl.insertAdjacentElement('beforebegin', box);

  let job = null, required = false, ink = false;
  const $ = (s) => box.querySelector(s);
  const mode = () => (box.querySelector(`input[name="${p}cc-mode"]:checked`) || {}).value;
  box.querySelectorAll(`input[name="${p}cc-mode"]`).forEach((r) => r.addEventListener('change', () => {
    $('.cc-code').style.display = mode() === 'code' ? '' : 'none';
    $('.cc-sign').style.display = mode() === 'signature' ? '' : 'none';
  }));

  // Signature pad
  const cv = $('.cc-canvas'), ctx = cv.getContext('2d');
  let drawing = false;
  const pos = (e) => { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) * (cv.width / r.width), (e.clientY - r.top) * (cv.height / r.height)]; };
  cv.addEventListener('pointerdown', (e) => { drawing = true; try { cv.setPointerCapture(e.pointerId); } catch (x) { /* old browsers */ } ctx.beginPath(); ctx.moveTo(...pos(e)); });
  cv.addEventListener('pointermove', (e) => { if (!drawing) return; ctx.lineWidth = 2.5; ctx.lineCap = 'round'; ctx.strokeStyle = '#14151A'; ctx.lineTo(...pos(e)); ctx.stroke(); ink = true; });
  ['pointerup', 'pointerleave', 'pointercancel'].forEach((ev) => cv.addEventListener(ev, () => { drawing = false; }));
  const clear = () => { ctx.clearRect(0, 0, cv.width, cv.height); ink = false; };
  $('.cc-clear').addEventListener('click', clear);

  $('.cc-send').addEventListener('click', async () => {
    if (!job) return;
    const b = $('.cc-send'), st = $('.cc-status');
    b.disabled = true; st.style.color = 'var(--stone)'; st.textContent = 'Sending…';
    try {
      const r = await api.sendCode(job.coll, job.id);
      const via = r && r.sentVia;
      st.textContent = via === 'sms' ? 'Code sent to the customer by SMS. It is also in their My Service page.'
        : via === 'whatsapp' ? 'Code sent to the customer on WhatsApp. It is also in their My Service page.'
        : 'Code ready. The customer sees it in My Service on the website (sign in with their mobile number). Or take their signature.';
      b.textContent = 'Send a new code';
    } catch (e) {
      st.style.color = 'var(--err)';
      st.textContent = (e && e.message && !/internal/i.test(e.message)) ? e.message.replace(/^Firebase:\s*/, '') : 'Could not send the code. Use the customer signature instead.';
    } finally { setTimeout(() => { b.disabled = false; }, 1500); }
  });

  return {
    get required() { return required; },
    // Call when the closure form opens.
    async reset(j) {
      job = j; clear();
      $('.cc-otp').value = ''; $('.cc-signer').value = j.customerName || '';
      $('.cc-send').textContent = 'Send code to customer';
      $('.cc-status').style.color = 'var(--stone)';
      $('.cc-status').textContent = 'Send the code when the work is done; the customer reads it out to you.';
      box.querySelector(`input[name="${p}cc-mode"][value="code"]`).checked = true;
      $('.cc-code').style.display = ''; $('.cc-sign').style.display = 'none';
      try { const s = await api.fs.getDoc(api.fs.doc(api.db, 'settings', 'closeConfirmation')); required = s.exists() && s.data().required === true; } catch (e) { required = false; }
      $('.cc-req').textContent = required ? '(required)' : '(recommended)';
    },
    // Fields to add to the "completed" write. Uploads the signature first.
    async fields() {
      const f = confirmationFields({ mode: mode(), code: $('.cc-otp').value, hasInk: ink, signer: $('.cc-signer').value, required });
      if (!f) return {};
      if (f.kind === 'code') return { closeOtp: f.closeOtp };
      const blob = await new Promise((res) => cv.toBlob(res, 'image/png'));
      const path = `closeSignatures/${job.coll}/${job.id}/${Date.now()}.png`;
      await api.st.uploadBytes(api.st.ref(api.storage, path), blob, { contentType: 'image/png' });
      return { customerSignature: { path, name: f.name } };
    }
  };
}

// After a "completed" write, the server may revert it (lifecycleRejected).
// Waits briefly and returns its reason, or null when the completion stood.
export async function serverVerdict(fs, db, coll, id, status = 'completed') {
  for (let i = 0; i < 3; i++) {
    await new Promise((r) => setTimeout(r, 1200));
    try {
      const d = (await fs.getDoc(fs.doc(db, coll, id))).data() || {};
      if (d.lifecycleRejected && d.lifecycleRejected.to === status && d.status !== status) return d.lifecycleRejected.reason;
      if (d.status === status && i >= 1) return null;
    } catch (e) { return null; }
  }
  return null;
}
