/**
 * Anomaly Detector for CSV Import
 * 
 * Detects 21 categories of data problems in the expenses CSV.
 * Each detector returns an array of anomaly objects.
 */

const ANOMALY_TYPES = {
  DUPLICATE_EXACT: 'duplicate_exact',
  DUPLICATE_CONFLICTING: 'duplicate_conflicting',
  COMMA_IN_AMOUNT: 'comma_in_amount',
  WHITESPACE_IN_AMOUNT: 'whitespace_in_amount',
  OVER_PRECISE_AMOUNT: 'over_precise_amount',
  ZERO_AMOUNT: 'zero_amount',
  NEGATIVE_AMOUNT: 'negative_amount',
  MISSING_PAYER: 'missing_payer',
  MISSING_CURRENCY: 'missing_currency',
  NAME_CASE_MISMATCH: 'name_case_mismatch',
  NAME_VARIANT: 'name_variant',
  PAYER_WHITESPACE: 'payer_whitespace',
  SETTLEMENT_AS_EXPENSE: 'settlement_as_expense',
  DEPOSIT_AS_EXPENSE: 'deposit_as_expense',
  PERCENTAGES_NOT_100: 'percentages_not_100',
  DATE_FORMAT_MIXED: 'date_format_mixed',
  DATE_INCOMPLETE: 'date_incomplete',
  DATE_AMBIGUOUS: 'date_ambiguous',
  MEMBER_AFTER_LEAVE: 'member_after_leave',
  NON_MEMBER_IN_SPLIT: 'non_member_in_split',
  SPLIT_TYPE_MISMATCH: 'split_type_mismatch',
};

// Known canonical names for the flat
const CANONICAL_NAMES = ['Aisha', 'Rohan', 'Priya', 'Meera', 'Dev', 'Sam'];

/**
 * Normalize a name to title case for comparison
 */
function normalizeName(name) {
  if (!name) return '';
  return name.trim().split(/\s+/).map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
}

/**
 * Check if two descriptions refer to the same expense (fuzzy match)
 */
function descriptionsSimilar(a, b) {
  const normalize = s => s.toLowerCase().replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();
  const na = normalize(a);
  const nb = normalize(b);
  if (na === nb) return true;

  // Check if key words overlap
  const wordsA = new Set(na.split(' ').filter(w => w.length > 2));
  const wordsB = new Set(nb.split(' ').filter(w => w.length > 2));
  let overlap = 0;
  wordsA.forEach(w => { if (wordsB.has(w)) overlap++; });
  const similarity = overlap / Math.max(wordsA.size, wordsB.size);
  return similarity >= 0.5;
}

/**
 * Find the best canonical name match for a given name
 */
function findCanonicalMatch(name) {
  const norm = normalizeName(name);
  // Exact match
  const exact = CANONICAL_NAMES.find(c => c.toLowerCase() === norm.toLowerCase());
  if (exact) return exact;

  // Starts with match (e.g., "Priya S" -> "Priya")
  const startsWith = CANONICAL_NAMES.find(c => norm.toLowerCase().startsWith(c.toLowerCase()));
  if (startsWith) return startsWith;

  return null;
}

/**
 * Run all anomaly detectors on parsed rows
 */
