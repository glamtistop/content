"use client";
import { useEffect } from "react";
import { BASE_PATH } from "@/lib/config";

/** Registers the service worker so ContentPilot installs as an app and opens offline. */
export function SWRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register(`${BASE_PATH}/sw.js`, { scope: `${BASE_PATH}/` }).catch(() => {});
  }, []);
  return null;
}
