import React, { useEffect, useState } from 'react';
import { getUploadHistory, uploadFile } from '../services/api';
import EmptyState from '../components/modern/EmptyState';
import MetricCard from '../components/modern/MetricCard';

/**
 * Modern Upload Page - Professional File Upload Interface
 * Uses design system tokens and modern layout
 */
const ModernUpload = () => {
  const [uploadHistory, setUploadHistory] = useState(null);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [historyError, setHistoryError] = useState(null);
  const [selectedFile, setSelectedFile] = useState(null);
  const [dataType, setDataType] = useState('');
  const [uploadStatus, setUploadStatus] = useState('');
  const [uploadError, setUploadError] = useState(null);
  const [dragActive, setDragActive] = useState(false);
  // S3 demo state
  const [s3Items, setS3Items] = useState([]);
  const [s3Loading, setS3Loading] = useState(false);
  const [s3Error, setS3Error] = useState(null);
  const [s3Prefix, setS3Prefix] = useState('');
  const [s3NextToken, setS3NextToken] = useState(null);
  const [s3Configured, setS3Configured] = useState(false);

  useEffect(() => {
    const fetchUploadHistory = async () => {
      try {
        const data = await getUploadHistory();
        // API returns an object with uploads array and metadata
        const list = Array.isArray(data) ? data : (Array.isArray(data?.uploads) ? data.uploads : []);
        setUploadHistory(list);
      } catch (err) {
        setHistoryError(err.message || String(err));
        setUploadHistory([]);
      } finally {
        setLoadingHistory(false);
      }
    };

    fetchUploadHistory();
  }, []);

  const fetchS3 = async (opts = {}) => {
    try {
      setS3Loading(true);
      setS3Error(null);
      const resp = await listS3Objects({ prefix: opts.prefix ?? s3Prefix, token: opts.token ?? null, pageSize: 25 });
      setS3Items(Array.isArray(resp?.items) ? resp.items : []);
      setS3NextToken(resp?.nextToken || null);
      setS3Configured(!!resp?.configured);
    } catch (e) {
      setS3Error(e?.message || String(e));
      setS3Items([]);
    } finally {
      setS3Loading(false);
    }
  };

  const handleFileChange = (event) => {
    const file = event.target.files[0];
    setSelectedFile(file);
    setUploadError(null);
  };

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      setSelectedFile(e.dataTransfer.files[0]);
      setUploadError(null);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile || !dataType) {
      setUploadError('Please select a file and data type');
      return;
    }

    setUploadStatus('uploading');
    setUploadError(null);

    try {
      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('data_type', dataType);
      await uploadFile(formData);
      setUploadStatus('success');
      setSelectedFile(null);
      setDataType('');
      
      // Refresh upload history
      const data = await getUploadHistory();
      const list = Array.isArray(data) ? data : (Array.isArray(data?.uploads) ? data.uploads : []);
      setUploadHistory(list);
    } catch (err) {
      setUploadError(err.message);
      setUploadStatus('error');
    }
  };

  const getUploadStats = () => {
    if (!Array.isArray(uploadHistory)) {
      return {
        totalUploads: 0,
        successfulUploads: 0,
        recentUploads: 0,
        dataQuality: 'No Data'
      };
    }

    const total = uploadHistory.length;
    const successful = uploadHistory.filter(u => String(u.status || '').startsWith('success')).length;
    const recent = uploadHistory.filter(u => {
      const ts = u.uploaded_at || u.timestamp || u.created_at;
      const uploadDate = ts ? new Date(ts) : null;
      if (!uploadDate || isNaN(uploadDate.getTime())) return false;
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);
      return uploadDate > weekAgo;
    }).length;

    return {
      totalUploads: total,
      successfulUploads: successful,
      recentUploads: recent,
      dataQuality: total > 0 ? `${((successful / total) * 100).toFixed(1)}%` : 'No Data'
    };
  };

  const stats = getUploadStats();

  return (
    <div className="modern-dashboard">
      {/* Header */}
      <div className="dashboard-header">
        <div>
          <h1 className="dashboard-title">Data Upload</h1>
          <p className="dashboard-subtitle">
            Upload water quality data files for processing and analysis
          </p>
        </div>
      </div>

      {/* Main Content */}
      <div className="main-content">
        {/* Upload Statistics */}
        <div className="metrics-grid">
          <MetricCard
            title="Total Uploads"
            value={stats.totalUploads.toString()}
            icon="cloud-upload"
            status={stats.totalUploads > 0 ? "good" : "unknown"}
            context="All time uploads"
          />
          <MetricCard
            title="Success Rate"
            value={stats.dataQuality}
            icon="check-circle"
            status={stats.successfulUploads === stats.totalUploads && stats.totalUploads > 0 ? "excellent" : stats.totalUploads > 0 ? "good" : "unknown"}
            context="Upload success rate"
          />
          <MetricCard
            title="Recent Uploads"
            value={stats.recentUploads.toString()}
            icon="calendar"
            status={stats.recentUploads > 0 ? "good" : "unknown"}
            context="Last 7 days"
          />
          <MetricCard
            title="File Types"
            value="CSV, Excel"
            icon="file-earmark-text"
            status="good"
            context="Supported formats"
          />
        </div>

        {/* Upload Interface */}
        <div className="upload-container">
          <div className="upload-header">
            <h2 className="section-title">
              <i className="bi bi-cloud-upload" style={{ marginRight: '12px' }}></i>
              Upload New Data
            </h2>
          </div>

          <div className="upload-form">
            {/* File Drop Zone */}
            <div
              className={`file-drop-zone ${dragActive ? 'drag-active' : ''} ${selectedFile ? 'has-file' : ''}`}
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
              onClick={() => document.getElementById('file-input').click()}
            >
              <input
                id="file-input"
                type="file"
                accept=".csv,.xlsx,.xls"
                onChange={handleFileChange}
                style={{ display: 'none' }}
              />
              
              <div className="drop-zone-content">
                {selectedFile ? (
                  <>
                    <div className="file-icon selected">
                      <i className="bi bi-file-earmark-check"></i>
                    </div>
                    <h3 className="drop-zone-title">File Selected</h3>
                    <p className="drop-zone-description">{selectedFile.name}</p>
                    <p className="file-size">{(selectedFile.size / 1024).toFixed(1)} KB</p>
                  </>
                ) : (
                  <>
                    <div className="file-icon">
                      <i className="bi bi-cloud-upload"></i>
                    </div>
                    <h3 className="drop-zone-title">Drop files here or click to browse</h3>
                    <p className="drop-zone-description">
                      Support for CSV and Excel files up to 10MB
                    </p>
                  </>
                )}
              </div>
            </div>

            {/* Data Type Selection */}
            <div className="form-group">
              <label className="form-label">Data Type</label>
              <select
                value={dataType}
                onChange={(e) => setDataType(e.target.value)}
                className="form-select modern-select"
              >
                <option value="">Select data type</option>
                <option value="water_quality">Water Quality Measurements</option>
                <option value="redox_data">Redox Analysis Data</option>
                <option value="site_metadata">Site Metadata</option>
                <option value="calibration_data">Calibration Data</option>
              </select>
            </div>

            {/* Upload Status */}
            {uploadStatus && (
              <div className={`upload-status ${uploadStatus}`}>
                {uploadStatus === 'uploading' && (
                  <>
                    <i className="bi bi-arrow-repeat spin"></i>
                    <span>Uploading file...</span>
                  </>
                )}
                {uploadStatus === 'success' && (
                  <>
                    <i className="bi bi-check-circle"></i>
                    <span>Upload successful!</span>
                  </>
                )}
                {uploadStatus === 'error' && (
                  <>
                    <i className="bi bi-exclamation-circle"></i>
                    <span>Upload failed</span>
                  </>
                )}
              </div>
            )}

            {/* Error Display */}
            {uploadError && (
              <div className="error-message">
                <i className="bi bi-exclamation-triangle"></i>
                <span>{uploadError}</span>
              </div>
            )}

            {/* Upload Button */}
            <div className="upload-actions">
              <button
                onClick={handleUpload}
                disabled={!selectedFile || !dataType || uploadStatus === 'uploading'}
                className={`btn ${selectedFile && dataType ? 'btn-primary' : 'btn-outline-secondary'} shadow-interactive transition-all`}
              >
                {uploadStatus === 'uploading' ? (
                  <>
                    <i className="bi bi-arrow-repeat spin" style={{ marginRight: '8px' }}></i>
                    Uploading...
                  </>
                ) : (
                  <>
                    <i className="bi bi-cloud-upload" style={{ marginRight: '8px' }}></i>
                    Upload File
                  </>
                )}
              </button>
              
              {selectedFile && (
                <button
                  onClick={() => {
                    setSelectedFile(null);
                    setUploadError(null);
                    setUploadStatus('');
                  }}
                  className="btn btn-outline-secondary shadow-interactive transition-all"
                >
                  <i className="bi bi-x-circle" style={{ marginRight: '8px' }}></i>
                  Clear
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Upload History */}
        <div className="upload-history-container">
          <div className="upload-header">
            <h2 className="section-title">
              <i className="bi bi-clock-history" style={{ marginRight: '12px' }}></i>
              Upload History
            </h2>
          </div>

          {loadingHistory ? (
            <EmptyState
              type="loading"
              title="Loading Upload History"
              description="Fetching your recent uploads..."
            />
          ) : historyError ? (
            <EmptyState
              type="error"
              title="Failed to Load History"
              description={historyError}
            />
          ) : !uploadHistory || uploadHistory.length === 0 ? (
            <EmptyState
              type="no-data"
              title="No Upload History"
              description="You haven't uploaded any files yet. Upload your first data file to get started."
              illustration={<i className="bi bi-cloud-upload"></i>}
            />
          ) : (
            <div className="history-list">
              {uploadHistory.slice(0, 10).map((upload, index) => (
                <div key={index} className="history-item component-slide-in">
                  <div className="history-icon">
                    <i className={`bi ${upload.status === 'success' ? 'bi-check-circle status-excellent' : 'bi-exclamation-circle status-poor'}`}></i>
                  </div>
                  <div className="history-content">
                    <h4 className="history-title">{upload.filename || 'Unknown File'}</h4>
                    <p className="history-description">
                      {upload.data_type || 'Unknown Type'} • {new Date(upload.timestamp).toLocaleString()}
                    </p>
                  </div>
                  <div className={`history-status ${upload.status}`}>
                    {upload.status === 'success' ? 'Success' : 'Failed'}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* S3 Browser (Demo-Safe) */}
        <div className="upload-container" style={{ marginTop: 24 }}>
          <div className="upload-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h2 className="section-title">
              <i className="bi bi-folder2-open" style={{ marginRight: '12px' }}></i>
              S3 Browser {s3Configured ? '' : '(Demo)'}
            </h2>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                type="text"
                className="form-input"
                placeholder="Prefix (e.g., uploads/)"
                value={s3Prefix}
                onChange={(e)=> setS3Prefix(e.target.value)}
                style={{ minWidth: 240 }}
              />
              <button className="btn btn-outline-secondary btn-sm" onClick={()=> fetchS3({ prefix: s3Prefix, token: null })} disabled={s3Loading} title="Refresh S3 list">
                <i className={`bi ${s3Loading ? 'bi-arrow-repeat' : 'bi-arrow-clockwise'} me-1`}></i>
                Refresh
              </button>
              {s3NextToken && (
                <button className="btn btn-outline-primary btn-sm" onClick={()=> fetchS3({ prefix: s3Prefix, token: s3NextToken })} disabled={s3Loading} title="Load next page">
                  Next Page
                </button>
              )}
            </div>
          </div>
          {s3Error && (
            <div className="alert-message alert-error" style={{ marginBottom: 8 }}>
              <div className="alert-content">
                <i className="bi bi-exclamation-triangle"></i>
                <span>{s3Error}</span>
              </div>
            </div>
          )}
          <div className="table-responsive" style={{ overflowX: 'auto' }}>
            <table className="modern-table">
              <thead>
                <tr>
                  <th style={{ width: '60%' }}>Key</th>
                  <th>Size</th>
                  <th>Last Modified</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {s3Loading ? (
                  <tr><td colSpan={4} style={{ textAlign: 'center', color: '#6c757d' }}>Loading…</td></tr>
                ) : s3Items.length === 0 ? (
                  <tr><td colSpan={4} style={{ textAlign: 'center', color: '#6c757d' }}>No objects found</td></tr>
                ) : (
                  s3Items.map((it, idx) => (
                    <tr key={`${it.key}|${idx}`}>
                      <td style={{ fontFamily: 'monospace' }}>{it.key}</td>
                      <td>{(Number(it.size || 0)/1024).toFixed(1)} KB</td>
                      <td>{it.lastModified ? String(it.lastModified).replace('T',' ').replace('Z','') : '-'}</td>
                      <td>
                        <button
                          className="btn btn-outline-secondary btn-sm"
                          onClick={async ()=> {
                            try {
                              const res = await getS3PresignedGetUrl(it.key);
                              const url = res?.url;
                              if (url) window.open(url, '_blank');
                            } catch (e) { /* ignore */ }
                          }}
                        >
                          View
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ModernUpload;
