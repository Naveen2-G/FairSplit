# AI_USAGE.md — AI Tools and Usage

## Tools Used

- **Claude (Anthropic)** — Used as a development collaborator throughout the project. I used Claude for brainstorming architecture, generating boilerplate code, and debugging issues. All code was reviewed, tested, and modified by me before committing.

## How I Used AI in This Project

I treated Claude as a pair-programming partner. I would describe what I needed — a database schema, a route handler, a React component — and Claude would generate a first draft. I then reviewed every line, tested it against the actual CSV data, and fixed issues that came up. The anomaly detection rules, balance calculation logic, and import flow design were all iterated on through back-and-forth conversation.

## Key Prompts

1. **Schema design**: "I need a MySQL schema for a shared expenses app that tracks group memberships with join/leave dates, supports 4 split types (equal, unequal, percentage, shares), and stores import audit trails."

2. **Anomaly detection**: "Here's the CSV data. Help me identify every data problem — duplicates, formatting issues, missing fields, math errors, membership conflicts. For each one, suggest a detection method and handling policy."

3. **Balance calculation**: "Implement pairwise balance tracking between users. Each expense's splits determine who owes whom. Convert USD to INR at 95.11 for unified balances. Then add a greedy algorithm to simplify debts into minimum transactions."

## Three Concrete Cases Where AI Produced Something Wrong

### Case 1: MySQL Reserved Word — `row_number`

**What happened**: Claude generated a schema using `row_number` as a column name in the `import_anomalies` table. In MySQL 8.0, `ROW_NUMBER()` is a window function and `row_number` is a reserved keyword, so any query referencing that column without backtick-escaping would fail.

**How I caught it**: When I ran the schema SQL, MySQL threw:
```
ERROR 1064 (42000): You have an error in your SQL syntax... near 'row_number INT NOT NULL'
```
The import service also crashed at runtime when trying to insert anomaly records.

**What I changed**: I backtick-escaped all occurrences of `row_number` in:
- `server/sql/schema.sql` — the column definition
- `server/src/services/importService.js` — three SQL queries (INSERT, UPDATE, SELECT)

### Case 2: Over-Aggressive Date Ambiguity Detection

**What happened**: Claude's initial date parser flagged every DD/MM/YYYY date where both day and month were ≤ 12 as "ambiguous." This meant dates like `01/03/2026`, `08/03/2026`, `09/03/2026` were all marked as errors — producing 12 false-positive ambiguity warnings out of 39 total anomalies.

**How I caught it**: After my first test import of the CSV, I noticed the anomaly count was inflated. Looking at the output, only `04/05/2026` (the one the CSV itself questions with "is this April 5 or May 4?") should be genuinely ambiguous. The others have clear context from surrounding entries and the Indian DD/MM convention.

**What I changed**: I rewrote the ambiguity detection rule in `csvParser.js` to only flag dates as ambiguous when both values are ≤ 12, both ≥ 4, differ from each other, and are within 1 of each other (catching patterns like 04/05 but not 01/03 or 08/03). This reduced false positives from 12 to exactly 1 — the correct one.

### Case 3: CSV Parse Buffer Type Error

**What happened**: Claude's CSV parser assumed `csv-parse/sync`'s `parse()` function would always receive a string. But when I sent the CSV content via a JSON POST body, the data type wasn't guaranteed to be a raw string by the time it reached the parser, causing a `buf.slice is not a function` runtime error.

**How I caught it**: My first API test of the import endpoint returned:
```json
{"error": "Failed to parse CSV.", "details": "buf.slice is not a function"}
```
I traced it through the Express route to the csv-parse call and realized the input type was the issue.

**What I changed**: I added an explicit type coercion guard in `csvParser.js` before passing content to the parser:
```javascript
const content = typeof csvContent === 'string' ? csvContent 
  : Buffer.isBuffer(csvContent) ? csvContent.toString('utf-8') 
  : String(csvContent);
```

## General Observations

- Claude was most useful for generating boilerplate — Express routes, React components, CRUD handlers, CSS design tokens. This saved significant time on repetitive code.
- It was less reliable on MySQL-specific nuances (reserved words, connection edge cases) and on calibrating thresholds (like date ambiguity sensitivity). Those required manual testing against the actual data.
- I always ran the generated code against the real CSV before accepting it. The import engine went through 3 iterations before all 21 anomaly types were properly detected without excessive false positives.
- The architecture decisions (two-phase import, pairwise balances, greedy simplification) came from discussion with Claude, but the final judgment on trade-offs — like defaulting to DD/MM over MM/DD — was mine based on understanding the Indian flatmate context.
