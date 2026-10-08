// Field rules for the Contact us form (D28): one copy for the page (lib/shop/contact.js) and the Worker
// (worker/contact.js), which checks again. Name, email and message; no order number needed. No DOM, no Worker APIs.

import { LIMITS } from "./address-rules.mjs";

export const CONTACT_LIMITS = { name: 100, email: LIMITS.email, message: 5000, minMessage: 10 };

export const CONTACT_MESSAGES = {
  name: "Enter your name.",
  email: "Enter a valid email address.",
  message: "Write a message of at least 10 characters.",
  tooLong: (limit) => `Keep this under ${limit} characters.`,
  busy: "We're receiving a lot of messages right now. Please try again later or email services@apgo.com.tw.",
  turnstile: "Please complete the check that you're not a robot.",
};

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const isEmail = (value) => EMAIL.test(value);

// Control characters out; the message keeps its line breaks and tabs.
export const cleanText = (value, { multiline = false } = {}) =>
  String(value ?? "")
    .replace(multiline ? /[\u0000-\u0008\u000b-\u001f\u007f]/g : /[\u0000-\u001f\u007f]/g, multiline ? "" : " ")
    .trim();

// { value: { name, email, message }, errors: { field: message } }
export function checkContactMessage(input = {}) {
  const value = {
    name: cleanText(input.name).replace(/\s+/g, " "),
    email: cleanText(input.email).toLowerCase(),
    message: cleanText(input.message, { multiline: true }),
  };
  const errors = {};
  if (!value.name) errors.name = CONTACT_MESSAGES.name;
  else if (value.name.length > CONTACT_LIMITS.name) errors.name = CONTACT_MESSAGES.tooLong(CONTACT_LIMITS.name);
  if (!isEmail(value.email) || value.email.length > CONTACT_LIMITS.email) errors.email = CONTACT_MESSAGES.email;
  if (value.message.length < CONTACT_LIMITS.minMessage) errors.message = CONTACT_MESSAGES.message;
  else if (value.message.length > CONTACT_LIMITS.message) errors.message = CONTACT_MESSAGES.tooLong(CONTACT_LIMITS.message);
  return { value, errors };
}
