# BILSEN Review Management System - Status Report

## Project Overview
The BILSEN Review Management System has been transitioned from a conceptual architectural design into a functional full-stack application. The system is built using a monorepo structure with a React (Next.js) frontend and an Express.js (TypeScript) backend.

## Tech Stack
- **Frontend:** Next.js 14, Tailwind CSS, Lucide Icons.
- **Backend:** Node.js, Express.js, TypeScript.
- **Database:** SQLite (File-based, located at `backend/database.sqlite`).
- **ORM:** TypeORM (v0.3.x).

## Key Features Implemented

### 1. Database Architecture (SQLite)
- **Entities:** All 16 prototype entities (User, Paper, Round, Assignment, AIReviewReport, etc.) have been migrated to TypeORM models.
- **Inheritance:** Implemented polymorphic User inheritance (`LabMember`, `Coordinator`, `Admin`) using TypeORM's `TableInheritance`.
- **Relationships:** Fully mapped many-to-many (e.g., Paper-Authors) and one-to-many (e.g., Paper-Rounds) relations.
- **SQLite Optimization:** Adapted Postgres-specific `enum` types to `simple-enum` for SQLite compatibility.

### 2. Backend API
- **Controllers:** 9 specialized controllers implemented to handle Business Logic (Account, Paper, Admin, AIReview, etc.).
- **Routing:** A centralized REST master-router in `backend/src/routes/index.ts` connecting ~80 structural endpoints.
- **Seeding:** A standalone `seed.ts` script to populate the database with mock data (Users, Papers, Assignments).

### 3. Frontend Integration
- **Live Data Fetching:** Dashboard and Papers views are powered by `fetch()` hooks targeting the backend API.
- **Transparent Proxy:** Configured `next.config.mjs` with rewrites to proxy `/api/*` traffic to the backend, enabling seamless access via Public IPs and Ngrok tunnels.
- **Network Binding:** Bound Next.js to `0.0.0.0` to permit external hardware connectivity.

### 4. Repository Configuration
- **Monorepo Structure:** `/frontend` and `/backend` separation.
- **Documentation:** All architectural diagrams (PlantUML) and decisions are preserved in the `/doc` folder.
- **Git Hygiene:** Comprehensive `.gitignore` excluding build artifacts and the SQLite database file.

## Execution Guide

### To Start the Backend:
```bash
cd backend
npm run dev
```

### To Start the Frontend:
```bash
cd frontend
npm run dev
```

### To Reset/Seed Database:
```bash
cd backend
npx ts-node src/seed.ts
```
