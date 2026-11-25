const API_BASE = 'http://localhost:3000/api';

const shell = document.querySelector('#dashboard');
const reportModal = document.querySelector('#report-modal');
const loginModal = document.querySelector('#login-modal');
const createSessionModal = document.querySelector('#create-session-modal');
const addCandidateModal = document.querySelector('#add-candidate-modal');
const addTeamModal = document.querySelector('#add-team-modal');
const testSimModal = document.querySelector('#test-sim-modal');
const toastEl = document.querySelector('#toast');

let currentUser = null; // { role: 'superadmin' | 'admin' | 'user', name, email, title, initials, candidateId? }
let selectedLoginRole = 'admin';
let candidates = [];
let sessions = [];
let teamMembers = [];
let currentReportCandidateId = null;

// Simulation state
let simTimerInterval = null;
let simSecondsLeft = 900;
let simTabSwitches = 0;

function showToast(message) {
  if (!toastEl) return;
  toastEl.textContent = message;
  toastEl.classList.add('show');
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => toastEl.classList.remove('show'), 3200);
}

async function fetchJson(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || `API error ${response.status}`);
  return data;
}

function showApiWarning() {
  if (document.querySelector('.api-warning')) return;
  const warning = document.createElement('div');
  warning.className = 'api-warning';
  warning.textContent = 'Backend belum terhubung. Jalankan npm run dev atau npm run backend pada terminal.';
  document.querySelector('.app-main')?.prepend(warning);
}

// === ROLE LOGIN PORTAL ===
async function openLoginModal(defaultRole = 'admin') {
  closeAllDialogs();
  selectedLoginRole = defaultRole;
  updateLoginTabs();

  try {
    if (candidates.length === 0) {
      candidates = await fetchJson('/candidates');
    }
    const selectEl = document.querySelector('#login-candidate-select');
    if (selectEl) {
      selectEl.innerHTML = candidates
        .map((c) => `<option value="${c.id}">${c.name} — ${c.position} (${c.status})</option>`)
        .join('');
      const pending = candidates.find((c) => c.status === 'Belum mulai' || c.status === 'Berlangsung');
      if (pending) selectEl.value = pending.id;
    }
  } catch (err) {
    console.error(err);
  }

  document.querySelector('#login-error').style.display = 'none';
  openDialog(loginModal);
}

function updateLoginTabs() {
  document.querySelectorAll('.role-tab').forEach((tab) => {
    tab.classList.toggle('active', tab.dataset.roleTab === selectedLoginRole);
  });

  const staffFields = document.querySelector('#login-staff-fields');
  const userFields = document.querySelector('#login-user-fields');
  const emailInput = document.querySelector('#login-email');
  const passInput = document.querySelector('#login-password');
  const hintEl = document.querySelector('#demo-cred-hint');

  if (selectedLoginRole === 'user') {
    staffFields.style.display = 'none';
    userFields.style.display = 'block';
    emailInput.required = false;
    passInput.required = false;
  } else {
    staffFields.style.display = 'flex';
    staffFields.style.flexDirection = 'column';
    staffFields.style.gap = '12px';
    userFields.style.display = 'none';
    emailInput.required = true;
    passInput.required = true;

    if (selectedLoginRole === 'superadmin') {
      emailInput.value = 'superadmin@bautomate.id';
      passInput.value = 'bautomate123';
      hintEl.innerHTML = 'Demo Super Admin: <code>superadmin@bautomate.id</code> / <code>bautomate123</code>';
    } else {
      emailInput.value = 'hr@emporiopahalaabadi.co.id';
      passInput.value = 'hr123';
      hintEl.innerHTML = 'Demo Admin HR: <code>hr@emporiopahalaabadi.co.id</code> / <code>hr123</code>';
    }
  }
}

document.querySelectorAll('.role-tab').forEach((tab) => {
  tab.addEventListener('click', () => {
    selectedLoginRole = tab.dataset.roleTab;
    updateLoginTabs();
  });
});

