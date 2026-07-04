import { useCallback, useState } from 'react';

/**
 * Pull-to-refresh over Convex live queries: data is already reactive, so
 * the gesture's job is REASSURANCE — give the websocket a beat to resettle
 * after a flaky-network stall, then release the spinner.
 */
export function usePullRefresh(delayMs = 900) {
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), delayMs);
  }, [delayMs]);
  return { refreshing, onRefresh };
}
