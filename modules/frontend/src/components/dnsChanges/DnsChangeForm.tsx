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

import React, { useRef, useState, useEffect } from "react";
import {
  useForm,
  useFieldArray,
  useWatch,
  useFormContext,
  FormProvider,
} from "react-hook-form";
import { useQuery } from "@tanstack/react-query";
import type {
  CreateDnsChangeRequest,
  SingleChange,
} from "../../types/dnsChange";
import { groupsService } from "../../services/groupsService";

/** Union of all possible DNS record data shapes across supported record types. */
interface RecordData {
  // A / AAAA / A+PTR / AAAA+PTR
  address?: string;
  // CNAME
  cname?: string;
  // PTR
  ptrdname?: string;
  // TXT
  text?: string;
  // MX
  preference?: number;
  exchange?: string;
  // NS
  nsdname?: string;
  // SRV
  priority?: number;
  weight?: number;
  port?: number;
  target?: string;
  // NAPTR
  order?: number;
  flags?: string;
  service?: string;
  regexp?: string;
  replacement?: string;
}

/**
 * Form-level change item. Strips server-only fields from `SingleChange` so
 * the form only manages the subset of fields the user can actually provide.
 * The `record` field holds the type-specific record data payload.
 */
/**
 * Form-level change item. Strips server-only fields from `SingleChange` so
 * the form only manages the subset of fields the user can actually provide.
 * The `record` field holds the type-specific record data payload.
 */
type ChangeFormItem = Omit<
  SingleChange,
  | "id"
  | "status"
  | "recordName"
  | "zoneName"
  | "zoneId"
  | "recordSetId"
  | "errors"
  | "systemMessage"
> & { record?: RecordData };
export type { ChangeFormItem, RecordData };

/** Top-level react-hook-form shape for the batch change submission form. */
/** Top-level react-hook-form shape for the batch change submission form. */
interface DnsChangeFormData {
  comments: string;
  ownerGroupId: string;
  scheduledOption: "now" | "later";
  scheduledTime: string;
  changes: ChangeFormItem[];
}

/** Default batch change limit. Matches VinylDNS server default. */
const BATCH_CHANGE_LIMIT = 1000;

/**
 * IPv4 address validation pattern. Matches only dotted-decimal notation with
 * each octet in the 0–255 range, matching the AngularJS `ipv4` directive.
 */
