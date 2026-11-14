import { useCallback, useEffect, useRef, useState } from "react";

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

  // Requests can overlap (a pull to refresh during a reload after a change) and finish
  // out of order. Only the one that set out last may say what the screen shows.
  const latest = useRef(0);

  const run = useCallback(async () => {
    const mine = ++latest.current;
    try {
      const loaded = await load();
      if (mine !== latest.current) return;
      setData(loaded);
      setError(null);
    } catch (caught) {
      if (mine === latest.current) setError(caught);
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
