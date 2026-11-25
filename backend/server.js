const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
const DB_PATH = path.join(__dirname, 'data', 'db.json');

app.use(cors({ origin: ['http://localhost:5173', 'http://127.0.0.1:5173'] }));
app.use(express.json());

function readDatabase() {
  return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
}

function writeDatabase(data) {
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), 'utf8');
}

function computeOverview(database) {
  const list = database.candidates;
  const totalCandidates = list.length;
  const completed = list.filter((c) => c.status === 'Selesai').length;
  const inProgress = list.filter((c) => c.status === 'Berlangsung').length;
  const needReview = list.filter((c) => c.status === 'Perlu review').length;
  const notStarted = list.filter((c) => c.status === 'Belum mulai').length;
  const finishedCount = completed + needReview;
  const completionRate = totalCandidates > 0 ? Math.round((finishedCount / totalCandidates) * 100) : 0;

  return {
    company: database.company,
    totalCandidates,
    completed,
    inProgress,
    needReview,
    notStarted,
    completionRate
  };
}

function makeInitials(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'KD';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function formatNow() {
  const now = new Date();
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  return `${now.getDate()} ${months[now.getMonth()]}, ${hh}:${mm}`;
}

app.get('/api/health', (_request, response) => {
  response.json({ status: 'ok', service: 'Bautomate Assessment API — PT Emporio Pahala Abadi' });
});

app.post('/api/auth/login', (request, response) => {
  const database = readDatabase();
  const { role, email, password, candidateId } = request.body || {};

  if (role === 'user') {
    const candidate =
      database.candidates.find((c) => c.id === candidateId) ||
      database.candidates.find((c) => c.email.toLowerCase() === String(email || '').toLowerCase());
    if (!candidate) {
      return response.status(404).json({ message: 'Data peserta tidak ditemukan' });
    }
    return response.json({
      role: 'user',
      name: candidate.name,
      email: candidate.email,
      title: `Kandidat · ${candidate.position}`,
      initials: candidate.initials,
      candidateId: candidate.id,
      company: database.company
    });
  }

  const account = database.accounts.find(
    (a) =>
      a.email.toLowerCase() === String(email || '').trim().toLowerCase() &&
      a.password === String(password || '')
  );

  if (!account) {
    return response.status(401).json({ message: 'Email atau password tidak sesuai' });
  }

  response.json({
    role: account.role,
    name: account.name,
    email: account.email,
    title: account.title,
    initials: account.initials,
    company: database.company
  });
});

app.get('/api/overview', (_request, response) => {
  const database = readDatabase();
  response.json(computeOverview(database));
});

app.get('/api/team', (_request, response) => {
  const database = readDatabase();
  response.json(database.teamMembers);
});

app.post('/api/team', (request, response) => {
  const database = readDatabase();
  const { name, email, position, role } = request.body || {};
  if (!name || !email) {
    return response.status(400).json({ message: 'Nama dan email wajib diisi' });
  }
  const normalizedRole = role === 'superadmin' ? 'superadmin' : 'admin';
  const colors = ['purple', 'green', 'orange'];
  const newMember = {
    id: `usr-${Date.now()}`,
    initials: makeInitials(name),
    name: String(name).trim(),
    email: String(email).trim(),
    position: String(position || 'HR Staff').trim(),
    role: normalizedRole,
    badge: normalizedRole === 'superadmin' ? 'Super Admin' : 'Admin HR',
    color: colors[database.teamMembers.length % colors.length]
  };
  database.teamMembers.push(newMember);
  writeDatabase(database);
  response.status(201).json(newMember);
});

app.get('/api/candidates', (request, response) => {
  const database = readDatabase();
  const search = String(request.query.search || '').toLowerCase();
  const status = String(request.query.status || '').toLowerCase();
  const sessionId = String(request.query.sessionId || '');

  const result = database.candidates.filter((candidate) => {
    const matchesSearch =
      !search ||
      candidate.name.toLowerCase().includes(search) ||
      candidate.email.toLowerCase().includes(search) ||
      candidate.position.toLowerCase().includes(search);
    const matchesStatus = !status || candidate.status.toLowerCase() === status;
    const matchesSession = !sessionId || candidate.sessionId === sessionId;
    return matchesSearch && matchesStatus && matchesSession;
  });

  response.json(result);
});

app.post('/api/candidates', (request, response) => {
  const database = readDatabase();
  const { name, email, position, sessionId } = request.body;

  if (!name || !email) {
    return response.status(400).json({ message: 'Nama dan email kandidat wajib diisi' });
  }

  const session = database.sessions.find((s) => s.id === sessionId);
  const colors = ['purple', 'green', 'orange'];
  const newCandidate = {
    id: `cand-${Date.now()}`,
    sessionId: session ? session.id : '',
    initials: makeInitials(name),
    name: String(name).trim(),
    email: String(email).trim(),
    position: String(position || session?.position || 'General Staff').trim(),
    status: 'Belum mulai',
    score: null,
    lastActivity: formatNow(),
    color: colors[database.candidates.length % colors.length],
    proctoring: { tabSwitches: 0, cameraStatus: 'Pending', integrity: 'Belum mulai' },
    report: {
      recommendation: 'Belum tersedia',
      personalityType: '—',
      duration: '—',
      aspects: []
    }
  };

  database.candidates.unshift(newCandidate);
  if (session) session.participants = (session.participants || 0) + 1;
  writeDatabase(database);

  response.status(201).json(newCandidate);
});

app.get('/api/candidates/:id', (request, response) => {
  const candidate = readDatabase().candidates.find((item) => item.id === request.params.id);
  if (!candidate) return response.status(404).json({ message: 'Kandidat tidak ditemukan' });
  response.json(candidate);
});

app.patch('/api/candidates/:id', (request, response) => {
  const database = readDatabase();
  const candidate = database.candidates.find((item) => item.id === request.params.id);
  if (!candidate) return response.status(404).json({ message: 'Kandidat tidak ditemukan' });

  const { status, recommendation } = request.body;
  if (status) candidate.status = status;
  if (recommendation && candidate.report) candidate.report.recommendation = recommendation;
  candidate.lastActivity = formatNow();

  writeDatabase(database);
  response.json(candidate);
});

app.post('/api/candidates/:id/submit-test', (request, response) => {
  const database = readDatabase();
  const candidate = database.candidates.find((item) => item.id === request.params.id);
  if (!candidate) return response.status(404).json({ message: 'Kandidat tidak ditemukan' });

  const {
    cognitiveScore = 80,
    precisionScore = 82,
    discType = 'High I-D (Komunikatif & Persuasif)',
    tabSwitches = 0,
    durationLabel = '12 menit'
  } = request.body;

  const cog = Math.max(40, Math.min(100, Number(cognitiveScore)));
  const prec = Math.max(40, Math.min(100, Number(precisionScore)));
  const adapt = Math.round((cog + prec) / 2) + 2;
  const collab = Math.min(98, Math.round((cog + prec) / 2) + 4);
  const composite = Math.round((cog + prec + adapt + collab) / 4);

  const switches = Number(tabSwitches) || 0;
  const flagged = switches > 0;

  candidate.score = composite;
  candidate.status = flagged ? 'Perlu review' : 'Selesai';
  candidate.lastActivity = formatNow();
  candidate.proctoring = {
    tabSwitches: switches,
    cameraStatus: 'Verified',
    integrity: flagged ? `Perlu Cek (${switches}x pindah tab)` : 'Aman'
  };
  candidate.report = {
    recommendation: flagged
      ? 'Dipertimbangkan — perlu verifikasi log proctoring oleh HR'
      : composite >= 80
        ? 'Direkomendasikan ke tahap wawancara user'
        : 'Dipertimbangkan sesuai kebutuhan posisi',
    personalityType: discType,
    duration: durationLabel,
    aspects: [
      { name: 'Kemampuan kognitif', score: cog },
      { name: 'Ketelitian kerja', score: prec },
      { name: 'Adaptabilitas', score: Math.min(100, adapt) },
      { name: 'Kolaborasi tim', score: Math.min(100, collab) }
    ]
  };

  writeDatabase(database);
  response.json(candidate);
});

app.get('/api/candidates/:id/report', (request, response) => {
  const database = readDatabase();
  const candidate = database.candidates.find((item) => item.id === request.params.id);
  if (!candidate) return response.status(404).json({ message: 'Kandidat tidak ditemukan' });

  const session = database.sessions.find((s) => s.id === candidate.sessionId);

  response.json({
    ...candidate.report,
    id: candidate.id,
    initials: candidate.initials,
    color: candidate.color,
    name: candidate.name,
    email: candidate.email,
    position: candidate.position,
    status: candidate.status,
    lastActivity: candidate.lastActivity,
    compositeScore: candidate.score,
    proctoring: candidate.proctoring || { tabSwitches: 0, cameraStatus: 'Verified', integrity: 'Aman' },
    sessionName: session ? session.name : candidate.position,
    company: database.company.name
  });
});

app.get('/api/sessions', (_request, response) => {
  const database = readDatabase();
  response.json(database.sessions);
});

app.post('/api/sessions', (request, response) => {
  const database = readDatabase();
  const { name, position, capacity, durationMinutes, modules, deadline } = request.body;

  if (!name || !position || !capacity) {
    return response.status(400).json({ message: 'name, position, dan capacity wajib diisi' });
  }

  const codePrefix = String(position).replace(/[^a-zA-Z0-9]/g, '').slice(0, 4).toUpperCase() || 'TEST';
  const newSession = {
    id: `session-${Date.now()}`,
    name: String(name).trim(),
    position: String(position).trim(),
    modules: Array.isArray(modules) && modules.length ? modules : ['Kognitif (CFIT)', 'Kepribadian (DISC)', 'Ketelitian'],
    durationMinutes: Number(durationMinutes) || 60,
    participants: 0,
    capacity: Number(capacity),
    status: 'Live',
    deadline: deadline || '15 Des 2026',
    inviteCode: `${codePrefix}-EPA${Math.floor(10 + Math.random() * 89)}`
  };

  database.sessions.unshift(newSession);
  writeDatabase(database);
  response.status(201).json(newSession);
});

app.use((error, _request, response, _next) => {
  console.error(error);
  response.status(500).json({ message: 'Terjadi kesalahan pada server' });
});

app.listen(PORT, () => console.log(`Bautomate Assessment API (PT Emporio Pahala Abadi) berjalan di http://localhost:${PORT}`));
