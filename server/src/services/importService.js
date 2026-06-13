const pool = require('../config/db');
const { parseCSV } = require('../utils/csvParser');
const { detectAnomalies, normalizeName, findCanonicalMatch } = require('../utils/anomalyDetector');

/**
 * Import Service — orchestrates the CSV import pipeline:
 * 1. Parse CSV → structured rows
 * 2. Detect anomalies
 * 3. Return preview for user review
 * 4. Commit approved rows to DB
 */

/**
 * Phase 1: Parse and Analyze
 * Returns parsed rows + detected anomalies for user review
 */
async function parseAndAnalyze(csvContent, groupId, userId) {
  // Parse CSV
  const rows = parseCSV(csvContent);

  // Detect anomalies
  const anomalies = detectAnomalies(rows);

  // Create import report in DB
  const [result] = await pool.query(
    `INSERT INTO import_reports (group_id, imported_by, filename, total_rows, anomaly_count, status)
     VALUES (?, ?, 'expenses_export.csv', ?, ?, 'pending')`,
    [groupId, userId, rows.length, anomalies.length]
  );
  const reportId = result.insertId;

  // Store anomalies in DB
  for (const anomaly of anomalies) {
    await pool.query(
      `INSERT INTO import_anomalies (import_report_id, \`row_number\`, anomaly_type, severity, description, original_data, suggested_fix)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [reportId, anomaly.row_number, anomaly.type, anomaly.severity,
       anomaly.description, JSON.stringify({ value: anomaly.original_value, related_row: anomaly.related_row }),
       anomaly.suggested_fix]
    );
  }

  // Prepare preview data
  const preview = rows.map((row, idx) => {
    const rowNum = idx + 2;
    const rowAnomalies = anomalies.filter(a => a.row_number === rowNum);
    const hasErrors = rowAnomalies.some(a => a.severity === 'error');
    const hasWarnings = rowAnomalies.some(a => a.severity === 'warning');

    return {
      row_number: rowNum,
      ...row,
      anomalies: rowAnomalies,
      status: hasErrors ? 'needs_review' : hasWarnings ? 'has_warnings' : 'clean',
      suggested_action: hasErrors ? 'review' : 'import'
    };
  });

  return {
    import_id: reportId,
    total_rows: rows.length,
    clean_rows: preview.filter(r => r.status === 'clean').length,
    warning_rows: preview.filter(r => r.status === 'has_warnings').length,
    error_rows: preview.filter(r => r.status === 'needs_review').length,
    anomaly_count: anomalies.length,
    rows: preview,
    anomalies
  };
}

/**
 * Phase 2: Commit Import
 * Takes user decisions and creates expenses/settlements in DB
 */
async function commitImport(importId, groupId, userId, decisions) {
  const conn = await pool.getConnection();

  try {
    await conn.beginTransaction();

    // Get the import report
    const [reports] = await conn.query('SELECT * FROM import_reports WHERE id = ?', [importId]);
    if (reports.length === 0) throw new Error('Import report not found');

    // Get stored anomalies
    const [storedAnomalies] = await conn.query(
      'SELECT * FROM import_anomalies WHERE import_report_id = ?', [importId]
    );

    let processedCount = 0;
    let skippedCount = 0;
    const results = [];

    for (const decision of decisions) {
      const { row_number, action, row_data, overrides } = decision;

      if (action === 'skip') {
        skippedCount++;
        results.push({ row_number, action: 'skipped', reason: 'User chose to skip' });
        continue;
      }

      if (action === 'import' || action === 'import_modified' || action === 'import_as_settlement') {
        const data = overrides ? { ...row_data, ...overrides } : row_data;

        try {
          // Resolve user IDs for payer and participants
          const payerId = await resolveUserId(conn, data.paid_by, groupId);
          if (!payerId) {
            results.push({ row_number, action: 'error', reason: `Could not resolve payer: ${data.paid_by}` });
            skippedCount++;
            continue;
          }

          // Check if this is a settlement
          const isSettlement = action === 'import_as_settlement';

          if (isSettlement) {
            // Import as settlement
            const participants = (data.split_with || '').split(';').map(n => n.trim()).filter(Boolean);
            const toUserId = participants.length > 0 ? await resolveUserId(conn, participants[0], groupId) : null;

            if (toUserId) {
              await conn.query(
                `INSERT INTO settlements (group_id, from_user, to_user, amount, currency, settlement_date, notes, import_row)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                [groupId, payerId, toUserId, Math.abs(data.amount), data.currency || 'INR',
                 data.parsed_date, data.notes || null, row_number]
              );
              results.push({ row_number, action: 'imported_as_settlement' });
            }
          } else {
            // Import as expense
            const amount = parseFloat(data.amount);
            const currency = data.currency || 'INR';
            const splitType = data.split_type || 'equal';

            const [expResult] = await conn.query(
              `INSERT INTO expenses (group_id, description, paid_by, amount, currency, split_type, expense_date, notes, import_row)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [groupId, data.description, payerId, amount, currency, splitType,
               data.parsed_date, data.notes || null, row_number]
            );
            const expenseId = expResult.insertId;

            // Calculate and insert splits
            const participants = (data.split_with || '').split(';').map(n => n.trim()).filter(Boolean);
            const splits = await calculateSplits(conn, expenseId, splitType, amount, participants, data.split_details, groupId);

            for (const split of splits) {
              await conn.query(
                `INSERT INTO expense_splits (expense_id, user_id, owed_amount, share_value, percentage_value)
                 VALUES (?, ?, ?, ?, ?)`,
                [expenseId, split.user_id, split.owed_amount, split.share_value || null, split.percentage_value || null]
              );
            }

            results.push({ row_number, action: 'imported', expense_id: expenseId, splits_count: splits.length });
          }

          processedCount++;
        } catch (err) {
          results.push({ row_number, action: 'error', reason: err.message });
          skippedCount++;
        }
      }
    }

    // Update import report
    await conn.query(
      `UPDATE import_reports SET processed_rows = ?, skipped_rows = ?, status = 'completed',
       summary_json = ? WHERE id = ?`,
      [processedCount, skippedCount, JSON.stringify(results), importId]
    );

    // Update anomaly resolutions
    for (const decision of decisions) {
      await conn.query(
        `UPDATE import_anomalies SET action = ?, resolved = TRUE
         WHERE import_report_id = ? AND \`row_number\` = ?`,
        [decision.action, importId, decision.row_number]
      );
    }

    await conn.commit();

    return {
      import_id: importId,
      processed: processedCount,
      skipped: skippedCount,
      results,
      status: 'completed'
    };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