document.querySelector('#login-form')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const errorEl = document.querySelector('#login-error');
  errorEl.style.display = 'none';

  const payload =
    selectedLoginRole === 'user'
      ? { role: 'user', candidateId: document.querySelector('#login-candidate-select')?.value }
      : {
          role: selectedLoginRole,
          email: document.querySelector('#login-email')?.value,
          password: document.querySelector('#login-password')?.value
        };

  try {
    currentUser = await fetchJson('/auth/login', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    closeAllDialogs();

    if (currentUser.role === 'user') {
      // User (Kandidat) ONLY accesses the psychotest portal, never the HR dashboard
      closeDashboard();
      await openTestSimulation(currentUser.candidateId);
      showToast(`Selamat mengerjakan tes, ${currentUser.name}!`);
    } else {
      await openDashboard();
      showToast(`Login berhasil sebagai ${currentUser.role === 'superadmin' ? 'Super Admin' : 'Admin HR'}`);
    }
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.style.display = 'block';
  }
});

// === DASHBOARD OPEN / CLOSE & RBAC ===
const openDashboard = async () => {
  if (!currentUser || currentUser.role === 'user') {
    return openLoginModal('admin');
  }
  applyRolePermissions();
  shell.classList.add('open');
  shell.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
  await refreshWorkspace();
};

const closeDashboard = () => {
  shell.classList.remove('open');
  shell.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
};

function applyRolePermissions() {
  if (!currentUser) return;
  const isSuperAdmin = currentUser.role === 'superadmin';
  document.querySelector('#profile-initials').textContent = currentUser.initials || 'HR';
  document.querySelector('#profile-name').textContent = currentUser.name;
  document.querySelector('#profile-role').textContent = currentUser.title;
  document.querySelector('#active-role-badge').textContent = isSuperAdmin ? 'SUPER ADMIN' : 'ADMIN HR';

  const settingsBtn = document.querySelector('#nav-settings-btn');
  if (settingsBtn) {
    settingsBtn.style.display = isSuperAdmin ? 'flex' : 'none';
  }

  // If Admin was on settings page, redirect to overview
  const activePage = document.querySelector('.app-view.active')?.dataset.page;
  if (!isSuperAdmin && activePage === 'settings') {
    showPage('overview');
  }
}

document.querySelector('.close-app')?.addEventListener('click', closeDashboard);
document.querySelector('#logout-btn')?.addEventListener('click', () => {
  currentUser = null;
  closeDashboard();
  openLoginModal('admin');
});

document.querySelector('#switch-to-user-btn')?.addEventListener('click', () => {
  openLoginModal('user');
});

const pageNames = {
  overview: 'Overview',
  candidates: 'Kandidat',
  sessions: 'Sesi Asesmen',
  reports: 'Laporan',
  settings: 'Pengaturan & Role'
};

function showPage(name) {
  if (name === 'settings' && currentUser?.role !== 'superadmin') {
    showToast('Halaman Pengaturan & Role hanya dapat diakses oleh Super Admin.');
    return;
  }
  document.querySelectorAll('.app-view').forEach((view) => view.classList.toggle('active', view.dataset.page === name));
  document.querySelectorAll('.app-sidebar nav button').forEach((btn) => btn.classList.toggle('active', btn.dataset.view === name));
  const breadcrumb = document.querySelector('.app-breadcrumb strong');
  if (breadcrumb) breadcrumb.textContent = pageNames[name] || 'Overview';
  document.querySelector('.app-sidebar')?.classList.remove('mobile-open');
}

document.querySelectorAll('[data-view]').forEach((btn) => btn.addEventListener('click', () => showPage(btn.dataset.view)));
document.querySelectorAll('[data-view-jump]').forEach((btn) => btn.addEventListener('click', () => showPage(btn.dataset.viewJump)));
document.querySelector('.mobile-sidebar')?.addEventListener('click', () => {
  document.querySelector('.app-sidebar')?.classList.toggle('mobile-open');
});

