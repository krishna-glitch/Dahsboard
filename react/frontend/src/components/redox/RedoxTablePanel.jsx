import React from 'react';
import RedoxDetailsTableTanstack from './RedoxDetailsTableTanstack';

// START: REDOX DETAILS VIEW ENHANCEMENTS (uses modern DataTable with compact density, pinning, columns menu)
const RedoxTablePanel = React.memo(function RedoxTablePanel({ data, columns, loading, selectedSites, startDate, endDate }) {
  // Enable virtualization for large datasets (>200 rows)
  return (
    <div style={{ marginTop: '0.5rem' }}>
      <RedoxDetailsTableTanstack
        data={data}
        columns={columns}
        loading={loading}
        pageSize={100}
        className="compact redox-data-table"
      />
    </div>
  );
});

// END: REDOX DETAILS VIEW ENHANCEMENTS

export default RedoxTablePanel;
