"use client";

import { useCallback, useState } from "react";

export function useAsyncTask<TArgs extends unknown[], TResult>(task: (...args: TArgs) => Promise<TResult>) {
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const run = useCallback(async (...args: TArgs) => {
    setIsPending(true); setError(null);
    try { return await task(...args); }
    catch (reason) { const nextError = reason instanceof Error ? reason : new Error("Something went wrong."); setError(nextError); throw nextError; }
    finally { setIsPending(false); }
  }, [task]);
  return { run, isPending, error };
}