// Mobile landing menu
document.querySelector('.menu-button')?.addEventListener('click', () => {
  const nav = document.querySelector('.site-header nav');
  if (!nav) return;
  const isOpen = nav.style.display === 'flex';
  nav.style.display = isOpen ? '' : 'flex';
  if (!isOpen) {
    nav.style.position = 'absolute';
    nav.style.top = '64px';
    nav.style.left = '0';
    nav.style.right = '0';
    nav.style.background = '#fff';
    nav.style.padding = '16px 24px';
    nav.style.flexDirection = 'column';
    nav.style.borderBottom = '1px solid #e7eaf0';
  } else {
    nav.removeAttribute('style');
  }
});

// === LOAD ALL WORKSPACE DATA ===
async function refreshWorkspace() {
  try {
    const [overview, sessionList, candidateList, teamList] = await Promise.all([
      fetchJson('/overview'),
      fetchJson('/sessions'),
      fetchJson('/candidates'),
      fetchJson('/team')
    ]);

    sessions = sessionList;
    candidates = candidateList;
    teamMembers = teamList;

    renderOverview(overview);
    renderSessions();
    renderCandidates(candidates);
    renderReports();
    renderSettings(overview.company);
    populateSessionSelects();
  } catch (error) {
    showApiWarning();
    console.error(error);
  }
}

// === RENDERING HELPERS ===
const statusClass = (status) => {
  if (status === 'Selesai') return 'done';
  if (status === 'Perlu review') return 'review';
  if (status === 'Berlangsung') return 'progress';
  return '';
};

function proctorBadge(proctoring) {
  const integrity = proctoring?.integrity || 'Belum mulai';
  if (integrity === 'Aman') return `<span class="proctor-tag safe">✓ Aman</span>`;
  if (integrity.startsWith('Perlu Cek')) return `<span class="proctor-tag warn">⚠ ${integrity}</span>`;
  return `<span class="proctor-tag idle">${integrity}</span>`;
}

function renderOverview(overview) {
  const { company, totalCandidates, completed, inProgress, needReview, completionRate } = overview;
  document.querySelector('#overview-company-label').textContent = `WORKSPACE · ${company.name.toUpperCase()}`;
  document.querySelector('#metric-total').textContent = totalCandidates;
  document.querySelector('#metric-quota').textContent = `Kuota: ${totalCandidates} / ${company.quotaLimit}`;
  document.querySelector('#metric-completed').textContent = completed;
  document.querySelector('#metric-rate').textContent = `${completionRate}% completion rate`;
  document.querySelector('#metric-progress').textContent = inProgress;
  document.querySelector('#metric-review').textContent = needReview;

  document.querySelector('#nav-candidate-count').textContent = totalCandidates;
  document.querySelector('#nav-session-count').textContent = sessions.length;

  const overviewSessionsEl = document.querySelector('#overview-sessions-list');
  if (overviewSessionsEl) {
    overviewSessionsEl.innerHTML = sessions
      .slice(0, 2)
      .map((s) => {
        const pct = Math.min(100, Math.round((s.participants / s.capacity) * 100));
        const badgeCls = s.status === 'Live' ? 'live' : 'scheduled';
        const badgeLabel = s.status === 'Live' ? '● LIVE' : s.status.toUpperCase();
        return `<div class="session-card">
          <span class="${badgeCls}">${badgeLabel}</span>
          <small>${s.name}</small>
          <strong>${s.participants} / ${s.capacity} kandidat</strong>
          <div class="bar"><span style="width:${pct}%"></span></div>
          <div><span>Batas: ${s.deadline}</span><button data-view-jump="sessions">Detail</button></div>
        </div>`;
      })
      .join('');
    overviewSessionsEl.querySelectorAll('[data-view-jump]').forEach((b) =>
      b.addEventListener('click', () => showPage(b.dataset.viewJump))
    );
  }
}

