# 🖨 PrintStation — QR-Based Self-Service Printing PWA

A real-time, session-based printing system where students scan a QR code on a printer's PC dashboard, upload files from their phone, and the job appears instantly in the dashboard for review and printing.

---

## 📁 Folder Structure

```
print-station/
├── server/
│   ├── index.js                  # Express + Socket.IO server entry point
│   ├── models/
│   │   └── schemas.js            # MongoDB schemas: PrinterSession, PrintJob
│   ├── routes/
│   │   └── api.js                # All REST API routes
│   ├── config/
│   │   └── multer.js             # Multer upload config (storage, fileFilter, limits)
│   ├── socket/
│   │   └── handlers.js           # Socket.IO event handlers
│   └── jobs/
│       └── cleanup.js            # Cron job: auto-delete expired files
│
├── public/
│   ├── index.html                # Landing page
│   ├── dashboard.html            # PC printer dashboard
│   ├── upload.html               # Student PWA upload page
│   ├── manifest.json             # PWA manifest
│   ├── sw.js                     # Service worker (offline shell caching)
│   └── icons/
│       ├── icon-192.png          # PWA icon (provide your own)
│       └── icon-512.png          # PWA icon (provide your own)
│
├── uploads/                      # Temp file storage (auto-created)
│   └── {sessionId}/
│       └── {uuid}.pdf / .jpg / .png
│
├── .env.example                  # Environment variable template
├── .env                          # Your actual config (git-ignored)
├── package.json
└── README.md
```

---

## ⚡ Quick Start

### 1. Install dependencies
```bash
cd print-station
npm install
```

### 2. Configure environment
```bash
cp .env.example .env
# Edit .env:
# MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/printstation
# BASE_URL=http://your-local-ip:3000   ← use LAN IP so phones can reach it
# PORT=3000
```

> **Important:** `BASE_URL` must use your **local network IP** (e.g. `http://192.168.1.42:3000`),
> not `localhost`, so that student phones on the same WiFi can open the QR link.

### 3. Run the server
```bash
npm start          # production
npm run dev        # development (nodemon)
```

### 4. Open the dashboard
Visit `http://localhost:3000/dashboard` on the printer PC.

---

## 🗺 Architecture & Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                        PC DASHBOARD                              │
│   /dashboard.html                                               │
│                                                                  │
│  1. Click "Generate QR Session"                                  │
│     → POST /api/sessions  → MongoDB saves session               │
│     → QR code rendered from sessionUrl                          │
│                                                                  │
│  2. socket.emit('join_session', { sessionId })                   │
│     → Server: socket.join('session:{sessionId}')                │
│                                                                  │
│  3. Waits for socket event: 'new_job'                           │
│     → Renders job card with files, settings, Print button       │
│                                                                  │
│  4. Click "🖨 Print"                                             │
│     → Opens file URL in new window/iframe → browser print UI    │
│     → PATCH /api/jobs/{jobId}/status { status:'printed' }       │
│     → deleteAfter set to now + 1 hour                          │
└─────────────────────────────────────────────────────────────────┘
          ↑ Socket: new_job                ↑ REST: status update
          │                               │
┌─────────────────────────────────────────────────────────────────┐
│                      NODE.JS SERVER                              │
│                                                                  │
│  Express + Socket.IO + MongoDB Atlas + Multer + node-cron       │
│                                                                  │
│  REST API:                                                       │
│    POST   /api/sessions              Create printer session      │
│    GET    /api/sessions/:id          Get session info            │
│    DELETE /api/sessions/:id          Close session               │
│    POST   /api/jobs/:sessionId       Upload files + create job   │
│    GET    /api/jobs/:sessionId       List pending jobs           │
│    GET    /api/jobs/detail/:jobId    Get single job              │
│    GET    /api/files/:sid/:filename  Serve file for preview/print│
│    PATCH  /api/jobs/:jobId/status    Update job status           │
│    DELETE /api/jobs/:jobId           Delete job manually         │
│                                                                  │
│  Socket.IO Events:                                               │
│    Client → Server:  join_session, heartbeat, ack_job           │
│    Server → Client:  session_joined, new_job, job_status_update │
│                                                                  │
│  Cron (every 15 min):                                           │
│    - Delete printed jobs where deleteAfter ≤ now (1h after print)│
│    - Delete pending/abandoned jobs where deleteAfter ≤ now (24h) │
└─────────────────────────────────────────────────────────────────┘
          ↑ Multipart POST /api/jobs/:sessionId
          │
