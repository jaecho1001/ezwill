# EZWill — Ontario Will & Estate Planning Platform

Bilingual (EN/KO) will-building application for Ontario, Canada. Part of the CaseLawVision platform.

## Architecture

Three-portal system:
- **Client Questionnaire** (`/will/*`) — 7-step guided will builder
- **Lawyer Dashboard** (`/dashboard/*`) — Client management, Tier 2 clause config, document generation
- **Client Review Portal** (future, :3001) — Client reviews generated documents

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 16 + React 19 + TypeScript + Tailwind CSS v4 |
| Backend | FastAPI (Python) |
| Database | PostgreSQL 16 with `firm_{id}` schema isolation |
| Editor | Tiptap (ProseMirror-based) |

## Getting Started

### Frontend
```bash
cd frontend
npm install
npm run dev    # http://localhost:3000
```

### Backend
```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --port 8003 --reload
```

## Features

- **Tier 1**: Simple will questionnaire (client-facing)
- **Tier 2**: Full annotated will with 60+ clause templates (lawyer-facing)
- **Dual Will Strategy**: Probate + Non-Probate wills (EAT savings)
- **AI Flagging**: 9 Ontario-specific legal rules
- **Clause Library**: Based on Annotated Will 2026 + firm precedent
- **Rich Text Editor**: Tiptap-based clause editing with {{placeholder}} support
- **Bilingual**: Full EN/KO support
- **Magic Links**: Secure client questionnaire distribution

## Legal Foundation

Ontario statutes: SLRA, SDA, CLRA, FLA, Trustee Act, ITA, EAT Act, ODSPA, Accumulations Act

## License

Proprietary — Vaturi & Cho LLP