function candidateRow(candidate) {
  const score = candidate.score == null ? '—' : candidate.score;
  const canSim = candidate.status === 'Belum mulai' || candidate.status === 'Berlangsung';
  return `<tr>
    <td><span class="avatar ${candidate.color}">${candidate.initials}</span><div><strong>${candidate.name}</strong><small>${candidate.email}</small></div></td>
    <td>${candidate.position}</td>
    <td><em class="status ${statusClass(candidate.status)}">${candidate.status}</em></td>
    <td>${proctorBadge(candidate.proctoring)}</td>
    <td><b class="score">${score}</b>${candidate.score == null ? '' : ' / 100'}</td>
    <td>${candidate.lastActivity}</td>
    <td>
      ${canSim ? `<button class="btn-table-action" data-sim-candidate="${candidate.id}">Tes User</button>` : ''}
      <button class="more" data-candidate-report="${candidate.id}" aria-label="Buka laporan ${candidate.name}">•••</button>
    </td>
  </tr>`;
}

function renderCandidates(list) {
  const tableBody = document.querySelector('#candidate-table');
  if (tableBody) {
    tableBody.innerHTML = list.length
      ? list.map(candidateRow).join('')
      : `<tr><td colspan="7" style="text-align:center;padding:28px;color:#8b93a1">Tidak ada kandidat sesuai filter.</td></tr>`;
  }
  const overviewBody = document.querySelector('#overview-candidate-table');
  if (overviewBody) {
    overviewBody.innerHTML = candidates.slice(0, 4).map(candidateRow).join('');
  }
}

function renderSessions() {
  const container = document.querySelector('#sessions-list');
  if (!container) return;
  container.innerHTML = sessions
    .map((s) => {
      const pct = Math.min(100, Math.round((s.participants / s.capacity) * 100));
      const badgeCls = s.status === 'Live' ? 'done' : 'progress';
      const modulesHtml = (s.modules || []).map((m) => `<span>${m}</span>`).join('');
      return `<article class="session-full-card">
        <div class="session-full-head">
          <div>
            <em class="status ${badgeCls}">${s.status}</em>
            <h3>${s.name}</h3>
            <small>Posisi: ${s.position} · Durasi ${s.durationMinutes} menit</small>
          </div>
          <span class="invite-pill">${s.inviteCode}</span>
        </div>
        <div class="session-modules">${modulesHtml}</div>
        <div>
          <div style="display:flex;justify-content:space-between;font-size:.65rem;margin-bottom:6px">
            <span>Peserta terdaftar</span><strong>${s.participants} / ${s.capacity}</strong>
          </div>
          <div class="bar"><span style="width:${pct}%"></span></div>
        </div>
        <div class="session-full-meta">
          <span>Batas pengerjaan: ${s.deadline}</span>
          <div class="session-full-actions">
            <button class="btn-table-action" data-copy-invite="${s.inviteCode}">Salin Link Tes</button>
            <button class="btn-table-action" data-open-login="user">Portal User</button>
          </div>
        </div>
      </article>`;
    })
    .join('');
}

function renderReports() {
  const tbody = document.querySelector('#reports-table');
  if (!tbody) return;
  const reportable = candidates.filter((c) => c.score !== null);
  tbody.innerHTML = reportable.length
    ? reportable
        .map(
          (c) => `<tr>
      <td><span class="avatar ${c.color}">${c.initials}</span><div><strong>${c.name}</strong><small>${c.email}</small></div></td>
      <td>${c.position}</td>
      <td>${c.report?.personalityType || '—'}</td>
      <td>${proctorBadge(c.proctoring)}</td>
      <td><b class="score">${c.score}</b> / 100</td>
      <td><em class="status ${statusClass(c.status)}">${c.status}</em></td>
      <td>
        <button class="btn-table-action" data-candidate-report="${c.id}">Lihat Psikogram</button>
      </td>
    </tr>`
        )
        .join('')
    : `<tr><td colspan="7" style="text-align:center;padding:28px;color:#8b93a1">Belum ada kandidat yang menyelesaikan asesmen.</td></tr>`;
}

