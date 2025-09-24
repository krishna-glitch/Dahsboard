import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  flexRender,
  createColumnHelper
} from '@tanstack/react-table';
import Button from 'react-bootstrap/Button';
import Form from 'react-bootstrap/Form';
import InputGroup from 'react-bootstrap/InputGroup';
import Dropdown from 'react-bootstrap/Dropdown';
import ButtonGroup from 'react-bootstrap/ButtonGroup';
import ExportButton from '../ExportButton';

/**
 * TanStack React Table Component
 * Modern, sortable, filterable data table with full feature parity
 * Replaces the custom DataTable with TanStack React Table
 */
const TanStackDataTable = ({
  data = [],
  columns = [],
  title = "Data Table",
  loading = false,
  exportFilename = "data_export",
  searchable = true,
  sortable = true,
  paginated = true,
  pageSize = 50,
  maxHeight = '70vh',
  className = "",
  onRowClick = null,
  onRowSelect = null
}) => {
  // Table state
  const [globalFilter, setGlobalFilter] = useState('');
  const [compact, setCompact] = useState(false);
  const [visibleColumns, setVisibleColumns] = useState(new Set(columns.map(c => c.key)));
  const [pageSizeState, setPageSizeState] = useState(pageSize);
  const [highlightedRowId, setHighlightedRowId] = useState(null);
  const lastTapRef = useRef({ time: 0, rowId: null });

  // Convert our column format to TanStack format
  const tanStackColumns = useMemo(() => {
    const columnHelper = createColumnHelper();

    return columns
      .filter(col => visibleColumns.has(col.key))
      .map(col => columnHelper.accessor(col.key, {
        header: col.label || col.key,
        cell: info => {
          const value = info.getValue();
          const formattedValue = col.format ? col.format(value) : value;
          return (
            <span
              className={`cell-content ${col.key === 'measurement_timestamp' ? 'timestamp-cell' : ''}`}
              title={typeof formattedValue === 'string' ? formattedValue : String(formattedValue || '')}
            >
              {formattedValue}
            </span>
          );
        },
        enableSorting: sortable,
        enableColumnFilter: true,
        filterFn: 'includesString'
      }));
  }, [columns, visibleColumns, sortable]);

  // Create table instance
  const table = useReactTable({
    data,
    columns: tanStackColumns,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    globalFilterFn: 'includesString',
    state: {
      globalFilter,
      pagination: {
        pageIndex: 0,
        pageSize: paginated ? pageSizeState : data.length
      }
    },
    onGlobalFilterChange: setGlobalFilter,
    initialState: {
      pagination: {
        pageSize: paginated ? pageSizeState : data.length
      }
    }
  });

  // Column visibility handlers
  const handleColumnToggle = useCallback((key) => {
    const newVisible = new Set(visibleColumns);
    if (newVisible.has(key)) {
      newVisible.delete(key);
    } else {
      newVisible.add(key);
    }
    setVisibleColumns(newVisible);
  }, [visibleColumns]);

  const handleSelectAllColumns = useCallback(() => {
    setVisibleColumns(new Set(columns.map(c => c.key)));
  }, [columns]);

  const handleDeselectAllColumns = useCallback(() => {
    setVisibleColumns(new Set());
  }, []);

  // Row click handler
  const handleRowClick = useCallback((row) => {
    if (onRowClick) {
      onRowClick(row.original);
    }
  }, [onRowClick]);

  const toggleRowHighlight = useCallback((rowId) => {
    setHighlightedRowId((current) => (current === rowId ? null : rowId));
  }, []);

  const handleRowDoubleClick = useCallback((row) => {
    toggleRowHighlight(row.id);
  }, [toggleRowHighlight]);

  const handleRowTouchEnd = useCallback((row) => {
    const now = Date.now();
    const { time: lastTime, rowId: lastRowId } = lastTapRef.current;
    if (now - lastTime < 350 && lastRowId === row.id) {
      toggleRowHighlight(row.id);
      lastTapRef.current = { time: 0, rowId: null };
    } else {
      lastTapRef.current = { time: now, rowId: row.id };
    }
  }, [toggleRowHighlight]);

  // Get visible data for export
  const visibleData = useMemo(() => {
    const rows = table.getFilteredRowModel().rows;
    return rows.map(row => row.original);
  }, [table]);

  const visibleRowIds = table.getRowModel().rows.map(row => row.id);

  useEffect(() => {
    if (highlightedRowId && !visibleRowIds.includes(highlightedRowId)) {
      setHighlightedRowId(null);
    }
  }, [highlightedRowId, visibleRowIds]);

  if (loading) {
    return (
      <div className="d-flex justify-content-center align-items-center" style={{ height: 200 }}>
        <div className="spinner-border text-primary" role="status">
          <span className="visually-hidden">Loading...</span>
        </div>
      </div>
    );
  }

  return (
    <div className={`data-table-container ${className}`}>
      {/* Header Controls */}
      <div className="table-header">
        <div className="d-flex justify-content-between align-items-center mb-3">
          <div className="d-flex align-items-center">
            <h5 className="mb-0 me-3">{title}</h5>
            <small className="text-muted">
              {table.getFilteredRowModel().rows.length.toLocaleString()}
              {globalFilter && ` of ${data.length.toLocaleString()}`} records
            </small>
          </div>

          <div className="d-flex gap-2 align-items-center">
            {/* Search */}
            {searchable && (
              <InputGroup style={{ width: '250px' }}>
                <InputGroup.Text>
                  <i className="bi bi-search"></i>
                </InputGroup.Text>
                <Form.Control
                  type="text"
                  placeholder="Search all columns..."
                  value={globalFilter}
                  onChange={(e) => setGlobalFilter(e.target.value)}
                />
                {globalFilter && (
                  <Button
                    variant="outline-secondary"
                    onClick={() => setGlobalFilter('')}
                    style={{ borderLeft: 'none' }}
                  >
                    <i className="bi bi-x"></i>
                  </Button>
                )}
              </InputGroup>
            )}

            {/* Column Visibility */}
            <Dropdown>
              <Dropdown.Toggle variant="outline-secondary" size="sm">
                <i className="bi bi-columns me-1"></i>
                Columns ({visibleColumns.size})
              </Dropdown.Toggle>
              <Dropdown.Menu style={{ maxHeight: '300px', overflowY: 'auto' }}>
                <Dropdown.Header>
                  <div className="d-flex justify-content-between">
                    <span>Column Visibility</span>
                    <div>
                      <Button
                        variant="link"
                        size="sm"
                        className="p-0 me-2"
                        onClick={handleSelectAllColumns}
                      >
                        All
                      </Button>
                      <Button
                        variant="link"
                        size="sm"
                        className="p-0"
                        onClick={handleDeselectAllColumns}
                      >
                        None
                      </Button>
                    </div>
                  </div>
                </Dropdown.Header>
                <Dropdown.Divider />
                {columns.map(col => (
                  <Dropdown.Item
                    key={col.key}
                    as="div"
                    className="d-flex align-items-center"
                    onClick={() => handleColumnToggle(col.key)}
                  >
                    <Form.Check
                      type="checkbox"
                      checked={visibleColumns.has(col.key)}
                      onChange={() => handleColumnToggle(col.key)}
                      label={col.label || col.key}
                      className="mb-0"
                    />
                  </Dropdown.Item>
                ))}
              </Dropdown.Menu>
            </Dropdown>

            {/* View Options */}
            <ButtonGroup size="sm">
              <Button
                variant={compact ? "outline-secondary" : "secondary"}
                onClick={() => setCompact(false)}
                title="Comfortable view"
              >
                <i className="bi bi-list"></i>
              </Button>
              <Button
                variant={compact ? "secondary" : "outline-secondary"}
                onClick={() => setCompact(true)}
                title="Compact view"
              >
                <i className="bi bi-justify"></i>
              </Button>
            </ButtonGroup>

            {/* Export */}
            <ExportButton
              data={visibleData}
              filename={exportFilename}
              availableFormats={['csv', 'json']}
              variant="outline-success"
              size="sm"
              disabled={visibleData.length === 0}
            />
          </div>
        </div>
      </div>

      {/* Table */}
      <div
        className={`table-responsive ${compact ? 'table-compact' : ''}`}
        style={{
          maxHeight: typeof maxHeight === 'number' ? `${maxHeight}px` : maxHeight,
          minHeight: '420px',
          overflowY: 'auto'
        }}
      >
        <table className="table table-hover table-sm">
          <thead className="table-light sticky-top">
            {table.getHeaderGroups().map(headerGroup => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map(header => (
                  <th
                    key={header.id}
                    style={{
                      cursor: header.column.getCanSort() ? 'pointer' : 'default',
                      userSelect: 'none',
                      position: 'relative'
                    }}
                    onClick={header.column.getToggleSortingHandler()}
                  >
                    <div className="d-flex align-items-center justify-content-between">
                      <span>
                        {flexRender(header.column.columnDef.header, header.getContext())}
                      </span>
                      {header.column.getCanSort() && (
                        <span className="sort-indicator ms-1">
                          {{
                            asc: <i className="bi bi-arrow-up text-primary"></i>,
                            desc: <i className="bi bi-arrow-down text-primary"></i>
                          }[header.column.getIsSorted()] ?? (
                            <i className="bi bi-arrow-down-up text-muted"></i>
                          )}
                        </span>
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
                onClick={() => handleRowClick(row)}
                onDoubleClick={() => handleRowDoubleClick(row)}
                onTouchEnd={() => handleRowTouchEnd(row)}
                style={{
                  cursor: onRowClick ? 'pointer' : 'default',
                  height: compact ? '35px' : '45px'
                }}
                className={`table-data-row${onRowClick ? ' table-row-clickable' : ''}${highlightedRowId === row.id ? ' table-row-highlight' : ''}`}
              >
                {row.getVisibleCells().map(cell => (
                  <td
                    key={cell.id}
                    style={{
                      maxWidth: '200px',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      padding: compact ? '0.25rem 0.5rem' : '0.5rem'
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

      {/* Pagination */}
      {paginated && (
        <div className="d-flex justify-content-between align-items-center mt-3">
          <div className="d-flex align-items-center gap-2">
            <small className="text-muted">Rows per page:</small>
            <Form.Select
              size="sm"
              style={{ width: 'auto' }}
              value={table.getState().pagination.pageSize}
              onChange={(e) => {
                const size = Number(e.target.value);
                table.setPageSize(size);
                setPageSizeState(size);
              }}
            >
              {[10, 25, 50, 100, 250].map(size => (
                <option key={size} value={size}>{size}</option>
              ))}
            </Form.Select>
          </div>

          <div className="d-flex align-items-center gap-2">
            <small className="text-muted">
              Page {table.getState().pagination.pageIndex + 1} of {table.getPageCount()}
            </small>
            <ButtonGroup size="sm">
              <Button
                variant="outline-secondary"
                onClick={() => table.setPageIndex(0)}
                disabled={!table.getCanPreviousPage()}
              >
                <i className="bi bi-chevron-double-left"></i>
              </Button>
              <Button
                variant="outline-secondary"
                onClick={() => table.previousPage()}
                disabled={!table.getCanPreviousPage()}
              >
                <i className="bi bi-chevron-left"></i>
              </Button>
              <Button
                variant="outline-secondary"
                onClick={() => table.nextPage()}
                disabled={!table.getCanNextPage()}
              >
                <i className="bi bi-chevron-right"></i>
              </Button>
              <Button
                variant="outline-secondary"
                onClick={() => table.setPageIndex(table.getPageCount() - 1)}
                disabled={!table.getCanNextPage()}
              >
                <i className="bi bi-chevron-double-right"></i>
              </Button>
            </ButtonGroup>
          </div>
        </div>
      )}

      {/* Custom CSS */}
      <style jsx>{`
        .table-data-row {
          transition: background-color 0.2s ease, box-shadow 0.2s ease;
        }

        .table-row-clickable:hover {
          background-color: var(--bs-primary-bg-subtle) !important;
        }

        .table-row-highlight {
          background-color: var(--bs-warning-bg-subtle) !important;
          box-shadow: inset 0 0 0 2px rgba(255, 193, 7, 0.35);
        }

        .cell-content {
          display: block;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .timestamp-cell {
          font-family: 'Courier New', monospace;
          font-size: 0.875rem;
        }

        .table-compact {
          font-size: 0.875rem;
        }

        .sort-indicator {
          opacity: 0.6;
          transition: opacity 0.2s;
        }

        th:hover .sort-indicator {
          opacity: 1;
        }

        .sticky-top {
          position: sticky;
          top: 0;
          z-index: 10;
          background-color: var(--bs-light) !important;
        }
      `}</style>
    </div>
  );
};

export default TanStackDataTable;
