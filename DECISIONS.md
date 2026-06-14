# DECISIONS.md — Decision Log

Each significant engineering and product decision I made, the options I considered, and why I chose what I chose.

---

## 1. Date Format Interpretation

**Decision**: Treat DD/MM/YYYY as the default for slash-separated dates.

**Options I considered**:
- (A) Treat all ambiguous dates as errors requiring manual resolution
- (B) Default to DD/MM/YYYY (Indian convention) and only flag truly ambiguous cases
- (C) Use MM/DD/YYYY (US convention)

**Why I chose B**: The CSV is from Indian flatmates. Most dates clearly follow DD/MM/YYYY. Only `04/05/2026` is genuinely ambiguous (the CSV note itself questions it). Flagging every date would overwhelm the user with false positives — I saw this firsthand during testing when my initial implementation flagged 12 dates as ambiguous.

---

## 2. Settlement vs Expense Detection

**Decision**: Use a combination of keyword matching and structural analysis to detect settlements.

**Options I considered**:
- (A) Only detect by missing split_type
- (B) Keyword match on description ("paid back", "settlement") + empty split_type + single participant
- (C) Let users manually reclassify during import

**Why I chose B**: The CSV has two cases — "Rohan paid Aisha back" (clearly a settlement by keywords + notes) and "Sam deposit share" (a transfer/deposit). Pure structural analysis would miss descriptions; pure keyword matching could have false positives. Combining both gives the best accuracy while still letting users override during the import review step.

---

## 3. Currency Conversion Approach

**Decision**: Fixed exchange rate (1 USD = ₹95.11) stored in the database, applied at balance calculation time.

**Options I considered**:
- (A) Convert on import (store everything in INR)
- (B) Convert at display/calculation time, keeping original currency
- (C) Use a live exchange rate API

**Why I chose B**: Preserving the original amount and currency maintains data integrity. Users can see "$540" instead of "₹51,359.40" for the Goa villa booking. The rate is configurable via the `.env` file. A live API would be overkill for a flat expenses app and adds an unnecessary network dependency. Priya specifically asked for proper dollar handling — showing the original USD amount alongside the INR equivalent addresses that.

---

## 4. Percentage Normalization

**Decision**: When percentages don't sum to 100%, normalize proportionally.

**Options I considered**:
- (A) Reject the expense entirely
- (B) Flag and normalize (each value × 100/total)
- (C) Add the remainder to one person

**Why I chose B**: The CSV has two cases where percentages sum to 110% (30+30+30+20). The intent is clearly a 3:3:3:2 proportional split. Normalizing preserves the intended ratios: Aisha/Rohan/Priya each get ~27.27%, Meera gets ~18.18%. The anomaly is flagged so the user can override if the normalization isn't what they wanted.

---

## 5. Handling Members Who Left

**Decision**: Flag membership conflicts but let the user decide — don't silently exclude people.

**Options I considered**:
- (A) Ignore membership dates entirely
- (B) Flag but still include them (let user decide during import)
- (C) Automatically remove them from the split

**Why I chose B**: Sam's concern ("Why would March electricity affect my balance?") is valid — membership dates should matter. But Meera being included in the April 2 grocery (row 36) might have been intentional (e.g., she still had groceries at the flat). Meera specifically asked to approve any changes, so I flag the conflict and let the user decide rather than silently removing her.

---

## 6. Duplicate Detection Strategy

**Decision**: Use fuzzy description matching + same date + same payer/amount.

**Options I considered**:
- (A) Exact match only (same description, amount, date, payer)
- (B) Fuzzy description matching with word overlap scoring
- (C) Manual duplicate marking by user

**Why I chose B**: The duplicates in the CSV have different descriptions ("Dinner at Marina Bites" vs "dinner - marina bites", "Dinner at Thalassa" vs "Thalassa dinner"). Exact matching would miss them entirely. I implemented fuzzy matching with >50% word overlap after normalizing — this catches both duplicates without false positives on unrelated expenses on the same date.

---

## 7. Balance Calculation Method

**Decision**: Pairwise balance tracking with greedy simplification.

**Options I considered**:
- (A) Simple sum (total paid − total share) per person
- (B) Pairwise tracking (A owes B how much) then greedy simplification
- (C) Graph-based minimum cost flow algorithm

**Why I chose B**: Pairwise tracking is essential for Rohan's request — he wants to see exactly which expenses make up his balance and who he owes for each one. Simple sums can't provide that breakdown. Greedy simplification produces near-optimal results for a small group (6 people) and is much simpler to implement and debug than min-cost flow. For Aisha's "one number per person" request, I simplify the pairwise debts into minimum transactions.

---

## 8. Guest User Handling

**Decision**: Create guest user accounts (`is_guest=TRUE`) for non-registered members found during import.

**Options I considered**:
- (A) Require all members to register before importing
- (B) Create guest accounts that can be upgraded later
- (C) Use name strings instead of user IDs in the expenses table

**Why I chose B**: The CSV references 7 people but realistically only 1 person (whoever is doing the import) needs to register. Requiring all 7 to sign up before importing would be terrible UX. Using name strings instead of user IDs would break referential integrity in the database. Guest accounts give me proper foreign keys while keeping the import flow smooth. Guests can register later and claim their accounts.

---

## 9. Import Confirmation Flow

**Decision**: Two-phase import — parse and preview first, then user-approved commit.

**Options I considered**:
- (A) Auto-import with best-guess resolution for all anomalies
- (B) Two-phase: parse → review all anomalies → confirm → import
- (C) Row-by-row interactive import wizard

**Why I chose B**: Meera's requirement — "I want to approve anything the app deletes or changes" — directly mandates user review. A two-phase approach lets the user see ALL anomalies at once, make bulk decisions (approve, skip, modify), and then commit everything in one transaction. This is more efficient than row-by-row and much safer than auto-import which could silently make wrong decisions.

---

## 10. Rounding Strategy

**Decision**: Round to 2 decimal places, assign rounding remainder to the first participant.

**Options I considered**:
- (A) Always round down (lose fractional paisas)
- (B) Round to nearest, give remainder to first person
- (C) Track sub-paisa amounts with higher precision

**Why I chose B**: When splitting ₹899.995 among 4 people, each gets ₹225.00 rounded. The ₹0.005 remainder needs to go somewhere — I assign it to the first participant. This ensures the split amounts always sum exactly to the total, avoiding the "missing paisa" problem that accumulates over many expenses.

---

## 11. Split Type vs Split Details Contradiction

**Decision**: Trust the `split_type` column, flag contradictions with `split_details`.

**Options I considered**:
- (A) Infer split type from the split_details values
- (B) Trust split_type and silently ignore mismatched details
- (C) Trust split_type, flag the mismatch for the user

**Why I chose C**: Row 42 has `split_type` "equal" but share values in `split_details` ("Aisha 1; Rohan 1; Priya 1; Sam 1"). Since the shares happen to be all 1s, equal and share splits would give the same result — but I can't assume that's always the case. Flagging the contradiction lets the user verify intent rather than me guessing.

---

## 12. Tech Stack

**Decision**: React + Vite (frontend), Express + MySQL (backend), vanilla CSS.

**Why**: React/Node/Express/MySQL was specified in the requirements. I chose Vite over Create React App for significantly faster dev builds and HMR. I used vanilla CSS over Tailwind for full control over the dark glassmorphism design system — I wanted a premium look with gradients, glass effects, and micro-animations that would be harder to achieve with utility-first CSS. MySQL was the required relational database, and I designed the schema with proper foreign keys and constraints throughout.
