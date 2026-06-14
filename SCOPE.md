# SCOPE.md — Anomaly Log & Database Schema

## CSV Anomaly Log

Every data problem found in `expenses_export.csv` and how the importer handles it.

### 1. Exact Duplicate (Row 5→6)
- **Problem**: "Dinner at Marina Bites" (row 5) and "dinner - marina bites" (row 6) — same date (2026-02-08), same payer (Dev), same amount (₹3200).
- **Detection**: Fuzzy description match + same date + same amount + same payer.
- **Policy**: Flag row 6 as duplicate, suggest skipping it. User confirms.

### 2. Conflicting Duplicate (Row 24→25)
- **Problem**: "Dinner at Thalassa" (₹2400, Aisha, row 24) vs "Thalassa dinner" (₹2450, Rohan, row 25). Notes say "Aisha also logged this I think hers is wrong."
- **Detection**: Fuzzy description match + same date + different amount/payer.
- **Policy**: Flag both, present to user with notes context. User chooses which to keep.

### 3. Comma-Formatted Amount (Row 7)
- **Problem**: Amount is `"1,200"` instead of `1200`.
- **Detection**: Check for comma in raw amount string.
- **Policy**: Auto-strip comma, log as info-level auto-fix.

### 4. Inconsistent Payer Casing (Row 9)
- **Problem**: `priya` instead of `Priya`.
- **Detection**: Compare raw name against title-cased version.
- **Policy**: Auto-normalize to title case, log as info.

### 5. Over-Precise Decimal (Row 10)
- **Problem**: Amount is `899.995` (half a paisa — not a valid denomination).
- **Detection**: Check decimal places > 2.
- **Policy**: Flag, suggest rounding to ₹900.00. User confirms.

### 6. Name Variant (Row 11)
- **Problem**: `Priya S` instead of `Priya`.
- **Detection**: Fuzzy match against canonical names using starts-with.
- **Policy**: Flag as potential match to "Priya", user confirms mapping.

### 7. Missing Payer (Row 13)
- **Problem**: `paid_by` is empty for "House cleaning supplies". Note: "can't remember who paid."
- **Detection**: Check for empty paid_by field.
- **Policy**: Flag as critical error. User must assign a payer before import.

### 8. Settlement Logged as Expense (Row 14)
- **Problem**: "Rohan paid Aisha back" — ₹5000, no split_type, only one person in split_with. Note: "this is a settlement not an expense??"
- **Detection**: Keyword match ("paid back") + missing split_type + single participant.
- **Policy**: Flag, suggest importing as settlement instead of expense.

### 9. Percentages Sum to 110% (Rows 15, 32)
- **Problem**: "Pizza Friday" and "Weekend brunch" — percentages are 30+30+30+20 = 110%.
- **Detection**: Parse percentage split_details and check sum.
- **Policy**: Flag as error. When importing, normalize proportionally (each × 100/110).

### 10. Mixed Date Formats (Rows 16-33)
- **Problem**: Some rows use YYYY-MM-DD, others DD/MM/YYYY.
- **Detection**: Regex matching against multiple date patterns.
- **Policy**: Auto-parse both formats, log as info. Default to DD/MM/YYYY (Indian convention).

### 11. Incomplete Date (Row 27)
- **Problem**: "Mar 14" — missing year.
- **Detection**: Match "Mon DD" pattern with no year.
- **Policy**: Infer year 2026 from surrounding context, flag for user confirmation.

### 12. Payer Name with Trailing Space (Row 27)
- **Problem**: `rohan ` (trailing space + lowercase).
- **Detection**: Compare trimmed vs raw name.
- **Policy**: Auto-trim and normalize, log as info.

### 13. Ambiguous Date (Row 34)
- **Problem**: `04/05/2026` — could be April 5 or May 4. CSV note asks "is this April 5 or May 4?"
- **Detection**: Both values ≤ 12 and close enough to be plausibly swapped.
- **Policy**: Default to DD/MM/YYYY (May 4), flag as error for user to override.

### 14. Missing Currency (Row 28)
- **Problem**: No currency specified for "Groceries DMart". Note: "forgot to set currency."
- **Detection**: Empty currency field.
- **Policy**: Flag, default to INR (most common in the dataset). User confirms.

### 15. Whitespace in Amount (Row 29)
- **Problem**: Amount is `" 1450 "` (leading/trailing spaces).
- **Detection**: Compare trimmed vs raw amount.
- **Policy**: Auto-trim, log as info.

### 16. Zero Amount (Row 31)
- **Problem**: Amount is `0` for "Dinner order Swiggy". Note: "counted twice earlier - fixing later."
- **Detection**: Check amount === 0.
- **Policy**: Flag as error, suggest skipping (void/placeholder entry).

### 17. Negative Amount (Row 26)
- **Problem**: `-30 USD` for "Parasailing refund". Note: "one slot got cancelled."
- **Detection**: Check amount < 0.
- **Policy**: Flag as refund. Import with negative amount as expense reversal.

### 18. Non-Member in Split (Row 23)
- **Problem**: `Dev's friend Kabir` appears in split_with for "Parasailing".
- **Detection**: Check for "friend"/"guest" keywords in participant names.
- **Policy**: Create as guest participant for this expense only.

### 19. Member After Leave (Row 36)
- **Problem**: "Groceries BigBasket" (2026-04-02) includes Meera, who moved out end of March.
- **Detection**: Cross-reference expense date against member's left_at date.
- **Policy**: Flag as error, suggest removing Meera from split.

### 20. Split Type/Details Mismatch (Row 42)
- **Problem**: split_type is "equal" but split_details has share values ("Aisha 1; Rohan 1; Priya 1; Sam 1").
- **Detection**: Check for non-empty split_details when split_type is "equal".
- **Policy**: Flag, use "equal" split and ignore redundant details.

### 21. Deposit/Transfer as Expense (Row 38)
- **Problem**: "Sam deposit share" — ₹15000 paid to Aisha. Note: "Sam moving in! paid Aisha his deposit."
- **Detection**: Keyword match ("deposit", "moving in").
- **Policy**: Flag, suggest importing as settlement/transfer.

---

## Database Schema

### Tables (9 total)

| Table | Purpose |
|-------|---------|
| `users` | Registered users and guest members |
| `groups` | Expense groups |
| `group_memberships` | Tracks who is in which group with join/leave dates |
| `expenses` | Individual expenses |
| `expense_splits` | How each expense is split among participants |
| `settlements` | Direct payments between users |
| `exchange_rates` | Currency conversion rates (USD→INR = 95.11) |
| `import_reports` | Tracks each CSV import session |
| `import_anomalies` | Individual anomalies detected during import |

### Key Design Decisions

- **Temporal memberships**: `group_memberships` has `joined_at` and `left_at` columns so we can track when members were active (addresses Sam's and Meera's concerns).
- **Multi-currency**: Expenses store original `amount` and `currency`; balances are computed in INR.
- **Split types as ENUM**: `equal`, `unequal`, `percentage`, `share` — covers all CSV patterns.
- **Import audit trail**: Every import creates a report with per-anomaly records showing what was detected and how the user resolved it.

See `server/sql/schema.sql` for full DDL.
