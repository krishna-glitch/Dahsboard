import React from 'react';
import DataTable from '../../components/modern/DataTable';

// START: REDOX DETAILS VIEW ENHANCEMENTS (uses modern DataTable with compact density, pinning, columns menu)
const RedoxTablePanel = React.memo(function RedoxTablePanel({ data, columns, loading, selectedSites, startDate, endDate }) {
  // Enable virtualization for large datasets (>200 rows)
  const shouldVirtualize = data && data.length > 200;
  
  return (
    <div style={{ marginTop: '0.5rem' }}>
      {/* START: prefer larger first-page to show multi-site rows */}
      <DataTable
        data={data}
        columns={columns}
        title="Redox Data"
        loading={loading}
        exportFilename={`redox_${(selectedSites||[]).join('_')}_${(startDate||'').replaceAll('-','')}_${(endDate||'').replaceAll('-','')}`}
        searchable={true}
        sortable={true}
        paginated={!shouldVirtualize} // Disable pagination when virtualizing
        virtualized={shouldVirtualize}
        maxHeight={500}
        rowHeight={45}
        pageSize={200}
        className="compact redox-data-table"
      />
      {/* END: prefer larger first-page to show multi-site rows */}
    </div>
  );
});

// END: REDOX DETAILS VIEW ENHANCEMENTS

export default RedoxTablePanel;