function renderSettings(company) {
  const infoEl = document.querySelector('#settings-company-info');
  if (infoEl && company) {
    infoEl.innerHTML = `
      <div class="kv-row"><span>Nama Perusahaan</span><strong>${company.name}</strong></div>
      <div class="kv-row"><span>Kode Workspace</span><strong>${company.workspaceCode}</strong></div>
      <div class="kv-row"><span>Paket Aktif</span><strong>${company.plan}</strong></div>
      <div class="kv-row"><span>Kuota Kandidat</span><strong>${candidates.length} / ${company.quotaLimit} terpakai</strong></div>
    `;
  }
  const teamEl = document.querySelector('#team-table');
  if (teamEl) {
    teamEl.innerHTML = teamMembers
      .map(
        (m) => `<tr>
      <td><span class="avatar ${m.color}">${m.initials}</span><div><strong>${m.name}</strong></div></td>
      <td>${m.email}</td>
      <td>${m.position}</td>
      <td><em class="status ${m.role === 'superadmin' ? 'done' : 'progress'}">${m.badge}</em></td>
    </tr>`
      )
      .join('');
  }
}

function populateSessionSelects() {
  const filterSelect = document.querySelector('#candidate-session-filter');
  const addCandSelect = document.querySelector('#add-candidate-session');
  const optionsHtml = sessions.map((s) => `<option value="${s.id}">${s.name} (${s.position})</option>`).join('');
  if (filterSelect) filterSelect.innerHTML = `<option value="">Semua sesi</option>${optionsHtml}`;
  if (addCandSelect) addCandSelect.innerHTML = optionsHtml || `<option value="">Umum</option>`;
}

// === SEARCH, FILTER & EXPORT CSV ===
function applyCandidateFilters() {
  const search = (document.querySelector('#candidate-search')?.value || '').toLowerCase();
  const status = document.querySelector('#candidate-status-filter')?.value || '';
  const sessionId = document.querySelector('#candidate-session-filter')?.value || '';

  const filtered = candidates.filter((c) => {
    const matchSearch =
      !search ||
      c.name.toLowerCase().includes(search) ||
      c.email.toLowerCase().includes(search) ||
      c.position.toLowerCase().includes(search);
    const matchStatus = !status || c.status === status;
    const matchSession = !sessionId || c.sessionId === sessionId;
    return matchSearch && matchStatus && matchSession;
  });
  renderCandidates(filtered);
}

document.querySelector('#candidate-search')?.addEventListener('input', applyCandidateFilters);
document.querySelector('#candidate-status-filter')?.addEventListener('change', applyCandidateFilters);
document.querySelector('#candidate-session-filter')?.addEventListener('change', applyCandidateFilters);

document.querySelector('#export-csv-btn')?.addEventListener('click', () => {
  const headers = ['Nama', 'Email', 'Posisi', 'Status', 'Skor Komposit', 'Proctoring', 'Aktivitas Terakhir'];
  const rows = candidates.map((c) => [
    `"${c.name}"`,
    `"${c.email}"`,
    `"${c.position}"`,
    `"${c.status}"`,
    c.score ?? '',
    `"${c.proctoring?.integrity || ''}"`,
    `"${c.lastActivity}"`
  ]);
  const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'PT_Emporio_Pahala_Abadi_Kandidat.csv';
  link.click();
  URL.revokeObjectURL(url);
  showToast('Data kandidat berhasil diexport ke CSV');
});