function detectAnomalies(rows, membershipInfo = {}) {
  const anomalies = [];

  rows.forEach((row, idx) => {
    const rowNum = idx + 2; // +2 because row 1 is header, array is 0-indexed

    // 1. Check for comma in amount
    if (row.raw_amount && row.raw_amount.includes(',')) {
      anomalies.push({
        row_number: rowNum,
        type: ANOMALY_TYPES.COMMA_IN_AMOUNT,
        severity: 'info',
        description: `Amount "${row.raw_amount}" contains comma formatting. Cleaned to ${row.amount}.`,
        original_value: row.raw_amount,
        suggested_fix: `Use ${row.amount}`,
        auto_fixed: true
      });
    }

    // 2. Check for whitespace in amount
    if (row.raw_amount && row.raw_amount !== row.raw_amount.trim()) {
      anomalies.push({
        row_number: rowNum,
        type: ANOMALY_TYPES.WHITESPACE_IN_AMOUNT,
        severity: 'info',
        description: `Amount has leading/trailing whitespace. Cleaned to ${row.amount}.`,
        original_value: `"${row.raw_amount}"`,
        suggested_fix: `Use ${row.amount}`,
        auto_fixed: true
      });
    }

    // 3. Over-precise decimal
    const amountStr = String(row.amount);
    if (amountStr.includes('.') && amountStr.split('.')[1]?.length > 2) {
      const rounded = parseFloat(parseFloat(row.amount).toFixed(2));
      anomalies.push({
        row_number: rowNum,
        type: ANOMALY_TYPES.OVER_PRECISE_AMOUNT,
        severity: 'warning',
        description: `Amount ${row.amount} has more than 2 decimal places (sub-paisa precision). Rounded to ${rounded}.`,
        original_value: row.amount,
        suggested_fix: `Round to ${rounded}`,
        auto_fixed: false
      });
    }

    // 4. Zero amount
    if (parseFloat(row.amount) === 0) {
      anomalies.push({
        row_number: rowNum,
        type: ANOMALY_TYPES.ZERO_AMOUNT,
        severity: 'error',
        description: `Amount is ₹0. ${row.notes ? `Note: "${row.notes}"` : 'This appears to be a void entry.'}`,
        original_value: '0',
        suggested_fix: 'Skip this row (void/placeholder entry)',
        auto_fixed: false
      });
    }

    // 5. Negative amount
    if (parseFloat(row.amount) < 0) {
      anomalies.push({
        row_number: rowNum,
        type: ANOMALY_TYPES.NEGATIVE_AMOUNT,
        severity: 'warning',
        description: `Negative amount ${row.amount} ${row.currency || 'INR'}. This appears to be a refund: "${row.description}".`,
        original_value: row.amount,
        suggested_fix: 'Import as a refund (negative expense reversal)',
        auto_fixed: false
      });
    }

    // 6. Missing payer
    if (!row.paid_by || row.paid_by.trim() === '') {
      anomalies.push({
        row_number: rowNum,
        type: ANOMALY_TYPES.MISSING_PAYER,
        severity: 'error',
        description: `No payer specified for "${row.description}". ${row.notes ? `Note: "${row.notes}"` : ''}`,
        original_value: '',
        suggested_fix: 'Assign a payer manually',
        auto_fixed: false
      });
    }

    // 7. Missing currency
    if (!row.currency || row.currency.trim() === '') {
      anomalies.push({
        row_number: rowNum,
        type: ANOMALY_TYPES.MISSING_CURRENCY,
        severity: 'warning',
        description: `No currency specified for "${row.description}". Defaulting to INR.`,
        original_value: '',
        suggested_fix: 'Default to INR',
        auto_fixed: false
      });
    }

    // 8. Payer name issues (case, whitespace, variant)
    if (row.paid_by) {
      const trimmed = row.paid_by.trim();
      const normalized = normalizeName(trimmed);

      if (trimmed !== row.paid_by) {
        anomalies.push({
          row_number: rowNum,
          type: ANOMALY_TYPES.PAYER_WHITESPACE,
          severity: 'info',
          description: `Payer name "${row.paid_by}" has extra whitespace. Cleaned to "${trimmed}".`,
          original_value: `"${row.paid_by}"`,
          suggested_fix: `Use "${trimmed}"`,
          auto_fixed: true
        });
      }

      if (trimmed.toLowerCase() !== trimmed && trimmed !== normalized) {
        // Not all lowercase AND not properly capitalized - could be case issue
      }

      if (trimmed !== normalized && trimmed.toLowerCase() === normalized.toLowerCase()) {
        anomalies.push({
          row_number: rowNum,
          type: ANOMALY_TYPES.NAME_CASE_MISMATCH,
          severity: 'info',
          description: `Payer name "${trimmed}" has inconsistent casing. Normalized to "${normalized}".`,
          original_value: trimmed,
          suggested_fix: `Use "${normalized}"`,
          auto_fixed: true
        });
      }

      // Check for name variants (e.g., "Priya S" vs "Priya")
      const canonical = findCanonicalMatch(trimmed);
      if (canonical && canonical.toLowerCase() !== trimmed.toLowerCase().trim()) {
        anomalies.push({
          row_number: rowNum,
          type: ANOMALY_TYPES.NAME_VARIANT,
          severity: 'warning',
          description: `Payer name "${trimmed}" appears to be a variant of "${canonical}".`,
          original_value: trimmed,
          suggested_fix: `Map to "${canonical}"`,
          auto_fixed: false
        });
      }
    }

    // 9. Settlement masquerading as expense
    const settlementKeywords = ['paid back', 'settlement', 'settled', 'repaid', 'paid.*back'];
    const isLikelySettlement = settlementKeywords.some(kw =>
      new RegExp(kw, 'i').test(row.description)
    ) || (!row.split_type || row.split_type.trim() === '');

    const noteSettlement = row.notes && /settlement|not an expense/i.test(row.notes);

    if ((isLikelySettlement && row.split_with && row.split_with.split(';').length <= 1) || noteSettlement) {
      if (!row.description?.toLowerCase().includes('deposit')) {
        anomalies.push({
          row_number: rowNum,
          type: ANOMALY_TYPES.SETTLEMENT_AS_EXPENSE,
          severity: 'warning',
          description: `"${row.description}" appears to be a settlement/payment, not an expense. ${row.notes ? `Note: "${row.notes}"` : ''}`,
          original_value: row.description,
          suggested_fix: 'Import as a settlement (direct payment between users)',
          auto_fixed: false
        });
      }
    }

    // 10. Deposit / transfer
    if (row.description && /deposit|moving in/i.test(row.description + ' ' + (row.notes || ''))) {
      anomalies.push({
        row_number: rowNum,
        type: ANOMALY_TYPES.DEPOSIT_AS_EXPENSE,
        severity: 'warning',
        description: `"${row.description}" appears to be a deposit/transfer, not a regular expense. ${row.notes ? `Note: "${row.notes}"` : ''}`,
        original_value: row.description,
        suggested_fix: 'Import as a settlement/transfer',
        auto_fixed: false
      });
    }

    // 11. Percentages don't sum to 100
    if (row.split_type === 'percentage' && row.split_details) {
      const percentages = row.split_details.split(';').map(p => {
        const match = p.trim().match(/([\d.]+)%/);
        return match ? parseFloat(match[1]) : 0;
      });
      const total = percentages.reduce((sum, p) => sum + p, 0);
      if (Math.abs(total - 100) > 0.01) {
        anomalies.push({
          row_number: rowNum,
          type: ANOMALY_TYPES.PERCENTAGES_NOT_100,
          severity: 'error',
          description: `Percentages sum to ${total}%, not 100%. Split details: "${row.split_details}".`,
          original_value: `${total}%`,
          suggested_fix: `Normalize proportionally to 100% (each value × ${(100/total).toFixed(4)})`,
          auto_fixed: false
        });
      }
    }

    // 12. Date format issues
    if (row.date_format && row.date_format !== 'YYYY-MM-DD') {
      if (row.date_format === 'incomplete') {
        anomalies.push({
          row_number: rowNum,
          type: ANOMALY_TYPES.DATE_INCOMPLETE,
          severity: 'warning',
          description: `Date "${row.raw_date}" is incomplete (missing year). Inferred year 2026 from context.`,
          original_value: row.raw_date,
          suggested_fix: `Use ${row.parsed_date}`,
          auto_fixed: false
        });
      } else if (row.date_format === 'DD/MM/YYYY') {
        anomalies.push({
          row_number: rowNum,
          type: ANOMALY_TYPES.DATE_FORMAT_MIXED,
          severity: 'info',
          description: `Date "${row.raw_date}" uses DD/MM/YYYY format instead of YYYY-MM-DD. Parsed as ${row.parsed_date}.`,
          original_value: row.raw_date,
          suggested_fix: `Use ${row.parsed_date}`,
          auto_fixed: true
        });
      } else if (row.date_format === 'ambiguous') {
        anomalies.push({
          row_number: rowNum,
          type: ANOMALY_TYPES.DATE_AMBIGUOUS,
          severity: 'error',
          description: `Date "${row.raw_date}" is ambiguous — could be ${row.parsed_date} (DD/MM) or another interpretation (MM/DD). ${row.notes ? `Note: "${row.notes}"` : ''}`,
          original_value: row.raw_date,
          suggested_fix: `Defaulting to DD/MM/YYYY → ${row.parsed_date}. Change if incorrect.`,
          auto_fixed: false
        });
      }
    }

    // 13. Non-member in split list (e.g., "Dev's friend Kabir")
    if (row.split_with) {
      const participants = row.split_with.split(';').map(n => n.trim());
      participants.forEach(name => {
        if (name && !findCanonicalMatch(name) && !/kabir/i.test(name)) {
          // Non-standard name that's not a known canonical
        }
        if (/friend|guest|visitor/i.test(name)) {
          anomalies.push({
            row_number: rowNum,
            type: ANOMALY_TYPES.NON_MEMBER_IN_SPLIT,
            severity: 'warning',
            description: `"${name}" in split list appears to be a non-member/guest.`,
            original_value: name,
            suggested_fix: `Create as guest participant for this expense only`,
            auto_fixed: false
          });
        }
      });
    }

    // 14. Split type says "equal" but split_details has share values
    if (row.split_type === 'equal' && row.split_details && row.split_details.trim()) {
      // Check if details contain share-like values
      const hasShareValues = /\d+\s*;\s*\w+\s+\d+/i.test(row.split_details) ||
        row.split_details.split(';').some(d => /\d+/.test(d));
      if (hasShareValues) {
        anomalies.push({
          row_number: rowNum,
          type: ANOMALY_TYPES.SPLIT_TYPE_MISMATCH,
          severity: 'warning',
          description: `Split type is "equal" but split_details contains values: "${row.split_details}". These are contradictory.`,
          original_value: `type=equal, details="${row.split_details}"`,
          suggested_fix: 'Use "equal" split (ignore redundant details)',
          auto_fixed: false
        });
      }
    }
  });

  // Cross-row checks: Duplicates
  for (let i = 0; i < rows.length; i++) {
    for (let j = i + 1; j < rows.length; j++) {
      const a = rows[i], b = rows[j];
      if (a.parsed_date === b.parsed_date && descriptionsSimilar(a.description, b.description)) {
        const sameAmount = parseFloat(a.amount) === parseFloat(b.amount);
        const samePayer = normalizeName(a.paid_by || '') === normalizeName(b.paid_by || '');

        if (sameAmount && samePayer) {
          // Exact duplicate
          anomalies.push({
            row_number: j + 2,
            type: ANOMALY_TYPES.DUPLICATE_EXACT,
            severity: 'error',
            description: `Row ${j + 2} appears to be an exact duplicate of row ${i + 2}: "${a.description}" (${a.amount} by ${a.paid_by}) on ${a.parsed_date}.`,
            original_value: `Duplicate of row ${i + 2}`,
            suggested_fix: `Skip row ${j + 2} (keep row ${i + 2} with cleaner description)`,
            auto_fixed: false,
            related_row: i + 2
          });
        } else if (!sameAmount || !samePayer) {
          // Conflicting duplicate
          anomalies.push({
            row_number: j + 2,
            type: ANOMALY_TYPES.DUPLICATE_CONFLICTING,
            severity: 'error',
            description: `Row ${j + 2} ("${b.description}", ${b.amount} by ${b.paid_by || '?'}) conflicts with row ${i + 2} ("${a.description}", ${a.amount} by ${a.paid_by || '?'}) — same date, similar description but different ${!sameAmount ? 'amount' : 'payer'}. ${b.notes ? `Note: "${b.notes}"` : ''}`,
            original_value: `Conflicts with row ${i + 2}`,
            suggested_fix: `Review and keep the correct one. ${b.notes && /wrong|incorrect/i.test(b.notes) ? 'Notes suggest the other row may be wrong.' : ''}`,
            auto_fixed: false,
            related_row: i + 2
          });
        }
      }
    }
  }

  // Check for Meera in expenses after her leave date (end of March)
  rows.forEach((row, idx) => {
    const rowNum = idx + 2;
    if (row.parsed_date && new Date(row.parsed_date) > new Date('2026-03-31')) {
      if (row.split_with) {
        const participants = row.split_with.split(';').map(n => normalizeName(n.trim()));
        if (participants.some(n => n === 'Meera')) {
          anomalies.push({
            row_number: rowNum,
            type: ANOMALY_TYPES.MEMBER_AFTER_LEAVE,
            severity: 'error',
            description: `Meera is included in the split for "${row.description}" dated ${row.parsed_date}, but she moved out at the end of March 2026. ${row.notes ? `Note: "${row.notes}"` : ''}`,
            original_value: row.split_with,
            suggested_fix: 'Remove Meera from this expense split',
            auto_fixed: false
          });
        }
      }
    }
  });

  return anomalies;
}

module.exports = { detectAnomalies, ANOMALY_TYPES, normalizeName, findCanonicalMatch, CANONICAL_NAMES };
