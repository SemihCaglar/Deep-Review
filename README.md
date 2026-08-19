# Deep Review Management System

A full-stack system for managing academic paper reviews, featuring AI-assisted review generation and relational reviewer management.

## Project Structure
- **/frontend:** Next.js 14 web application (React, Tailwind CSS).
- **/backend:** Express.js TypeScript API (TypeORM, SQLite).

## Tech Stack
- **Frontend:** Next.js, Lucide Icons, Tailwind.
- **Backend:** Node.js, Express, TypeScript.
- **Database:** SQLite (local file: `backend/database.sqlite`).
- **ORM:** TypeORM.

---

## 🚀 Setup & Installation

### 1. Prerequisites
- Node.js (v18+)
- npm

### 2. Clone and Install
```bash
# Install backend dependencies
cd backend
npm install

# Setup backend environment variables
cp .env.example .env
# Important: Open backend/.env and ensure JWT_SECRET is set

# Install frontend dependencies
cd ../frontend
npm install
```

### 3. Initialize Database (Seeding)
To populate the SQLite database with mock users (Semih, Emily, etc.) and papers:
```bash
cd backend
npx ts-node src/seed.ts
```

---

## 🏃 Running the Application

### Start Backend Server
```bash
cd backend
npm run dev
```
- Server runs on: `http://localhost:3001`
- SQLite DB file: `backend/database.sqlite`

### Start Frontend Server
```bash
cd frontend
npm run dev
```
- Web App runs on: `http://localhost:3000`
- Access via Public IP/Ngrok: Fully supported via `-H 0.0.0.0` and Next.js proxy.

---

## 🛠 Features
- **Monorepo Design:** Clean separation of concerns.
- **SQLite Persistence:** No external database setup required.
- **Transparent API Proxy:** Seamless cross-origin fetching.
- **Team-Ready:** Comprehensive `.gitignore` and `README` for collaborative development.

---

## ⚙️ Configuration and Email Templates

The system supports configurable email templates and global system policies.
Detailed placeholder and policy key references are documented in [`docs/configuration.md`](docs/configuration.md).

