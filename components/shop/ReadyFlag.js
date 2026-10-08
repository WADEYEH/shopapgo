"use client";

import { useEffect } from "react";
import { useStoreConfig } from "@/lib/shop/store-config";

// Marks <html data-{name}="true"> once the store config has answered (or failed): the page has its prices and is
// ready to use. Browser tests wait for it.
export default function ReadyFlag({ name }) {
  const { status } = useStoreConfig();
  useEffect(() => {
    if (status !== "loading") document.documentElement.dataset[name] = "true";
  }, [status, name]);
  return null;
}
