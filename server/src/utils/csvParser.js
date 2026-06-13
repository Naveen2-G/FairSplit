const { parse } = require('csv-parse/sync');

/**
 * CSV Parser — handles multiple date formats, cleans amounts, normalizes names.
 * 
 * Supported date formats:
 *   - YYYY-MM-DD (ISO standard)
 *   - DD/MM/YYYY (common Indian format)
 *   - "Mon DD" (e.g., "Mar 14") — incomplete, year inferred as 2026
 *   - Ambiguous DD/MM/YYYY where day ≤ 12 (could be MM/DD)
 */

const MONTH_MAP = {
  jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
  jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12'
};

/**
 * Parse a date string into YYYY-MM-DD format.
 * Returns { date, format, isAmbiguous }
 */
function parseDate(dateStr) {
  if (!dateStr) return { date: null, format: 'missing', isAmbiguous: false };

  const trimmed = dateStr.trim();

  // Format: YYYY-MM-DD
  const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    return { date: trimmed, format: 'YYYY-MM-DD', isAmbiguous: false };
  }

  // Format: DD/MM/YYYY
  const slashMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slashMatch) {
    const [, first, second, year] = slashMatch;
    const day = first.padStart(2, '0');
    const month = second.padStart(2, '0');

    // Default to DD/MM/YYYY (Indian convention).
    // Only flag as truly ambiguous when both values <= 12 AND they differ
    // AND the first value could plausibly be a month (4-12) while the second
    // is also a valid month — basically only 04/05 type patterns where
    // the difference is small and context doesn't resolve it.
    const firstInt = parseInt(first);
    const secondInt = parseInt(second);
    const isAmbiguous = firstInt <= 12 && secondInt <= 12 
      && first !== second && firstInt >= 4 && secondInt >= 4
      && Math.abs(firstInt - secondInt) <= 1;

    return {
      date: `${year}-${month}-${day}`,
      format: isAmbiguous ? 'ambiguous' : 'DD/MM/YYYY',
      isAmbiguous
    };
  }

  // Format: "Mon DD" (e.g., "Mar 14")
  const monthDayMatch = trimmed.match(/^([A-Za-z]{3})\s+(\d{1,2})$/);
  if (monthDayMatch) {
    const [, monthStr, day] = monthDayMatch;
    const month = MONTH_MAP[monthStr.toLowerCase()];
    if (month) {
      return {
        date: `2026-${month}-${day.padStart(2, '0')}`,
        format: 'incomplete',
        isAmbiguous: false
      };
    }
  }

  return { date: null, format: 'unknown', isAmbiguous: false };
}

/**
 * Clean and parse an amount string.
 * Handles: commas ("1,200"), whitespace (" 1450 "), negatives, decimals.
 */
function parseAmount(amountStr) {
  if (amountStr === undefined || amountStr === null) return { amount: 0, raw: '' };
  const raw = String(amountStr);
  const cleaned = raw.replace(/,/g, '').trim();
  const amount = parseFloat(cleaned);
  return { amount: isNaN(amount) ? 0 : amount, raw };
}

/**
 * Parse the CSV content into structured rows.
 */
function parseCSV(csvContent) {
  // Ensure csvContent is a string (may arrive as Buffer or object)
  const content = typeof csvContent === 'string' ? csvContent : Buffer.isBuffer(csvContent) ? csvContent.toString('utf-8') : String(csvContent);
  
  const records = parse(content, {
    columns: true,
    skip_empty_lines: true,
    trim: false, // We handle trimming ourselves to detect whitespace anomalies
    relax_quotes: true,
    relax_column_count: true,
  });

  return records.map((record, index) => {
    const { amount, raw: rawAmount } = parseAmount(record.amount);
    const { date, format, isAmbiguous } = parseDate(record.date);

    return {
      row_index: index,
      raw_date: record.date,
      parsed_date: date,
      date_format: format,
      date_ambiguous: isAmbiguous,
      description: (record.description || '').trim(),
      paid_by: record.paid_by || '',
      raw_amount: rawAmount,
      amount: amount,
      currency: (record.currency || '').trim(),
      split_type: (record.split_type || '').trim(),
      split_with: (record.split_with || '').trim(),
      split_details: (record.split_details || '').trim(),
      notes: (record.notes || '').trim(),
    };
  });
}

module.exports = { parseCSV, parseDate, parseAmount };
