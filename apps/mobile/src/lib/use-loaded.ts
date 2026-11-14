import { useCallback, useEffect, useState } from "react";

/**
 * Something fetched for a screen: the data, whether it is on its way, what went wrong,
 * and a way to fetch it again (pull to refresh, or after a change).
 *
 * `load` should be stable: wrap it in useCallback, or declare it outside the component.
 */
export function useLoaded<T>(load: () => Promise<T>) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const run = useCallback(async () => {
    try {
      setData(await load());
      setError(null);
    } catch (caught) {
      setError(caught);
    }
  }, [load]);

  useEffect(() => {
    let live = true;
    setLoading(true);
    run().finally(() => {
      if (live) setLoading(false);
    });
    return () => {
      live = false;
    };
  }, [run]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await run();
    setRefreshing(false);
  }, [run]);

  return { data, error, loading, refreshing, refresh, reload: run };
}
