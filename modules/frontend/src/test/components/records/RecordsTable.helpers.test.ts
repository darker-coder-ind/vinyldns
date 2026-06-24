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
  recStatusClass,
  recStatusLabel,
  summarizeRecordData,
} from "../../../components/records/RecordsTable";

describe("recStatusClass", () => {
  it.each([
    ["Active", "vds-status-badge--success"],
    ["PendingDelete", "vds-status-badge--danger"],
    ["PendingUpdate", "vds-status-badge--warning"],
    ["Pending", "vds-status-badge--warning"],
    ["Inactive", "vds-status-badge--secondary"],
  ])("maps %s → %s", (status, expected) => {
    expect(recStatusClass(status)).toBe(expected);
  });

  it("returns secondary for unknown statuses", () => {
    expect(recStatusClass("Mystery")).toBe("vds-status-badge--secondary");
  });
});

describe("recStatusLabel", () => {
  it("humanises PendingDelete / PendingUpdate", () => {
    expect(recStatusLabel("PendingDelete")).toBe("Pending Delete");
    expect(recStatusLabel("PendingUpdate")).toBe("Pending Update");
  });

  it("returns other statuses unchanged", () => {
    expect(recStatusLabel("Active")).toBe("Active");
  });
});

describe("summarizeRecordData", () => {
  it("returns the lone value when there is exactly one record", () => {
    expect(
      summarizeRecordData({ type: "A", records: [{ address: "1.2.3.4" }] }),
    ).toBe("1.2.3.4");

    expect(
      summarizeRecordData({
        type: "CNAME",
        records: [{ cname: "alias.example." }],
      }),
    ).toBe("alias.example.");

    expect(
      summarizeRecordData({ type: "TXT", records: [{ text: "v=spf1 -all" }] }),
    ).toBe("v=spf1 -all");
  });

  it('appends "(+N more)" when there are multiple records', () => {
    const out = summarizeRecordData({
      type: "A",
      records: [{ address: "1.2.3.4" }, { address: "5.6.7.8" }],
    });
    expect(out).toBe("1.2.3.4 (+1 more)");
  });

  it('formats MX records as "Pref: N Exchange: …"', () => {
    expect(
      summarizeRecordData({
        type: "MX",
        records: [{ preference: 10, exchange: "mail.example." }],
      }),
    ).toBe("Pref: 10 Exchange: mail.example.");
  });

  it("formats SRV records with priority weight port target", () => {
    expect(
      summarizeRecordData({
        type: "SRV",
        records: [
          { priority: 10, weight: 20, port: 5060, target: "sip.example." },
        ],
      }),
    ).toBe("10 20 5060 sip.example.");
  });

  it("falls back to rec.data when there are zero records", () => {
    expect(
      summarizeRecordData({ type: "A", records: [], data: "fallback" }),
    ).toBe("fallback");
  });

  it('returns "—" when nothing usable is available', () => {
    expect(summarizeRecordData({ type: "A", records: [] })).toBe("—");
    expect(summarizeRecordData({ type: "WEIRD", records: [{}] })).toBe("—");
  });
});
