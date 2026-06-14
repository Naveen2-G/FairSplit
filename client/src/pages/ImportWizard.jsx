import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Upload, CheckCircle, AlertTriangle, XCircle, FileText, ArrowLeft, ArrowRight } from 'lucide-react';
import API from '../api/client';
import toast from 'react-hot-toast';

export default function ImportWizard() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [step, setStep] = useState(1); // 1=upload, 2=review, 3=confirm, 4=report
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [decisions, setDecisions] = useState({});
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [dragging, setDragging] = useState(false);

  const handleUpload = async () => {
    if (!file) return toast.error('Please select a CSV file');
    setLoading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await API.post(`/groups/${id}/import/parse`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      setPreview(res.data);
      // Initialize decisions — default to import for clean rows, review for anomalous
      const decs = {};
      res.data.rows.forEach(r => {
        decs[r.row_number] = {
          row_number: r.row_number,
          action: r.status === 'clean' ? 'import' : 'import',
          row_data: r
        };
      });
      // Auto-skip exact duplicate rows
      res.data.anomalies.filter(a => a.type === 'duplicate_exact').forEach(a => {
        decs[a.row_number] = { ...decs[a.row_number], action: 'skip' };
      });
      // Auto-mark zero-amount rows as skip
      res.data.anomalies.filter(a => a.type === 'zero_amount').forEach(a => {
        decs[a.row_number] = { ...decs[a.row_number], action: 'skip' };
      });
      // Mark settlements
      res.data.anomalies.filter(a => a.type === 'settlement_as_expense' || a.type === 'deposit_as_expense').forEach(a => {
        if (decs[a.row_number]) decs[a.row_number].action = 'import_as_settlement';
      });
      setDecisions(decs);
      setStep(2);
      toast.success(`Parsed ${res.data.total_rows} rows, found ${res.data.anomaly_count} anomalies`);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to parse CSV');
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = async () => {
    setLoading(true);
    try {
      const decisionsArr = Object.values(decisions).map(d => ({
        row_number: d.row_number,
        action: d.action,
        row_data: d.row_data
      }));
      const res = await API.post(`/groups/${id}/import/confirm`, {
        import_id: preview.import_id,
        decisions: decisionsArr
      });
      setReport(res.data);
      setStep(4);
      toast.success(`Import complete! ${res.data.processed} rows processed.`);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Import failed');
    } finally {
      setLoading(false);
    }
  };

  const setDecision = (rowNum, action) => {
    setDecisions(prev => ({
      ...prev,
      [rowNum]: { ...prev[rowNum], action }
    }));
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile && droppedFile.name.endsWith('.csv')) setFile(droppedFile);
    else toast.error('Please drop a CSV file');
  };

  const getSeverityIcon = (severity) => {
    if (severity === 'error') return <XCircle size={16} color="var(--danger)" />;
    if (severity === 'warning') return <AlertTriangle size={16} color="var(--warning)" />;
    return <CheckCircle size={16} color="var(--info)" />;
  };

  const steps = ['Upload CSV', 'Review Anomalies', 'Confirm Import', 'Import Report'];

  return (
    <div>
      <div className="page-header">
        <button className="btn btn-ghost" onClick={() => navigate(`/groups/${id}`)} style={{ marginBottom: '1rem' }}>
          <ArrowLeft size={16} /> Back to Group
        </button>
        <h1 className="page-title">Import Expenses</h1>
        <p className="page-subtitle">Upload your CSV and review data anomalies before importing</p>
      </div>

      {/* Wizard Steps */}
      <div className="wizard-steps">
        {steps.map((s, i) => (
          <div key={i} className={`wizard-step ${step === i + 1 ? 'active' : ''} ${step > i + 1 ? 'completed' : ''}`}>
            <span className="step-number">{step > i + 1 ? '✓' : i + 1}</span>
            {s}
          </div>
        ))}
      </div>

      {/* Step 1: Upload */}
      {step === 1 && (
        <div className="card">
          <div className={`upload-area ${dragging ? 'dragging' : ''}`}
            onDragOver={e => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            onClick={() => document.getElementById('csv-input').click()}>
            <div className="upload-icon">📁</div>
            <div className="upload-text">
              {file ? `Selected: ${file.name}` : 'Drag & drop your CSV file here, or click to browse'}
            </div>
            <div className="upload-hint">Accepts .csv files • expenses_export.csv</div>
            <input id="csv-input" type="file" accept=".csv" style={{ display: 'none' }}
              onChange={e => setFile(e.target.files[0])} />
          </div>
          <div style={{ marginTop: '1.5rem', textAlign: 'center' }}>
            <button className="btn btn-primary btn-lg" onClick={handleUpload} disabled={!file || loading}>
              {loading ? 'Parsing...' : 'Parse & Analyze'} <ArrowRight size={18} />
            </button>
          </div>
        </div>
      )}

      {/* Step 2: Review Anomalies */}
      {step === 2 && preview && (
        <div>
          <div className="stats-row">
            <div className="stat-card"><div className="stat-value">{preview.total_rows}</div><div className="stat-label">Total Rows</div></div>
            <div className="stat-card"><div className="stat-value green">{preview.clean_rows}</div><div className="stat-label">Clean Rows</div></div>
            <div className="stat-card"><div className="stat-value yellow">{preview.warning_rows}</div><div className="stat-label">Warnings</div></div>
            <div className="stat-card"><div className="stat-value red">{preview.error_rows}</div><div className="stat-label">Errors</div></div>
          </div>

          <h2 style={{ fontSize: '1.2rem', fontWeight: 600, marginBottom: '1rem' }}>
            Anomalies Found ({preview.anomaly_count})
          </h2>

          {preview.anomalies.map((a, i) => (
            <div key={i} className={`anomaly-card severity-${a.severity}`}>
              <div className="anomaly-header">
                <div>
                  <div className="anomaly-row">Row {a.row_number} • {a.type.replace(/_/g, ' ')}</div>
                  <div className="anomaly-desc">{a.description}</div>
                </div>
                <span className={`anomaly-badge ${a.severity}`}>
                  {getSeverityIcon(a.severity)} {a.severity}
                </span>
              </div>
              <div className="anomaly-fix">
                <strong>Suggested: </strong>{a.suggested_fix}
              </div>
              <div className="anomaly-actions">
                <button className={`btn btn-sm ${decisions[a.row_number]?.action === 'import' ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => setDecision(a.row_number, 'import')}>
                  Import As-Is
                </button>
                <button className={`btn btn-sm ${decisions[a.row_number]?.action === 'skip' ? 'btn-danger' : 'btn-secondary'}`}
                  onClick={() => setDecision(a.row_number, 'skip')}>
                  Skip Row
                </button>
                {(a.type === 'settlement_as_expense' || a.type === 'deposit_as_expense') && (
                  <button className={`btn btn-sm ${decisions[a.row_number]?.action === 'import_as_settlement' ? 'btn-primary' : 'btn-secondary'}`}
                    onClick={() => setDecision(a.row_number, 'import_as_settlement')}>
                    Import as Settlement
                  </button>
                )}
              </div>
            </div>
          ))}

          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '2rem' }}>
            <button className="btn btn-secondary" onClick={() => setStep(1)}>
              <ArrowLeft size={16} /> Back
            </button>
            <button className="btn btn-primary btn-lg" onClick={() => setStep(3)}>
              Review Summary <ArrowRight size={18} />
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Confirm */}
      {step === 3 && (
        <div className="card">
          <h2 style={{ fontSize: '1.2rem', fontWeight: 600, marginBottom: '1.5rem' }}>Import Summary</h2>
          <div className="stats-row">
            <div className="stat-card">
              <div className="stat-value green">
                {Object.values(decisions).filter(d => d.action === 'import' || d.action === 'import_modified').length}
              </div>
              <div className="stat-label">Will Import as Expense</div>
            </div>
            <div className="stat-card">
              <div className="stat-value blue">
                {Object.values(decisions).filter(d => d.action === 'import_as_settlement').length}
              </div>
              <div className="stat-label">Will Import as Settlement</div>
            </div>
            <div className="stat-card">
              <div className="stat-value red">
                {Object.values(decisions).filter(d => d.action === 'skip').length}
              </div>
              <div className="stat-label">Will Skip</div>
            </div>
          </div>

          <div style={{ marginTop: '1.5rem' }}>
            <h3 style={{ fontSize: '1rem', marginBottom: '0.75rem', color: 'var(--text-secondary)' }}>Row Decisions:</h3>
            {Object.values(decisions).map(d => (
              <div key={d.row_number} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem 0', borderBottom: '1px solid var(--border-color)', fontSize: '0.85rem' }}>
                <span>Row {d.row_number}: {d.row_data?.description || 'Unknown'}</span>
                <span className={`badge ${d.action === 'skip' ? 'badge-danger' : d.action === 'import_as_settlement' ? 'badge-warning' : 'badge-success'}`}>
                  {d.action}
                </span>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '2rem' }}>
            <button className="btn btn-secondary" onClick={() => setStep(2)}>
              <ArrowLeft size={16} /> Back to Review
            </button>
            <button className="btn btn-primary btn-lg" onClick={handleConfirm} disabled={loading}>
              {loading ? 'Importing...' : 'Confirm & Import'} <CheckCircle size={18} />
            </button>
          </div>
        </div>
      )}

      {/* Step 4: Report */}
      {step === 4 && report && (
        <div className="card">
          <h2 style={{ fontSize: '1.2rem', fontWeight: 600, marginBottom: '1.5rem' }}>
            <CheckCircle size={20} color="var(--accent)" style={{ verticalAlign: 'middle', marginRight: '0.5rem' }} />
            Import Complete
          </h2>
          <div className="stats-row">
            <div className="stat-card"><div className="stat-value green">{report.processed}</div><div className="stat-label">Processed</div></div>
            <div className="stat-card"><div className="stat-value red">{report.skipped}</div><div className="stat-label">Skipped</div></div>
          </div>

          <div className="report-section">
            <h3 className="report-title">Import Details</h3>
            {report.results?.map((r, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem 0', borderBottom: '1px solid var(--border-color)', fontSize: '0.85rem' }}>
                <span>Row {r.row_number}</span>
                <span className={`badge ${r.action === 'error' || r.action === 'skipped' ? 'badge-danger' : r.action.includes('settlement') ? 'badge-warning' : 'badge-success'}`}>
                  {r.action} {r.reason ? `(${r.reason})` : ''}
                </span>
              </div>
            ))}
          </div>

          <div style={{ textAlign: 'center', marginTop: '2rem' }}>
            <button className="btn btn-primary btn-lg" onClick={() => navigate(`/groups/${id}`)}>
              <FileText size={18} /> Go to Group
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
