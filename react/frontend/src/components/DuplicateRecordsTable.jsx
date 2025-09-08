import React, { useMemo, useState } from 'react';
import { 
  useReactTable, 
  getCoreRowModel, 
  getSortedRowModel, 
  getFilteredRowModel,
  flexRender,
  createColumnHelper
} from '@tanstack/react-table';

const columnHelper = createColumnHelper();

const DuplicateRecordsTable = ({ duplicateRecords, siteId }) => {
  const [sorting, setSorting] = useState([]);
  const [globalFilter, setGlobalFilter] = useState('');

  const columns = useMemo(() => [
    columnHelper.accessor('timestamp', {
      header: 'Duplicate Timestamp',
      cell: info => (
        <div style={{ fontSize: '11px', fontFamily: 'monospace' }}>
          {info.getValue()?.slice(0, 19).replace('T', ' ')}
        </div>
      ),
      size: 140
    }),
    columnHelper.accessor('site_code', {
      header: 'Site',
      cell: info => (
        <div style={{ fontSize: '12px', fontWeight: 'bold', color: '#495057' }}>
          {info.getValue()}
        </div>
      ),
      size: 60
    }),
    columnHelper.accessor(row => `${row.duplicate_index}/${row.total_in_group}`, {
      id: 'position',
      header: 'Position',
      cell: info => (
        <span style={{ 
          fontSize: '11px', 
          fontWeight: 'bold',
          color: info.row.original.duplicate_index === 1 ? '#28a745' : '#ffc107'
        }}>
          {info.getValue()}
        </span>
      ),
      size: 70
    }),
    columnHelper.accessor('value', {
      header: 'Measured Value',
      cell: info => {
        const value = info.getValue();
        return (
          <span style={{ fontSize: '11px' }}>
            {value !== null && value !== undefined 
              ? (typeof value === 'number' ? value.toFixed(3) : String(value))
              : '-'
            }
          </span>
        );
      },
      size: 100
    }),
    columnHelper.accessor('depth_cm', {
      header: 'Depth (cm)',
      cell: info => {
        const depth = info.getValue();
        return (
          <span style={{ fontSize: '11px', color: '#495057' }}>
            {depth !== null && depth !== undefined ? `${depth} cm` : '-'}
          </span>
        );
      },
      size: 80
    }),
    columnHelper.accessor('duplicate_group', {
      header: 'Timestamp Group',
      cell: info => (
        <div style={{ 
          fontSize: '10px', 
          fontFamily: 'monospace',
          color: '#6c757d',
          overflow: 'hidden',
          textOverflow: 'ellipsis'
        }}>
          {info.getValue()}
        </div>
      ),
      size: 180
    })
  ], []);

  const table = useReactTable({
    data: duplicateRecords,
    columns,
    state: {
      sorting,
      globalFilter
    },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    debugTable: false
  });

  if (!duplicateRecords.length) {
    return (
      <div style={{ 
        padding: '20px', 
        textAlign: 'center', 
        color: '#6c757d', 
        fontSize: '14px' 
      }}>
        <i className="bi bi-check-circle me-2" style={{ color: '#28a745' }}></i>
        No duplicate records found for site {siteId}
      </div>
    );
  }

  return (
    <div className="duplicate-records-table">
      {/* Header with search and stats */}
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center', 
        marginBottom: '12px',
        padding: '8px 12px',
        background: '#f8f9fa',
        borderRadius: '4px'
      }}>
        <div style={{ fontSize: '13px', fontWeight: '600' }}>
          <i className="bi bi-exclamation-triangle me-2" style={{ color: '#dc3545' }}></i>
          Duplicate Records for Site {siteId}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ fontSize: '12px', color: '#6c757d' }}>
            {table.getFilteredRowModel().rows.length} of {duplicateRecords.length} records
          </span>
          <input
            type="text"
            placeholder="Search duplicates..."
            value={globalFilter}
            onChange={e => setGlobalFilter(e.target.value)}
            style={{
              padding: '4px 8px',
              fontSize: '12px',
              border: '1px solid #ced4da',
              borderRadius: '3px',
              width: '180px'
            }}
          />
        </div>
      </div>

      {/* Table */}
      <div style={{ 
        maxHeight: '400px', 
        overflow: 'auto',
        border: '1px solid #dee2e6',
        borderRadius: '4px'
      }}>
        <table style={{ 
          width: '100%', 
          fontSize: '12px',
          borderCollapse: 'collapse'
        }}>
          <thead style={{ 
            background: '#f8f9fa',
            position: 'sticky',
            top: 0,
            zIndex: 1
          }}>
            {table.getHeaderGroups().map(headerGroup => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map(header => (
                  <th
                    key={header.id}
                    style={{
                      padding: '8px 12px',
                      textAlign: 'left',
                      fontWeight: '600',
                      fontSize: '11px',
                      textTransform: 'uppercase',
                      color: '#495057',
                      borderBottom: '2px solid #dee2e6',
                      cursor: header.column.getCanSort() ? 'pointer' : 'default',
                      userSelect: 'none',
                      width: header.getSize()
                    }}
                    onClick={header.column.getToggleSortingHandler()}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      {flexRender(header.column.columnDef.header, header.getContext())}
                      {header.column.getCanSort() && (
                        <i className={`bi ${
                          header.column.getIsSorted() === 'asc' ? 'bi-chevron-up' :
                          header.column.getIsSorted() === 'desc' ? 'bi-chevron-down' :
                          'bi-chevron-expand'
                        }`} style={{ fontSize: '10px', color: '#6c757d' }}></i>
                      )}
                    </div>
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map(row => (
              <tr 
                key={row.id}
                style={{
                  borderBottom: '1px solid #dee2e6',
                  background: row.original.duplicate_index === 1 ? '#f8f9fa' : 'white'
                }}
              >
                {row.getVisibleCells().map(cell => (
                  <td
                    key={cell.id}
                    style={{
                      padding: '8px 12px',
                      verticalAlign: 'top'
                    }}
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Footer with insights */}
      <div style={{ 
        marginTop: '8px', 
        padding: '8px 12px',
        background: '#fff3cd',
        border: '1px solid #ffeaa7',
        borderRadius: '4px',
        fontSize: '11px',
        color: '#856404'
      }}>
        <strong>💡 Insights:</strong> True duplicates are multiple records with identical timestamps at the same site. 
        There should be only 1 record per timestamp per site. Multiple entries indicate data ingestion issues, 
        sensor malfunctions, or ETL pipeline problems.
      </div>
    </div>
  );
};

export default DuplicateRecordsTable;