┌─────────────────────────────────────────────────────────────────┐
│                    STUDENT PWA (Mobile)                          │
│   /upload/{sessionId}  →  upload.html                           │
│                                                                  │
│  1. Scans QR code → opens upload page on phone browser          │
│  2. Verifies session is active via GET /api/sessions/:id        │
│  3. Enters name, selects PDF/JPG/PNG files                      │
│  4. Previews thumbnails locally                                  │
│  5. Chooses orientation, copies, color, paper size              │
│  6. Submits → multipart POST with XHR progress bar              │
│  7. Server saves files to uploads/{sessionId}/ via Multer       │
│  8. Job saved to MongoDB, sessionId linked                      │
│  9. io.to('session:{sessionId}').emit('new_job', ...)           │
│     → Dashboard receives instantly                              │
│ 10. Success screen shown on phone                               │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🗄 MongoDB Schemas

### PrinterSession
| Field | Type | Description |
|---|---|---|
| `sessionId` | String (UUID) | Unique session identifier |
| `label` | String | Human-readable printer name |
| `status` | `active` / `inactive` | Session state |
| `qrCodeDataUrl` | String | Base64 QR code image |
| `sessionUrl` | String | URL encoded in QR |
| `connectedSocketId` | String | Dashboard's socket.id |
| `createdAt` | Date | Creation timestamp |
| `lastActiveAt` | Date | Last heartbeat |

### PrintJob
| Field | Type | Description |
|---|---|---|
| `jobId` | String (UUID) | Unique job identifier |
| `sessionId` | String | References PrinterSession |
| `studentName` | String | Submitted by |
| `files[]` | Array | originalName, storedName, filePath, mimeType, fileSize |
| `settings` | Object | orientation, copies, colorMode, paperSize |
| `status` | `pending` / `printing` / `printed` / `failed` / `abandoned` | Job lifecycle |
| `submittedAt` | Date | Upload time |
| `printedAt` | Date | When marked printed |
| `deleteAfter` | Date | Auto-set: 24h (default) or 1h after print |

---

## 🔄 Session Isolation (Multi-Printer Support)

Each PC dashboard:
1. Creates its own session → gets a unique `sessionId`
2. Joins socket room `session:{sessionId}`
3. QR code encodes `BASE_URL/upload/{sessionId}`

Students scan **that printer's** QR → their job is submitted with that `sessionId` → the server emits to `io.to('session:{sessionId}')` → **only that PC's dashboard** receives it.

Up to N printers can run simultaneously with complete isolation.

---

## 🔐 Security Notes

- **File path traversal protection**: Filename regex whitelist in `/api/files` route
- **Session validation**: Uploads rejected if session not found or inactive
- **File type enforcement**: Multer checks both MIME type and extension
- **Max file size**: Configurable via `MAX_FILE_SIZE_MB` env var (default 50 MB)
- **Max files per job**: 10
- **Max copies**: 20 (capped server-side)

---

## ♻️ Cleanup Logic

| Job State | deleteAfter | Action |
|---|---|---|
| Printed | `printedAt + 1 hour` | Files deleted, DB record removed |
| Pending/Failed | `submittedAt + 24 hours` | Marked abandoned, files deleted, DB record removed |

Cleanup runs every 15 minutes via `node-cron`.

---

## 📱 PWA Features

- **Service Worker** (`sw.js`): Caches upload shell for offline access
- **Web App Manifest** (`manifest.json`): Installable on iOS/Android home screen
- **Responsive design**: Works on all screen sizes
- **XHR upload progress**: Real-time progress bar during upload
- **Local file preview**: Thumbnails shown before upload (no server round-trip)

---

## 🔮 Future Extensions

- **DOC/DOCX/XLS/XLSX support**: Add LibreOffice headless conversion in backend before storing
- **Print preview in dashboard**: Embed pdf.js for in-browser PDF rendering
- **Authentication**: Add printer admin PIN for dashboard access
- **Analytics**: Track jobs per session, peak hours
- **SMS/WhatsApp notification**: Notify student when job is printed
- **Payment integration**: Pre-paid print credits via Razorpay/Stripe