// === REPORT DRAWER ===
async function openReport(candidateId = 'cand-001') {
  currentReportCandidateId = candidateId;
  try {
    const report = await fetchJson(`/candidates/${candidateId}/report`);
    document.querySelector('#report-avatar').textContent = report.initials || 'KD';
    document.querySelector('#report-avatar').className = `avatar ${report.color || 'purple'} large`;
    document.querySelector('#report-name').textContent = report.name;
    document.querySelector('#report-meta').textContent = `${report.position} · ${report.company}`;
    document.querySelector('#report-score').textContent = report.compositeScore ?? '—';
    document.querySelector('#report-recommendation').textContent = report.recommendation || 'Belum tersedia';
    document.querySelector('#report-personality').textContent = `Profil Kepribadian: ${report.personalityType || '—'}`;
    document.querySelector('#report-session').textContent = report.sessionName || report.position;
    document.querySelector('#report-date').textContent = report.lastActivity || '—';
    document.querySelector('#report-duration').textContent = report.duration || '—';
    document.querySelector('#report-proctoring').textContent = `${report.proctoring?.integrity || 'Aman'} (Kamera: ${report.proctoring?.cameraStatus || 'Verified'})`;
    document.querySelector('#report-status-badge').innerHTML = `<em class="status ${statusClass(report.status)}">${report.status}</em>`;

    const aspectsEl = document.querySelector('#report-aspects');
    if (report.aspects && report.aspects.length) {
      aspectsEl.innerHTML = report.aspects
        .map(
          (a) => `<div class="aspect">
          <span>${a.name}</span>
          <div class="bar"><i style="width:${a.score}%"></i></div>
          <b>${a.score}</b>
        </div>`
        )
        .join('');
    } else {
      aspectsEl.innerHTML = `<p style="font-size:.75rem;color:#8b93a1">Kandidat belum menyelesaikan asesmen sehingga aspek penilaian belum tersedia.</p>`;
    }

    const approveBtn = document.querySelector('#approve-review-btn');
    if (approveBtn) {
      approveBtn.style.display = report.status === 'Perlu review' ? 'inline-block' : 'none';
    }
  } catch (error) {
    console.error(error);
  }
  reportModal.classList.add('open');
  reportModal.setAttribute('aria-hidden', 'false');
}

function closeReport() {
  reportModal.classList.remove('open');
  reportModal.setAttribute('aria-hidden', 'true');
}

document.querySelector('#print-report-btn')?.addEventListener('click', () => window.print());

document.querySelector('#approve-review-btn')?.addEventListener('click', async () => {
  if (!currentReportCandidateId) return;
  try {
    await fetchJson(`/candidates/${currentReportCandidateId}`, {
      method: 'PATCH',
      body: JSON.stringify({
        status: 'Selesai',
        recommendation: 'Disetujui HR & Psikolog — Lanjut ke tahap user interview'
      })
    });
    showToast('Status kandidat disetujui menjadi Selesai');
    await refreshWorkspace();
    await openReport(currentReportCandidateId);
  } catch (err) {
    showToast(err.message);
  }
});

// === DIALOG MODALS ===
function openDialog(modalEl) {
  modalEl?.classList.add('open');
  modalEl?.setAttribute('aria-hidden', 'false');
}

function closeAllDialogs() {
  [loginModal, createSessionModal, addCandidateModal, addTeamModal, testSimModal].forEach((m) => {
    m?.classList.remove('open');
    m?.setAttribute('aria-hidden', 'true');
  });
  stopSimTimer();
}

document.querySelectorAll('[data-open-create-session]').forEach((b) =>
  b.addEventListener('click', () => openDialog(createSessionModal))
);

document.querySelectorAll('[data-open-add-candidate]').forEach((b) =>
  b.addEventListener('click', () => openDialog(addCandidateModal))
);

document.querySelector('#open-add-team-btn')?.addEventListener('click', () => openDialog(addTeamModal));

document.querySelector('#create-session-form')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target;
  const formData = new FormData(form);
  const modules = formData.getAll('modules');
  try {
    await fetchJson('/sessions', {
      method: 'POST',
      body: JSON.stringify({
        name: formData.get('name'),
        position: formData.get('position'),
        capacity: Number(formData.get('capacity')),
        durationMinutes: Number(formData.get('durationMinutes')),
        modules
      })
    });
    form.reset();
    closeAllDialogs();
    await refreshWorkspace();
    showPage('sessions');
    showToast('Sesi asesmen baru berhasil dibuat!');
  } catch (err) {
    showToast(err.message);
  }
});

