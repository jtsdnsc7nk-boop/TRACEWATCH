import { useCallback, useRef, useState } from "react";

export class ScanError extends Error {}

export async function requestJson<T>(url: string, body?: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: body === undefined ? "GET" : "POST",
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
      credentials: "omit",
      referrerPolicy: "no-referrer",
    });
  } catch {
    throw new ScanError("Network error: the TraceWatch server could not be reached.");
  }

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const message =
      payload && typeof payload === "object" && "error" in payload && typeof payload.error === "string"
        ? payload.error
        : `Request failed with HTTP ${response.status}.`;
    throw new ScanError(message);
  }
  return payload as T;
}

export interface ScanState<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
}

/** Runs a scan and keeps the result in component memory only: nothing touches storage. */
export function useScan<T>() {
  const [state, setState] = useState<ScanState<T>>({ data: null, error: null, loading: false });
  const sequence = useRef(0);

  const run = useCallback(async (task: () => Promise<T>) => {
    const current = ++sequence.current;
    setState({ data: null, error: null, loading: true });
    try {
      const data = await task();
      if (current === sequence.current) setState({ data, error: null, loading: false });
    } catch (error) {
      if (current !== sequence.current) return;
      const message = error instanceof Error ? error.message : "Unexpected error.";
      setState({ data: null, error: message, loading: false });
    }
  }, []);

  const reset = useCallback(() => {
    sequence.current += 1;
    setState({ data: null, error: null, loading: false });
  }, []);

  return { ...state, run, reset };
}
