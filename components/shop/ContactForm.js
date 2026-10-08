"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/shop/api";
import { CONTACT_LIMITS, checkContactMessage } from "@/lib/shop/contact";
import { useStoreConfig } from "@/lib/shop/store-config";
import { Notice } from "@/components/shop/ui";
import { Field, describedBy } from "@/components/shop/checkout/parts";

// The Contact us form (D28): name, email, message, sent to customer service through the Worker (POST /api/contact),
// which checks the same rules again, saves the message and emails the team. A hidden field catches robots; Cloudflare
// Turnstile appears once the operator has set its keys (/api/store/config → contact.turnstileSiteKey).

const TURNSTILE_SCRIPT = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
const FIELDS = ["name", "email", "message"];

function useTurnstile(siteKey, container) {
  const [token, setToken] = useState("");
  const widget = useRef(null);
  useEffect(() => {
    if (!siteKey || !container.current) return undefined;
    let cancelled = false;
    const render = () => {
      if (cancelled || widget.current !== null || !window.turnstile) return;
      widget.current = window.turnstile.render(container.current, {
        sitekey: siteKey,
        theme: "dark",
        callback: setToken,
        "expired-callback": () => setToken(""),
        "error-callback": () => setToken(""),
      });
    };
    if (window.turnstile) render();
    else {
      const script = document.createElement("script");
      script.src = TURNSTILE_SCRIPT;
      script.async = true;
      script.onload = render;
      document.head.append(script);
    }
    return () => {
      cancelled = true;
    };
  }, [siteKey, container]);
  const reset = () => {
    setToken("");
    if (widget.current !== null) window.turnstile?.reset(widget.current);
  };
  return { token, reset };
}

export default function ContactForm() {
  const { config } = useStoreConfig();
  const siteKey = config?.contact?.turnstileSiteKey || null;
  const turnstileBox = useRef(null);
  const turnstile = useTurnstile(siteKey, turnstileBox);
  const [values, setValues] = useState({ name: "", email: "", message: "", company: "" });
  const [errors, setErrors] = useState({});
  const [status, setStatus] = useState("idle"); // idle | sending | sent
  const [problem, setProblem] = useState("");
  const [sentTo, setSentTo] = useState(null);

  const change = (name) => (event) => setValues((current) => ({ ...current, [name]: event.target.value }));

  async function submit(event) {
    event.preventDefault();
    setProblem("");
    const { value, errors: found } = checkContactMessage(values);
    if (siteKey && !turnstile.token) found.turnstile = "Please complete the check that you're not a robot.";
    setErrors(found);
    const first = [...FIELDS, "turnstile"].find((name) => found[name]);
    if (first) {
      document.getElementById(first === "turnstile" ? "contact-turnstile" : `contact-${first}`)?.focus();
      return;
    }
    setStatus("sending");
    try {
      await api("/api/contact", { method: "POST", body: { ...value, company: values.company, turnstileToken: turnstile.token || undefined } });
      setSentTo(value);
      setStatus("sent");
    } catch (error) {
      setStatus("idle");
      turnstile.reset();
      if (error.status === 400 && error.field && [...FIELDS, "turnstile"].includes(error.field)) {
        setErrors({ [error.field]: error.message });
        document.getElementById(error.field === "turnstile" ? "contact-turnstile" : `contact-${error.field}`)?.focus();
      } else {
        setProblem(error.message);
      }
    }
  }

  if (status === "sent") {
    return (
      <div data-contact-sent="" aria-live="polite">
        <Notice tone="success" title="Message sent">
          {`Thanks, ${sentTo.name}. We'll reply to ${sentTo.email} within 2 business days.`}
        </Notice>
      </div>
    );
  }

  return (
    <form className="stack contact-form" data-contact-form="" noValidate onSubmit={submit}>
      <Field name="contact-name" label="Name" error={errors.name}>
        <input id="contact-name" name="name" autoComplete="name" maxLength={CONTACT_LIMITS.name + 20} required value={values.name} onChange={change("name")}
          aria-invalid={errors.name ? "true" : "false"} aria-describedby={describedBy("contact-name", errors.name)} />
      </Field>
      <Field name="contact-email" label="Email" error={errors.email}>
        <input id="contact-email" name="email" type="email" autoComplete="email" inputMode="email" required value={values.email} onChange={change("email")}
          aria-invalid={errors.email ? "true" : "false"} aria-describedby={describedBy("contact-email", errors.email)} />
      </Field>
      <Field name="contact-message" label="Message" error={errors.message}>
        <textarea id="contact-message" name="message" rows={6} maxLength={CONTACT_LIMITS.message + 100} required value={values.message} onChange={change("message")}
          aria-invalid={errors.message ? "true" : "false"} aria-describedby={describedBy("contact-message", errors.message, "contact-message-hint")} />
        <span className="field__hint" id="contact-message-hint">Include your order number if you have one.</span>
      </Field>
      {/* Robots fill every field; people never see this one. */}
      <div className="contact-form__trap" aria-hidden="true">
        <label htmlFor="contact-company">Company</label>
        <input id="contact-company" name="company" tabIndex={-1} autoComplete="off" value={values.company} onChange={change("company")} />
      </div>
      {siteKey && (
        <div className="field" data-field="turnstile">
          <div id="contact-turnstile" ref={turnstileBox} tabIndex={-1} aria-label="Check that you're not a robot" />
          <span className="field__error" data-error="" hidden={!errors.turnstile}>{errors.turnstile}</span>
        </div>
      )}
      <div data-contact-message="" aria-live="assertive">
        {problem && <Notice tone="warning" title="Message not sent">{problem}</Notice>}
      </div>
      <div className="actions">
        <button className="btn" type="submit" disabled={status === "sending"}>
          {status === "sending" ? "Sending…" : <>Send message <span aria-hidden="true">→</span></>}
        </button>
      </div>
      <p className="contact-form__privacy">
        We use your details only to answer you. See our <a href="/privacy">Privacy Policy</a>.
      </p>
    </form>
  );
}