/**
 * Resolve a display name to a user ID, creating guest users if needed.
 * Always ensures the user is a member of the given group.
 */
async function resolveUserId(conn, displayName, groupId) {
  if (!displayName || displayName.trim() === '') return null;

  const normalized = normalizeName(displayName);
  const canonical = findCanonicalMatch(displayName) || normalized;

  // Try to find by display_name (case-insensitive)
  const [users] = await conn.query(
    'SELECT id FROM users WHERE LOWER(display_name) = LOWER(?)',
    [canonical]
  );

  if (users.length > 0) {
    const userId = users[0].id;
    // Ensure user is a member of THIS group (they may exist from another group)
    await conn.query(
      'INSERT IGNORE INTO group_memberships (group_id, user_id, joined_at, is_active) VALUES (?, ?, ?, TRUE)',
      [groupId, userId, '2026-02-01']
    );
    return userId;
  }

  // Create guest user
  const guestUsername = canonical.toLowerCase().replace(/[^a-z0-9]/g, '_') + '_' + Date.now();
  const guestEmail = guestUsername + '@guest.local';

  const [result] = await conn.query(
    'INSERT INTO users (username, email, password_hash, display_name, is_guest) VALUES (?, ?, ?, ?, TRUE)',
    [guestUsername, guestEmail, 'GUEST_NO_LOGIN', canonical]
  );

  // Add to group
  await conn.query(
    'INSERT IGNORE INTO group_memberships (group_id, user_id, joined_at, is_active) VALUES (?, ?, ?, TRUE)',
    [groupId, result.insertId, '2026-02-01']
  );

  return result.insertId;
}

