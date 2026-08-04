import { useState, useEffect } from "react";

// Pattern T: setTimeout wrapper around fetchSession
export function ProbeFetch3() {
  const [state, setState] = useState({ loading: true });

  const fetchSession = async () => {
    try {
      const res = await fetch("/api/auth/session", { credentials: "include" });
      if (res.ok) {
        setState({ loading: false });
      } else {
        setState({ loading: false });
      }
    } catch {
      setState({ loading: false });
    }
  };

  useEffect(() => {
    const t = setTimeout(() => void fetchSession(), 0);
    return () => clearTimeout(t);
  }, [fetchSession]);

  return <div>{String(state.loading)}</div>;
}

// Pattern U: microtask wrapper
export function ProbeFetch4() {
  const [state, setState] = useState({ loading: true });

  const fetchSession = async () => {
    try {
      const res = await fetch("/api/auth/session", { credentials: "include" });
      if (res.ok) {
        setState({ loading: false });
      } else {
        setState({ loading: false });
      }
    } catch {
      setState({ loading: false });
    }
  };

  useEffect(() => {
    const p = Promise.resolve().then(() => fetchSession());
    return () => {
      void p;
    };
  }, [fetchSession]);

  return <div>{String(state.loading)}</div>;
}
