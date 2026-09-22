"use client";
/* eslint-disable react-hooks/set-state-in-effect -- Clearing the notice stack on a route
   change is the behaviour this file was lifted from; the repo carries the same file-level
   exemption in workspace-header, workspace-nav, status-dot, console and system-client. */

import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

/* W2B §5.5 - the notice stack, lifted out of AuthorPage unchanged.
   X3 - a toast describes the thing that was in front of the operator when it was raised, so
   it never survives a move to another page. The selected-graphic and library-tab cases are
   cleared where that navigation happens (openDraft, beginNew, backToLibrary, chooseLibraryTab)
   because those same handlers raise the next toast in the same commit. */
export function useToasts() {
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const pathname = usePathname();

  useEffect(() => { setMessage(""); setError(""); }, [pathname]);
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessage(""), 3000);
    return () => clearTimeout(timer);
  }, [message]);

  const fail = useCallback((value: unknown) => {
    setError(value instanceof Error ? value.message : "Something went wrong.");
    setMessage("");
  }, []);

  return { message, setMessage, error, setError, fail };
}