/**
 * Calculate expense splits based on split type.
 */
async function calculateSplits(conn, expenseId, splitType, totalAmount, participantNames, splitDetails, groupId) {
  const splits = [];
  const participantIds = [];

  for (const name of participantNames) {
    const userId = await resolveUserId(conn, name, groupId);
    if (userId) participantIds.push({ userId, name: normalizeName(name) });
  }

  if (participantIds.length === 0) return splits;

  switch (splitType) {
    case 'equal': {
      const perPerson = parseFloat((totalAmount / participantIds.length).toFixed(2));
      // Handle rounding: give remainder to first person
      let remaining = parseFloat((totalAmount - perPerson * participantIds.length).toFixed(2));

      participantIds.forEach((p, i) => {
        const share = i === 0 ? perPerson + remaining : perPerson;
        splits.push({ user_id: p.userId, owed_amount: share });
      });
      break;
    }

    case 'unequal': {
      // Parse split_details: "Name1 Amount1; Name2 Amount2"
      if (splitDetails) {
        const parts = splitDetails.split(';').map(s => s.trim());
        for (const part of parts) {
          const match = part.match(/^(.+?)\s+([\d.]+)$/);
          if (match) {
            const name = match[1].trim();
            const amount = parseFloat(match[2]);
            const userId = await resolveUserId(conn, name, groupId);
            if (userId) {
              splits.push({ user_id: userId, owed_amount: amount });
            }
          }
        }
      }
      break;
    }

    case 'percentage': {
      // Parse split_details: "Name1 30%; Name2 20%"
      if (splitDetails) {
        const parts = splitDetails.split(';').map(s => s.trim());
        let totalPct = 0;
        const rawSplits = [];

        for (const part of parts) {
          const match = part.match(/^(.+?)\s+([\d.]+)%$/);
          if (match) {
            const pct = parseFloat(match[2]);
            totalPct += pct;
            rawSplits.push({ name: match[1].trim(), pct });
          }
        }

        // Normalize if percentages don't sum to 100
        const normFactor = totalPct !== 0 ? 100 / totalPct : 1;

        for (const rs of rawSplits) {
          const normalizedPct = rs.pct * normFactor;
          const amount = parseFloat((totalAmount * normalizedPct / 100).toFixed(2));
          const userId = await resolveUserId(conn, rs.name, groupId);
          if (userId) {
            splits.push({ user_id: userId, owed_amount: amount, percentage_value: parseFloat(normalizedPct.toFixed(2)) });
          }
        }
      }
      break;
    }

    case 'share': {
      // Parse split_details: "Name1 2; Name2 1"
      if (splitDetails) {
        const parts = splitDetails.split(';').map(s => s.trim());
        let totalShares = 0;
        const rawSplits = [];

        for (const part of parts) {
          const match = part.match(/^(.+?)\s+([\d.]+)$/);
          if (match) {
            const shares = parseFloat(match[2]);
            totalShares += shares;
            rawSplits.push({ name: match[1].trim(), shares });
          }
        }

        for (const rs of rawSplits) {
          const amount = parseFloat((totalAmount * rs.shares / totalShares).toFixed(2));
          const userId = await resolveUserId(conn, rs.name, groupId);
          if (userId) {
            splits.push({ user_id: userId, owed_amount: amount, share_value: rs.shares });
          }
        }
      }
      break;
    }
  }

  return splits;
}

/**
 * Get import report details
 */
async function getImportReport(reportId) {
  const [reports] = await pool.query('SELECT * FROM import_reports WHERE id = ?', [reportId]);
  if (reports.length === 0) return null;

  const [anomalies] = await pool.query(
    'SELECT * FROM import_anomalies WHERE import_report_id = ? ORDER BY `row_number`',
    [reportId]
  );

  return { ...reports[0], anomalies };
}

module.exports = { parseAndAnalyze, commitImport, getImportReport, resolveUserId, calculateSplits };
