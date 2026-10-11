// Global Privacy Control (D46, M10-08, O7 pending counsel): a browser that sends GPC is asking us not to sell or share
// its data, which for this site means Meta. While the switch is on (lib/us/config.js honorGpc, the default), such a
// browser gets no Meta Pixel (public/js/meta-pixel.js checks the same signal) and its checkout sends no attribution, so
// the Worker sends no Conversions API events for that order. GA4 measurement is not affected.
import { config } from "@/lib/us/config";

export const gpcRequested = () => typeof navigator !== "undefined" && navigator.globalPrivacyControl === true;

export const shareBlocked = () => config.honorGpc && gpcRequested();
