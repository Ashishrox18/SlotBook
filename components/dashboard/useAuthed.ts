"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

/** Fetch a dashboard JSON endpoint, redirecting to login on 401. */
export function useAuthed<T>(url: string) {
  const router = useRouter();
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      try {
        const res = await fetch(url, { credentials: "include" });
        if (res.status === 401) {
          router.replace("/dashboard/login");
          return;
        }
        if (!res.ok) {
          setError("Request failed");
          return;
        }
        const json = (await res.json()) as T;
        if (active) setData(json);
      } catch {
        if (active) setError("Network error");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [url, router]);

  return { data, loading, error, setData };
}
