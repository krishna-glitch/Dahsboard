import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import Button from 'react-bootstrap/Button';
import Form from 'react-bootstrap/Form';
import InputGroup from 'react-bootstrap/InputGroup';
import Dropdown from 'react-bootstrap/Dropdown';
import ButtonGroup from 'react-bootstrap/ButtonGroup';
import ExportButton from '../ExportButton';

/**
 * Professional Data Table Component
 * Modern, sortable, filterable data table for scientific data analysis
 */
const DataTable = ({ 
  data = [], 
  columns = [], 
  title = "Data Table",
  loading = false,
  exportFilename = "data_export",
  searchable = true,
  sortable = true,
  paginated = true,
  pageSize = 50,
  virtualized = false,
  maxHeight = 400,
  rowHeight = 45,
  className = "",
  onRowClick = null,
  onRowSelect = null,
  pinnable = true
}) => {
  // Table state
  const [sortColumn, setSortColumn] = useState(null);
  const [sortDirection, setSortDirection] = useState('asc');
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [compact, setCompact] = useState(false);
  const [visibleKeys, setVisibleKeys] = useState(new Set(columns.map(c => c.key)));
  const [pageSizeState, setPageSizeState] = useState(pageSize);
  
  // Virtualization state
  const [scrollTop, setScrollTop] = useState(0);
  const containerRef = useRef(null);
  const [containerHeight] = useState(maxHeight);

  // Columns dropdown visibility (controlled for proper close UX)
  const [columnsOpen, setColumnsOpen] = useState(false);

  // Reset visible keys when column definitions change
  useEffect(() => {
    setVisibleKeys(new Set(columns.map(c => c.key)));
  }, [columns]);
  const [selectedPageRows, setSelectedPageRows] = useState(new Set());
  const [pinnedRowHashes, setPinnedRowHashes] = useState(new Set());

  const getRowHash = useCallback((row) => {
    try {
      const keys = Object.keys(row || {}).sort();
      return JSON.stringify(row, keys);
    } catch {
      return String(row?.id ?? Math.random());
    }
  }, []);

  const isPinned = useCallback((row) => pinnedRowHashes.has(getRowHash(row)), [pinnedRowHashes, getRowHash]);
  const togglePin = useCallback((row) => {
    const hash = getRowHash(row);
    setPinnedRowHashes(prev => {
      const next = new Set(prev);
      if (next.has(hash)) next.delete(hash); else next.add(hash);
      return next;
    });
  }, [getRowHash]);

  // Filter and sort data
  const filteredData = useMemo(() => {
    if (!searchTerm.trim()) return data;
    
    return data.filter(row => 
      Object.values(row).some(value => 
        value?.toString().toLowerCase().includes(searchTerm.toLowerCase())
      )
    );
  }, [data, searchTerm]);

  const sortedData = useMemo(() => {
    if (!sortColumn || !sortable) return filteredData;
    
    return [...filteredData].sort((a, b) => {
      const aValue = a[sortColumn];
      const bValue = b[sortColumn];
      
      // Handle different data types
      let comparison = 0;
      if (typeof aValue === 'number' && typeof bValue === 'number') {
        comparison = aValue - bValue;
      } else if (aValue instanceof Date && bValue instanceof Date) {
        comparison = aValue.getTime() - bValue.getTime();
      } else {
        comparison = String(aValue).localeCompare(String(bValue));
      }
      
      return sortDirection === 'asc' ? comparison : -comparison;
    });
  }, [filteredData, sortColumn, sortDirection, sortable]);

  // If the current sort column is hidden, reset sort state
  useEffect(() => {
    if (sortColumn && !visibleKeys.has(sortColumn)) {
      setSortColumn(null);
      setSortDirection('asc');
    }
  }, [visibleKeys, sortColumn]);

  // Pagination
  const totalPages = Math.ceil(sortedData.length / pageSizeState);
  const paginatedData = useMemo(() => {
    if (!paginated) return sortedData;
    // Bring pinned rows to top before paging
    const withPins = [...sortedData].sort((a, b) => (isPinned(b) ? 1 : 0) - (isPinned(a) ? 1 : 0));
    const start = (currentPage - 1) * pageSizeState;
    const end = start + pageSizeState;
    return withPins.slice(start, end);
  }, [sortedData, currentPage, pageSizeState, paginated, isPinned]);

  // Virtualization logic
  const virtualizedData = useMemo(() => {
    if (!virtualized) return null;
    
    const dataToVirtualize = sortedData; // Always use full sorted data for virtualization
    const visibleRowCount = Math.ceil(containerHeight / rowHeight) + 5; // +5 buffer rows
    const startIndex = Math.floor(scrollTop / rowHeight);
    const endIndex = Math.min(startIndex + visibleRowCount, dataToVirtualize.length);
    
    return {
      visibleRows: dataToVirtualize.slice(startIndex, endIndex),
      startIndex,
      endIndex,
      totalHeight: dataToVirtualize.length * rowHeight,
      offsetY: startIndex * rowHeight
    };
  }, [virtualized, sortedData, scrollTop, containerHeight, rowHeight]);

  // Select data source based on mode
  const dataToRender = useMemo(() => {
    if (virtualized && virtualizedData) {
      return virtualizedData.visibleRows;
    }
    return paginatedData;
  }, [virtualized, virtualizedData, paginatedData]);

  // Virtualized scroll handler
  const handleScroll = useCallback((e) => {
    setScrollTop(e.target.scrollTop);
  }, []);

  // Handle sorting
  const handleSort = useCallback((columnKey) => {
    if (!sortable) return;
    
    if (sortColumn === columnKey) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(columnKey);
      setSortDirection('asc');
    }
  }, [sortable, sortColumn, sortDirection]);

  // Handle row selection
  const handleRowSelect = useCallback((rowIndex, isSelected) => {
    if (!onRowSelect) return;
    
    const newSelected = new Set(selectedPageRows);
    if (isSelected) {
      newSelected.add(rowIndex);
    } else {
      newSelected.delete(rowIndex);
    }
    setSelectedPageRows(newSelected);
    
    // Call parent handler with actual row data
    const selectedRowsData = Array.from(newSelected).map(index => paginatedData[index]);
    onRowSelect(selectedRowsData);
  }, [onRowSelect, selectedPageRows, paginatedData]);

  // Reset pagination when data changes
  useEffect(() => {
    setCurrentPage(1);
  }, [data, searchTerm]);

  // Stable callbacks for performance optimization
  const handleSearchChange = useCallback((e) => {
    setSearchTerm(e.target.value);
  }, []);

  const handleClearSearch = useCallback(() => {
    setSearchTerm('');
  }, []);

  const handleToggleColumn = useCallback((colKey) => {
    setVisibleKeys(prev => {
      const newSet = new Set(prev);
      if (newSet.has(colKey)) {
        newSet.delete(colKey);
      } else {
        newSet.add(colKey);
      }
      return newSet;
    });
  }, []);

  const handleToggleCompact = useCallback(() => {
    setCompact(v => !v);
  }, []);

  const handlePageSizeChange = useCallback((e) => {
    setCurrentPage(1);
    setPageSizeState(parseInt(e.target.value) || 10);
  }, []);

  const handleSortClick = useCallback((columnKey) => {
    handleSort(columnKey);
  }, [handleSort]);

  const handleRowClick = useCallback((row, index) => {
    // Toggle highlight selection for quick compare
    setSelectedPageRows(prev => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index); else next.add(index);
      return next;
    });
    if (onRowClick) onRowClick(row, index);
  }, [onRowClick]);

  const handleFirstPage = useCallback(() => {
    setCurrentPage(1);
  }, []);

  const handlePrevPage = useCallback(() => {
    setCurrentPage(currentPage - 1);
  }, [currentPage]);

  const handleNextPage = useCallback(() => {
    setCurrentPage(currentPage + 1);
  }, [currentPage]);

  // Additional complex callbacks  
  const handleSelectAll = useCallback((e) => {
    if (e.target.checked) {
      const allIndexes = new Set(Array.from({ length: paginatedData.length }, (_, i) => i));
      setSelectedPageRows(allIndexes);
      onRowSelect?.(paginatedData);
    } else {
      setSelectedPageRows(new Set());
      onRowSelect?.([]);
    }
  }, [paginatedData, onRowSelect]);

  const handleRowCheckChange = useCallback((e, index) => {
    e.stopPropagation();
    handleRowSelect(index, e.target.checked);
  }, [handleRowSelect]);

  const handlePageClick = useCallback((page) => {
    setCurrentPage(page);
  }, []);

  const handleLastPage = useCallback(() => {
    setCurrentPage(totalPages);
  }, [totalPages]);

  // Memoized table row component to prevent unnecessary re-renders
  const TableRow = React.memo(({ row, index, isSelected }) => (
    <tr 
      className={`${onRowClick ? 'clickable-row' : ''} ${isSelected ? 'selected-row' : ''} ${isPinned(row) ? 'pinned-row' : ''}`}
      onClick={() => handleRowClick(row, index)}
    >
      {pinnable && (
        <td className="data-table-pin-col">
          <button 
            type="button" 
            className={`pin-btn ${isPinned(row) ? 'active' : ''}`}
            title={isPinned(row) ? 'Unpin row' : 'Pin row'}
            onClick={(e) => { e.stopPropagation(); togglePin(row); }}
          >
            <i className={`bi ${isPinned(row) ? 'bi-pin-angle-fill' : 'bi-pin'}`}></i>
          </button>
        </td>
      )}
      {onRowSelect && (
        <td className="data-table-checkbox-col">
          <Form.Check
            type="checkbox"
            checked={isSelected}
            onChange={(e) => handleRowCheckChange(e, index)}
          />
        </td>
      )}
      {[...visibleKeys].map((key) => {
        const column = columns.find(c => c.key === key);
        if (!column) return null;
        return (
          <td key={column.key} className="data-table-td">
            {formatCellValue(row[column.key], column, row)}
          </td>
        );
      })}
    </tr>
  ));

  // Format cell value for display
  const formatCellValue = (value, column, row) => {
    if (value == null) return '-';
    
    if (column.format) {
      try {
        // Support (value) and (value, row) signatures
        return column.format.length >= 2 ? column.format(value, row) : column.format(value);
      } catch {
        return column.format(value);
      }
    }
    
    // Auto-format common data types
    if (typeof value === 'number') {
      // Check if it looks like a decimal with scientific precision
      if (Math.abs(value) > 0 && Math.abs(value) < 0.001) {
        return value.toExponential(2);
      }
      // Round to 3 decimal places for readability
      return Number(value.toFixed(3));
    }
    
    if (value instanceof Date) {
      return value.toLocaleDateString();
    }
    
    return String(value);
  };

  const getSortIcon = (columnKey) => {
    if (sortColumn !== columnKey) return <i className="bi bi-arrow-down-up text-muted"></i>;
    return sortDirection === 'asc' 
      ? <i className="bi bi-arrow-up text-primary"></i>
      : <i className="bi bi-arrow-down text-primary"></i>;
  };

  const getPaginationItems = () => {
    const items = [];
    const maxVisible = 5;
    let start = Math.max(1, currentPage - Math.floor(maxVisible / 2));
    let end = Math.min(totalPages, start + maxVisible - 1);
    
    if (end - start + 1 < maxVisible) {
      start = Math.max(1, end - maxVisible + 1);
    }
    
    for (let i = start; i <= end; i++) {
      items.push(i);
    }
    
    return items;
  };

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
    <div className={`modern-data-table ${compact ? 'compact' : ''} ${className}`}>
      {/* Table Header */}
      <div className="data-table-header">
        <div className="header-row">
          <div>
            <h3 className="data-table-title">{title}</h3>
            <p className="data-table-subtitle">
              {filteredData.length.toLocaleString()} records
              {searchTerm && ` (filtered from ${data.length.toLocaleString()})`}
            </p>
          </div>
          
          <div className="data-table-actions">
            {searchable && (
              <InputGroup style={{ maxWidth: 320 }}>
                <InputGroup.Text>
                  <i className="bi bi-search"></i>
                </InputGroup.Text>
                <Form.Control
                  type="text"
                  placeholder="Search data..."
                  value={searchTerm}
                  onChange={handleSearchChange}
                />
                {searchTerm && (
                  <Button 
                    variant="outline-secondary" 
                    onClick={handleClearSearch}
                    className="border-start-0"
                  >
                    <i className="bi bi-x"></i>
                  </Button>
                )}
              </InputGroup>
            )}
            {/* Column visibility */}
            <Dropdown
              as={ButtonGroup}
              align="end"
              className="columns-menu"
              show={columnsOpen}
              onToggle={(isOpen, e, meta) => {
                try { console.log('[DataTable] onToggle columns dropdown', { isOpen, source: meta?.source }); } catch { /* ignore */ }
                setColumnsOpen(isOpen);
              }}
            >
              <Button
                variant="outline-secondary"
                size="sm"
                className="columns-btn"
                onClick={() => {
                  try { console.log('[DataTable] Main Columns button clicked', { columnsOpenBefore: columnsOpen }); } catch { /* ignore */ }
                  setColumnsOpen(v => !v);
                }}
              >
                <i className="bi bi-columns-gap me-1"></i> Columns
              </Button>
              <Dropdown.Toggle
                split
                variant="outline-secondary"
                id="columns-split"
                size="sm"
                className="columns-toggle"
                onClick={() => {
                  try { console.log('[DataTable] Toggle clicked', { columnsOpenBefore: columnsOpen }); } catch { /* ignore */ }
                  setColumnsOpen(v => !v);
                }}
              />
              {columnsOpen && (
                <Dropdown.Menu
                  className="columns-dropdown-menu"
                  onClick={(e) => { try { console.log('[DataTable] Menu click', { target: e.target?.outerHTML?.slice(0, 80) }); } catch { /* ignore */ } }}
                >
                <div className="d-flex justify-content-between align-items-center px-2 py-1" style={{borderBottom: '1px solid var(--border-primary)'}}>
                  <span style={{fontSize: '0.85rem', color: 'var(--text-secondary)'}}>Show/Hide Columns</span>
                  <button
                    type="button"
                    className="btn btn-sm btn-light"
                    aria-label="Close"
                    onMouseDown={(e) => { try { console.log('[DataTable] Close X mousedown', { targetTag: e.target?.tagName }); } catch { /* ignore */ } }}
                    onClick={(e) => {
                      try { console.log('[DataTable] Close X clicked', { columnsOpenBefore: columnsOpen, target: e.target?.tagName }); } catch { /* ignore */ }
                      e.preventDefault();
                      e.stopPropagation();
                      setColumnsOpen(false);
                    }}
                    style={{border: '1px solid var(--border-primary)', borderRadius: 8}}
                  >
                    <i className="bi bi-x"></i>
                  </button>
                </div>
                {columns.map(col => (
                  <Dropdown.Item as="button" key={col.key} onClick={() => handleToggleColumn(col.key)}>
                    <Form.Check
                      type="checkbox"
                      id={`col-${col.key}`}
                      label={col.label}
                      checked={visibleKeys.has(col.key)}
                      readOnly
                    />
                  </Dropdown.Item>
                ))}
                </Dropdown.Menu>
              )}
            </Dropdown>
            {/* Density toggle */}
            <Button
              variant={compact ? 'primary' : 'outline-secondary'}
              size="sm"
              onClick={handleToggleCompact}
              title={compact ? 'Switch to comfortable' : 'Switch to compact'}
              className="density-btn"
            >
              <i className={`bi ${compact ? 'bi-arrows-expand' : 'bi-arrows-collapse'} me-1`}></i>
              {compact ? 'Comfort' : 'Compact'}
            </Button>
            {/* Page size selector */}
            {paginated && (
              <Form.Select
                size="sm"
                value={pageSizeState}
                onChange={handlePageSizeChange}
                aria-label="Rows per page"
                style={{ width: 100 }}
              >
                {[10, 25, 50, 100].map(sz => (
                  <option key={sz} value={sz}>{sz} rows</option>
                ))}
              </Form.Select>
            )}
            <ExportButton
              data={sortedData}
              filename={exportFilename}
              availableFormats={['csv', 'xlsx', 'json']}
              variant="outline-primary"
              size="sm"
              disabled={data.length === 0}
            />
          </div>
        </div>
        
      </div>

      {/* Table */}
      <div className={virtualized ? "virtualized-table-container" : "table-responsive"} 
           style={virtualized ? { height: maxHeight, overflowY: 'auto', position: 'relative' } : {}}
           onScroll={virtualized ? handleScroll : undefined}
           ref={virtualized ? containerRef : undefined}>
        <table className="data-table-modern" style={virtualized ? { position: 'relative' } : {}}>
          <thead className="data-table-head">
            <tr>
              {pinnable && (<th className="data-table-pin-col"></th>)}
              {onRowSelect && (
                <th className="data-table-checkbox-col">
                  <Form.Check
                    type="checkbox"
                    checked={selectedPageRows.size === dataToRender.length && dataToRender.length > 0}
                    onChange={handleSelectAll}
                  />
                </th>
              )}
              {[...visibleKeys].map((key) => {
                const column = columns.find(c => c.key === key);
                if (!column) return null;
                return (
                <th 
                  key={column.key}
                  className={`data-table-th ${sortable ? 'sortable' : ''}`}
                  onClick={() => handleSortClick(column.key)}
                  style={{ cursor: sortable ? 'pointer' : 'default' }}
                >
                  <div className="d-flex justify-content-between align-items-center">
                    <span>{column.label}</span>
                    {sortable && getSortIcon(column.key)}
                  </div>
                </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="data-table-body" style={virtualized && virtualizedData ? { display: 'block', position: 'relative', height: virtualizedData.totalHeight } : {}}>
            {virtualized && virtualizedData && (
              <tr style={{ height: virtualizedData.offsetY }}>
                <td style={{ padding: 0, border: 0 }} colSpan={columns.length + (onRowSelect ? 1 : 0) + (pinnable ? 1 : 0)} />
              </tr>
            )}
            {dataToRender.length === 0 ? (
              <tr>
                <td colSpan={columns.length + (onRowSelect ? 1 : 0) + (pinnable ? 1 : 0)} className="text-center py-4 text-muted">
                  {searchTerm ? 'No matching records found' : 'No data available'}
                </td>
              </tr>
            ) : (
              dataToRender.map((row, index) => (
                <TableRow
                  key={virtualized && virtualizedData ? virtualizedData.startIndex + index : index}
                  row={row}
                  index={virtualized && virtualizedData ? virtualizedData.startIndex + index : index}
                  isSelected={selectedPageRows.has(index)}
                />
              ))
            )}
            {virtualized && virtualizedData && (
              <tr style={{ height: Math.max(virtualizedData.totalHeight - virtualizedData.offsetY - (dataToRender.length * rowHeight), 0) }}>
                <td style={{ padding: 0, border: 0 }} colSpan={columns.length + (onRowSelect ? 1 : 0) + (pinnable ? 1 : 0)} />
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {paginated && totalPages > 1 && (
        <div className="data-table-pagination d-flex justify-content-between align-items-center mt-3">
          <div className="text-muted">
            Showing {((currentPage - 1) * pageSizeState) + 1} to {Math.min(currentPage * pageSizeState, sortedData.length)} of {sortedData.length} entries
          </div>
          
          <nav>
            <ul className="pagination pagination-sm mb-0">
              <li className={`page-item ${currentPage === 1 ? 'disabled' : ''}`}>
                <button 
                  className="page-link" 
                  onClick={handleFirstPage}
                  disabled={currentPage === 1}
                >
                  First
                </button>
              </li>
              <li className={`page-item ${currentPage === 1 ? 'disabled' : ''}`}>
                <button 
                  className="page-link" 
                  onClick={handlePrevPage}
                  disabled={currentPage === 1}
                >
                  Previous
                </button>
              </li>
              
              {getPaginationItems().map(page => (
                <li key={page} className={`page-item ${currentPage === page ? 'active' : ''}`}>
                  <button 
                    className="page-link" 
                    onClick={() => handlePageClick(page)}
                  >
                    {page}
                  </button>
                </li>
              ))}
              
              <li className={`page-item ${currentPage === totalPages ? 'disabled' : ''}`}>
                <button 
                  className="page-link" 
                  onClick={handleNextPage}
                  disabled={currentPage === totalPages}
                >
                  Next
                </button>
              </li>
              <li className={`page-item ${currentPage === totalPages ? 'disabled' : ''}`}>
                <button 
                  className="page-link" 
                  onClick={handleLastPage}
                  disabled={currentPage === totalPages}
                >
                  Last
                </button>
              </li>
            </ul>
          </nav>
        </div>
      )}
    </div>
  );
};

// Memoize the entire DataTable to prevent unnecessary re-renders
export default React.memo(DataTable);