document.querySelector('#add-candidate-form')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target;
  const formData = new FormData(form);
  try {
    await fetchJson('/candidates', {
      method: 'POST',
      body: JSON.stringify({
        name: formData.get('name'),
        email: formData.get('email'),
        sessionId: formData.get('sessionId'),
        position: formData.get('position')
      })
    });
    form.reset();
    closeAllDialogs();
    await refreshWorkspace();
    showPage('candidates');
    showToast('Kandidat berhasil diundang!');
  } catch (err) {
    showToast(err.message);
  }
});

document.querySelector('#add-team-form')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target;
  const formData = new FormData(form);
  try {
    await fetchJson('/team', {
      method: 'POST',
      body: JSON.stringify({
        name: formData.get('name'),
        email: formData.get('email'),
        position: formData.get('position'),
        role: formData.get('role')
      })
    });
    form.reset();
    closeAllDialogs();
    await refreshWorkspace();
    showToast('Akun pengelola baru berhasil ditambahkan!');
  } catch (err) {
    showToast(err.message);
  }
});

// === USER (KANDIDAT) PSYCHOTEST PORTAL ===
function updateProctorPill() {
  const pill = document.querySelector('#sim-proctor-pill');
  if (!pill) return;
  pill.textContent = `● Kamera & Tab Guard Aktif (${simTabSwitches}x pindah tab)`;
  pill.classList.toggle('warn', simTabSwitches > 0);
}

function startSimTimer() {
  stopSimTimer();
  simSecondsLeft = 900;
  const timerEl = document.querySelector('#sim-timer');
  const tick = () => {
    const m = String(Math.floor(simSecondsLeft / 60)).padStart(2, '0');
    const s = String(simSecondsLeft % 60).padStart(2, '0');
    if (timerEl) timerEl.textContent = `${m}:${s}`;
    if (simSecondsLeft > 0) simSecondsLeft -= 1;
  };
  tick();
  simTimerInterval = setInterval(tick, 1000);
}

function stopSimTimer() {
  if (simTimerInterval) clearInterval(simTimerInterval);
  simTimerInterval = null;
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden && testSimModal.classList.contains('open')) {
    simTabSwitches += 1;
    updateProctorPill();
  }
});

async function openTestSimulation(preferredCandidateId = null) {
  if (candidates.length === 0) {
    try {
      candidates = await fetchJson('/candidates');
    } catch (e) {
      showToast('Pastikan backend aktif untuk membuka Portal Tes.');
      return;
    }
  }
  const selectEl = document.querySelector('#sim-candidate-id');
  if (selectEl) {
    selectEl.innerHTML = candidates
      .map((c) => `<option value="${c.id}">${c.name} — ${c.position} (${c.status})</option>`)
      .join('');
    if (preferredCandidateId) selectEl.value = preferredCandidateId;
    else {
      const pending = candidates.find((c) => c.status === 'Belum mulai' || c.status === 'Berlangsung');
      if (pending) selectEl.value = pending.id;
    }
  }

  document.querySelector('#test-sim-form').style.display = 'flex';
  document.querySelector('#sim-done-view').style.display = 'none';
  simTabSwitches = 0;
  updateProctorPill();
  startSimTimer();
  openDialog(testSimModal);
}

