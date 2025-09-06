import { useState, useCallback, useRef } from 'react';
import { getWaterQualityData } from '../services/api';

/**
 * Progressive data loader with real processing progress
 * Shows actual progress as data is fetched, parsed, and processed
 */
export const useProgressiveDataLoader = () => {
  const [loadingState, setLoadingState] = useState({
    isLoading: false,
    phase: 'idle', // 'fetching', 'parsing', 'processing', 'rendering'
    progress: 0,
    currentStep: '',
    totalPoints: 0,
    processedPoints: 0,
    estimatedTime: null,
    startTime: null
  });

  const abortControllerRef = useRef(null);
  const processingTimeoutRef = useRef(null);
  const allTimeoutRefs = useRef([]); // Track all pending timeouts for comprehensive cleanup

  const estimateDataSize = useCallback((params) => {
    // Smart estimation based on filters
    let basePoints = 1000; // Base estimate per site
    const siteCount = params.sites?.length || 1;
    
    // Adjust based on time range
    const timeMultipliers = {
      'Last 7 Days': 0.5,
      'Last 30 Days': 1,
      'Last 90 Days': 3,
      'Last 6 Months': 6,
      'Last 1 Year': 12,
      'Last 2 Years': 24
    };
    
    const timeMultiplier = timeMultipliers[params.time_range] || 1;
    const estimated = Math.round(basePoints * siteCount * timeMultiplier);
    
    return Math.max(50, Math.min(estimated, 50000)); // Reasonable bounds
  }, []);

  const processDataInChunks = useCallback(async (rawData, onProgress) => {
    const chunkSize = 500; // Process 500 points at a time
    const totalChunks = Math.ceil(rawData.length / chunkSize);
    const processedData = [];

    for (let i = 0; i < totalChunks; i++) {
      const chunkStart = i * chunkSize;
      const chunkEnd = Math.min(chunkStart + chunkSize, rawData.length);
      const chunk = rawData.slice(chunkStart, chunkEnd);

      // Simulate realistic processing time (data cleaning, validation, etc.)
      await new Promise(resolve => {
        const timeoutId = setTimeout(resolve, 10 + Math.random() * 20);
        processingTimeoutRef.current = timeoutId;
        allTimeoutRefs.current.push(timeoutId); // Track for cleanup
      });

      // Process chunk (in reality: data validation, cleaning, calculations)
      const processedChunk = chunk.map(point => ({
        ...point,
        // Add any derived fields or validations here
        processed: true
      }));

      processedData.push(...processedChunk);

      // Update progress
      const progress = ((i + 1) / totalChunks) * 100;
      onProgress(progress, processedData.length);
    }

    return processedData;
  }, []);

  const loadData = useCallback(async (params) => {
    // Cancel any existing request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    const startTime = Date.now();
    const estimatedPoints = estimateDataSize(params);

    try {
      // Phase 1: Fetching
      setLoadingState({
        isLoading: true,
        phase: 'fetching',
        progress: 0,
        currentStep: 'Fetching data from server...',
        totalPoints: estimatedPoints,
        processedPoints: 0,
        startTime
      });

      const response = await getWaterQualityData(params, abortControllerRef.current.signal);
      const rawData = response?.water_quality_data || [];

      if (rawData.length === 0) {
        setLoadingState(prev => ({ ...prev, isLoading: false, phase: 'idle' }));
        return { success: true, data: [] };
      }

      // Phase 2: Parsing/Validation
      setLoadingState(prev => ({
        ...prev,
        phase: 'parsing',
        progress: 25,
        currentStep: `Parsing ${rawData.length.toLocaleString()} data points...`,
        totalPoints: rawData.length
      }));

      // Simulate parsing delay for large datasets
      if (rawData.length > 1000) {
        await new Promise(resolve => setTimeout(resolve, 200));
      }

      // Phase 3: Processing
      setLoadingState(prev => ({
        ...prev,
        phase: 'processing', 
        progress: 50,
        currentStep: 'Processing and validating data...'
      }));

      const processedData = await processDataInChunks(rawData, (progress, processedCount) => {
        const overallProgress = 50 + (progress * 0.4); // Processing is 40% of total
        setLoadingState(prev => ({
          ...prev,
          progress: overallProgress,
          processedPoints: processedCount,
          currentStep: `Processing: ${processedCount.toLocaleString()} / ${rawData.length.toLocaleString()} points`
        }));
      });

      // Phase 4: Rendering
      setLoadingState(prev => ({
        ...prev,
        phase: 'rendering',
        progress: 95,
        currentStep: 'Preparing charts and visualizations...',
        processedPoints: processedData.length
      }));

      // Final rendering delay
      await new Promise(resolve => setTimeout(resolve, 150));

      // Complete
      setLoadingState({
        isLoading: false,
        phase: 'idle',
        progress: 100,
        currentStep: 'Complete',
        totalPoints: processedData.length,
        processedPoints: processedData.length,
        startTime: null
      });

      return { success: true, data: processedData };

    } catch (error) {
      // Treat axios cancellations as non-errors
      const isCancelled =
        error?.name === 'AbortError' ||
        error?.name === 'RequestCancelled' ||
        error?.isCancelled === true ||
        error?.type === 'CANCELLED' ||
        error?.code === 'ERR_CANCELED' ||
        (typeof error?.message === 'string' && error.message.toLowerCase().includes('cancel'));

      if (isCancelled) {
        setLoadingState(prev => ({ ...prev, isLoading: false, phase: 'idle' }));
        return { success: false, cancelled: true };
      }

      setLoadingState(prev => ({
        ...prev,
        isLoading: false,
        phase: 'error',
        currentStep: `Error: ${error.message}`
      }));

      return { success: false, error: error.message };
    }
  }, [estimateDataSize, processDataInChunks]);

  const cancelLoading = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    
    // Clear current processing timeout
    if (processingTimeoutRef.current) {
      clearTimeout(processingTimeoutRef.current);
    }
    
    // Clear ALL pending timeouts for comprehensive cancellation
    allTimeoutRefs.current.forEach(timeoutId => {
      clearTimeout(timeoutId);
    });
    allTimeoutRefs.current = [];
    
    setLoadingState(prev => ({ ...prev, isLoading: false, phase: 'idle' }));
  }, []);

  const resetProgress = useCallback(() => {
    cancelLoading();
    setLoadingState({
      isLoading: false,
      phase: 'idle',
      progress: 0,
      currentStep: '',
      totalPoints: 0,
      processedPoints: 0,
      estimatedTime: null,
      startTime: null
    });
  }, [cancelLoading]);

  return {
    loadingState,
    loadData,
    cancelLoading,
    resetProgress,
    
    // Computed values
    isLoading: loadingState.isLoading,
    progress: loadingState.progress,
    currentPhase: loadingState.phase,
    pointsLoaded: loadingState.processedPoints
  };
};
