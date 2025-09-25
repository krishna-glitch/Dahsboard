import React from 'react';
import Modal from 'react-bootstrap/Modal';
import DuplicateRecordsTable from './DuplicateRecordsTable';

const DuplicateRecordsModal = ({ show, onHide, site, duplicateRecords }) => {
  const duplicateCount = duplicateRecords?.length || 0;
  const totalDuplicates = site?.duplicates || 0;
  
  return (
    <Modal 
      show={show} 
      onHide={onHide} 
      size="xl"
      centered
    >
      <Modal.Header closeButton style={{ background: '#f8f9fa' }}>
        <Modal.Title style={{ fontSize: '18px', display: 'flex', alignItems: 'center' }}>
          <i className="bi bi-exclamation-triangle me-2" style={{ color: '#dc3545' }}></i>
          Duplicate Records - Site {site?.site_id}
          <span style={{ 
            marginLeft: '12px', 
            fontSize: '14px', 
            fontWeight: 'normal',
            color: '#6c757d'
          }}>
            {totalDuplicates.toLocaleString()} total duplicates • {duplicateCount} samples shown
          </span>
        </Modal.Title>
      </Modal.Header>
      
      <Modal.Body style={{ padding: '0' }}>
        <div style={{ padding: '20px' }}>
          {duplicateRecords && duplicateRecords.length > 0 ? (
            <DuplicateRecordsTable 
              duplicateRecords={duplicateRecords}
              siteId={site?.site_id}
            />
          ) : (
            <div style={{ 
              textAlign: 'center', 
              padding: '40px',
              color: '#6c757d'
            }}>
              <i className="bi bi-info-circle" style={{ fontSize: '48px', marginBottom: '16px' }}></i>
              <h5>No Detailed Duplicate Records Available</h5>
              <p>
                Site {site?.site_id} has {totalDuplicates} duplicate records, but detailed 
                information is not available. This could be due to:
              </p>
              <ul style={{ textAlign: 'left', display: 'inline-block', fontSize: '14px' }}>
                <li>Large number of duplicates (system limit reached)</li>
                <li>Data processing constraints</li>
                <li>Time range or filtering limitations</li>
              </ul>
              <p style={{ fontSize: '12px', marginTop: '16px' }}>
                Try adjusting your time range or site selection to view detailed duplicate records.
              </p>
            </div>
          )}
        </div>
      </Modal.Body>
      
      <Modal.Footer style={{ background: '#f8f9fa', borderTop: '1px solid #dee2e6' }}>
        <div style={{ 
          flex: 1, 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center' 
        }}>
          <div style={{ fontSize: '12px', color: '#6c757d' }}>
            <i className="bi bi-lightbulb me-1"></i>
            Duplicates occur when multiple records share the same time bucket
          </div>
          <button 
            className="btn btn-secondary btn-sm"
            onClick={onHide}
          >
            Close
          </button>
        </div>
      </Modal.Footer>
    </Modal>
  );
};

export default DuplicateRecordsModal;
