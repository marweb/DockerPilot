import { useCallback, useMemo, useState } from 'react';

/**
 * Pagination hook options
 */
export interface UsePaginationOptions {
  /** Total number of items */
  totalItems: number;
  /** Items per page */
  itemsPerPage?: number;
  /** Initial page number (1-based) */
  initialPage?: number;
  /** Maximum number of page buttons to show */
  maxPageButtons?: number;
}

/**
 * Pagination hook return type
 */
export interface UsePaginationReturn {
  /** Current page number (1-based) */
  currentPage: number;
  /** Total number of pages */
  totalPages: number;
  /** Items per page */
  itemsPerPage: number;
  /** Total items count */
  totalItems: number;
  /** Go to specific page */
  goToPage: (page: number) => void;
  /** Go to next page */
  nextPage: () => void;
  /** Go to previous page */
  prevPage: () => void;
  /** Go to first page */
  firstPage: () => void;
  /** Go to last page */
  lastPage: () => void;
  /** Whether can go to next page */
  canGoNext: boolean;
  /** Whether can go to previous page */
  canGoPrev: boolean;
  /** Slice of items for current page */
  sliceItems: <T>(items: T[]) => T[];
  /** Page range for pagination buttons */
  pageRange: number[];
  /** Start index of current page (0-based) */
  startIndex: number;
  /** End index of current page (0-based, exclusive) */
  endIndex: number;
  /** Set items per page */
  setItemsPerPage: (count: number) => void;
  /** Reset to initial state */
  reset: () => void;
}

/**
 * Hook for managing pagination state
 *
 * @example
 * ```tsx
 * function ItemList({ items }: { items: Item[] }) {
 *   const {
 *     currentPage,
 *     totalPages,
 *     nextPage,
 *     prevPage,
 *     goToPage,
 *     canGoNext,
 *     canGoPrev,
 *     sliceItems,
 *     pageRange,
 *   } = usePagination({
 *     totalItems: items.length,
 *     itemsPerPage: 10,
 *   });
 *
 *   const paginatedItems = sliceItems(items);
 *
 *   return (
 *     <div>
 *       {paginatedItems.map(item => <Item key={item.id} {...item} />)}
 *
 *       <div className="pagination">
 *         <button onClick={prevPage} disabled={!canGoPrev}>Previous</button>
 *         {pageRange.map(page => (
 *           <button
 *             key={page}
 *             onClick={() => goToPage(page)}
 *             className={currentPage === page ? 'active' : ''}
 *           >
 *             {page}
 *           </button>
 *         ))}
 *         <button onClick={nextPage} disabled={!canGoNext}>Next</button>
 *       </div>
 *     </div>
 *   );
 * }
 * ```
 */
export function usePagination({
  totalItems,
  itemsPerPage: initialItemsPerPage = 10,
  initialPage = 1,
  maxPageButtons = 5,
}: UsePaginationOptions): UsePaginationReturn {
  const [currentPage, setCurrentPage] = useState(Math.max(1, initialPage));
  const [itemsPerPage, setItemsPerPageState] = useState(Math.max(1, initialItemsPerPage));

  /**
   * Calculate total pages
   */
  const totalPages = useMemo(() => {
    return Math.max(1, Math.ceil(totalItems / itemsPerPage));
  }, [totalItems, itemsPerPage]);

  /**
   * Ensure current page is valid
   */
  const validPage = useMemo(() => {
    return Math.min(Math.max(1, currentPage), totalPages);
  }, [currentPage, totalPages]);

  /**
   * Calculate page range for buttons
   */
  const pageRange = useMemo(() => {
    const halfButtons = Math.floor(maxPageButtons / 2);
    let start = Math.max(1, validPage - halfButtons);
    const end = Math.min(totalPages, start + maxPageButtons - 1);

    // Adjust if we're near the end
    if (end - start + 1 < maxPageButtons) {
      start = Math.max(1, end - maxPageButtons + 1);
    }

    return Array.from({ length: end - start + 1 }, (_, i) => start + i);
  }, [validPage, totalPages, maxPageButtons]);

  /**
   * Calculate start and end indices
   */
  const startIndex = useMemo(() => {
    return (validPage - 1) * itemsPerPage;
  }, [validPage, itemsPerPage]);

  const endIndex = useMemo(() => {
    return Math.min(startIndex + itemsPerPage, totalItems);
  }, [startIndex, itemsPerPage, totalItems]);

  /**
   * Go to specific page
   */
  const goToPage = useCallback(
    (page: number): void => {
      const targetPage = Math.min(Math.max(1, page), totalPages);
      setCurrentPage(targetPage);
    },
    [totalPages]
  );

  /**
   * Go to next page
   */
  const nextPage = useCallback((): void => {
    if (validPage < totalPages) {
      setCurrentPage(validPage + 1);
    }
  }, [validPage, totalPages]);

  /**
   * Go to previous page
   */
  const prevPage = useCallback((): void => {
    if (validPage > 1) {
      setCurrentPage(validPage - 1);
    }
  }, [validPage]);

  /**
   * Go to first page
   */
  const firstPage = useCallback((): void => {
    setCurrentPage(1);
  }, []);

  /**
   * Go to last page
   */
  const lastPage = useCallback((): void => {
    setCurrentPage(totalPages);
  }, [totalPages]);

  /**
   * Check if can go next/prev
   */
  const canGoNext = validPage < totalPages;
  const canGoPrev = validPage > 1;

  /**
   * Slice items array for current page
   */
  const sliceItems = useCallback(
    <T>(items: T[]): T[] => {
      return items.slice(startIndex, endIndex);
    },
    [startIndex, endIndex]
  );

  /**
   * Set items per page and reset to first page
   */
  const setItemsPerPage = useCallback((count: number): void => {
    setItemsPerPageState(Math.max(1, count));
    setCurrentPage(1);
  }, []);

  /**
   * Reset to initial state
   */
  const reset = useCallback((): void => {
    setCurrentPage(Math.max(1, initialPage));
    setItemsPerPageState(Math.max(1, initialItemsPerPage));
  }, [initialPage, initialItemsPerPage]);

  return {
    currentPage: validPage,
    totalPages,
    itemsPerPage,
    totalItems,
    goToPage,
    nextPage,
    prevPage,
    firstPage,
    lastPage,
    canGoNext,
    canGoPrev,
    sliceItems,
    pageRange,
    startIndex,
    endIndex,
    setItemsPerPage,
    reset,
  };
}

export default usePagination;
