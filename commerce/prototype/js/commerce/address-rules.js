// Contact and shipping-address rules (docs/design/modules/M3-cart-checkout.md §3.2), shared by the checkout page and
// the Worker: the page checks first for the shopper's convenience, the Worker checks again and its answer is the one
// that counts. Pure data and functions, no DOM: worker/checkout.js imports this file too.

// Where we ship (D4): the 48 contiguous states and DC. No Alaska, Hawaii, territories or military (AA/AE/AP) codes.
export const SHIP_STATES = {
  AL: "Alabama", AZ: "Arizona", AR: "Arkansas", CA: "California", CO: "Colorado", CT: "Connecticut",
  DE: "Delaware", DC: "District of Columbia", FL: "Florida", GA: "Georgia", ID: "Idaho", IL: "Illinois",
  IN: "Indiana", IA: "Iowa", KS: "Kansas", KY: "Kentucky", LA: "Louisiana", ME: "Maine", MD: "Maryland",
  MA: "Massachusetts", MI: "Michigan", MN: "Minnesota", MS: "Mississippi", MO: "Missouri", MT: "Montana",
  NE: "Nebraska", NV: "Nevada", NH: "New Hampshire", NJ: "New Jersey", NM: "New Mexico", NY: "New York",
  NC: "North Carolina", ND: "North Dakota", OH: "Ohio", OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania",
  RI: "Rhode Island", SC: "South Carolina", SD: "South Dakota", TN: "Tennessee", TX: "Texas", UT: "Utah",
  VT: "Vermont", VA: "Virginia", WA: "Washington", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming",
};

// First three digits of the ZIP code per state (USPS prefix assignments). Military (090–098, 340, 962–966),
// Alaska, Hawaii and the territories are deliberately absent.
const ZIP3 = {
  AL: [[350, 369]], AZ: [[850, 865]], AR: [[716, 729]], CA: [[900, 961]], CO: [[800, 816]], CT: [[60, 69]],
  DE: [[197, 199]], DC: [[200, 200], [202, 205], [569, 569]], FL: [[320, 339], [341, 349]],
  GA: [[300, 319], [398, 399]], ID: [[832, 838]], IL: [[600, 629]], IN: [[460, 479]], IA: [[500, 528]],
  KS: [[660, 679]], KY: [[400, 427]], LA: [[700, 714]], ME: [[39, 49]], MD: [[206, 219]],
  MA: [[10, 27], [55, 55]], MI: [[480, 499]], MN: [[550, 567]], MS: [[386, 397]], MO: [[630, 658]],
  MT: [[590, 599]], NE: [[680, 693]], NV: [[889, 898]], NH: [[30, 38]], NJ: [[70, 89]], NM: [[870, 884]],
  NY: [[5, 5], [100, 149]], NC: [[270, 289]], ND: [[580, 588]], OH: [[430, 459]], OK: [[730, 731], [734, 749]],
  OR: [[970, 979]], PA: [[150, 196]], RI: [[28, 29]], SC: [[290, 299]], SD: [[570, 577]], TN: [[370, 385]],
  TX: [[733, 733], [750, 799], [885, 885]], UT: [[840, 847]], VT: [[50, 54], [56, 59]],
  VA: [[201, 201], [220, 246]], WA: [[980, 994]], WV: [[247, 268]], WI: [[530, 549]], WY: [[820, 831]],
};

// ZIP codes that also serve a town across a state line (the prefix belongs to the neighbouring state).
const ZIP_ALSO = {
  "06390": ["NY"], // Fishers Island, NY
  "42223": ["TN"], // Fort Campbell, KY/TN
  "59221": ["ND"], // Fairview, MT/ND
  "83414": ["WY"], // Alta, WY
  "97635": ["CA"], // New Pine Creek, OR/CA
};

// Amazon's limits for a fulfillment address (M6): the name line, each address line and the city.
export const LIMITS = { email: 254, name: 50, line: 60, city: 50 };

