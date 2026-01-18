# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Meeting Transcription Full-Stack Application that transcribes, summarizes, and extracts action items from meeting recordings using AWS services (Transcribe, Bedrock/Claude, S3) with a FastAPI backend and Next.js frontend.

## Development Commands

### Backend (FastAPI)
```bash
cd backend
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

### Frontend (Next.js)
```bash
cd frontend
npm install
npm run dev      # Development server on port 3000
npm run build    # Production build
npm run lint     # ESLint
```

### Docker Compose (Full Stack with PostgreSQL)
```bash
docker compose up --build
```
This starts backend (port 8000), frontend (port 3000), and PostgreSQL (port 5432).

## Architecture

```
frontend/           Next.js 14 (App Router) + TypeScript + Tailwind CSS
  app/              Page components (login, dashboard, session/[id], profile, settings)
  lib/api.ts        Axios-based API client with JWT interceptor

backend/
  main.py           Single-file FastAPI application containing:
                    - SQLAlchemy models (User, MeetingSessionDB)
                    - JWT authentication with bcrypt
                    - AWS integration (S3, Transcribe, Bedrock)
                    - All API endpoints
```

### Data Flow
1. User uploads audio file → Backend stores in S3
2. Backend starts AWS Transcribe job with speaker identification
3. Frontend polls `/api/sessions/{id}/process` for status
4. On completion, backend invokes Claude (Bedrock) for summary and action items
5. User can rename speaker labels (spk_0, spk_1) to real names

### Key Backend Patterns
- AWS clients initialized lazily via `get_aws_clients()` (lines 142-198)
- Database defaults to SQLite (`meetings.db`) but uses PostgreSQL in Docker
- Default admin credentials: `admin` / `m33t!ng5`
- Speaker mapping stored as JSON in `speaker_mappings` column

## Environment Variables

### Backend
- `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` - AWS credentials
- `S3_BUCKET_NAME` - Bucket for meeting recordings
- `AWS_REGION` - Default: us-east-1
- `JWT_SECRET_KEY` - Change in production
- `DATABASE_URL` - Default: sqlite:///./meetings.db
- `BEDROCK_MODEL_ID` - Default: anthropic.claude-3-5-sonnet-20241022-v2:0

### Frontend
- `NEXT_PUBLIC_API_URL` - Backend URL (default: http://localhost:8000)

## API Endpoints

- `POST /api/auth/login` - JWT authentication
- `GET/PUT /api/users/me` - User profile
- `POST /api/users/me/change-password` - Change password
- `GET/POST /api/admin/users` - Admin user management
- `GET/POST /api/sessions` - List/create meeting sessions
- `GET /api/sessions/{id}` - Get session details
- `POST /api/sessions/{id}/process` - Poll/process transcription
- `GET/PATCH /api/sessions/{id}/speakers` - Speaker label management
- `DELETE /api/sessions/{id}` - Delete session
- `GET /api/health` - Health check
