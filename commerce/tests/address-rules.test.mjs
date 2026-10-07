// Checkout field rules shared by the page and the Worker (prototype/js/commerce/address-rules.js, M3 §3.2).
import assert from "node:assert/strict";
import test from "node:test";

import {
  LIMITS,
  MESSAGES,
  SHIP_STATES,
  checkContact,
  checkShipping,
  formatUsPhone,
  isPoBoxOrMilitary,
  normalizeUsPhone,
  suggestEmail,
  zipMatchesState,
} from "../prototype/js/commerce/address-rules.js";

const ADDRESS = { firstName: "Ada", lastName: "Lee", street: "100 Example Ave", street2: "Apt 4", city: "Austin", state: "TX", zip: "78701" };
const errorsOf = (patch) => checkShipping({ ...ADDRESS, ...patch }).errors;

test("we ship to the 48 contiguous states and DC, nowhere else (M3-07)", () => {
  assert.equal(Object.keys(SHIP_STATES).length, 49);
  assert.ok(SHIP_STATES.DC);
  for (const code of ["AK", "HI", "PR", "GU", "VI", "AS", "MP", "AA", "AE", "AP"]) {
    assert.equal(SHIP_STATES[code], undefined, code);
    assert.deepEqual(errorsOf({ state: code }), { state: MESSAGES.state }, code);
  }
});

test("each state accepts its own ZIP codes (one per state, plus the odd prefixes)", () => {
  const capitals = {
    AL: "36104", AZ: "85001", AR: "72201", CA: "95814", CO: "80202", CT: "06103", DE: "19901", DC: "20001", FL: "32301",
    GA: "30303", ID: "83702", IL: "62701", IN: "46204", IA: "50309", KS: "66603", KY: "40601", LA: "70802", ME: "04330",
    MD: "21401", MA: "02108", MI: "48933", MN: "55102", MS: "39201", MO: "65101", MT: "59601", NE: "68508", NV: "89701",
    NH: "03301", NJ: "08608", NM: "87501", NY: "12207", NC: "27601", ND: "58501", OH: "43215", OK: "73102", OR: "97301",
    PA: "17101", RI: "02903", SC: "29201", SD: "57501", TN: "37219", TX: "78701", UT: "84111", VT: "05602", VA: "23219",
    WA: "98501", WV: "25301", WI: "53703", WY: "82001",
  };
  assert.deepEqual(Object.keys(capitals).sort(), Object.keys(SHIP_STATES).sort());
  for (const [state, zip] of Object.entries(capitals)) {
    assert.equal(zipMatchesState(zip, state), true, `${state} ${zip}`);
    assert.equal(zipMatchesState(`${zip}-1234`, state), true, `${state} ZIP+4`);
  }
  const odd = [["00501", "NY"], ["05501", "MA"], ["20166", "VA"], ["22201", "VA"], ["73301", "TX"], ["88510", "TX"], ["20500", "DC"],
    ["39901", "GA"], ["34102", "FL"], ["06390", "NY"], ["83414", "WY"], ["97635", "CA"], ["42223", "TN"], ["59221", "ND"]];
  for (const [zip, state] of odd) assert.equal(zipMatchesState(zip, state), true, `${zip} ${state}`);
});

test("a ZIP from another state, a territory or military mail does not match (M3-09)", () => {
  const wrong = [["10001", "NJ"], ["78701", "OK"], ["73301", "OK"], ["99501", "WA"], ["96813", "CA"], ["00901", "NY"], ["09001", "NJ"],
    ["34001", "FL"], ["96201", "CA"], ["05501", "VT"], ["20166", "DC"], ["1000", "NY"], ["abcde", "NY"]];
  for (const [zip, state] of wrong) assert.equal(zipMatchesState(zip, state), false, `${zip} ${state}`);
  assert.deepEqual(errorsOf({ zip: "10001" }), { zip: MESSAGES.zipState });
  assert.deepEqual(errorsOf({ zip: "7870" }), { zip: MESSAGES.zip });
});