document.querySelector('#test-sim-form')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target;
  const candidateId = document.querySelector('#sim-candidate-id')?.value;
  if (!candidateId) return;

  // 1. Kemampuan Kognitif (3 soal: 0-3 benar -> skor 55..96)
  const cogCorrect = Number(form.cog1.value) + Number(form.cog2.value) + Number(form.cog3.value);
  const cognitiveScore = [55, 70, 84, 96][cogCorrect] || 70;

  // 2. Ketelitian & Numerik (3 soal: 0-3 benar -> skor 55..95)
  const precCorrect = Number(form.prec1.value) + Number(form.prec2.value) + Number(form.prec3.value);
  const precisionScore = [55, 68, 82, 95][precCorrect] || 70;

  // 3. Adaptabilitas & Integritas SJT (rata-rata 3 soal)
  const adaptabilityScore = Math.round(
    (Number(form.adapt1.value) + Number(form.adapt2.value) + Number(form.adapt3.value)) / 3
  );

  // 4. Profil Gaya Kerja DISC (3 soal) & Kolaborasi
  const discCounts = { D: 0, I: 0, S: 0, C: 0 };
  [form.disc1.value, form.disc2.value, form.disc3.value].forEach((val) => {
    if (discCounts[val] !== undefined) discCounts[val] += 1;
  });
  const sortedDisc = Object.entries(discCounts).sort((a, b) => b[1] - a[1]);
  const primary = sortedDisc[0][0];
  const secondary = sortedDisc[1][0];
  const discLabels = {
    D: 'Dominance (Penggerak & Tegas)',
    I: 'Influence (Komunikatif & Persuasif)',
    S: 'Steadiness (Stabil & Kooperatif)',
    C: 'Compliance (Analitis & Teliti)'
  };
  const discType = `High ${primary}-${secondary} (${discLabels[primary]})`;
  const collaborationScore = primary === 'I' || primary === 'S' ? 90 : 84;

  const elapsedSec = 900 - simSecondsLeft;
  const durationLabel = `${Math.max(1, Math.ceil(elapsedSec / 60))} menit`;

  try {
    await fetchJson(`/candidates/${candidateId}/submit-test`, {
      method: 'POST',
      body: JSON.stringify({
        cognitiveScore,
        precisionScore,
        adaptabilityScore,
        collaborationScore,
        discType,
        tabSwitches: simTabSwitches,
        durationLabel
      })
    });
    form.reset();
    stopSimTimer();

    if (currentUser?.role === 'user') {
      // User only sees confirmation screen, NOT HR dashboard/scores
      document.querySelector('#test-sim-form').style.display = 'none';
      document.querySelector('#sim-done-view').style.display = 'block';
      showToast('Jawaban tes berhasil dikirim ke tim HR!');
    } else {
      closeAllDialogs();
      await refreshWorkspace();
      showToast('Jawaban tes terkirim & psikogram otomatis dibuat!');
      await openReport(candidateId);
    }
  } catch (err) {
    showToast(err.message);
  }
});

// === GLOBAL EVENT DELEGATION ===
document.addEventListener('click', (event) => {
  const loginTrigger = event.target.closest('[data-open-login]');
  if (loginTrigger) {
    const targetRole = loginTrigger.dataset.openLogin || 'admin';
    if (targetRole !== 'user' && currentUser && currentUser.role !== 'user' && !shell.classList.contains('open')) {
      return openDashboard();
    }
    return openLoginModal(targetRole);
  }

  const reportBtn = event.target.closest('[data-candidate-report]');
  if (reportBtn) return openReport(reportBtn.dataset.candidateReport);

  if (event.target.closest('[data-open-report]')) return openReport();
  if (event.target.closest('[data-close-report]')) return closeReport();
  if (event.target.closest('[data-close-dialog]')) return closeAllDialogs();

  const simCandBtn = event.target.closest('[data-sim-candidate]');
  if (simCandBtn) return openTestSimulation(simCandBtn.dataset.simCandidate);

  const copyBtn = event.target.closest('[data-copy-invite]');
  if (copyBtn) {
    const code = copyBtn.dataset.copyInvite;
    const url = `${window.location.origin}/?invite=${code}`;
    navigator.clipboard?.writeText(url).catch(() => {});
    showToast(`Link undangan (${code}) disalin ke clipboard!`);
  }
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    if (
      loginModal.classList.contains('open') ||
      testSimModal.classList.contains('open') ||
      createSessionModal.classList.contains('open') ||
      addCandidateModal.classList.contains('open') ||
      addTeamModal.classList.contains('open')
    ) {
      closeAllDialogs();
    } else if (reportModal.classList.contains('open')) {
      closeReport();
    } else if (shell.classList.contains('open')) {
      closeDashboard();
    }
  }
});

const observer = new IntersectionObserver(
  (entries) => entries.forEach((entry) => {
    if (entry.isIntersecting) entry.target.classList.add('visible');
  }),
  { threshold: 0.12 }
);
document.querySelectorAll('.reveal').forEach((element) => observer.observe(element));
