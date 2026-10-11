// Pushpak CRM — Phase 11A Bug Reporter Foundation
// Global reporter UI. Firestore is the primary bug store; attachments are
// handled in Phase 11D. This module captures the authenticated reporter,
// page/module context and creates a bugReports document.
import { initializeApp, getApps, getApp } from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js';
import { getAuth, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js';
import { getFirestore, collection, addDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js';

const firebaseConfig = {
  apiKey: 'AIzaSyCRqUdrKe2U2wF_4LI-6Yl7zdgmE5YhvQY',
  authDomain: 'makwell-websiteandcrm.firebaseapp.com',
  projectId: 'makwell-websiteandcrm',
  storageBucket: 'makwell-websiteandcrm.firebasestorage.app',
  messagingSenderId: '673518655103',
  appId: '1:673518655103:web:1805d10de3c63eca23914a',
  measurementId: 'G-YLM91W3YF1'
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const $ = (s, r = document) => r.querySelector(s);
const esc = v => String(v ?? '').replace(/[&<>\"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c]));

let currentUser = null;
let profile = null;
let modal = null;

function moduleName() {
  const title = document.title || '';
  const path = location.pathname.split('/').pop() || 'index.html';
  return title.replace(/\s*[—|-]\s*Pushpak.*$/i, '').trim() || path.replace(/\.html$/i, '');
}

function styles() {
  if ($('#pe-bug-styles')) return;
  const s = document.createElement('style');
  s.id = 'pe-bug-styles';
  s.textContent = `
    #pe-bug-trigger{position:fixed;right:18px;bottom:18px;z-index:10050;border:0;border-radius:999px;background:#B3261E;color:#fff;padding:11px 16px;font:700 13px Inter,system-ui,sans-serif;box-shadow:0 8px 24px rgba(0,0,0,.22);cursor:pointer}
    #pe-bug-trigger:hover{filter:brightness(.94);transform:translateY(-1px)}
    .pe-bug-overlay{position:fixed;inset:0;z-index:10060;background:rgba(15,20,30,.58);display:none;align-items:center;justify-content:center;padding:18px}
    .pe-bug-overlay.show{display:flex}
    .pe-bug-modal{width:min(680px,100%);max-height:calc(100vh - 36px);overflow:auto;background:#fff;border-radius:14px;box-shadow:0 24px 70px rgba(0,0,0,.28);padding:24px;font-family:Inter,system-ui,sans-serif;color:#25292E}
    .pe-bug-head{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;margin-bottom:18px}.pe-bug-head h2{font-size:19px;margin:0}.pe-bug-head p{font-size:12px;color:#667085;margin:5px 0 0}.pe-bug-close{border:0;background:#f2f4f7;border-radius:8px;width:34px;height:34px;font-size:20px;cursor:pointer}
    .pe-bug-grid{display:grid;grid-template-columns:1fr 1fr;gap:13px}.pe-bug-field{display:flex;flex-direction:column;gap:5px}.pe-bug-field.full{grid-column:1/-1}.pe-bug-field label{font-size:12px;font-weight:700;color:#475467}.pe-bug-field input,.pe-bug-field select,.pe-bug-field textarea{width:100%;border:1px solid #d0d5dd;border-radius:8px;padding:10px 11px;font:13px Inter,system-ui,sans-serif;background:#fff}.pe-bug-field textarea{min-height:76px;resize:vertical}.pe-bug-meta{background:#f8f9fb;border:1px solid #eaecf0;border-radius:9px;padding:10px 12px;font-size:11px;color:#667085;line-height:1.55;margin:14px 0}.pe-bug-actions{display:flex;justify-content:flex-end;gap:9px;margin-top:18px}.pe-bug-actions button{border-radius:8px;padding:10px 15px;font:700 13px Inter,system-ui,sans-serif;cursor:pointer}.pe-bug-cancel{border:1px solid #d0d5dd;background:#fff}.pe-bug-submit{border:0;background:#B3261E;color:#fff}.pe-bug-submit:disabled{opacity:.6;cursor:wait}.pe-bug-msg{font-size:12px;margin-top:9px}.pe-bug-error{color:#B42318}.pe-bug-success{color:#027A48}
    @media(max-width:620px){#pe-bug-trigger{right:12px;bottom:12px;padding:10px 13px}.pe-bug-modal{padding:18px}.pe-bug-grid{grid-template-columns:1fr}.pe-bug-field.full{grid-column:auto}}
  `;
  document.head.appendChild(s);
}

function build() {
  styles();
  if ($('#pe-bug-trigger')) return;
  const b = document.createElement('button');
  b.id = 'pe-bug-trigger';
  b.type = 'button';
  b.textContent = '🐞 Report Bug';
  b.title = 'Report a problem on this CRM page';
  b.addEventListener('click', open);
  document.body.appendChild(b);

  modal = document.createElement('div');
  modal.className = 'pe-bug-overlay';
  modal.innerHTML = `
    <div class="pe-bug-modal" role="dialog" aria-modal="true" aria-labelledby="pe-bug-title">
      <div class="pe-bug-head"><div><h2 id="pe-bug-title">Report a Bug</h2><p>Your account and current CRM page are captured automatically.</p></div><button class="pe-bug-close" type="button" aria-label="Close">×</button></div>
      <form id="pe-bug-form">
        <div class="pe-bug-grid">
          <div class="pe-bug-field full"><label for="pe-bug-title-input">Bug title *</label><input id="pe-bug-title-input" maxlength="160" required placeholder="Short description of the problem"></div>
          <div class="pe-bug-field"><label for="pe-bug-severity">Severity *</label><select id="pe-bug-severity"><option value="low">Low</option><option value="medium" selected>Medium</option><option value="high">High</option><option value="critical">Critical</option></select></div>
          <div class="pe-bug-field"><label for="pe-bug-module">Module</label><input id="pe-bug-module" readonly></div>
          <div class="pe-bug-field full"><label for="pe-bug-description">What happened? *</label><textarea id="pe-bug-description" maxlength="5000" required placeholder="Describe the problem clearly."></textarea></div>
          <div class="pe-bug-field"><label for="pe-bug-expected">Expected result</label><textarea id="pe-bug-expected" maxlength="3000" placeholder="What should have happened?"></textarea></div>
          <div class="pe-bug-field"><label for="pe-bug-actual">Actual result</label><textarea id="pe-bug-actual" maxlength="3000" placeholder="What actually happened?"></textarea></div>
          <div class="pe-bug-field full"><label for="pe-bug-steps">Steps to reproduce</label><textarea id="pe-bug-steps" maxlength="5000" placeholder="1. Open...&#10;2. Click...&#10;3. Observe..."></textarea></div>
        </div>
        <div class="pe-bug-meta" id="pe-bug-meta"></div>
        <div class="pe-bug-msg" id="pe-bug-msg"></div>
        <div class="pe-bug-actions"><button class="pe-bug-cancel" type="button">Cancel</button><button class="pe-bug-submit" type="submit">Submit Bug</button></div>
      </form>
    </div>`;
  document.body.appendChild(modal);
  $('.pe-bug-close', modal).addEventListener('click', close);
  $('.pe-bug-cancel', modal).addEventListener('click', close);
  modal.addEventListener('click', e => { if (e.target === modal) close(); });
  $('#pe-bug-form', modal).addEventListener('submit', submit);
}

function open() {
  if (!currentUser) { alert('Please sign in to the CRM before reporting a bug.'); return; }
  $('#pe-bug-title-input', modal).value = '';
  $('#pe-bug-description', modal).value = '';
  $('#pe-bug-expected', modal).value = '';
  $('#pe-bug-actual', modal).value = '';
  $('#pe-bug-steps', modal).value = '';
  $('#pe-bug-module', modal).value = moduleName();
  $('#pe-bug-meta', modal).innerHTML = `<b>Reporter:</b> ${esc(profile?.displayName || currentUser.displayName || currentUser.email || 'Signed-in user')} · <b>Role:</b> ${esc(profile?.role || 'CRM user')}<br><b>Page:</b> ${esc(location.pathname)}<br><b>Browser:</b> ${esc(navigator.userAgent)}`;
  $('#pe-bug-msg', modal).textContent = '';
  $('#pe-bug-msg', modal).className = 'pe-bug-msg';
  modal.classList.add('show');
  $('#pe-bug-title-input', modal).focus();
}
function close() { modal?.classList.remove('show'); }

async function submit(e) {
  e.preventDefault();
  const submitBtn = $('.pe-bug-submit', modal);
  const msg = $('#pe-bug-msg', modal);
  submitBtn.disabled = true;
  msg.className = 'pe-bug-msg';
  msg.textContent = 'Submitting…';
  try {
    const now = new Date();
    const ref = await addDoc(collection(db, 'bugReports'), {
      bugVersion: 1,
      title: $('#pe-bug-title-input', modal).value.trim(),
      severity: $('#pe-bug-severity', modal).value,
      module: moduleName(),
      description: $('#pe-bug-description', modal).value.trim(),
      expectedResult: $('#pe-bug-expected', modal).value.trim(),
      actualResult: $('#pe-bug-actual', modal).value.trim(),
      reproductionSteps: $('#pe-bug-steps', modal).value.trim(),
      status: 'reported',
      reporterUid: currentUser.uid,
      reporterEmail: currentUser.email || '',
      reporterName: profile?.displayName || currentUser.displayName || currentUser.email || 'CRM User',
      reporterRole: profile?.role || 'unknown',
      reporterScope: {
        serviceCenterUid: profile?.linkedServiceCenterUid || profile?.serviceCenterUid || null,
        territory: profile?.territory || profile?.territoryCode || null,
        brand: profile?.brand || null
      },
      page: {
        url: location.href,
        path: location.pathname,
        title: document.title,
        module: moduleName()
      },
      environment: {
        userAgent: navigator.userAgent,
        language: navigator.language || '',
        viewport: `${window.innerWidth}x${window.innerHeight}`
      },
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    msg.className = 'pe-bug-msg pe-bug-success';
    msg.textContent = `Bug submitted successfully. Reference: ${ref.id}`;
    setTimeout(close, 1800);
  } catch (err) {
    console.error('Bug report submission failed:', err);
    msg.className = 'pe-bug-msg pe-bug-error';
    msg.textContent = 'Could not submit the bug. Please try again or contact an administrator.';
  } finally {
    submitBtn.disabled = false;
  }
}

onAuthStateChanged(auth, async user => {
  currentUser = user;
  if (!user) return;
  try {
    const { doc, getDoc } = await import('https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js');
    const snap = await getDoc(doc(db, 'users', user.uid));
    profile = snap.exists() ? snap.data() : null;
  } catch (e) {
    console.warn('Bug reporter could not load user profile:', e);
  }
  build();
});