test("PO boxes and military mail are refused in either address line or as the city (M3-08)", () => {
  const refused = ["PO Box 123", "P.O. Box 123", "P O Box 9", "po box 12", "POB 44", "Post Office Box 77", "Postal Box 5", "Box 12",
    "PO-Box 7", "Pobox 3", "General Delivery", "PSC 802 Box 74", "Unit 2050 Box 4190", "CMR 450 Box 1234"];
  for (const line of refused) {
    assert.equal(isPoBoxOrMilitary(line), true, line);
    assert.deepEqual(errorsOf({ street: line }), { street: MESSAGES.poBox }, line);
  }
  assert.deepEqual(errorsOf({ street2: "PO Box 5" }), { street2: MESSAGES.poBox });
  for (const city of ["APO", "FPO", "DPO", "a.p.o."]) assert.deepEqual(errorsOf({ city }), { city: MESSAGES.poBox }, city);
  const fine = ["123 Main St", "456 Boxwood Ln", "789 Box Elder Rd", "100 Pobrecito Dr", "PMB 123", "Suite 200", "Apt 4B", "Unit 5",
    "12 Post Office Rd", "1 Po Valley Rd", "20 Box Canyon Rd", "RR 2 Box 152", "1 Probate Ct"];
  for (const line of fine) assert.equal(isPoBoxOrMilitary(line), false, line);
  assert.deepEqual(errorsOf({ city: "Apopka" }), {});
});

test("lengths are Amazon's and too long is an error, never cut (M3-11)", () => {
  assert.deepEqual(LIMITS, { email: 254, name: 50, line: 60, city: 50 });
  assert.deepEqual(errorsOf({ street: `1 ${"A".repeat(58)}` }), {});
  assert.deepEqual(errorsOf({ street: `1 ${"A".repeat(59)}` }), { street: MESSAGES.lineTooLong });
  assert.deepEqual(errorsOf({ street2: "B".repeat(61) }), { street2: MESSAGES.lineTooLong });
  assert.deepEqual(errorsOf({ city: "C".repeat(51) }), { city: MESSAGES.cityTooLong });
  assert.deepEqual(errorsOf({ firstName: "F".repeat(25), lastName: "L".repeat(24) }), {});
  assert.deepEqual(errorsOf({ firstName: "F".repeat(25), lastName: "L".repeat(25) }), { lastName: MESSAGES.nameTooLong });
  const { value } = checkShipping({ ...ADDRESS, street: "  100   Example Ave ", state: "tx" });
  assert.equal(value.street, "100 Example Ave");
  assert.equal(value.state, "TX");
});

test("names use Latin letters and the usual punctuation", () => {
  for (const name of ["José", "O'Neil", "Mary-Jane", "Jr.", "Zoë", "D’Angelo"]) assert.deepEqual(errorsOf({ firstName: name }), {}, name);
  assert.deepEqual(errorsOf({ firstName: "李雷" }), { firstName: MESSAGES.firstName });
  assert.deepEqual(errorsOf({ lastName: "123" }), { lastName: MESSAGES.lastName });
  assert.deepEqual(errorsOf({ firstName: "", lastName: " " }), { firstName: MESSAGES.firstName, lastName: MESSAGES.lastName });
  assert.deepEqual(checkShipping({}).errors, {
    firstName: MESSAGES.firstName, lastName: MESSAGES.lastName, street: MESSAGES.street, city: MESSAGES.city, state: MESSAGES.state, zip: MESSAGES.zip,
  });
});

test("the phone is a 10-digit US number, stored as +1 and digits (M3-05)", () => {
  for (const input of ["(512) 555-0134", "512-555-0134", "512.555.0134", "+1 512 555 0134", "15125550134", "5125550134"]) {
    assert.equal(normalizeUsPhone(input), "+15125550134", input);
  }
  for (const input of ["555-0134", "012 555 0134", "512 155 0134", "+44 20 7946 0958", "512.555.0134 x12", "", "phone"]) {
    assert.equal(normalizeUsPhone(input), "", input);
  }
  assert.equal(formatUsPhone("+15125550134"), "(512) 555-0134");
  assert.deepEqual(checkContact({ email: " Ada@Example.com ", phone: "512 555 0134" }), { value: { email: "ada@example.com", phone: "+15125550134" }, errors: {} });
  assert.deepEqual(checkContact({ email: "nope", phone: "" }).errors, { email: MESSAGES.email, phone: MESSAGES.phone });
  assert.deepEqual(checkContact({ email: `${"a".repeat(250)}@b.co`, phone: "5125550134" }).errors, { email: MESSAGES.email });
});

test("common email misspellings get a hint; anything else none (M3-06)", () => {
  assert.equal(suggestEmail("ada@gmial.com"), "ada@gmail.com");
  assert.equal(suggestEmail(" Ada@Hotmial.com "), "ada@hotmail.com");
  assert.equal(suggestEmail("ada@yahoo.con"), "ada@yahoo.com");
  for (const email of ["ada@gmail.com", "ada@company.com", "nope", "@gmial.com", ""]) assert.equal(suggestEmail(email), "", email);
});
