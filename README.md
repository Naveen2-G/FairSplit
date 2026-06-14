# FairSplit — Shared Expenses App

A full-stack shared expenses application for flatmates built with **React + Vite**, **Node.js + Express**, and **MySQL**.

## Features

- **Login & Registration** — JWT-based authentication
- **Groups** — Create and manage expense groups with members who can join/leave over time
- **Expenses** — Create expenses with 4 split types: equal, unequal, percentage, shares
- **CSV Import** — Import messy spreadsheet data with 21-rule anomaly detection engine
- **Balance Calculation** — Group-wise and individual balances with currency conversion (USD→INR at ₹95.11)
- **Detailed Breakdown** — See exactly which expenses contribute to any person's balance
- **Simplified Settlements** — Minimum transactions to settle all debts
- **Import Reports** — Every anomaly detected and action taken is logged

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + Vite + React Router |
| Backend | Node.js + Express |
| Database | MySQL 8.0 |
| Auth | JWT (jsonwebtoken + bcryptjs) |
| CSV Parsing | csv-parse |
| Styling | Vanilla CSS (dark theme with glassmorphism) |

## Setup Instructions

### Prerequisites

- Node.js 18+
- MySQL 8.0 running on localhost:3306

### 1. Clone and Install

```bash
git clone <repo-url>
cd InternshipTask

# Install server dependencies
cd server
npm install

# Install client dependencies
cd ../client
npm install
```

### 2. Configure Database

Edit `server/.env` with your MySQL credentials:

```env
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=shared_expenses
JWT_SECRET=your_secret_key
USD_TO_INR=95.11
```

### 3. Create Database

```bash
mysql -u root -p < server/sql/schema.sql
```

### 4. Run

```bash
# Terminal 1 - Start backend
cd server
npm run dev

# Terminal 2 - Start frontend
cd client
npm run dev
```

Open http://localhost:5173

### 5. Import CSV

1. Register an account
2. Create a group (e.g., "Flat Expenses")
3. Navigate to Import CSV
4. Upload `expenses_export.csv`
5. Review all detected anomalies
6. Approve/skip/modify each row
7. Confirm import

## AI Tools Used

- **Claude (Anthropic)** — Primary development collaborator. See `AI_USAGE.md` for details.

## Project Structure

```
├── expenses_export.csv          # Raw CSV data (unmodified)
├── server/                      # Express backend
│   ├── src/
│   │   ├── index.js             # Entry point
│   │   ├── config/db.js         # MySQL connection
│   │   ├── middleware/auth.js   # JWT auth
│   │   ├── routes/              # API endpoints
│   │   ├── services/            # Business logic
│   │   └── utils/               # CSV parser, anomaly detector
│   └── sql/schema.sql           # Database schema
├── client/                      # React frontend
│   ├── src/
│   │   ├── pages/               # Route pages
│   │   ├── components/          # Reusable UI components
│   │   ├── context/             # Auth state
│   │   └── api/                 # Axios client
├── SCOPE.md                     # Anomaly log + schema docs
├── DECISIONS.md                 # Decision log
└── AI_USAGE.md                  # AI tools and usage
```