const RE_IPV4 =
  /^(?:(?:25[0-5]|2[0-4]\d|1\d{2}|[1-9]\d|\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d{2}|[1-9]\d|\d)$/;

/**
 * IPv6 address validation pattern covering all standard address forms including
 * compressed (::), mixed IPv4/IPv6, and link-local addresses with zone IDs.
 * Matches the AngularJS `ipv6` directive.
 */
const RE_IPV6 =
  /^(([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]+|::(ffff(:0{1,4})?:)?((25[0-5]|(2[0-4]|1?[0-9])?[0-9])\.){3}(25[0-5]|(2[0-4]|1?[0-9])?[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1?[0-9])?[0-9])\.){3}(25[0-5]|(2[0-4]|1?[0-9])?[0-9]))$/;

/**
 * FQDN validation pattern. Allows an optional leading wildcard label (`*.`)
 * and requires each label to be 1–63 alphanumeric/hyphen characters. An
 * optional trailing dot is permitted. Matches the AngularJS `fqdn` directive.
 */
const RE_FQDN =
  /^(\*\.)?([a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+([a-zA-Z]{2,}\.?)$/;

/** Decode a single CSV row using standard CSV quoting rules. */
function decodeCsvRow(row: string): string[] {
  const regex = /(,|\r?\n|\r|^)(?:"([^"]*(?:""[^"]*)*)"|([^,\r\n]*))/gi;
  const matches = [...row.matchAll(regex)];
  return matches.map((m) =>
    m[2] !== undefined ? m[2].replace(/""/g, '"') : (m[3] ?? ""),
  );
}

/**
 * Parses a full CSV text into `ChangeFormItem[]`.
 *
 * Validates the expected header row before processing data. NAPTR rows are
 * handled with a 5- or 6-field fallback because `regexp` is optional in some
 * export tools. Returns an `error` string instead of throwing so callers can
 * display it inline rather than catching an exception.
 */
export function parseCsvToChanges(
  csvText: string,
  limit: number,
): { changes: ChangeFormItem[]; error?: string } {
  const rows = csvText.split("\n");
  const header = rows[0]?.trim();
  if (header !== "Change Type,Record Type,Input Name,TTL,Record Data") {
    return {
      changes: [],
      error:
        "Import failed. CSV header must be: Change Type,Record Type,Input Name,TTL,Record Data",
    };
  }
  const dataRows = rows.slice(1).filter((r) => r.replace(/,+/g, "").trim());
  if (dataRows.length > limit) {
    return {
      changes: [],
      error: `Import failed. Cannot add more than ${limit} records per DNS change.`,
    };
  }
  const changes: ChangeFormItem[] = [];
  for (const row of dataRows) {
    const cols = decodeCsvRow(row);
    const changeTypeRaw = cols[0]?.trim() ?? "";
    const type = (cols[1]?.trim().toUpperCase() ??
      "A+PTR") as ChangeFormItem["type"];
    const inputName = cols[2]?.trim() ?? "";
    const ttlStr = cols[3]?.trim();
    const ttl = ttlStr ? parseInt(ttlStr, 10) : undefined;
    const recordData = cols[4]?.trim() ?? "";
    const changeType: "Add" | "DeleteRecordSet" = /delete/i.test(changeTypeRaw)
      ? "DeleteRecordSet"
      : "Add";

    let record: RecordData = {};
    if (["A", "AAAA", "A+PTR", "AAAA+PTR"].includes(type)) {
      record = { address: recordData };
    } else if (type === "CNAME") {
      record = { cname: recordData };
    } else if (type === "PTR") {
      record = { ptrdname: recordData };
    } else if (type === "TXT") {
      record = { text: recordData };
    } else if (type === "NS") {
      record = { nsdname: recordData };
    } else if (type === "MX") {
      const [pref, exchange] = recordData.split(" ");
      record = { preference: parseInt(pref, 10), exchange };
    } else if (type === "NAPTR") {
      const parts = recordData.split(" ");
      if (parts.length >= 6) {
        record = {
          order: parseInt(parts[0], 10),
          preference: parseInt(parts[1], 10),
          flags: parts[2],
          service: parts[3],
          regexp: parts[4],
          replacement: parts[5],
        };
      } else {
        record = {
          order: parseInt(parts[0], 10),
          preference: parseInt(parts[1], 10),
          flags: parts[2],
          service: parts[3],
          regexp: "",
          replacement: parts[4] ?? "",
        };
      }
    } else if (type === "SRV") {
      const [pri, wt, port, target] = recordData.split(" ");
      record = {
        priority: parseInt(pri, 10),
        weight: parseInt(wt, 10),
        port: parseInt(port, 10),
        target,
      };
    }
    changes.push({
      changeType,
      type,
      inputName,
      ttl,
      record: record as Record<string, unknown> & RecordData,
    });
  }
  return { changes };
}

const NAPTR_FLAGS = ["U", "S", "A", "P"] as const;

/**
 * Build a stable signature for a change row used to detect duplicates after
 * CSV import. Two rows are considered duplicates only when ALL of the
 * user-supplied fields match: changeType, type, inputName, ttl, and every
 * non-empty record sub-field. Record keys are sorted so property ordering
 * never affects the signature.
 */
export function changeSignature(c: ChangeFormItem): string {
  const recObj = (c.record ?? {}) as Record<string, unknown>;
  const recEntries = Object.entries(recObj)
    .filter(
      ([, v]) =>
        v !== undefined &&
        v !== null &&
        !(typeof v === "string" && v.trim() === "") &&
        !(typeof v === "number" && Number.isNaN(v)),
    )
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${String(v).trim().toLowerCase()}`)
    .join("|");
  return [
    String(c.changeType ?? "").toLowerCase(),
    String(c.type ?? "").toLowerCase(),
    String(c.inputName ?? "")
      .trim()
      .toLowerCase(),
    // TTL is intentionally excluded: rows with the same record data but
    // different TTL are still treated as duplicates so the user can pick
    // which TTL value to keep.
    recEntries,
  ].join("::");
}

/**
 * Group change rows by `changeSignature` and return only the groups that have
 * more than one row, i.e. duplicates. Indices refer to positions in the input
 * array so callers can mutate the original list precisely.
 */
export function findDuplicateGroups(
  changes: ChangeFormItem[],
): { signature: string; indices: number[] }[] {
  const map = new Map<string, number[]>();
  changes.forEach((c, idx) => {
    const sig = changeSignature(c);
    const list = map.get(sig);
    if (list) list.push(idx);
    else map.set(sig, [idx]);
  });
  const groups: { signature: string; indices: number[] }[] = [];
  for (const [signature, indices] of map.entries()) {
    if (indices.length > 1) groups.push({ signature, indices });
  }
  return groups;
}

/**
 * Type-aware record data fields for a single change row inside the batch form.
 *
 * Pulls `register` from the parent `FormProvider` context so it doesn't need
 * to be threaded through props. The `isAdd` flag drives required-field
 * validation — delete rows don't require record data. `isDark` propagates
 * the app-level theme into inline styles that can't use CSS variables.
 *
 * @param index      - Position of this row in the `changes` field array.
 * @param recordType - Currently selected DNS type for this row.
 * @param isAdd      - True for Add changes; false for DeleteRecordSet.
 * @param isDark     - Whether the dark VDS theme is currently active.
 */
function RecordDataFields({
  index,
  recordType,
  isAdd,
  isDark,
}: {
  index: number;
  recordType: string;
  isAdd: boolean;
  isDark: boolean;
}) {
  const { register } = useFormContext<DnsChangeFormData>();
  const req = isAdd;

  const inputStyle: React.CSSProperties = {
    background: isDark ? "#1a2640" : "#fff",
    color: isDark ? "#cdd9ed" : "#212529",
    borderColor: isDark ? "rgba(127,168,216,0.2)" : "#dde3ec",
    boxShadow: "none",
    borderRadius: "0.45rem",
  };

  const helpText = !isAdd && (
    <div className="form-text text-muted fst-italic">
      Record data is optional for delete.
    </div>
  );

  switch (recordType) {
    case "A":
    case "A+PTR":
      return (
        <div>
          <input
            className="form-control form-control-sm"
            placeholder="e.g. 1.1.1.1"
            style={inputStyle}
            {...register(`changes.${index}.record.address`, {
              required: req,
              validate: (v) =>
                !req ||
                !v ||
                RE_IPV4.test(String(v)) ||
                "Must be a valid IPv4 address",
            })}
          />
          {helpText}
        </div>
      );
    case "AAAA":
    case "AAAA+PTR":
      return (
        <div>
          <input
            className="form-control form-control-sm"
            placeholder="e.g. fd69:27cc:fe91::60"
            style={inputStyle}
            {...register(`changes.${index}.record.address`, {
              required: req,
              validate: (v) =>
                !req ||
                !v ||
                RE_IPV6.test(String(v)) ||
                "Must be a valid IPv6 address",
            })}
          />
          {helpText}
        </div>
      );
    case "CNAME":
      return (
        <div>
          <input
            className="form-control form-control-sm"
            placeholder="e.g. target.example.com."
            disabled={!isAdd}
            style={{
              ...inputStyle,
              background: !isAdd
                ? isDark
                  ? "#0f1825"
                  : "#e9ecef"
                : inputStyle.background,
            }}
            {...register(`changes.${index}.record.cname`, {
              required: req,
              validate: (v) =>
                !req || !v || RE_FQDN.test(String(v)) || "Must be a valid FQDN",
            })}
          />
        </div>
      );
    case "PTR":
      return (
        <div>
          <input
            className="form-control form-control-sm"
            placeholder="e.g. test.example.com."
            style={inputStyle}
            {...register(`changes.${index}.record.ptrdname`, {
              required: req,
              validate: (v) =>
                !req || !v || RE_FQDN.test(String(v)) || "Must be a valid FQDN",
            })}
          />
          {helpText}
        </div>
      );
    case "TXT":
      return (
        <div>
          <textarea
            className="form-control form-control-sm"
            rows={2}
            placeholder="e.g. attr=val"
            style={inputStyle}
            {...register(`changes.${index}.record.text`, { required: req })}
          />
          {helpText}
        </div>
      );
    case "MX":
      return (
        <div className="d-flex gap-2 flex-wrap">
          <div style={{ minWidth: 110 }}>
            <label className="form-label small mb-1">Preference</label>
            <input
              type="number"
              className="form-control form-control-sm"
              placeholder="e.g. 1"
              min={0}
              max={65535}
              style={inputStyle}
              {...register(`changes.${index}.record.preference`, {
                required: req,
                valueAsNumber: true,
                min: 0,
                max: 65535,
              })}
            />
          </div>
          <div style={{ minWidth: 200 }}>
            <label className="form-label small mb-1">Exchange</label>
            <input
              className="form-control form-control-sm"
              placeholder="e.g. mail.example.com."
              style={inputStyle}
              {...register(`changes.${index}.record.exchange`, {
                required: req,
                validate: (v) =>
                  !req ||
                  !v ||
                  RE_FQDN.test(String(v)) ||
                  "Must be a valid FQDN",
              })}
            />
          </div>
          {helpText && <div className="w-100 mb-0">{helpText}</div>}
        </div>
      );
    case "NS":
      return (
        <div>
          <input
            className="form-control form-control-sm"
            placeholder="e.g. ns1.example.com."
            style={inputStyle}
            {...register(`changes.${index}.record.nsdname`, {
              required: req,
              validate: (v) =>
                !req || !v || RE_FQDN.test(String(v)) || "Must be a valid FQDN",
            })}
          />
          {helpText}
        </div>
      );
    case "SRV":
      return (
        <div className="d-flex gap-2 flex-wrap">
          <div style={{ minWidth: 85 }}>
            <label className="form-label small mb-1">Priority</label>
            <input
              type="number"
              className="form-control form-control-sm"
              placeholder="0"
              min={0}
              max={65535}
              style={inputStyle}
              {...register(`changes.${index}.record.priority`, {
                required: req,
                valueAsNumber: true,
              })}
            />
          </div>
          <div style={{ minWidth: 85 }}>
            <label className="form-label small mb-1">Weight</label>
            <input
              type="number"
              className="form-control form-control-sm"
              placeholder="0"
              min={0}
              max={65535}
              style={inputStyle}
              {...register(`changes.${index}.record.weight`, {
                required: req,
                valueAsNumber: true,
              })}
            />
          </div>
          <div style={{ minWidth: 85 }}>
            <label className="form-label small mb-1">Port</label>
            <input
              type="number"
              className="form-control form-control-sm"
              placeholder="8080"
              min={0}
              max={65535}
              style={inputStyle}
              {...register(`changes.${index}.record.port`, {
                required: req,
                valueAsNumber: true,
              })}
            />
          </div>
          <div style={{ minWidth: 180 }}>
            <label className="form-label small mb-1">Target</label>
            <input
              className="form-control form-control-sm"
              placeholder="e.g. target.example.com."
              style={inputStyle}
              {...register(`changes.${index}.record.target`, {
                required: req,
                validate: (v) =>
                  !req ||
                  !v ||
                  RE_FQDN.test(String(v)) ||
                  v === "." ||
                  "Must be a valid FQDN",
              })}
            />
          </div>
          {helpText && <div className="w-100 mb-0">{helpText}</div>}
        </div>
      );
    case "NAPTR":
      return (
        <div className="d-flex gap-2 flex-wrap">
          <div style={{ minWidth: 85 }}>
            <label className="form-label small mb-1">Order</label>
            <input
              type="number"
              className="form-control form-control-sm"
              placeholder="1"
              min={0}
              max={65535}
              style={inputStyle}
              {...register(`changes.${index}.record.order`, {
                required: req,
                valueAsNumber: true,
              })}
            />
          </div>
          <div style={{ minWidth: 85 }}>
            <label className="form-label small mb-1">Preference</label>
            <input
              type="number"
              className="form-control form-control-sm"
              placeholder="1"
              min={0}
              max={65535}
              style={inputStyle}
              {...register(`changes.${index}.record.preference`, {
                required: req,
                valueAsNumber: true,
              })}
            />
          </div>
          <div style={{ minWidth: 80 }}>
            <label className="form-label small mb-1">Flags</label>
            <select
              className="form-select form-select-sm"
              style={inputStyle}
              {...register(`changes.${index}.record.flags`, { required: req })}
            >
              <option value="">--</option>
              {NAPTR_FLAGS.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </div>
          <div style={{ minWidth: 130 }}>
            <label className="form-label small mb-1">Service</label>
            <input
              className="form-control form-control-sm"
              placeholder="e.g. SIP+D2U"
              style={inputStyle}
              {...register(`changes.${index}.record.service`, {
                required: req,
              })}
            />
          </div>
          <div style={{ minWidth: 130 }}>
            <label className="form-label small mb-1">Regexp</label>
            <input
              className="form-control form-control-sm"
              placeholder="optional"
              style={inputStyle}
              {...register(`changes.${index}.record.regexp`)}
            />
          </div>
          <div style={{ minWidth: 130 }}>
            <label className="form-label small mb-1">Replacement</label>
            <input
              className="form-control form-control-sm"
              placeholder="e.g. ."
              style={inputStyle}
              {...register(`changes.${index}.record.replacement`, {
                required: req,
              })}
            />
          </div>
          {helpText && <div className="w-100 mb-0">{helpText}</div>}
        </div>
      );
    default:
      return <span className="text-muted small fst-italic">—</span>;
  }
}

const RECORD_TYPES = [
  "A+PTR",
  "AAAA+PTR",
  "A",
  "AAAA",
  "CNAME",
  "PTR",
  "TXT",
  "MX",
  "NS",
  "SRV",
  "NAPTR",
] as const;

/**
 * A single DNS change row within the batch form.
 *
 * Subscribes to its own `changeType` and `type` via `useWatch` so it can
 * conditionally show/hide record data fields without re-rendering the whole
 * form. Row background and border color shift to red when the API returns
 * server-side validation errors for that specific row, giving users a clear
 * visual cue on which entries need attention.
 *
 * The type selector resets `record` to an empty object on change so stale
 * field values from the previous type don't bleed into the new payload.
 */
function ChangeRow({
  index,
  remove,
  serverErrors,
}: {
  index: number;
  remove: (i: number) => void;
  serverErrors?: string[];
}) {
  const {
    register,
    control,
    setValue,
    formState: { errors },
  } = useFormContext<DnsChangeFormData>();
  const changeType = useWatch({ control, name: `changes.${index}.changeType` });
  const recordType = useWatch({ control, name: `changes.${index}.type` });
  const [isDark, setIsDark] = useState<boolean>(
    () => document.documentElement.getAttribute("data-vds-theme") === "dark",
  );
  // Observe `data-vds-theme` attribute changes on <html> so inline styles
  // stay in sync with the app-level theme toggle without a full re-render.
  useEffect(() => {
    const observer = new MutationObserver(() => {
      setIsDark(
        document.documentElement.getAttribute("data-vds-theme") === "dark",
      );
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-vds-theme"],
    });
    return () => observer.disconnect();
  }, []);

  const isAdd = changeType === "Add";
  const isPtr = recordType === "PTR";
  const hasErrors = serverErrors && serverErrors.length > 0;

  // Destructure onChange so the custom handler can clear `record` before
  // delegating to the default react-hook-form onChange for the select.
  const { onChange: onTypeChange, ...restTypeRegister } = register(
    `changes.${index}.type`,
  );

  return (
    <div
      data-change-row="true"
      style={{
        background: hasErrors
          ? isDark
            ? "#1e0a0a"
            : "#fff5f5"
          : isDark
            ? "#1e293b"
            : "#fff",
        border: `1px solid ${
          hasErrors
            ? isDark
              ? "#7f1d1d"
              : "#f1aeb5"
            : isDark
              ? "#4a6789"
              : "#94a3b8"
        }`,
        borderRadius: "0.5rem",
        marginBottom: "0.75rem",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0.45rem 0.85rem",
          background: hasErrors
            ? isDark
              ? "#2a0a0a"
              : "#fde5e7"
            : isDark
              ? "#1a2942"
              : "#cbd5e1",
          borderBottom: `1px solid ${
            hasErrors
              ? isDark
                ? "#7f1d1d"
                : "#f1aeb5"
              : isDark
                ? "#4a6789"
                : "#94a3b8"
          }`,
        }}
      >
        <span
          style={{
            fontSize: "0.82rem",
            fontWeight: 600,
            color: hasErrors ? "#991b1b" : isDark ? "#cbd5e1" : "#0d1b3e",
            display: "inline-flex",
            alignItems: "center",
            gap: "0.4rem",
          }}
        >
          <i
            className={`bi ${hasErrors ? "bi-exclamation-circle-fill" : "bi-hash"}`}
            style={{ fontSize: "0.85rem" }}
          />
          Change {index + 1}
        </span>
        <button
          type="button"
          onClick={() => remove(index)}
          title="Remove row"
          style={{
            background: "transparent",
            border: "none",
            color: "#9aacbe",
            cursor: "pointer",
            padding: "0 4px",
            fontSize: "0.85rem",
            lineHeight: 1,
            transition: "color 0.15s",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.color = "#dc3545")}
          onMouseLeave={(e) => (e.currentTarget.style.color = "#9aacbe")}
        >
          <i className="bi bi-x-circle-fill" />
        </button>
      </div>

      <div style={{ padding: "0.85rem" }}>
        <div className="row g-3">
          <div className="col-12 col-sm-6 col-md-3">
            <label
              className="form-label"
              style={{
                fontSize: "0.78rem",
                fontWeight: 600,
                color: isDark ? "#cbd5e1" : "#1f2a44",
                marginBottom: "0.3rem",
              }}
            >
              Change Type
            </label>
            <select
              className="form-select form-select-sm"
              style={{
                background: isDark ? "#1a2640" : "#fff",
                color: isDark ? "#cdd9ed" : "#212529",
                borderColor: isDark ? "rgba(127,168,216,0.2)" : "#dde3ec",
                boxShadow: "none",
                borderRadius: "0.45rem",
              }}
              {...register(`changes.${index}.changeType`)}
            >
              <option value="Add">Add</option>
              <option value="DeleteRecordSet">Delete Record Set</option>
            </select>
          </div>

          <div className="col-12 col-sm-6 col-md-3">
            <label
              className="form-label"
              style={{
                fontSize: "0.78rem",
                fontWeight: 600,
                color: isDark ? "#cbd5e1" : "#1f2a44",
                marginBottom: "0.3rem",
              }}
            >
              Record Type
            </label>
            <select
              className="form-select form-select-sm"
              style={{
                background: isDark ? "#1a2640" : "#fff",
                color: isDark ? "#cdd9ed" : "#212529",
                borderColor: isDark ? "rgba(127,168,216,0.2)" : "#dde3ec",
                boxShadow: "none",
                borderRadius: "0.45rem",
              }}
              {...restTypeRegister}
              onChange={(e) => {
                setValue(`changes.${index}.record`, {});
                void onTypeChange(e);
              }}
            >
              {RECORD_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>

          <div className="col-12 col-sm-8 col-md-4">
            <label
              className="form-label"
              style={{
                fontSize: "0.78rem",
                fontWeight: 600,
                color: isDark ? "#cbd5e1" : "#1f2a44",
                marginBottom: "0.3rem",
              }}
            >
              {isPtr ? "Input Name (IP Address)" : "Input Name (FQDN)"}
            </label>
            <input
              className="form-control form-control-sm"
              placeholder={
                isPtr ? "e.g. 192.0.2.193" : "e.g. host.example.com."
              }
              style={{
                background: isDark ? "#1a2640" : "#fff",
                color: isDark ? "#cdd9ed" : "#212529",
                borderColor: isDark ? "rgba(127,168,216,0.2)" : "#dde3ec",
                boxShadow: "none",
                borderRadius: "0.45rem",
              }}
              {...register(`changes.${index}.inputName`, {
                required: true,
                validate: (v) => {
                  if (!v) return true; // required handles the empty case
                  if (isPtr) {
                    return (
                      RE_IPV4.test(v) ||
                      RE_IPV6.test(v) ||
                      "Must be a valid IPv4 or IPv6 address"
                    );
                  }
                  return (
                    RE_FQDN.test(v) ||
                    "Must be a valid FQDN (e.g. host.example.com.)"
                  );
                },
              })}
            />
            {errors?.changes?.[index]?.inputName && (
              <div
                style={{ fontSize: "0.75rem", color: "#b02a37", marginTop: 2 }}
              >
                <i className="bi bi-exclamation-circle me-1" />
                {errors.changes[index].inputName.message ||
                  "Input name is required!"}
              </div>
            )}
          </div>

          <div className="col-12 col-sm-4 col-md-2">
            <label
              className="form-label"
              style={{
                fontSize: "0.78rem",
                fontWeight: 600,
                color: isDark ? "#cbd5e1" : "#1f2a44",
                marginBottom: "0.3rem",
              }}
            >
              TTL{" "}
              {!isAdd && (
                <span
                  style={{
                    fontWeight: 400,
                    color: "#9aacbe",
                    fontSize: "0.72rem",
                  }}
                >
                  (N/A)
                </span>
              )}
            </label>
            <input
              type="number"
              className="form-control form-control-sm"
              placeholder="300"
              disabled={!isAdd}
              min={30}
              max={2147483647}
              style={{
                background: !isAdd
                  ? isDark
                    ? "#0f1825"
                    : "#f8fafc"
                  : isDark
                    ? "#1a2640"
                    : "#fff",
                color: isDark ? "#cdd9ed" : "#212529",
                borderColor: isDark ? "rgba(127,168,216,0.2)" : "#dde3ec",
                boxShadow: "none",
                borderRadius: "0.45rem",
              }}
              {...register(`changes.${index}.ttl`, { valueAsNumber: true })}
            />
          </div>
        </div>

        <div className="mt-3">
          <label
            className="form-label"
            style={{
              fontSize: "0.78rem",
              fontWeight: 600,
              color: isDark ? "#cbd5e1" : "#1f2a44",
              marginBottom: "0.3rem",
            }}
          >
            Record Data
            {!isAdd && (
              <span
                style={{
                  fontWeight: 400,
                  color: "#9aacbe",
                  fontSize: "0.72rem",
                  marginLeft: 4,
                }}
              >
                (optional for delete)
              </span>
            )}
          </label>
          <RecordDataFields
            index={index}
            recordType={recordType}
            isAdd={isAdd}
            isDark={isDark}
          />
        </div>

        {hasErrors && (
          <div className="mt-2">
            {serverErrors!.map((e, i) => (
              <div
                key={i}
                style={{
                  fontSize: "0.78rem",
                  color: "#b02a37",
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                }}
              >
                <i className="bi bi-exclamation-circle-fill" />
                {e}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Isolated "Request Date/Time" field extracted into its own component to keep
 * the main form render function readable. Shows a simple Now/Later radio
 * toggle; the datetime-local input only appears when "Later" is selected.
 * The user's local timezone is displayed next to the picker so there's no
 * ambiguity about which timezone the server will interpret the value in.
 */
function ScheduledTimeField({
  register,
  watch,
  isDark,
}: {
  register: ReturnType<typeof useForm<DnsChangeFormData>>["register"];
  watch: ReturnType<typeof useForm<DnsChangeFormData>>["watch"];
  isDark: boolean;
}) {
  const scheduledOption = watch("scheduledOption");
  const localTz = Intl.DateTimeFormat().resolvedOptions().timeZone;

  return (
    <div className="col-12 col-md-4">
      <label
        className="form-label"
        style={{
          fontSize: "0.8rem",
          fontWeight: 600,
          color: isDark ? "#cbd5e1" : "#1f2a44",
        }}
      >
        Request Date/Time
      </label>
      <div className="d-flex gap-3 mb-1">
        <div className="form-check">
          <input
            type="radio"
            className="form-check-input"
            id="scheduleNow"
            value="now"
            {...register("scheduledOption")}
          />
          <label className="form-check-label small" htmlFor="scheduleNow">
            Now
          </label>
        </div>
        <div className="form-check">
          <input
            type="radio"
            className="form-check-input"
            id="scheduleLater"
            value="later"
            {...register("scheduledOption")}
          />
          <label className="form-check-label small" htmlFor="scheduleLater">
            Later
          </label>
        </div>
      </div>
      {scheduledOption === "later" && (
        <div className="d-flex align-items-center gap-1">
          <input
            type="datetime-local"
            className="form-control form-control-sm"
            style={{
              background: isDark ? "#1a2640" : "#fff",
              color: isDark ? "#cdd9ed" : "#212529",
              borderColor: isDark ? "rgba(127,168,216,0.2)" : "#dde3ec",
              boxShadow: "none",
              borderRadius: "0.45rem",
            }}
            {...register("scheduledTime")}
          />
          <span className="text-muted small text-nowrap">{localTz}</span>
        </div>
      )}
    </div>
  );
}

/**
 * @param onSubmit        - Receives the fully normalized `CreateDnsChangeRequest`
 *                          and the `allowManualReview` flag on form submit.
 * @param onCancel        - Called when the user dismisses without submitting.
 * @param isSubmitting    - Disables the submit button while the parent mutation runs.
 * @param serverRowErrors - Per-row error arrays returned by a 400 API response;
 *                          passed straight down to each `ChangeRow`.
 */
interface DnsChangeFormProps {
  onSubmit: (data: CreateDnsChangeRequest, allowManualReview: boolean) => void;
  onCancel: () => void;
  isSubmitting: boolean;
  /** Per-row server errors returned by a 400 API response */
  serverRowErrors?: string[][];
}

/**
 * Format a record-data object into a single human-readable line for display
 * in the duplicate-review modal. Empty values are dropped so PTR-only rows
 * don't render a sea of empty `field=` pairs.
 */
export function formatRecordData(record: RecordData | undefined): string {
  if (!record) return "—";
  const parts: string[] = [];
  for (const [k, v] of Object.entries(record).sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    if (v === undefined || v === null) continue;
    if (typeof v === "string" && v.trim() === "") continue;
    parts.push(`${k}: ${v}`);
  }
  return parts.length ? parts.join(", ") : "—";
}

interface DuplicateReviewModalProps {
  state: {
    changes: ChangeFormItem[];
    groups: { signature: string; indices: number[] }[];
    keep: Set<number>;
  };
  isDark: boolean;
  onToggleKeep: (rowIdx: number) => void;
  onApply: () => void;
  onCancel: () => void;
}

/**
 * Modal shown when the CSV importer detects duplicate change rows. Each
 * "duplicate group" represents one set of identical rows (matching change
 * type, record type, input name, TTL, and record data). The user can pick
 * which row in each group to keep; everything outside any group is kept
 * automatically and is not shown.
 */
function DuplicateReviewModal({
  state,
  isDark,
  onToggleKeep,
  onApply,
  onCancel,
}: DuplicateReviewModalProps) {
  const { changes, groups, keep } = state;
  // `totalRows` — total number of rows in the imported CSV.
  // `totalDuplicateRows` — total rows participating in any duplicate group
  //   (i.e. the maximum that *could* be removed if the user kept only one
  //   row per group).
  // `willKeep` / `willRemove` — reflect the user's current checkbox state.
  const totalRows = changes.length;
  const totalDuplicateRows = groups.reduce(
    (sum, g) => sum + g.indices.length,
    0,
  );
  const willRemove = totalRows - keep.size;
  const willKeep = keep.size;

  // Lock body scroll while modal is open, restore on close.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const panelBg = isDark ? "#1e293b" : "#ffffff";
  const panelBorder = isDark ? "#2d4163" : "#e8ecf0";
  const headerText = isDark ? "#e2e8f0" : "#0d1b3e";
  const subText = isDark ? "#94a3b8" : "#64748b";
  const cardBg = isDark ? "#162032" : "#f8fafd";
  const cardBorder = isDark ? "#2d4163" : "#e2e8f0";
  const rowBg = isDark ? "#1e293b" : "#ffffff";
  const rowBorder = isDark ? "#334155" : "#e8ecf0";
  const removeBg = isDark ? "#3f1d1d" : "#fef2f2";
  const removeBorder = isDark ? "#7f1d1d" : "#fecaca";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="dup-review-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(15, 23, 42, 0.65)",
        backdropFilter: "blur(2px)",
        zIndex: 1080,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "1.5rem",
      }}
    >
      <div
        style={{
          background: panelBg,
          color: headerText,
          border: `1px solid ${panelBorder}`,
          borderRadius: "0.85rem",
          boxShadow: "0 25px 60px rgba(0, 0, 0, 0.45)",
          width: "min(900px, 100%)",
          maxHeight: "90vh",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.85rem",
            padding: "1.1rem 1.4rem",
            borderBottom: `1px solid ${panelBorder}`,
            background: isDark
              ? "linear-gradient(90deg, #1e293b, #162032)"
              : "linear-gradient(90deg, #ffffff, #f8fafd)",
          }}
        >
          <span
            style={{
              width: 38,
              height: 38,
              borderRadius: "50%",
              background: isDark ? "#3b2f0d" : "#fff7e0",
              color: "#d97706",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "1.1rem",
              flexShrink: 0,
            }}
          >
            <i className="bi bi-exclamation-triangle-fill" aria-hidden="true" />
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h5
              id="dup-review-title"
              style={{
                margin: 0,
                fontSize: "1.05rem",
                fontWeight: 600,
                color: headerText,
              }}
            >
              Duplicate records found
            </h5>
          </div>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Close"
            style={{
              background: "transparent",
              border: "none",
              color: subText,
              fontSize: "1.1rem",
              cursor: "pointer",
              padding: "0.25rem 0.5rem",
              borderRadius: "0.4rem",
              transition: "background 0.15s",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = isDark ? "#2d4163" : "#e8ecf0";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "transparent";
            }}
          >
            <i className="bi bi-x-lg" aria-hidden="true" />
          </button>
        </div>

        {/* Body */}
        <div
          style={{
            padding: "1.1rem 1.4rem",
            overflowY: "auto",
            flex: 1,
          }}
        >
          <p
            style={{
              margin: "0 0 1rem",
              fontSize: "0.88rem",
              color: subText,
              lineHeight: 1.5,
            }}
          >
            Rows are considered duplicates when{" "}
            <strong style={{ color: headerText }}>
              Change Type, Record Type, Input Name,
            </strong>{" "}
            and <strong style={{ color: headerText }}>Record Data</strong> all
            match. Keep the rows you want to import; unchecked rows will be
            dropped before the form is populated.
          </p>

          {groups.map((group, gIdx) => {
            const sample = changes[group.indices[0]];
            return (
              <div
                key={gIdx}
                style={{
                  background: cardBg,
                  border: `1px solid ${cardBorder}`,
                  borderRadius: "0.7rem",
                  padding: "0.85rem 1rem",
                  marginBottom: "0.9rem",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.5rem",
                    marginBottom: "0.65rem",
                  }}
                >
                  <span
                    style={{
                      fontSize: "0.7rem",
                      fontWeight: 700,
                      letterSpacing: "0.04em",
                      textTransform: "uppercase",
                      color: "#d97706",
                      background: isDark ? "#3b2f0d" : "#fff7e0",
                      padding: "0.2rem 0.55rem",
                      borderRadius: "0.35rem",
                    }}
                  >
                    Group {gIdx + 1}
                  </span>
                  <span style={{ fontSize: "0.82rem", color: subText }}>
                    {group.indices.length} identical rows
                  </span>
                </div>

                {/* Shared key fields */}
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
                    gap: "0.5rem 1rem",
                    fontSize: "0.82rem",
                    marginBottom: "0.85rem",
                    paddingBottom: "0.75rem",
                    borderBottom: `1px dashed ${cardBorder}`,
                  }}
                >
                  <div>
                    <div style={{ color: subText, fontSize: "0.72rem" }}>
                      Change Type
                    </div>
                    <div style={{ color: headerText, fontWeight: 500 }}>
                      {sample.changeType ?? "—"}
                    </div>
                  </div>
                  <div>
                    <div style={{ color: subText, fontSize: "0.72rem" }}>
                      Record Type
                    </div>
                    <div style={{ color: headerText, fontWeight: 500 }}>
                      {sample.type ?? "—"}
                    </div>
                  </div>
                  <div style={{ gridColumn: "span 2", minWidth: 0 }}>
                    <div style={{ color: subText, fontSize: "0.72rem" }}>
                      Input Name
                    </div>
                    <div
                      style={{
                        color: headerText,
                        fontWeight: 500,
                        wordBreak: "break-all",
                      }}
                    >
                      {sample.inputName || "—"}
                    </div>
                  </div>
                  <div style={{ gridColumn: "1 / -1", minWidth: 0 }}>
                    <div style={{ color: subText, fontSize: "0.72rem" }}>
                      Record Data
                    </div>
                    <div
                      style={{
                        color: headerText,
                        fontWeight: 500,
                        wordBreak: "break-word",
                        fontFamily:
                          "ui-monospace, SFMono-Regular, Menlo, monospace",
                        fontSize: "0.78rem",
                      }}
                    >
                      {formatRecordData(sample.record)}
                    </div>
                  </div>
                </div>

                {/* Per-row checkboxes */}
                <div
                  style={{ display: "flex", flexDirection: "column", gap: 5 }}
                >
                  {group.indices.map((rowIdx) => {
                    const row = changes[rowIdx];
                    const checked = keep.has(rowIdx);
                    return (
                      <label
                        key={rowIdx}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "0.65rem",
                          padding: "0.5rem 0.85rem",
                          background: checked
                            ? isDark
                              ? "#0f2f1a"
                              : "#f0fdf4"
                            : isDark
                              ? "#1e293b"
                              : "#f8fafc",
                          border: `1px solid ${
                            checked
                              ? isDark
                                ? "#16a34a"
                                : "#86efac"
                              : isDark
                                ? "#2d3d52"
                                : "#e2e8f0"
                          }`,
                          borderRadius: "0.5rem",
                          cursor: "pointer",
                          transition: "background 0.15s, border-color 0.15s",
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => onToggleKeep(rowIdx)}
                          style={{
                            cursor: "pointer",
                            flexShrink: 0,
                            width: 15,
                            height: 15,
                            accentColor: "#16a34a",
                          }}
                        />
                        <span
                          style={{
                            fontWeight: 600,
                            fontSize: "0.83rem",
                            color: headerText,
                            flexShrink: 0,
                          }}
                        >
                          Row #{rowIdx + 1}
                        </span>
                        <span
                          style={{
                            background: isDark ? "#1e3a5f" : "#dbeafe",
                            color: isDark ? "#93c5fd" : "#1e5fa8",
                            fontSize: "0.72rem",
                            fontWeight: 600,
                            padding: "0.1rem 0.5rem",
                            borderRadius: "0.3rem",
                            fontFamily:
                              "ui-monospace, SFMono-Regular, Menlo, monospace",
                            flexShrink: 0,
                          }}
                        >
                          TTL {row.ttl !== undefined ? row.ttl : "—"}
                        </span>
                        <span style={{ flex: 1 }} />
                        {checked && (
                          <span
                            style={{
                              background: "#dc2626",
                              color: "#fff",
                              fontSize: "0.68rem",
                              fontWeight: 700,
                              padding: "0.15rem 0.55rem",
                              borderRadius: "9999px",
                              letterSpacing: "0.04em",
                              textTransform: "uppercase",
                              flexShrink: 0,
                            }}
                          >
                            Remove
                          </span>
                        )}
                      </label>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: "0.9rem 1.4rem",
            borderTop: `1px solid ${panelBorder}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "0.75rem",
            background: isDark ? "#162032" : "#f8fafd",
            flexWrap: "wrap",
          }}
        >
          <div
            style={{
              fontSize: "0.82rem",
              color: subText,
              display: "flex",
              alignItems: "center",
              gap: "0.4rem",
              flexWrap: "wrap",
            }}
          >
            <span>
              {willRemove > 0 ? (
                <>
                  <strong style={{ color: isDark ? "#fca5a5" : "#dc2626" }}>
                    {willRemove}
                  </strong>{" "}
                  duplicate{willRemove !== 1 ? "s" : ""} will be removed
                </>
              ) : null}
            </span>
          </div>
          <div style={{ display: "flex", gap: "0.55rem" }}>
            <button
              type="button"
              onClick={onCancel}
              style={{
                padding: "0.5rem 1rem",
                background: "transparent",
                border: `1px solid ${panelBorder}`,
                color: headerText,
                borderRadius: "0.5rem",
                cursor: "pointer",
                fontSize: "0.85rem",
                fontWeight: 500,
                transition: "background 0.15s",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = isDark
                  ? "#2d4163"
                  : "#e8ecf0";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "transparent";
              }}
            >
              Cancel import
            </button>
            <button
              type="button"
              onClick={onApply}
              disabled={willKeep === 0}
              style={{
                padding: "0.5rem 1.1rem",
                background:
                  willKeep === 0
                    ? isDark
                      ? "#334155"
                      : "#cbd5e1"
                    : "linear-gradient(90deg, #1e5fa8, #0d1b3e)",
                border: "none",
                color: "#fff",
                borderRadius: "0.5rem",
                cursor: willKeep === 0 ? "not-allowed" : "pointer",
                fontSize: "0.85rem",
                fontWeight: 600,
                boxShadow:
                  willKeep === 0 ? "none" : "0 2px 8px rgba(30, 95, 168, 0.25)",
                transition: "box-shadow 0.15s",
                display: "inline-flex",
                alignItems: "center",
                gap: "0.4rem",
              }}
              onMouseEnter={(e) => {
                if (willKeep > 0)
                  e.currentTarget.style.boxShadow =
                    "0 3px 12px rgba(30, 95, 168, 0.4)";
              }}
              onMouseLeave={(e) => {
                if (willKeep > 0)
                  e.currentTarget.style.boxShadow =
                    "0 2px 8px rgba(30, 95, 168, 0.25)";
              }}
            >
              <i className="bi bi-check2-circle" aria-hidden="true" />
              Apply &amp; import {willKeep} row{willKeep !== 1 ? "s" : ""}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Multi-row batch DNS change form.
 *
 * Manages state for:
 * - Batch metadata (description, owner group, scheduled time)
 * - An unbounded list of individual change rows via `useFieldArray`
 * - CSV import with client-side validation and inline error feedback
 * - Per-row server error display after a 400 API response
 *
 * `FormProvider` wraps the entire form so child row components can access
 * `register` and `control` via `useFormContext` without prop drilling.
 *
 * A+PTR and AAAA+PTR are convenience types that get expanded into two
 * separate API entries (address + reverse PTR) in `handleFormSubmit`,
 * mirroring the legacy portal's `formatData` behavior.
 */
export function DnsChangeForm({
  onSubmit,
  onCancel,
  isSubmitting,
  serverRowErrors,
}: DnsChangeFormProps) {
  const [allowManualReview, setAllowManualReview] = useState(false);
  const [rowErrors, setRowErrors] = useState<string[][]>([]);
  const [csvAlert, setCsvAlert] = useState<{
    type: "success" | "danger";
    message: string;
  } | null>(null);
  // When set, holds the staged submit payload waiting for user confirmation.
  // The form switches to a confirmation view instead of immediately calling
  // the API — matching the AngularJS two-step pendingSubmit → pendingConfirm flow.
  const [pendingSubmitData, setPendingSubmitData] = useState<{
    data: CreateDnsChangeRequest;
    allowManualReview: boolean;
  } | null>(null);
  // When set, the duplicate-review modal is shown. `changes` is the full
  // parsed CSV row list and `groups` enumerates the duplicate clusters (each
  // with ≥ 2 indices into `changes`). `keep` tracks which indices the user
  // wants to keep — defaults to "first row of each group" on open.
  const [dupReview, setDupReview] = useState<{
    changes: ChangeFormItem[];
    groups: { signature: string; indices: number[] }[];
    keep: Set<number>;
  } | null>(null);
  const csvFileRef = useRef<HTMLInputElement>(null);
  // Tracks the previous row count so the auto-focus effect only fires when
  // a new row is appended, not on initial render or row removal.
  const prevFieldsLengthRef = useRef(0);
  const [isDark, setIsDark] = useState<boolean>(
    () => document.documentElement.getAttribute("data-vds-theme") === "dark",
  );
  // Observe theme attribute so inline styles stay in sync with the app theme.
  useEffect(() => {
    const observer = new MutationObserver(() => {
      setIsDark(
        document.documentElement.getAttribute("data-vds-theme") === "dark",
      );
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-vds-theme"],
    });
    return () => observer.disconnect();
  }, []);

  // Fetch the user's groups to populate the owner group ID selector.
  // ignoreAccess=true mirrors the AngularJS groupsService.getGroups() call
  // which returns all groups the user can see, not just their own.
  const { data: groupsData } = useQuery({
    queryKey: ["groups-for-dns-form"],
    queryFn: async () => {
      const res = await groupsService.getGroups(true);
      return res.data.groups ?? [];
    },
    staleTime: 5 * 60 * 1000,
  });
  const groups = groupsData ?? [];

  // Server errors take priority over any local client-side error state;
  // once the parent clears `serverRowErrors` (e.g. on resubmit), local
  // errors from the previous attempt are also discarded.
  const effectiveRowErrors = serverRowErrors ?? rowErrors;

  // Surface a banner-level hint when any row's server error references the
  // owner group — this happens when records belong to a shared zone but
  // no owner group ID was provided in the batch metadata.
  const ownerGroupError = (serverRowErrors ?? [])
    .flat()
    .some((e) => e.includes("owner group ID must be specified for record"));

  const methods = useForm<DnsChangeFormData>({
    defaultValues: {
      comments: "",
      ownerGroupId: "",
      scheduledOption: "now",
      scheduledTime: "",
      changes: [
        {
          changeType: "Add",
          inputName: "",
          type: "A+PTR",
          ttl: undefined,
          record: {},
        },
      ],
    },
  });

  const { register, control, handleSubmit, watch } = methods;
  const { fields, append, remove, replace } = useFieldArray({
    control,
    name: "changes",
  });

  // Auto-focus the Change Type select of the newly added row whenever a row
  // is appended. This mirrors the AngularJS addSingleChange() focus behavior.
  useEffect(() => {
    if (fields.length > prevFieldsLengthRef.current) {
      const rows = document.querySelectorAll<HTMLElement>(
        '[data-change-row="true"]',
      );
      const lastRow = rows[rows.length - 1];
      if (lastRow) {
        const firstInput = lastRow.querySelector<HTMLElement>("select, input");
        if (firstInput) firstInput.focus();
      }
    }
    prevFieldsLengthRef.current = fields.length;
  }, [fields.length]);

  /**
   * Scrolls the first field that failed react-hook-form validation into view
   * and focuses it. This makes the inline error message visible to the user
   * when they click Submit but one or more rows are scrolled out of the viewport.
   * react-hook-form sets aria-invalid="true" on every registered input that
   * fails a validation rule, making them discoverable by a standard DOM query.
   */
  const onInvalid = () => {
    const firstInvalid = document.querySelector<HTMLElement>(
      '[aria-invalid="true"]',
    );
    if (firstInvalid) {
      firstInvalid.scrollIntoView({ behavior: "smooth", block: "center" });
      firstInvalid.focus({ preventScroll: true });
    }
  };

  /**
   * First-pass submit handler invoked by react-hook-form after validation passes.
   * Instead of calling `onSubmit` directly this stages the prepared payload in
   * `pendingSubmitData`, switching the footer to a confirmation panel. The second
   * click on "Confirm & Submit" is what actually calls `onSubmit`.
   */
  const handleFormSubmit = (data: DnsChangeFormData) => {
    setRowErrors([]);

    // A+PTR and AAAA+PTR are convenience compound types: each row expands into
    // a paired A/AAAA entry and a reverse PTR entry before reaching the API.
    // This mirrors the legacy portal's formatData function.
    const expandedChanges: ChangeFormItem[] = [];
    for (const entry of data.changes) {
      if (entry.type === "A+PTR" || entry.type === "AAAA+PTR") {
        const baseType = entry.type === "A+PTR" ? "A" : "AAAA";
        expandedChanges.push({ ...entry, type: baseType });
        expandedChanges.push({
          changeType: entry.changeType,
          type: "PTR",
          ttl: entry.ttl,
          inputName: (entry.record as RecordData)?.address ?? "",
          record: { ptrdname: entry.inputName },
        });
      } else if (entry.type === "NAPTR") {
        const r = entry.record as RecordData;
        expandedChanges.push({
          ...entry,
          record: { ...r, regexp: r?.regexp ?? "" },
        });
      } else {
        expandedChanges.push(entry);
      }
    }

    // For DeleteRecordSet: drop record if all values are empty.
    // Also strip NaN from TTL and any numeric record sub-fields produced by
    // valueAsNumber on blank number inputs, or left over when the user switches
    // record types (e.g. MX → A leaves preference: NaN on the row).
    const finalChanges = expandedChanges.map((entry) => {
      const cleanTtl =
        entry.ttl !== undefined && !Number.isNaN(entry.ttl)
          ? entry.ttl
          : undefined;

      const cleanRecord = entry.record
        ? (Object.fromEntries(
            Object.entries(entry.record as Record<string, unknown>).filter(
              ([, v]) =>
                v !== undefined &&
                v !== null &&
                v !== "" &&
                !(typeof v === "number" && Number.isNaN(v)),
            ),
          ) as typeof entry.record)
        : entry.record;

      const cleaned: ChangeFormItem = {
        ...entry,
        ...(cleanTtl !== undefined ? { ttl: cleanTtl } : {}),
        record: cleanRecord,
      };

      if (cleaned.changeType === "DeleteRecordSet" && cleaned.record) {
        const allEmpty = Object.values(cleaned.record).every(
          (v) =>
            v === undefined ||
            v === null ||
            (typeof v === "string" && v.trim() === ""),
        );
        if (allEmpty) {
          const { record: _r, ...rest } = cleaned;
          return rest as ChangeFormItem;
        }
      }
      return cleaned;
    });

    // Stage the payload for user confirmation rather than submitting immediately.
    // The confirmation panel will display the change count and let the user
    // back out before the API call is made. This mirrors the AngularJS two-step
    // pendingSubmit → pendingConfirm flow.
    setPendingSubmitData({
      data: {
        comments: data.comments || undefined,
        ownerGroupId: data.ownerGroupId || undefined,
        scheduledTime:
          data.scheduledOption === "later" && data.scheduledTime
            ? new Date(data.scheduledTime).toISOString()
            : undefined,
        changes: finalChanges,
      },
      allowManualReview,
    });
  };

  /** Executes the staged submit after the user clicks "Confirm & Submit". */
  const handleConfirmSubmit = () => {
    if (!pendingSubmitData) return;
    onSubmit(pendingSubmitData.data, pendingSubmitData.allowManualReview);
    setPendingSubmitData(null);
  };

  /** Returns the form to edit mode without submitting. */
  const handleBackToEdit = () => {
    setPendingSubmitData(null);
  };

  const handleCsvImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // reset input so same file can be re-imported
    if (csvFileRef.current) csvFileRef.current.value = "";
    if (!file) return;
    if (!file.name.endsWith(".csv")) {
      setCsvAlert({
        type: "danger",
        message: "Import failed. File should be of '.csv' type.",
      });
      return;
    }
    const reader = new FileReader();
    reader.onload = (evt) => {
      const text = evt.target?.result as string;
      const { changes, error } = parseCsvToChanges(text, BATCH_CHANGE_LIMIT);
      if (error) {
        setCsvAlert({ type: "danger", message: error });
        return;
      }
      // Detect duplicate rows BEFORE applying. If any are found, defer the
      // replace() call and let the user resolve them in the review modal.
      const groups = findDuplicateGroups(changes);
      if (groups.length > 0) {
        // Default: keep the first occurrence of each duplicate group, plus
        // every unique row (rows that don't appear in any group).
        const inAnyGroup = new Set<number>();
        groups.forEach((g) => g.indices.forEach((i) => inAnyGroup.add(i)));
        const keep = new Set<number>();
        changes.forEach((_, i) => {
          if (!inAnyGroup.has(i)) keep.add(i);
        });
        groups.forEach((g) => keep.add(g.indices[0]));
        setDupReview({ changes, groups, keep });
        setCsvAlert(null);
        return;
      }
      replace(changes as Parameters<typeof replace>[0]);
      setCsvAlert({
        type: "success",
        message: `Successfully imported ${changes.length} DNS change${changes.length !== 1 ? "s" : ""}.`,
      });
    };
    reader.readAsText(file);
  };

  /**
   * Apply the user's keep/remove decisions from the duplicate-review modal.
   * Rebuilds the change list preserving the original CSV order and replaces
   * the form's field array. Shows a success alert that explicitly reports
   * how many duplicate rows were removed.
   */
  const handleDupReviewApply = () => {
    if (!dupReview) return;
    const kept = dupReview.changes.filter((_, i) => dupReview.keep.has(i));
    const removed = dupReview.changes.length - kept.length;
    replace(kept as Parameters<typeof replace>[0]);
    setCsvAlert({
      type: "success",
      message:
        removed > 0
          ? `Imported ${kept.length} DNS change${kept.length !== 1 ? "s" : ""} (removed ${removed} duplicate${removed !== 1 ? "s" : ""}).`
          : `Successfully imported ${kept.length} DNS change${kept.length !== 1 ? "s" : ""}.`,
    });
    setDupReview(null);
  };

  /** Discard the import entirely; no rows are added to the form. */
  const handleDupReviewCancel = () => {
    setDupReview(null);
    setCsvAlert({
      type: "danger",
      message: "Import cancelled. No changes were added.",
    });
  };

  /** Toggle keep/remove for a single row inside the duplicate modal. */
  const toggleDupKeep = (rowIdx: number) => {
    setDupReview((prev) => {
      if (!prev) return prev;
      const next = new Set(prev.keep);
      if (next.has(rowIdx)) next.delete(rowIdx);
      else next.add(rowIdx);
      return { ...prev, keep: next };
    });
  };

  return (
    <FormProvider {...methods}>
      <form onSubmit={handleSubmit(handleFormSubmit, onInvalid)} noValidate>
        {/* ── Section: Metadata ─────────────────────────────────── */}
        <div
          className="vds-tab-panel-content rounded-3 mb-3"
          style={{
            border: `1px solid ${isDark ? "#4a6789" : "#64748b"}`,
            overflow: "hidden",
            boxShadow: isDark
              ? "0 2px 6px rgba(0,0,0,0.35)"
              : "0 2px 6px rgba(15,23,42,0.10)",
          }}
        >
          <div
            className="px-3 py-2 d-flex align-items-center gap-2"
            style={{
              background: "linear-gradient(90deg, #1e5fa8, #0d1b3e)",
              color: "#ffffff",
              borderBottom: `1px solid ${isDark ? "#3a5377" : "#0d1b3e"}`,
            }}
          >
            <i
              className="bi bi-info-circle-fill"
              style={{ fontSize: "0.95rem", color: "#ffffff" }}
            />
            <span
              className="fw-semibold"
              style={{ color: "#ffffff", fontSize: "0.9rem" }}
            >
              Batch Details
            </span>
          </div>
          <div className="p-3">
            {/* <div
              className="col-12 col-sm-5 col-md-2 d-flex align-items-end mt-md-0"
              style={{ paddingBottom: "0.15rem" }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  background: "#fff",
                  border: "1px solid #dde3ec",
                  borderRadius: "0.45rem",
                  padding: "0.45rem 0.75rem",
                  cursor: "pointer",
                  userSelect: "none",
                  width: "100%",
                }}
                onClick={() => setAllowManualReview((v) => !v)}
              >
                <input
                  type="checkbox"
                  id="allowManualReview"
                  className="form-check-input mt-0"
                  checked={allowManualReview}
                  onChange={(e) => setAllowManualReview(e.target.checked)}
                  style={{ cursor: "pointer", flexShrink: 0 }}
                />
                <label
                  htmlFor="allowManualReview"
                  style={{
                    fontSize: "0.78rem",
                    fontWeight: 600,
                    color: "#4a5568",
                    cursor: "pointer",
                    marginBottom: 0,
                  }}
                >
                  Manual Review
                </label>
              </div>
            </div> */}

            <div className="row g-3 align-items-start">
              <div className="col-12 col-md-6">
                <label
                  className="form-label"
                  style={{
                    fontSize: "0.8rem",
                    fontWeight: 600,
                    color: isDark ? "#cbd5e1" : "#1f2a44",
                  }}
                >
                  Description
                  <span
                    style={{ fontWeight: 400, color: "#9aacbe", marginLeft: 4 }}
                  >
                    (optional)
                  </span>
                </label>
                <textarea
                  className="form-control form-control-sm"
                  rows={2}
                  placeholder="Brief description of this batch change"
                  style={{
                    background: isDark ? "#1a2640" : "#fff",
                    color: isDark ? "#cdd9ed" : "#212529",
                    borderColor: isDark ? "rgba(127,168,216,0.2)" : "#dde3ec",
                    boxShadow: "none",
                    borderRadius: "0.45rem",
                    resize: "none",
                  }}
                  {...register("comments")}
                />
              </div>
              <div className="col-12 col-sm-7 col-md-4">
                <label
                  className="form-label"
                  style={{
                    fontSize: "0.8rem",
                    fontWeight: 600,
                    color: isDark ? "#cbd5e1" : "#1f2a44",
                  }}
                >
                  Owner Group
                  <span
                    style={{ fontWeight: 400, color: "#9aacbe", marginLeft: 4 }}
                  >
                    (optional)
                  </span>
                </label>
                {groups.length > 0 ? (
                  <select
                    className={`form-select form-select-sm${ownerGroupError ? " is-invalid" : ""}`}
                    style={{
                      background: isDark ? "#1a2640" : "#fff",
                      color: isDark ? "#cdd9ed" : "#212529",
                      borderColor: ownerGroupError
                        ? "#dc3545"
                        : isDark
                          ? "rgba(127,168,216,0.2)"
                          : "#dde3ec",
                      boxShadow: "none",
                      borderRadius: "0.45rem",
                    }}
                    {...register("ownerGroupId")}
                  >
                    <option value="">— No owner group —</option>
                    {groups
                      .slice()
                      .sort((a, b) => a.name.localeCompare(b.name))
                      .map((g) => (
                        <option key={g.id} value={g.id}>
                          {g.name}
                        </option>
                      ))}
                  </select>
                ) : (
                  <input
                    className={`form-control form-control-sm${ownerGroupError ? " is-invalid" : ""}`}
                    placeholder="Required for shared zone records"
                    style={{
                      background: isDark ? "#1a2640" : "#fff",
                      color: isDark ? "#cdd9ed" : "#212529",
                      borderColor: ownerGroupError
                        ? "#dc3545"
                        : isDark
                          ? "rgba(127,168,216,0.2)"
                          : "#dde3ec",
                      boxShadow: "none",
                      borderRadius: "0.45rem",
                    }}
                    {...register("ownerGroupId")}
                  />
                )}
                {ownerGroupError && (
                  <div
                    style={{
                      fontSize: "0.78rem",
                      color: "#b02a37",
                      marginTop: 4,
                    }}
                  >
                    <i className="bi bi-exclamation-circle me-1" />
                    <strong>
                      Record Owner Group is required for records in shared
                      zones.
                    </strong>
                  </div>
                )}
                <div
                  style={{
                    fontSize: "0.76rem",
                    color: "#6b7a90",
                    marginTop: 4,
                  }}
                >
                  Or you can{" "}
                  <a href="/groups" style={{ color: "#1e5fa8" }}>
                    create a new group from the Groups page
                  </a>
                  .
                </div>
              </div>
              <ScheduledTimeField
                register={register}
                watch={watch}
                isDark={isDark}
              />
              {/* <div
              className="col-12 col-sm-5 col-md-2 d-flex align-items-end mt-md-0"
              style={{ paddingBottom: "0.15rem" }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  background: "#fff",
                  border: "1px solid #dde3ec",
                  borderRadius: "0.45rem",
                  padding: "0.45rem 0.75rem",
                  cursor: "pointer",
                  userSelect: "none",
                  width: "100%",
                }}
                onClick={() => setAllowManualReview((v) => !v)}
              >
                <input
                  type="checkbox"
                  id="allowManualReview"
                  className="form-check-input mt-0"
                  checked={allowManualReview}
                  onChange={(e) => setAllowManualReview(e.target.checked)}
                  style={{ cursor: "pointer", flexShrink: 0 }}
                />
                <label
                  htmlFor="allowManualReview"
                  style={{
                    fontSize: "0.78rem",
                    fontWeight: 600,
                    color: "#4a5568",
                    cursor: "pointer",
                    marginBottom: 0,
                  }}
                >
                  Manual Review
                </label>
              </div>
            </div> */}
            </div>
          </div>
        </div>

        {/* ── Section: Changes ──────────────────────────────────── */}
        <div
          className="vds-tab-panel-content rounded-3 mb-3"
          style={{
            border: `1px solid ${isDark ? "#4a6789" : "#64748b"}`,
            overflow: "hidden",
            boxShadow: isDark
              ? "0 2px 6px rgba(0,0,0,0.35)"
              : "0 2px 6px rgba(15,23,42,0.10)",
          }}
        >
          <div
            className="px-3 py-2 d-flex align-items-center justify-content-between flex-wrap gap-2"
            style={{
              background: "linear-gradient(90deg, #1e5fa8, #0d1b3e)",
              color: "#ffffff",
              borderBottom: `1px solid ${isDark ? "#3a5377" : "#0d1b3e"}`,
            }}
          >
            <div className="d-flex align-items-center gap-2">
              <i
                className="bi bi-list-check"
                style={{ fontSize: "0.95rem", color: "#ffffff" }}
              />
              <span
                className="fw-semibold"
                style={{ color: "#ffffff", fontSize: "0.9rem" }}
              >
                DNS Changes
              </span>
              {fields.length > 0 && (
                <span
                  style={{
                    background: "rgba(255,255,255,0.18)",
                    color: "#ffffff",
                    fontSize: "0.72rem",
                    fontWeight: 700,
                    borderRadius: "999px",
                    padding: "2px 9px",
                    border: "1px solid rgba(255,255,255,0.25)",
                  }}
                >
                  {fields.length}
                </span>
              )}
            </div>
            <div className="d-flex align-items-center gap-2">
              <button
                type="button"
                className="btn btn-sm"
                disabled={fields.length >= BATCH_CHANGE_LIMIT}
                onClick={() =>
                  append({
                    changeType: "Add",
                    inputName: "",
                    type: "A+PTR",
                    ttl: undefined,
                    record: {},
                  })
                }
                style={{
                  background:
                    fields.length >= BATCH_CHANGE_LIMIT
                      ? "#c8d4e0"
                      : "linear-gradient(90deg, #1e5fa8, #0d1b3e)",
                  border: "none",
                  color: "#fff",
                  borderRadius: "0.45rem",
                  padding: "0.35rem 0.85rem",
                  fontSize: "0.82rem",
                  fontWeight: 600,
                  boxShadow:
                    fields.length >= BATCH_CHANGE_LIMIT
                      ? "none"
                      : "0 2px 8px rgba(30,95,168,.25)",
                  transition: "box-shadow 0.2s",
                  cursor:
                    fields.length >= BATCH_CHANGE_LIMIT
                      ? "not-allowed"
                      : "pointer",
                }}
                onMouseEnter={(e) => {
                  if (fields.length < BATCH_CHANGE_LIMIT)
                    e.currentTarget.style.boxShadow =
                      "0 3px 12px rgba(30,95,168,.35)";
                }}
                onMouseLeave={(e) => {
                  if (fields.length < BATCH_CHANGE_LIMIT)
                    e.currentTarget.style.boxShadow =
                      "0 2px 8px rgba(30,95,168,.25)";
                }}
              >
                <i className="bi bi-plus-lg me-1" />
                Add Change
              </button>

              <label
                htmlFor="batchChangeCsv"
                className="btn btn-sm mb-0"
                style={{
                  background: isDark ? "#1e293b" : "#fff",
                  border: `1px solid ${isDark ? "#2d4163" : "#d4dae3"}`,
                  color: isDark ? "#94a3b8" : "#4a5568",
                  borderRadius: "0.45rem",
                  padding: "0.33rem 0.8rem",
                  fontSize: "0.82rem",
                  fontWeight: 600,
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                }}
              >
                <i className="bi bi-upload me-1" />
                Import CSV
              </label>
              <input
                ref={csvFileRef}
                type="file"
                id="batchChangeCsv"
                accept=".csv"
                style={{ display: "none" }}
                onChange={handleCsvImport}
              />
            </div>
          </div>

          <div className="p-3">
            {csvAlert && (
              <div
                className={`alert alert-${csvAlert.type} d-flex align-items-center gap-2 py-2 px-3`}
                style={{ fontSize: "0.82rem", marginBottom: "0.75rem" }}
              >
                <i
                  className={`bi ${csvAlert.type === "success" ? "bi-check-circle" : "bi-exclamation-triangle"}`}
                />
                {csvAlert.message}
                <button
                  type="button"
                  onClick={() => setCsvAlert(null)}
                  style={{
                    marginLeft: "auto",
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                    padding: "0.25rem 0.6rem",
                    fontSize: "0.75rem",
                    fontWeight: 500,
                    border: `1px solid ${csvAlert.type === "success" ? "rgba(34,197,94,0.3)" : "rgba(239,68,68,0.3)"}`,
                    background:
                      csvAlert.type === "success"
                        ? "rgba(34,197,94,0.08)"
                        : "rgba(239,68,68,0.08)",
                    color: csvAlert.type === "success" ? "#059669" : "#dc2626",
                    borderRadius: "0.35rem",
                    cursor: "pointer",
                    transition: "all 0.15s ease",
                    outline: "none",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background =
                      csvAlert.type === "success"
                        ? "rgba(34,197,94,0.15)"
                        : "rgba(239,68,68,0.15)";
                    e.currentTarget.style.borderColor =
                      csvAlert.type === "success"
                        ? "rgba(34,197,94,0.5)"
                        : "rgba(239,68,68,0.5)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background =
                      csvAlert.type === "success"
                        ? "rgba(34,197,94,0.08)"
                        : "rgba(239,68,68,0.08)";
                    e.currentTarget.style.borderColor =
                      csvAlert.type === "success"
                        ? "rgba(34,197,94,0.3)"
                        : "rgba(239,68,68,0.3)";
                  }}
                >
                  <i className="bi bi-x-lg" />
                  Dismiss
                </button>
              </div>
            )}

            {fields.length >= BATCH_CHANGE_LIMIT && (
              <div
                className="alert alert-warning d-flex align-items-center gap-2 py-2 px-3"
                style={{ fontSize: "0.82rem", marginBottom: "0.75rem" }}
              >
                <i className="bi bi-exclamation-triangle-fill" />
                Limit reached. Cannot add more than {BATCH_CHANGE_LIMIT} records
                per DNS change.
              </div>
            )}

            <div style={{ marginBottom: "0.75rem" }}>
              <a
                href="https://www.vinyldns.io/portal/dns-changes#dns-change-csv-import"
                target="_blank"
                rel="noopener noreferrer"
                style={{ fontSize: "0.78rem", color: "#1e5fa8" }}
              >
                <i className="bi bi-box-arrow-up-right me-1" />
                See documentation for sample CSV format
              </a>
            </div>

            {fields.length === 0 ? (
              <div
                style={{
                  border: `2px dashed ${isDark ? "#3d5273" : "#94a3b8"}`,
                  borderRadius: "0.65rem",
                  padding: "2.5rem 1rem",
                  textAlign: "center",
                  color: isDark ? "#64748b" : "#475569",
                  background: isDark ? "#1e293b" : "#f8fafc",
                }}
              >
                <i
                  className="bi bi-plus-circle"
                  style={{
                    fontSize: "1.6rem",
                    display: "block",
                    marginBottom: "0.5rem",
                  }}
                />
                <span style={{ fontSize: "0.85rem", fontWeight: 500 }}>
                  No changes added yet
                </span>
                <br />
                <span style={{ fontSize: "0.78rem" }}>
                  Click <strong>Add Change</strong> to get started
                </span>
              </div>
            ) : (
              fields.map((field, index) => (
                <ChangeRow
                  key={field.id}
                  index={index}
                  remove={remove}
                  serverErrors={effectiveRowErrors[index]}
                />
              ))
            )}
          </div>
        </div>

        {/* ── Footer Actions ────────────────────────────────────── */}
        <div
          style={{
            paddingTop: "1rem",
            borderTop: `1px solid ${isDark ? "#2d4163" : "#e8ecf0"}`,
          }}
        >
          {pendingSubmitData ? (
            // Two-step confirmation panel — matches AngularJS pendingConfirm step.
            <div>
              <div
                className="d-flex align-items-start gap-2 p-3 mb-3"
                style={{
                  background: isDark
                    ? "rgba(255,193,7,0.08)"
                    : "rgba(255,193,7,0.12)",
                  border: "1px solid rgba(255,193,7,0.35)",
                  borderRadius: "0.5rem",
                  fontSize: "0.85rem",
                  color: isDark ? "#ffe082" : "#664d03",
                }}
              >
                <i
                  className="bi bi-exclamation-triangle-fill mt-1"
                  style={{ flexShrink: 0 }}
                />
                <div>
                  <strong>Review before submitting:</strong> You are about to
                  submit{" "}
                  <strong>
                    {pendingSubmitData.data.changes.length} DNS change
                    {pendingSubmitData.data.changes.length !== 1 ? "s" : ""}
                  </strong>
                  .
                  {pendingSubmitData.data.scheduledTime && (
                    <>
                      {" "}
                      Scheduled for:{" "}
                      <strong>{pendingSubmitData.data.scheduledTime}</strong>.
                    </>
                  )}{" "}
                  This action cannot be undone once submitted.
                </div>
              </div>
              <div className="d-flex align-items-center gap-2">
                <button
                  type="button"
                  onClick={handleConfirmSubmit}
                  disabled={isSubmitting}
                  style={{
                    background: isSubmitting
                      ? "#c8d4e0"
                      : "linear-gradient(90deg, #1e5fa8, #0d1b3e)",
                    border: "none",
                    color: "#fff",
                    borderRadius: "0.45rem",
                    padding: "0.45rem 1.4rem",
                    fontSize: "0.85rem",
                    fontWeight: 600,
                    boxShadow: isSubmitting
                      ? "none"
                      : "0 2px 8px rgba(30,95,168,.25)",
                    cursor: isSubmitting ? "not-allowed" : "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  {isSubmitting ? (
                    <>
                      <span className="spinner-border spinner-border-sm" />
                      Submitting…
                    </>
                  ) : (
                    <>
                      <i className="bi bi-send-fill" />
                      Confirm &amp; Submit
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={handleBackToEdit}
                  disabled={isSubmitting}
                  style={{
                    background: isDark ? "#1e293b" : "#fff",
                    border: `1px solid ${isDark ? "#2d4163" : "#d4dae3"}`,
                    color: isDark ? "#94a3b8" : "#5a6a85",
                    borderRadius: "0.45rem",
                    padding: "0.45rem 1.1rem",
                    fontSize: "0.85rem",
                    fontWeight: 600,
                    cursor: isSubmitting ? "not-allowed" : "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  <i className="bi bi-arrow-left" />
                  Back to Edit
                </button>
              </div>
            </div>
          ) : (
            <div className="d-flex align-items-center gap-2">
              <button
                type="submit"
                disabled={fields.length === 0 || isSubmitting}
                style={{
                  background:
                    fields.length === 0 || isSubmitting
                      ? "#c8d4e0"
                      : "linear-gradient(90deg, #1e5fa8, #0d1b3e)",
                  border: "none",
                  color: "#fff",
                  borderRadius: "0.45rem",
                  padding: "0.45rem 1.4rem",
                  fontSize: "0.85rem",
                  fontWeight: 600,
                  boxShadow:
                    fields.length === 0 || isSubmitting
                      ? "none"
                      : "0 2px 8px rgba(30,95,168,.25)",
                  cursor:
                    fields.length === 0 || isSubmitting
                      ? "not-allowed"
                      : "pointer",
                  transition: "all 0.2s",
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                }}
                onMouseEnter={(e) => {
                  if (fields.length > 0 && !isSubmitting)
                    e.currentTarget.style.boxShadow =
                      "0 3px 12px rgba(30,95,168,.35)";
                }}
                onMouseLeave={(e) => {
                  if (fields.length > 0 && !isSubmitting)
                    e.currentTarget.style.boxShadow =
                      "0 2px 8px rgba(30,95,168,.25)";
                }}
              >
                {isSubmitting ? (
                  <>
                    <span className="spinner-border spinner-border-sm" />
                    Submitting…
                  </>
                ) : (
                  <>
                    <i className="bi bi-send-fill" />
                    Submit Batch Change
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={onCancel}
                disabled={isSubmitting}
                style={{
                  background: isDark ? "#1e293b" : "#fff",
                  border: `1px solid ${isDark ? "#2d4163" : "#d4dae3"}`,
                  color: isDark ? "#94a3b8" : "#5a6a85",
                  borderRadius: "0.45rem",
                  padding: "0.45rem 1.1rem",
                  fontSize: "0.85rem",
                  fontWeight: 600,
                  cursor: isSubmitting ? "not-allowed" : "pointer",
                  transition: "all 0.15s",
                }}
                onMouseEnter={(e) => {
                  if (!isSubmitting) {
                    e.currentTarget.style.borderColor = "#1e5fa8";
                    e.currentTarget.style.color = "#1e5fa8";
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isSubmitting) {
                    e.currentTarget.style.borderColor = isDark
                      ? "#2d4163"
                      : "#d4dae3";
                    e.currentTarget.style.color = isDark
                      ? "#94a3b8"
                      : "#5a6a85";
                  }
                }}
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      </form>
      {dupReview && (
        <DuplicateReviewModal
          state={dupReview}
          isDark={isDark}
          onToggleKeep={toggleDupKeep}
          onApply={handleDupReviewApply}
          onCancel={handleDupReviewCancel}
        />
      )}
    </FormProvider>
  );
}
