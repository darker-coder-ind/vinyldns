/*
 * Copyright 2018 Comcast Cable Communications Management, LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { describe, it, expect } from "vitest";
import {
  batchStatusClass,
  batchStatusLabel,
  approvalStatusClass,
  approvalStatusLabel,
  singleChangeRecordText,
} from "../../pages/DnsChangeDetailPage";
import type { SingleChange } from "../../types/dnsChange";

function change(overrides: Partial<SingleChange>): SingleChange {
  return {
    id: "sc-1",
    changeType: "Add",
    inputName: "host.example.",
    type: "A",
    ttl: 300,
    status: "Pending",
    record: { address: "1.2.3.4" },
    ...overrides,
  };
}

describe("batchStatusClass", () => {
  it.each([
    ["Complete", "vds-status-badge--success"],
    ["Failed", "vds-status-badge--danger"],
    ["PartialFailure", "vds-status-badge--warning"],
    ["PendingProcessing", "vds-status-badge--info"],
    ["PendingReview", "vds-status-badge--warning"],
    ["Rejected", "vds-status-badge--danger"],
    ["Scheduled", "vds-status-badge--info"],
    ["Cancelled", "vds-status-badge--secondary"],
  ])("maps %s → %s", (s, cls) => {
    expect(batchStatusClass(s)).toBe(cls);
  });

  it("falls back to secondary for unknown statuses", () => {
    expect(batchStatusClass("Whatever")).toBe("vds-status-badge--secondary");
  });
});

describe("batchStatusLabel", () => {
  it("humanises compound statuses", () => {
    expect(batchStatusLabel("PartialFailure")).toBe("Partial Failure");
    expect(batchStatusLabel("PendingProcessing")).toBe("Pending Processing");
    expect(batchStatusLabel("PendingReview")).toBe("Pending Review");
  });
  it("returns simple statuses unchanged", () => {
    expect(batchStatusLabel("Complete")).toBe("Complete");
  });
});

describe("approvalStatusClass", () => {
  it.each([
    ["PendingReview", "vds-status-badge--warning"],
    ["ManuallyApproved", "vds-status-badge--success"],
    ["ManuallyRejected", "vds-status-badge--danger"],
    ["Cancelled", "vds-status-badge--secondary"],
    ["AutoApproved", "vds-status-badge--secondary"],
  ])("maps %s → %s", (s, cls) => {
    expect(approvalStatusClass(s)).toBe(cls);
  });
});

describe("approvalStatusLabel", () => {
  it.each([
    ["PendingReview", "Pending Review"],
    ["ManuallyApproved", "Approved"],
    ["ManuallyRejected", "Rejected"],
    ["AutoApproved", "AutoApproved"],
  ])("maps %s → %s", (s, label) => {
    expect(approvalStatusLabel(s)).toBe(label);
  });
});

describe("singleChangeRecordText", () => {
  it("returns the address for A / AAAA / A+PTR / AAAA+PTR", () => {
    expect(
      singleChangeRecordText(
        change({ type: "A", record: { address: "1.1.1.1" } }),
      ),
    ).toBe("1.1.1.1");
    expect(
      singleChangeRecordText(
        change({ type: "AAAA", record: { address: "::1" } }),
      ),
    ).toBe("::1");
    expect(
      singleChangeRecordText(
        change({ type: "A+PTR", record: { address: "1.2.3.4" } }),
      ),
    ).toBe("1.2.3.4");
  });

  it("returns cname / ptrdname / nsdname for their respective types", () => {
    expect(
      singleChangeRecordText(
        change({ type: "CNAME", record: { cname: "alias.example." } }),
      ),
    ).toBe("alias.example.");
    expect(
      singleChangeRecordText(
        change({ type: "PTR", record: { ptrdname: "host.example." } }),
      ),
    ).toBe("host.example.");
    expect(
      singleChangeRecordText(
        change({ type: "NS", record: { nsdname: "ns1.example." } }),
      ),
    ).toBe("ns1.example.");
  });

  it("formats MX with both preference and exchange", () => {
    const text = singleChangeRecordText(
      change({
        type: "MX",
        record: { preference: 10, exchange: "mail.example." },
      }),
    );
    expect(text).toContain("Preference: 10");
    expect(text).toContain("Exchange: mail.example.");
  });

  it("formats SRV with priority, weight, port and target", () => {
    const text = singleChangeRecordText(
      change({
        type: "SRV",
        record: {
          priority: 10,
          weight: 20,
          port: 5060,
          target: "sip.example.",
        },
      }),
    );
    expect(text).toContain("Priority: 10");
    expect(text).toContain("Weight: 20");
    expect(text).toContain("Port: 5060");
    expect(text).toContain("Target: sip.example.");
  });

  it("formats NAPTR with all six fields", () => {
    const text = singleChangeRecordText(
      change({
        type: "NAPTR",
        record: {
          order: 100,
          preference: 50,
          flags: "U",
          service: "E2U+sip",
          regexp: "!^.*$!sip:test@example.!",
          replacement: ".",
        },
      }),
    );
    expect(text).toMatch(/Order: 100/);
    expect(text).toMatch(/Flags: U/);
    expect(text).toMatch(/Service: E2U\+sip/);
    expect(text).toMatch(/Replacement: \./);
  });

  it('returns "—" for unknown or empty record data', () => {
    expect(
      singleChangeRecordText(change({ type: "WEIRD", record: undefined })),
    ).toBe("—");
    expect(singleChangeRecordText(change({ type: "A", record: {} }))).toBe("—");
  });
});
