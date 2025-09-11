import React, { useMemo, useState, useEffect } from 'react';
import {
  getCoreRowModel,
  getSortedRowModel,
  getPaginationRowModel,
  useReactTable,
  flexRender,
} from '@tanstack/react-table';

// A compact, high-performance details table using TanStack Table core with built-in pagination
// Props:
// - data: array of rows (objects)
// - columns: [{ key, label, format? }]
// - loading: boolean
// - pageSize (optional): default 100
// - className (optional)

function RedoxDetailsTableTanstack({ data = [], columns = [], loading = false, pageSize = 100, className = '' }) {
  const [sorting, setSorting] = useState([]);
  const [pageSizeState, setPageSizeState] = useState(pageSize);

  // Build TanStack column defs from provided columns
  const columnDefs = useMemo(() => {
    return columns.map(col => ({
      accessorKey: col.key,
      header: col.label,
      cell: info => {
        const value = info.getValue();
        if (col.format) {
          try { return col.format.length >= 2 ? col.format(value, info.row.original) : col.format(value); }
          catch { return String(value ?? '-'); }
        }
        if (value == null) return '-';
        if (typeof value === 'number') return Number.isFinite(value) ? Number(value.toFixed(3)) : '-';
        return String(value);
      },
    }));
  }, [columns]);

  const table = useReactTable({
    data,
    columns: columnDefs,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: pageSizeState } },
  });

  // Keep table pageSize in sync with selector
  useEffect(() => {
    table.setPageSize(pageSizeState);
  }, [pageSizeState]);

  if (loading) {
    return (
      <div className="data-table-skeleton">
        <div className="d-flex justify-content-between align-items-center mb-3">
          <div className="skeleton-text skeleton-title"></div>
          <div className="skeleton-text skeleton-button"></div>
        </div>
        <div className="skeleton-table">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="skeleton-row">
              {Array.from({ length: columns.length || 4 }).map((_, j) => (
                <div key={j} className="skeleton-cell"></div>
              ))}
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className={`tanstack-details-table ${className}`}>
      <div className="d-flex justify-content-between align-items-center mb-2">
        <div className="text-muted">{data.length.toLocaleString()} records</div>
        <div className="d-flex align-items-center" style={{ gap: 8 }}>
          <label className="text-muted" style={{ fontSize: '0.9rem' }}>Rows per page</label>
          <select value={pageSizeState} onChange={(e) => setPageSizeState(parseInt(e.target.value) || 50)} className="form-select form-select-sm" style={{ width: 100 }}>
            {[50, 100, 200, 500].map(sz => <option key={sz} value={sz}>{sz}</option>)}
          </select>
        </div>
      </div>
      <div className="table-responsive" style={{ maxHeight: 560 }}>
        <table className="table table-sm table-hover align-middle">
          <thead>
            {table.getHeaderGroups().map(headerGroup => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map(header => (
                  <th key={header.id} role="button" onClick={header.column.getToggleSortingHandler()}>
                    <div className="d-flex justify-content-between align-items-center">
                      {flexRender(header.column.columnDef.header, header.getContext())}
                      <span>
                        {{ asc: '▲', desc: '▼' }[header.column.getIsSorted()] ?? ''}
                      </span>
                    </div>
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map(row => (
              <tr key={row.id}>
                {row.getVisibleCells().map(cell => (
                  <td key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>
                ))}
              </tr>
            ))}
            {table.getRowModel().rows.length === 0 && (
              <tr>
                <td colSpan={columns.length} className="text-center text-muted py-4">No data available</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="d-flex justify-content-between align-items-center mt-2">
        <div className="text-muted" style={{ fontSize: '0.9rem' }}>
          Page {table.getState().pagination.pageIndex + 1} of {table.getPageCount()}
        </div>
        <div className="btn-group btn-group-sm">
          <button className="btn btn-outline-secondary" onClick={() => table.setPageIndex(0)} disabled={!table.getCanPreviousPage()}>
            « First
          </button>
          <button className="btn btn-outline-secondary" onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()}>
            ‹ Prev
          </button>
          <button className="btn btn-outline-secondary" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()}>
            Next ›
          </button>
          <button className="btn btn-outline-secondary" onClick={() => table.setPageIndex(table.getPageCount() - 1)} disabled={!table.getCanNextPage()}>
            Last »
          </button>
        </div>
      </div>
    </div>
  );
}

export default React.memo(RedoxDetailsTableTanstack);

