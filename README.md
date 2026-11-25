# Bautomate Assessment Cloud — Full-stack Demo

Prototype portofolio platform asesmen corporate. Semua data, organisasi, kandidat, dan hasil asesmen bersifat fiktif. Proyek ini bukan alat diagnosis psikologis.

## Teknologi

- Frontend: HTML, CSS, JavaScript.
- Backend: Node.js dan Express.
- Database demo: JSON lokal di `backend/data/db.json`.
- Frontend: `http://localhost:5173`.
- Backend/API: `http://localhost:3000`.

## Persiapan

1. Install Node.js versi 18 atau lebih baru dari https://nodejs.org/.
2. Ekstrak ZIP, lalu buka foldernya di VS Code.
3. Pilih **Terminal > New Terminal**.
4. Jalankan:

```bash
npm install
```

Pengguna Windows juga dapat menjalankan `START_WINDOWS.bat`. File tersebut akan menginstal dependency jika diperlukan, kemudian menyalakan frontend dan backend.

## Jalankan frontend dan backend bersama

```bash
npm run dev
```

Buka http://localhost:5173. Tes API melalui http://localhost:3000/api/health. Hentikan dengan `Ctrl+C`.

## Jalankan secara terpisah

Buka dua terminal VS Code.

Terminal pertama:

```bash
npm run backend
```

Terminal kedua:

```bash
npm run frontend
```

## Struktur folder

```text
Bautomate_Assessment_Cloud_Fullstack/
├── frontend/
│   ├── index.html
│   ├── styles.css
│   ├── app.js
│   └── server.js
├── backend/
│   ├── data/db.json
│   └── server.js
├── package.json
├── START_WINDOWS.bat
├── .gitignore
└── README.md
```

## Endpoint API

| Method | Endpoint | Fungsi |
|---|---|---|
| GET | `/api/health` | Cek backend aktif |
| GET | `/api/overview` | Statistik dashboard |
| GET | `/api/candidates` | Daftar kandidat |
| GET | `/api/candidates?search=nadia` | Cari kandidat |
| GET | `/api/candidates/:id` | Detail kandidat |
| GET | `/api/candidates/:id/report` | Laporan kandidat |
| GET | `/api/sessions` | Daftar sesi |
| POST | `/api/sessions` | Membuat contoh sesi |

Contoh body `POST /api/sessions`:

```json
{ "name": "Marketing Staff Batch 1", "position": "Marketing Staff", "capacity": 50 }
```

## Batasan demo

JSON lokal cocok untuk portofolio, tetapi belum cocok untuk produk komersial. Versi produksi memerlukan PostgreSQL, autentikasi, enkripsi, audit log, backup, serta pemisahan data setiap perusahaan.