export const MESSAGES = {
  email: "Enter a valid email address.",
  phone: "Enter a 10-digit US phone number.",
  firstName: "Enter your first name using English letters.",
  lastName: "Enter your last name using English letters.",
  nameTooLong: `First and last name together can be up to ${LIMITS.name} characters.`,
  street: "Enter a street address.",
  poBox: "We can't ship to PO boxes or military addresses.",
  lineTooLong: `Use up to ${LIMITS.line} characters.`,
  city: "Enter a city.",
  cityTooLong: `Use up to ${LIMITS.city} characters.`,
  state: "We currently ship only to the 48 contiguous states and DC.",
  zip: "Enter a 5-digit ZIP code.",
  zipState: "This ZIP code doesn't match the state you selected.",
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ZIP_PATTERN = /^\d{5}(-\d{4})?$/;
// Latin letters (accents included), spaces and the punctuation names use: O'Neil, Smith-Jones, Jr.
const NAME_PATTERN = /^[\p{Script=Latin}][\p{Script=Latin}\s'’.,-]*$/u;
// PO Box, P.O. Box, POB, Post Office Box, Postal Box, a line that starts with "Box 12", General Delivery.
const PO_BOX = /\bp(?:ost)?[\s.-]*o(?:ffice)?[\s.-]*b(?:ox)?\b|\bpostal\s*box\b|^\s*box\s*#?\s*\d|\bgeneral\s+delivery\b/i;
// Military mail: PSC / CMR / Unit ... Box ..., and APO / FPO / DPO as the city.
const MILITARY_LINE = /\b(?:psc|cmr|unit)\s*#?\s*\d+\b.*\bbox\s*#?\s*\d+/i;
const MILITARY_CITY = /^\s*[adf]\.?\s*p\.?\s*o\.?\s*$/i;

const text = (value) => String(value ?? "").trim().replace(/\s+/g, " ");

export const isPoBoxOrMilitary = (line) => PO_BOX.test(line) || MILITARY_LINE.test(line);

export function zipMatchesState(zip, state) {
  const five = String(zip ?? "").slice(0, 5);
  if (!/^\d{5}$/.test(five) || !ZIP3[state]) return false;
  const prefix = Number(five.slice(0, 3));
  return ZIP3[state].some(([from, to]) => prefix >= from && prefix <= to) || (ZIP_ALSO[five] ?? []).includes(state);
}

// "+1" and 10 digits, or "" when it is not a dialable US number (area code and exchange cannot start with 0 or 1).
export function normalizeUsPhone(value) {
  const raw = String(value ?? "").trim();
  if (!/^\+?[\d\s().-]+$/.test(raw)) return "";
  let digits = raw.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) digits = digits.slice(1);
  return /^[2-9]\d{2}[2-9]\d{6}$/.test(digits) ? `+1${digits}` : "";
}

export const formatUsPhone = (e164) => {
  const digits = String(e164 ?? "").replace(/^\+1/, "");
  return /^\d{10}$/.test(digits) ? `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}` : "";
};

// Contact step. Returns { value, errors }: errors maps a field name to its message (empty object = valid).
export function checkContact(input = {}) {
  const email = text(input.email).toLowerCase();
  const phone = normalizeUsPhone(input.phone);
  const errors = {};
  if (!EMAIL_PATTERN.test(email) || email.length > LIMITS.email) errors.email = MESSAGES.email;
  if (!phone) errors.phone = MESSAGES.phone;
  return { value: { email, phone }, errors };
}

// Shipping step. Lengths are checked, never cut: a value that does not fit is an error the shopper fixes (M3-11).
export function checkShipping(input = {}) {
  const value = {
    firstName: text(input.firstName),
    lastName: text(input.lastName),
    street: text(input.street),
    street2: text(input.street2),
    city: text(input.city),
    state: text(input.state).toUpperCase(),
    zip: text(input.zip),
  };
  const errors = {};
  if (!NAME_PATTERN.test(value.firstName)) errors.firstName = MESSAGES.firstName;
  if (!NAME_PATTERN.test(value.lastName)) errors.lastName = MESSAGES.lastName;
  if (!errors.firstName && !errors.lastName && `${value.firstName} ${value.lastName}`.length > LIMITS.name) {
    errors.lastName = MESSAGES.nameTooLong;
  }
  if (!value.street) errors.street = MESSAGES.street;
  else if (isPoBoxOrMilitary(value.street)) errors.street = MESSAGES.poBox;
  else if (value.street.length > LIMITS.line) errors.street = MESSAGES.lineTooLong;
  if (isPoBoxOrMilitary(value.street2)) errors.street2 = MESSAGES.poBox;
  else if (value.street2.length > LIMITS.line) errors.street2 = MESSAGES.lineTooLong;
  if (!value.city) errors.city = MESSAGES.city;
  else if (MILITARY_CITY.test(value.city)) errors.city = MESSAGES.poBox;
  else if (value.city.length > LIMITS.city) errors.city = MESSAGES.cityTooLong;
  if (!SHIP_STATES[value.state]) errors.state = MESSAGES.state;
  if (!ZIP_PATTERN.test(value.zip)) errors.zip = MESSAGES.zip;
  else if (!errors.state && !zipMatchesState(value.zip, value.state)) errors.zip = MESSAGES.zipState;
  return { value, errors };
}

// Common misspellings of the big mail domains. A hint only: the shopper may keep what they typed (M3-06).
const DOMAIN_FIXES = {
  "gmail.com": ["gmial.com", "gmal.com", "gmai.com", "gamil.com", "gnail.com", "gmaill.com", "gmail.co", "gmail.con", "gmail.cm", "gmail.om"],
  "yahoo.com": ["yaho.com", "yahooo.com", "yhoo.com", "yahoo.co", "yahoo.con", "yahoo.cm"],
  "hotmail.com": ["hotmial.com", "hotmal.com", "hotmai.com", "hotmil.com", "hotmail.co", "hotmail.con"],
  "outlook.com": ["outlok.com", "outllok.com", "outloo.com", "outlook.co", "outlook.con"],
  "icloud.com": ["iclod.com", "icoud.com", "icloud.co", "icloud.con"],
  "aol.com": ["aol.co", "aol.con"],
};
const TYPO_TO_DOMAIN = Object.fromEntries(Object.entries(DOMAIN_FIXES).flatMap(([domain, typos]) => typos.map((typo) => [typo, domain])));

export function suggestEmail(email) {
  const value = text(email).toLowerCase();
  const at = value.lastIndexOf("@");
  if (at < 1) return "";
  const fixed = TYPO_TO_DOMAIN[value.slice(at + 1)];
  return fixed ? `${value.slice(0, at + 1)}${fixed}` : "";
}
