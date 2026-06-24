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

import React, { useState, useMemo, useCallback, useEffect } from "react";
import { useParams, Link, useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { dnsChangeService } from "../services/dnsChangeService";
import { LoadingSpinner } from "../components/common/LoadingSpinner";
import { formatDateTime } from "../utils/dateUtils";
import { copyToClipboard } from "../utils/dateUtils";
import { useDnsChanges } from "../hooks/useDnsChanges";
import { useProfile } from "../contexts/ProfileContext";
import { useBreadcrumbs } from "../contexts/BreadcrumbContext";
import { Pagination } from "../components/common/Pagination";
import type { SingleChange, ValidationError } from "../types/dnsChange";

/**
 * Maps a batch change status string from the API to the corresponding VDS
 * badge modifier class. Used wherever the batch-level status is displayed.
 */
export function batchStatusClass(status: string): string {
  switch (status) {
    case "Complete":
      return "vds-status-badge--success";
    case "Failed":
      return "vds-status-badge--danger";
    case "PartialFailure":
      return "vds-status-badge--warning";
    case "PendingProcessing":
      return "vds-status-badge--info";
    case "PendingReview":
      return "vds-status-badge--warning";
    case "Rejected":
      return "vds-status-badge--danger";
    case "Scheduled":
      return "vds-status-badge--info";
    case "Cancelled":
      return "vds-status-badge--secondary";
    default:
      return "vds-status-badge--secondary";
  }
}

/** Returns a display-friendly label for batch statuses whose API values are not human-readable. */
export function batchStatusLabel(status: string): string {
  const map: Record<string, string> = {
    PartialFailure: "Partial Failure",
    PendingProcessing: "Pending Processing",
    PendingReview: "Pending Review",
  };
  return map[status] ?? status;
}

/**
 * Maps the batch approval workflow status to a VDS badge modifier class.
 * Approval status is separate from the overall batch execution status and
 * only applies to changes that require manual review.
 */
export function approvalStatusClass(status: string): string {
  switch (status) {
    case "PendingReview":
      return "vds-status-badge--warning";
    case "ManuallyApproved":
      return "vds-status-badge--success";
    case "ManuallyRejected":
      return "vds-status-badge--danger";
    case "Cancelled":
      return "vds-status-badge--secondary";
    default:
      return "vds-status-badge--secondary";
  }
}

/** Converts approval status API values to human-readable labels. */
export function approvalStatusLabel(status: string): string {
  const map: Record<string, string> = {
    PendingReview: "Pending Review",
    ManuallyApproved: "Approved",
    ManuallyRejected: "Rejected",
  };
  return map[status] ?? status;
}

/**
 * Maps the per-row SingleChange status to a VDS badge modifier class.
 * Each row in a batch tracks its own processing status independently.
 */
function changeStatusClass(status: string): string {
  switch (status) {
    case "Complete":
      return "vds-status-badge--success";
    case "Pending":
      return "vds-status-badge--info";
    case "NeedsReview":
      return "vds-status-badge--warning";
    case "Failed":
      return "vds-status-badge--danger";
    case "Rejected":
      return "vds-status-badge--danger";
    case "Cancelled":
      return "vds-status-badge--secondary";
    default:
      return "vds-status-badge--secondary";
  }
}

/** Returns display labels for per-change statuses that differ from their API representation. */
function changeStatusLabel(status: string): string {
  const map: Record<string, string> = { NeedsReview: "Needs Review" };
  return map[status] ?? status;
}

/** Returns true when the document is currently using the dark VDS theme. */
function isDarkTheme(): boolean {
  return (
    document.documentElement.getAttribute("data-vds-theme") === "dark" ||
    window.matchMedia("(prefers-color-scheme: dark)").matches
  );
}

/**
 * Returns inline color styles for a per-row change status badge, matching
 * the exact palette used by RecordHistoryModal's historyStatusStyle().
 */
function changeStatusStyle(status: string): React.CSSProperties {
  const isDark = isDarkTheme();
  if (status === "Complete")
    return {
      background: isDark ? "rgba(6,78,59,0.25)" : "#ecfdf5",
      color: isDark ? "#34d399" : "#065f46",
      border: isDark ? "1px solid rgba(52,211,153,0.3)" : "1px solid #a7f3d0",
    };
  if (status === "Failed" || status === "Rejected")
    return {
      background: isDark ? "rgba(153,27,27,0.25)" : "#fef2f2",
      color: isDark ? "#f87171" : "#991b1b",
      border: isDark ? "1px solid rgba(248,113,113,0.3)" : "1px solid #fecaca",
    };
  if (status === "NeedsReview")
    return {
      background: isDark ? "rgba(146,64,14,0.25)" : "#fffbeb",
      color: isDark ? "#fbbf24" : "#92400e",
      border: isDark ? "1px solid rgba(251,191,36,0.3)" : "1px solid #fde68a",
    };
  if (status === "Pending")
    return {
      background: isDark ? "rgba(37,99,235,0.25)" : "#dbeafe",
      color: isDark ? "#60a5fa" : "#1e40af",
      border: isDark ? "1px solid rgba(96,165,250,0.3)" : "1px solid #bfdbfe",
    };
  // Cancelled / default → secondary
  return {
    background: isDark ? "rgba(107,114,128,0.15)" : "#f1f5f9",
    color: isDark ? "#9ca3af" : "#475569",
    border: isDark ? "1px solid rgba(107,114,128,0.3)" : "1px solid #e2e8f0",
  };
}

/**
 * Renders the record data portion of a SingleChange in a type-aware format.
 * Each DNS record type carries different fields, so the cell switches on
 * `change.type` to display the relevant values. Multi-field types (MX, SRV,
 * NAPTR) render as a compact list; scalar types render as a monospace span.
 */
/** Returns a plain-text summary of a SingleChange's record data for the hover tooltip. */
export function singleChangeRecordText(change: SingleChange): string {
  const rec = change.record ?? {};
  switch (change.type) {
    case "A":
    case "AAAA":
    case "A+PTR":
    case "AAAA+PTR":
      return String(rec.address ?? "—");
    case "CNAME":
      return String(rec.cname ?? "—");
    case "PTR":
      return String(rec.ptrdname ?? "—");
    case "TXT":
    case "SPF":
      return String(rec.text ?? "—");
    case "NS":
      return String(rec.nsdname ?? "—");
    case "MX":
      return `Preference: ${String(rec.preference ?? "")}  ·  Exchange: ${String(rec.exchange ?? "")}`;
    case "NAPTR":
      return [
        `Order: ${String(rec.order ?? "")}`,
        `Preference: ${String(rec.preference ?? "")}`,
        `Flags: ${String(rec.flags ?? "")}`,
        `Service: ${String(rec.service ?? "")}`,
        `Regexp: ${String(rec.regexp ?? "")}`,
        `Replacement: ${String(rec.replacement ?? "")}`,
      ].join("  ·  ");
    case "SRV":
      return `Priority: ${String(rec.priority ?? "")}  ·  Weight: ${String(rec.weight ?? "")}  ·  Port: ${String(rec.port ?? "")}  ·  Target: ${String(rec.target ?? "")}`;
    default:
      return "—";
  }
}

function RecordDataCell({ change }: { change: SingleChange }) {
  const rec = change.record ?? {};

  let content: React.ReactNode;
  switch (change.type) {
    case "A":
    case "AAAA":
    case "A+PTR":
    case "AAAA+PTR":
      content = (
        <span className="vds-table-secondary small">
          {String(rec.address ?? "—")}
        </span>
      );
      break;
    case "CNAME":
      content = (
        <span className="vds-table-secondary small">
          {String(rec.cname ?? "—")}
        </span>
      );
      break;
    case "PTR":
      content = (
        <span className="vds-table-secondary small">
          {String(rec.ptrdname ?? "—")}
        </span>
      );
      break;
    case "TXT":
    case "SPF":
      content = (
        <span className="vds-table-secondary small">
          {String(rec.text ?? "—")}
        </span>
      );
      break;
    case "MX":
      content = (
        <ul className="mb-0 ps-3 small">
          <li>Preference: {String(rec.preference ?? "")}</li>
          <li>Exchange: {String(rec.exchange ?? "")}</li>
        </ul>
      );
      break;
    case "NS":
      content = (
        <span className="vds-table-secondary small">
          {String(rec.nsdname ?? "—")}
        </span>
      );
      break;
    case "NAPTR":
      content = (
        <ul className="mb-0 ps-3 small">
          <li>Order: {String(rec.order ?? "")}</li>
          <li>Preference: {String(rec.preference ?? "")}</li>
          <li>Flags: {String(rec.flags ?? "")}</li>
          <li>Service: {String(rec.service ?? "")}</li>
          <li>Regexp: {String(rec.regexp ?? "")}</li>
          <li>Replacement: {String(rec.replacement ?? "")}</li>
        </ul>
      );
      break;
    case "SRV":
      content = (
        <ul className="mb-0 ps-3 small">
          <li>Priority: {String(rec.priority ?? "")}</li>
          <li>Weight: {String(rec.weight ?? "")}</li>
          <li>Port: {String(rec.port ?? "")}</li>
          <li>Target: {String(rec.target ?? "")}</li>
        </ul>
      );
      break;
    default:
      content = <span className="small vds-table-secondary">{"\u2014"}</span>;
  }

  return (
    <div style={{ wordBreak: "break-all", overflowWrap: "break-word" }}>
      {content}
    </div>
  );
}

/** Builds the display text and error flag for the Additional Info cell.
 * Extracted so it can be reused outside the component (e.g. for column-width
 * estimation in the parent). */
function buildAdditionalInfoText(
  change: SingleChange,
  batchApprovalStatus?: string,
): { text: string; isError: boolean } {
  const errors: string[] = [];
  if (
    batchApprovalStatus !== "AutoApproved" &&
    change.status !== "Rejected" &&
    change.status !== "Cancelled"
  ) {
    if (change.validationErrors && change.validationErrors.length > 0) {
      change.validationErrors.forEach((e) => {
        const errObj = e as ValidationError;
        errors.push(errObj.message ? errObj.message : String(e));
      });
    }
    if (change.systemMessage) errors.push(change.systemMessage);
  }

  if (
    batchApprovalStatus === "AutoApproved" &&
    change.status === "Complete" &&
    !change.systemMessage
  )
    return { text: "No further action is required.", isError: false };

  if (
    batchApprovalStatus === "AutoApproved" &&
    change.status === "Complete" &&
    change.systemMessage
  )
    return { text: `\u2139\ufe0f ${change.systemMessage}`, isError: false };

  if (change.systemMessage && change.status === "Failed")
    return { text: change.systemMessage, isError: true };

  if (errors.length > 0) return { text: errors.join("; "), isError: true };

  return { text: "\u2014", isError: false };
}

/**
 * Renders validation errors, system messages, or informational text for a
 * single change row.
 */
function AdditionalInfoCell({
  change,
  batchApprovalStatus,
}: {
  change: SingleChange;
  batchApprovalStatus?: string;
}) {
  // ── Build the display text ───────────────────────────────────────────────
  const errors: string[] = [];
  if (
    batchApprovalStatus !== "AutoApproved" &&
    change.status !== "Rejected" &&
    change.status !== "Cancelled"
  ) {
    if (change.validationErrors && change.validationErrors.length > 0) {
      change.validationErrors.forEach((e) => {
        const errObj = e as ValidationError;
        errors.push(errObj.message ? errObj.message : String(e));
      });
    }
    if (change.systemMessage) {
      errors.push(change.systemMessage);
    }
  }

  let text = "\u2014";
  let isError = false;

  if (
    batchApprovalStatus === "AutoApproved" &&
    change.status === "Complete" &&
    !change.systemMessage
  ) {
    text = "No further action is required.";
  } else if (
    batchApprovalStatus === "AutoApproved" &&
    change.status === "Complete" &&
    change.systemMessage
  ) {
    text = `\u2139\ufe0f ${change.systemMessage}`;
  } else if (change.systemMessage && change.status === "Failed") {
    text = change.systemMessage;
    isError = true;
  } else if (errors.length > 0) {
    text = errors.join("; ");
    isError = true;
  }

  return (
    <span
      className={`small ${isError ? "text-danger" : "vds-table-secondary"}`}
      style={{ wordBreak: "break-word", overflowWrap: "break-word" }}
    >
      {text}
    </span>
  );
}

/**
 * Visual badge indicating whether a row is an Add, Update, or Delete operation.
 * Each changeType maps to a distinct color modifier so operators can scan the
 * table at a glance without reading the text.
 */
function ChangeTypeBadge({ changeType }: { changeType: string }) {
  let mod = "vds-change-type-badge--default";
  if (changeType === "Add") mod = "vds-change-type-badge--add";
  else if (changeType === "DeleteRecordSet")
    mod = "vds-change-type-badge--delete";
  else if (changeType === "UpdateRecord") mod = "vds-change-type-badge--update";
  return <span className={`vds-change-type-badge ${mod}`}>{changeType}</span>;
}

/**
 * Detail view for a single batch DNS change identified by the `id` URL param.
 * The page covers four responsibilities:
 *  1. Fetching and displaying the full batch metadata and per-row change list.
 *  2. Inline row filtering so operators can quickly locate specific changes.
 *  3. Review actions (approve/reject) gated to super/support users, with a
 *     two-step confirm flow to prevent accidental submissions.
 *  4. Cancellation initiated by the original submitter while the batch is
 *     still in PendingReview state.
 */
export function DnsChangeDetailPage() {
  const { id = "" } = useParams<{ id: string }>();
  const location = useLocation();
  const fromTab = (
    location.state as { fromTab?: "my" | "all"; paging?: unknown } | null
  )?.fromTab;
  const fromPaging = (
    location.state as { fromTab?: "my" | "all"; paging?: unknown } | null
  )?.paging;
  const backState =
    fromTab || fromPaging ? { tab: fromTab, paging: fromPaging } : undefined;
  const { profile } = useProfile();
  const { approveBatchChange, rejectBatchChange, cancelBatchChange } =
    useDnsChanges();
  const { setCrumbs } = useBreadcrumbs();

  // Review actions are restricted to super-admins and support users.
  const canReview = Boolean(profile?.isSuper || profile?.isSupport);
  // Compare user IDs (UUIDs) for reliable ownership checks.
  const currentUserId = profile?.id ?? "";

  // Breadcrumb trail updates whenever the batch ID changes; cleaned up on unmount.
  useEffect(() => {
    setCrumbs([
      {
        label: "DNS Changes",
        to: "/dnschanges",
        state: backState,
      },
      { label: id ? `${id.substring(0, 8)}\u2026` : "Detail" },
    ]);
    return () => setCrumbs(null);
  }, [id, fromTab, fromPaging, setCrumbs]);

  // Single search box that filters changes across all visible columns. Empty
  // string means "show all rows" and is also the trigger that CSV export uses
  // to decide whether to export every row or only the visible (filtered) ones.
  const [searchQuery, setSearchQuery] = useState("");
  const [reviewComment, setReviewComment] = useState("");
  const [reviewType, setReviewType] = useState<"approve" | "reject" | null>(
    null,
  );
  const [showCancelModal, setShowCancelModal] = useState(false);
  // Shows a brief "Copied!" confirmation on the Batch ID copy button.
  const [idCopied, setIdCopied] = useState(false);
  const [pageSize, setPageSize] = useState(100);
  const [pageNum, setPageNum] = useState(1);
  // Incremented by a MutationObserver when data-vds-theme changes so
  // changeStatusStyle() re-evaluates isDarkTheme() on the next render.
  const [, setThemeRefresh] = useState(0);

  useEffect(() => {
    const obs = new MutationObserver(() => setThemeRefresh((n) => n + 1));
    obs.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-vds-theme"],
    });
    return () => obs.disconnect();
  }, []);

  const handleCopyId = () => {
    if (!change) return;
    void copyToClipboard(change.id).then((ok) => {
      if (!ok) return;
      setIdCopied(true);
      setTimeout(() => setIdCopied(false), 2000);
    });
  };

  const {
    data: change,
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ["dnschange", id],
    queryFn: async () => {
      const res = await dnsChangeService.getBatchChange(id);
      return res.data;
    },
    enabled: Boolean(id),
  });

  // Two-phase confirm: the first click sets reviewType to "approve", revealing
  // a confirm button; the second click triggers the mutation. This prevents
  // accidental approvals from a single misclick.
  const handleApprove = useCallback(() => {
    if (!change) return;
    if (reviewType === "approve") {
      approveBatchChange(
        { id: change.id, comment: reviewComment || undefined },
        {
          onSuccess: () => {
            void refetch();
            setReviewType(null);
            setReviewComment("");
          },
        },
      );
    } else {
      setReviewType("approve");
    }
  }, [reviewType, change, reviewComment, approveBatchChange, refetch]);

  // Same two-phase pattern as handleApprove — guards against accidental rejection.
  const handleReject = useCallback(() => {
    if (!change) return;
    if (reviewType === "reject") {
      rejectBatchChange(
        { id: change.id, comment: reviewComment || undefined },
        {
          onSuccess: () => {
            void refetch();
            setReviewType(null);
            setReviewComment("");
          },
        },
      );
    } else {
      setReviewType("reject");
    }
  }, [reviewType, change, reviewComment, rejectBatchChange, refetch]);

  const handleCancelReview = useCallback(() => {
    setReviewType(null);
    setReviewComment("");
  }, []);

  const handleCancelChange = useCallback(() => {
    if (!change) return;
    cancelBatchChange(change.id, {
      onSuccess: () => {
        setShowCancelModal(false);
        void refetch();
      },
    });
  }, [change, cancelBatchChange, refetch]);

  // Single global search across every visible column — case-insensitive
  // substring match against any field shown in the row.
  const filteredChanges = useMemo(() => {
    const all = change?.changes ?? [];
    const q = searchQuery.trim().toLowerCase();
    if (!q) return all;
    return all.filter((c) => {
      const recStr = Object.values(c.record ?? {})
        .map(String)
        .join(" ");
      const errStr = (c.validationErrors ?? [])
        .map((e) =>
          e && typeof e === "object" && "message" in (e as object)
            ? String((e as { message: unknown }).message)
            : String(e),
        )
        .join(" ");
      const haystack = [
        c.changeType,
        c.inputName,
        c.recordName,
        c.zoneName,
        c.type,
        recStr,
        c.ttl != null ? String(c.ttl) : "",
        c.status,
        c.systemMessage,
        errStr,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [searchQuery, change]);

  // Reset to page 1 whenever the search query changes.
  useEffect(() => {
    setPageNum(1);
  }, [searchQuery]);

  const hasActiveSearch = searchQuery.trim().length > 0;

  // Client-side pagination over the filtered result set.
  const totalPages = Math.max(1, Math.ceil(filteredChanges.length / pageSize));
  const nextPageEnabled = pageNum < totalPages;
  const prevPageEnabled = pageNum > 1;
  const pageSizes = ([10, 25, 50, 100] as const).filter(
    (s) => s <= pageSize || nextPageEnabled,
  );
  const displayedChanges = filteredChanges.slice(
    (pageNum - 1) * pageSize,
    pageNum * pageSize,
  );

  if (isLoading) return <LoadingSpinner />;

  if (!change)
    return (
      <div className="vds-empty-state">
        <i
          className="bi bi-exclamation-triangle fs-1 mb-2 text-danger"
          style={{ opacity: 0.7 }}
        />
        <p className="mb-0 fw-semibold">Batch change not found</p>
        <small className="text-muted mb-3">
          The requested DNS change does not exist or was removed.
        </small>
        <Link
          to="/dnschanges"
          state={backState}
          className="btn btn-sm btn-outline-primary mt-2"
        >
          <i className="bi bi-arrow-left me-1" />
          Back to DNS Changes
        </Link>
      </div>
    );

  // `approvalStatus` is optional in the API response; fall back to `status`
  // (always present) so cancel/review guards work even when the field is absent.
  const approvalStatus = change.approvalStatus ?? change.status ?? "";
  const isPendingReview =
    approvalStatus === "PendingReview" || change.status === "PendingReview";
  // Cancel is owner-only — the API rejects cancel attempts from anyone
  // other than the original submitter, even super users.
  const isOwner = Boolean(currentUserId) && change.userId === currentUserId;
  const canCancelChange = isPendingReview && isOwner;
  const reviewConfirmationMsg =
    reviewType === "approve"
      ? "Confirm approval of this DNS change?"
      : "Confirm rejection of this DNS change?";
  // Show the review status badge for all states that involve manual review;
  // omit it for AutoApproved batches where the field adds no value.
  const showReviewStatus =
    approvalStatus === "PendingReview" ||
    approvalStatus === "ManuallyApproved" ||
    approvalStatus === "ManuallyRejected" ||
    approvalStatus === "Cancelled" ||
    change.status === "PendingReview";

  return (
    <div>
      <div className="vds-page-header rounded-3 mb-3 d-flex justify-content-between align-items-center flex-wrap gap-3">
        <div className="d-flex align-items-center gap-3">
          <div className="vds-page-header__icon rounded-3 d-flex align-items-center justify-content-center">
            <i className="bi bi-list-ol text-white fs-5" />
          </div>
          <div>
            <div className="d-flex align-items-center gap-2 flex-wrap mb-1">
              <h4 className="mb-0 fw-bold vds-page-header__title">
                DNS Change
              </h4>
              <span
                className={`vds-status-badge ${batchStatusClass(change.status)}`}
              >
                {batchStatusLabel(change.status)}
              </span>
            </div>
            <small className="text-muted font-monospace">{change.id}</small>
          </div>
        </div>
        <div className="d-flex gap-2 flex-wrap">
          <Link
            to="/dnschanges"
            state={backState}
            className="btn btn-sm vds-btn-flat d-flex align-items-center gap-1"
            title="Back to DNS Changes"
          >
            <i className="bi bi-arrow-left" />
            <span className="vds-btn-flat__label">Back</span>
          </Link>
          <button
            type="button"
            className="btn btn-sm vds-btn-flat d-flex align-items-center gap-1"
            onClick={() =>
              dnsChangeService.exportToCsv(change, {
                rows: hasActiveSearch ? filteredChanges : undefined,
              })
            }
            title={
              hasActiveSearch
                ? `Export ${filteredChanges.length} filtered row${filteredChanges.length === 1 ? "" : "s"}`
                : "Export all rows"
            }
          >
            <i className="bi bi-download" />
            <span className="vds-btn-flat__label">Export CSV</span>
          </button>
        </div>
      </div>

      <div className="vds-info-tiles mb-3">
        <div className="vds-info-tile">
          <i className="bi bi-hash vds-info-tile__icon" />
          <div className="vds-info-tile__label">Batch ID</div>
          <div className="d-flex align-items-center gap-2">
            <div className="vds-info-tile__value font-monospace text-break flex-grow-1">
              {change.id}
            </div>
            <button
              type="button"
              className="btn btn-sm p-0 border-0 bg-transparent vds-copy-btn flex-shrink-0 vds-info-tile__copy"
              title={idCopied ? "Copied!" : "Copy Batch ID"}
              style={{
                color: idCopied ? "#22c55e" : undefined,
                transition: "color 0.15s",
              }}
              onClick={handleCopyId}
            >
              <i className={idCopied ? "bi bi-check2" : "bi bi-clipboard"} />
              {idCopied && (
                <span style={{ fontSize: "0.72rem", marginLeft: 3 }}>
                  Copied!
                </span>
              )}
            </button>
          </div>
        </div>
        <div className="vds-info-tile">
          <i className="bi bi-clock-history vds-info-tile__icon" />
          <div className="vds-info-tile__label">Submitted</div>
          <div className="vds-info-tile__value">
            {formatDateTime(change.createdTimestamp)}
          </div>
        </div>
        {!isOwner && (
          <div className="vds-info-tile">
            <i className="bi bi-person-circle vds-info-tile__icon" />
            <div className="vds-info-tile__label">Submitter</div>
            <div className="vds-info-tile__value">{change.userName}</div>
          </div>
        )}
        {(change.ownerGroupName || change.ownerGroupId) && (
          <div className="vds-info-tile">
            <i className="bi bi-people-fill vds-info-tile__icon" />
            <div className="vds-info-tile__label">Owner Group</div>
            <div className="vds-info-tile__value">
              {change.ownerGroupName ?? (
                <span className="text-danger small">
                  <i className="bi bi-exclamation-triangle-fill me-1" />
                  Group deleted
                </span>
              )}
            </div>
          </div>
        )}
        {change.scheduledTime && (
          <div className="vds-info-tile">
            <i className="bi bi-calendar-event vds-info-tile__icon" />
            <div className="vds-info-tile__label">Scheduled</div>
            <div className="vds-info-tile__value">
              {formatDateTime(change.scheduledTime)}
            </div>
          </div>
        )}
        {showReviewStatus && (
          <div className="vds-info-tile">
            <i className="bi bi-shield-check vds-info-tile__icon" />
            <div className="vds-info-tile__label">Review Status</div>
            <div className="mt-2">
              <span
                className={`vds-status-badge ${approvalStatusClass(approvalStatus)}`}
              >
                {approvalStatusLabel(approvalStatus)}
              </span>
            </div>
          </div>
        )}
      </div>

      {change.comments && (
        <div
          className="d-flex gap-2 align-items-start p-3 rounded-3 mb-3 vds-comment-panel"
          style={{
            background: "rgba(30,95,168,0.05)",
            border: "1px solid #6f9ad1",
          }}
        >
          <i
            className="bi bi-chat-left-text text-primary mt-1"
            style={{ fontSize: "0.85rem", flexShrink: 0 }}
          />
          <div>
            <div className="vds-info-label mb-1">Description</div>
            <p className="mb-0 small">{change.comments}</p>
          </div>
        </div>
      )}

      {/* Server-configured contextual notices keyed to the batch status.
          Only rendered when the API returns at least one notice. */}
      {change.notices && change.notices.length > 0 && (
        <div
          className="d-flex gap-2 align-items-start p-3 rounded-3 mb-3 vds-notice-panel"
          style={{
            background: "rgba(13,202,240,0.06)",
            border: "1px solid rgba(13,202,240,0.2)",
          }}
          role="alert"
        >
          <i
            className="bi bi-info-circle-fill mt-1 vds-notice-icon"
            style={{ color: "#0dcaf0", flexShrink: 0 }}
          />
          <div>
            {change.notices.map((n, i) => (
              <p key={i} className="mb-0 small">
                {n}
              </p>
            ))}
          </div>
        </div>
      )}

      {/* PendingReview notice — mirrors the Angular portal's dns-change-notices config entry */}
      {isPendingReview && (
        <div
          role="alert"
          className="d-flex align-items-center gap-3 px-4 py-3 rounded-3 mb-3"
          style={{
            background: "linear-gradient(135deg, #0369a1 0%, #0284c7 100%)",
            border: "1px solid #0ea5e9",
            boxShadow: "0 4px 14px rgba(3,105,161,0.3)",
            color: "#ffffff",
          }}
        >
          <i
            className="bi bi-info-circle-fill flex-shrink-0"
            style={{ fontSize: "1.3rem", opacity: 0.95 }}
          />
          <div style={{ lineHeight: 1.5 }}>
            <span className="fw-semibold" style={{ fontSize: "0.9rem" }}>
              Your DNS Change requires further review.
            </span>{" "}
            <span style={{ fontSize: "0.85rem", opacity: 0.9 }}>
              It will be approved and processed following the review.
            </span>{" "}
            <a
              href="https://www.vinyldns.io/portal/manual-review-scheduling"
              target="_blank"
              rel="noreferrer"
              style={{
                color: "#bae6fd",
                textDecoration: "underline",
                fontWeight: 600,
                fontSize: "0.85rem",
              }}
            >
              See the docs for more information.
            </a>
          </div>
        </div>
      )}

      {(approvalStatus === "ManuallyApproved" ||
        approvalStatus === "ManuallyRejected") && (
        <div
          className="d-flex flex-column gap-2 p-3 rounded-3 mb-3"
          style={{
            background:
              approvalStatus === "ManuallyApproved"
                ? "rgba(34,197,94,0.06)"
                : "rgba(239,68,68,0.06)",
            border: `1px solid ${approvalStatus === "ManuallyApproved" ? "rgba(34,197,94,0.18)" : "rgba(239,68,68,0.16)"}`,
          }}
        >
          <div className="d-flex align-items-center gap-2">
            <i
              className={`bi ${approvalStatus === "ManuallyApproved" ? "bi-check-circle-fill text-success" : "bi-x-circle-fill text-danger"}`}
              style={{ fontSize: "0.95rem" }}
            />
            <span className="fw-semibold small">
              {approvalStatus === "ManuallyApproved" ? "Approved" : "Rejected"}{" "}
              by{" "}
              {change.reviewerUserName ?? (
                <span className="text-danger">
                  <i className="bi bi-exclamation-triangle-fill me-1" />
                  deleted reviewer
                </span>
              )}
              {change.reviewTimestamp && (
                <span className="text-muted fw-normal">
                  {" "}
                  · {formatDateTime(change.reviewTimestamp)}
                </span>
              )}
            </span>
          </div>
          {change.reviewComment && (
            <p className="mb-0 ms-4 small text-muted">{change.reviewComment}</p>
          )}
        </div>
      )}

      <div
        className="vds-tab-panel-content rounded-3 mb-3"
        style={{
          borderTop: isDarkTheme() ? "3px solid #64748b" : "3px solid #94a3b8",
          overflow: "visible",
        }}
      >
        <div className="px-3 py-2 d-flex align-items-center justify-content-between flex-wrap gap-2 vds-section-toolbar">
          <div className="d-flex align-items-center gap-2">
            <i
              className="bi bi-list-check text-primary"
              style={{ fontSize: "0.9rem" }}
            />
            <span className="vds-section-toolbar__title fw-semibold">
              Changes
            </span>
            <span className="vds-count-badge">
              {filteredChanges.length}
              {hasActiveSearch ? ` / ${change.changes?.length ?? 0}` : ""}
            </span>
          </div>
          <div className="d-flex align-items-center gap-2 flex-wrap">
            <button
              type="button"
              className="btn btn-sm vds-btn-flat d-flex align-items-center gap-1"
              onClick={() => void refetch()}
            >
              <i className="bi bi-arrow-clockwise" />
              <span className="vds-btn-flat__label">Refresh</span>
            </button>
            {canCancelChange && (
              <button
                type="button"
                className="btn btn-sm vds-btn-flat vds-btn-flat--cancel d-flex align-items-center gap-1"
                onClick={() => setShowCancelModal(true)}
              >
                <i className="bi bi-x-circle-fill" />
                <span className="vds-btn-flat__label">Cancel Changes</span>
              </button>
            )}
            <span className="vds-toolbar-sep" />
            <div
              className="input-group input-group-sm vds-search-group"
              style={{ width: 280 }}
            >
              <span className="input-group-text border-0 bg-transparent pe-1">
                <i className="bi bi-search text-muted" />
              </span>
              <input
                type="text"
                className="form-control border-0 ps-0 shadow-none bg-transparent"
                placeholder="Search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              {searchQuery && (
                <button
                  type="button"
                  className="btn btn-sm border-0 vds-table-secondary"
                  onClick={() => setSearchQuery("")}
                  title="Clear search"
                >
                  <i className="bi bi-x" />
                </button>
              )}
            </div>
          </div>
        </div>

        <div
          className="vds-zones-table-wrap"
          style={{
            borderRadius: 0,
            boxShadow: "none",
            border: "none",
            overflowX: "auto",
            overflowY: "auto",
            maxHeight: "60vh",
          }}
        >
          {(prevPageEnabled || nextPageEnabled) && (
            <div className="d-flex align-items-center justify-content-end px-3 pt-2">
              <Pagination
                onPrev={() => setPageNum((p) => p - 1)}
                onNext={() => setPageNum((p) => p + 1)}
                prevEnabled={prevPageEnabled}
                nextEnabled={nextPageEnabled}
                rangeLabel={
                  filteredChanges.length > 0
                    ? `${(pageNum - 1) * pageSize + 1}–${Math.min(pageNum * pageSize, filteredChanges.length)} of ${filteredChanges.length}`
                    : undefined
                }
              />
            </div>
          )}
          <table className="vds-zones-table vds-dns-change-detail-table">
            <thead>
              <tr>
                <th>
                  Change
                  <br />
                  Type
                </th>
                <th>Input Name</th>
                <th>Recordset Name</th>
                <th>Zone Name</th>
                <th>
                  Record
                  <br />
                  Type
                </th>
                <th>Record Data</th>
                <th>TTL</th>
                <th>Status</th>
                <th>Additional Info</th>
              </tr>
            </thead>
            <tbody>
              {filteredChanges.length === 0 ? (
                <tr>
                  <td colSpan={9}>
                    <div
                      className="vds-empty-state"
                      style={{
                        border: "none",
                        background: "transparent",
                        padding: "1.5rem",
                      }}
                    >
                      <i
                        className="bi bi-inbox fs-3 mb-2"
                        style={{ opacity: 0.4 }}
                      />
                      <p className="mb-0 fw-semibold small">
                        {hasActiveSearch
                          ? "No changes match your search"
                          : "No changes found"}
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                displayedChanges.map((c) => (
                  <tr
                    key={c.id}
                    className={c.outstandingErrors ? "vds-row-error" : ""}
                  >
                    <td>
                      <ChangeTypeBadge changeType={c.changeType} />
                    </td>
                    <td
                      className="vds-table-secondary small"
                      style={{ overflowWrap: "break-word" }}
                    >
                      {c.inputName}
                    </td>
                    <td
                      className="vds-table-secondary small"
                      style={{ overflowWrap: "break-word" }}
                    >
                      {c.recordName || "—"}
                    </td>
                    <td
                      className="vds-table-secondary small"
                      style={{ overflowWrap: "break-word" }}
                    >
                      {c.zoneName || "—"}
                    </td>
                    <td>
                      <span className="vds-type-badge">{c.type}</span>
                    </td>
                    <td className="vds-table-secondary small">
                      <RecordDataCell change={c} />
                    </td>
                    <td
                      className="vds-table-secondary small"
                      style={{ whiteSpace: "nowrap" }}
                    >
                      {c.ttl != null ? `${c.ttl}s` : "—"}
                    </td>
                    <td>
                      <div className="d-flex align-items-center gap-1">
                        <span
                          className="vds-status-badge"
                          style={changeStatusStyle(c.status)}
                        >
                          {changeStatusLabel(c.status)}
                        </span>
                        {c.outstandingErrors && (
                          <i
                            className="bi bi-exclamation-circle-fill text-danger"
                            style={{ fontSize: "0.78rem" }}
                          />
                        )}
                      </div>
                    </td>
                    <td className="vds-table-secondary small">
                      <AdditionalInfoCell
                        change={c}
                        batchApprovalStatus={approvalStatus}
                      />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {(prevPageEnabled || nextPageEnabled) && (
          <div className="card-footer d-flex align-items-center justify-content-end py-2 px-3">
            <Pagination
              onPrev={() => setPageNum((p) => p - 1)}
              onNext={() => setPageNum((p) => p + 1)}
              prevEnabled={prevPageEnabled}
              nextEnabled={nextPageEnabled}
              rangeLabel={
                filteredChanges.length > 0
                  ? `${(pageNum - 1) * pageSize + 1}–${Math.min(pageNum * pageSize, filteredChanges.length)} of ${filteredChanges.length}`
                  : undefined
              }
            />
          </div>
        )}
      </div>

      {canReview && isPendingReview && (
        <div
          className="vds-tab-panel-content rounded-3 mb-3"
          style={{
            borderTop: isDarkTheme()
              ? "3px solid #64748b"
              : "3px solid #94a3b8",
            overflow: "hidden",
          }}
        >
          {/* Header */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "12px 20px",
              borderBottom: isDarkTheme()
                ? "1px solid #2d4163"
                : "1px solid #c7deff",
              background: isDarkTheme()
                ? "linear-gradient(90deg, #162035 0%, #1c2b48 100%)"
                : "linear-gradient(90deg, #eaf2ff 0%, #f0f6fc 100%)",
            }}
          >
            <i
              className="bi bi-clipboard2-check"
              style={{
                fontSize: "1rem",
                color: isDarkTheme() ? "#7fa8d8" : "#4a6fa5",
              }}
            />
            <div style={{ flex: 1 }}>
              <div
                style={{
                  fontSize: "0.85rem",
                  fontWeight: 700,
                  letterSpacing: "0.04em",
                  textTransform: "uppercase" as const,
                  color: isDarkTheme() ? "#7fa8d8" : "#4a6fa5",
                }}
              >
                Review DNS Change
              </div>
              <div
                style={{
                  fontSize: "0.75rem",
                  color: isDarkTheme() ? "#94a3b8" : "#64748b",
                  marginTop: 2,
                  textTransform: "none" as const,
                  letterSpacing: "normal",
                  fontWeight: 400,
                }}
              >
                {reviewType
                  ? reviewType === "approve"
                    ? "Ready to approve this change?"
                    : "Ready to reject this change?"
                  : "Add a comment and approve or reject this DNS change"}
              </div>
            </div>
          </div>

          {/* Body */}
          <div
            style={{
              padding: "20px 24px",
              background: isDarkTheme() ? "#1a2640" : "#ffffff",
            }}
          >
            <div style={{ marginBottom: 20 }}>
              <label
                htmlFor="review-comment"
                style={{
                  display: "block",
                  fontSize: "0.82rem",
                  fontWeight: 600,
                  marginBottom: 8,
                  color: isDarkTheme() ? "#cbd5e1" : "#334155",
                }}
              >
                <i
                  className="bi bi-chat-left-text me-2"
                  style={{ fontSize: "0.8rem" }}
                />
                Comment (optional)
              </label>
              <textarea
                id="review-comment"
                value={reviewComment}
                onChange={(e) => setReviewComment(e.target.value)}
                placeholder="Add comments"
                rows={3}
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  fontSize: "0.85rem",
                  border: isDarkTheme()
                    ? "1px solid #2d4163"
                    : "1px solid #c7deff",
                  borderRadius: 6,
                  background: isDarkTheme() ? "#0f172a" : "#f8fbff",
                  color: isDarkTheme() ? "#e2e8f0" : "#1e293b",
                  fontFamily: "inherit",
                  transition: "border-color 0.15s, box-shadow 0.15s",
                  outline: "none",
                  resize: "vertical",
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = isDarkTheme()
                    ? "#4a6fa5"
                    : "#4a6fa5";
                  e.currentTarget.style.boxShadow = isDarkTheme()
                    ? "0 0 0 3px rgba(74,111,165,0.2)"
                    : "0 0 0 3px rgba(74,111,165,0.12)";
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = isDarkTheme()
                    ? "#2d4163"
                    : "#c7deff";
                  e.currentTarget.style.boxShadow = "none";
                }}
              />
            </div>

            <div
              style={{
                display: "flex",
                gap: 10,
                justifyContent: "flex-end",
                flexWrap: "wrap",
                alignItems: "center",
              }}
            >
              {!reviewType ? (
                <>
                  <button
                    type="button"
                    onClick={handleReject}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 7,
                      padding: "9px 18px",
                      fontSize: "0.85rem",
                      fontWeight: 600,
                      border: isDarkTheme()
                        ? "1px solid #7f1d1d"
                        : "1px solid #fca5a5",
                      background: isDarkTheme() ? "#450a0a" : "#fff0f0",
                      color: isDarkTheme() ? "#fca5a5" : "#b91c1c",
                      borderRadius: 6,
                      cursor: "pointer",
                      transition: "all 0.15s ease",
                      outline: "none",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = isDarkTheme()
                        ? "#7f1d1d"
                        : "#fee2e2";
                      e.currentTarget.style.borderColor = isDarkTheme()
                        ? "#ef4444"
                        : "#ef4444";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = isDarkTheme()
                        ? "#450a0a"
                        : "#fff0f0";
                      e.currentTarget.style.borderColor = isDarkTheme()
                        ? "#7f1d1d"
                        : "#fca5a5";
                    }}
                  >
                    <i className="bi bi-x-circle-fill" />
                    Reject
                  </button>
                  <button
                    type="button"
                    onClick={handleApprove}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 7,
                      padding: "9px 18px",
                      fontSize: "0.85rem",
                      fontWeight: 600,
                      border: "none",
                      background: isDarkTheme()
                        ? "linear-gradient(135deg, #166534, #15803d)"
                        : "linear-gradient(135deg, #16a34a, #15803d)",
                      color: "#ffffff",
                      borderRadius: 6,
                      cursor: "pointer",
                      transition: "all 0.15s ease",
                      outline: "none",
                      boxShadow: isDarkTheme()
                        ? "0 2px 8px rgba(22,101,52,0.5)"
                        : "0 2px 8px rgba(22,163,74,0.35)",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.filter = "brightness(1.15)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.filter = "none";
                    }}
                  >
                    <i className="bi bi-check-circle-fill" />
                    Approve
                  </button>
                </>
              ) : (
                <>
                  <div
                    style={{
                      flex: 1,
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      minWidth: 0,
                    }}
                  >
                    <i
                      className="bi bi-exclamation-circle-fill"
                      style={{
                        fontSize: "0.9rem",
                        color: isDarkTheme() ? "#fbbf24" : "#d97706",
                        flexShrink: 0,
                      }}
                    />
                    <span
                      style={{
                        fontSize: "0.85rem",
                        fontWeight: 500,
                        color: isDarkTheme() ? "#e2e8f0" : "#334155",
                      }}
                    >
                      {reviewConfirmationMsg}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={handleCancelReview}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      padding: "8px 14px",
                      fontSize: "0.82rem",
                      fontWeight: 500,
                      border: isDarkTheme()
                        ? "1px solid #4a6fa5"
                        : "1px solid #93b4e0",
                      background: isDarkTheme() ? "#1e3a5f" : "#e8f0fb",
                      color: isDarkTheme() ? "#93c5fd" : "#1e40af",
                      borderRadius: 6,
                      cursor: "pointer",
                      transition: "all 0.15s ease",
                      outline: "none",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = isDarkTheme()
                        ? "#1e4d80"
                        : "#dbeafe";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = isDarkTheme()
                        ? "#1e3a5f"
                        : "#e8f0fb";
                    }}
                  >
                    <i className="bi bi-arrow-counterclockwise" />
                    Go back
                  </button>
                  {reviewType === "approve" && (
                    <button
                      type="button"
                      onClick={handleApprove}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 7,
                        padding: "9px 18px",
                        fontSize: "0.85rem",
                        fontWeight: 600,
                        border: "none",
                        background: isDarkTheme()
                          ? "linear-gradient(135deg, #166534, #15803d)"
                          : "linear-gradient(135deg, #16a34a, #15803d)",
                        color: "#ffffff",
                        borderRadius: 6,
                        cursor: "pointer",
                        transition: "all 0.15s ease",
                        outline: "none",
                        boxShadow: isDarkTheme()
                          ? "0 2px 8px rgba(22,101,52,0.5)"
                          : "0 2px 8px rgba(22,163,74,0.35)",
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.filter = "brightness(1.15)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.filter = "none";
                      }}
                    >
                      <i className="bi bi-check-circle-fill" />
                      Confirm Approval
                    </button>
                  )}
                  {reviewType === "reject" && (
                    <button
                      type="button"
                      onClick={handleReject}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 7,
                        padding: "9px 18px",
                        fontSize: "0.85rem",
                        fontWeight: 600,
                        border: "none",
                        background: isDarkTheme()
                          ? "linear-gradient(135deg, #991b1b, #b91c1c)"
                          : "linear-gradient(135deg, #dc2626, #b91c1c)",
                        color: "#ffffff",
                        borderRadius: 6,
                        cursor: "pointer",
                        transition: "all 0.15s ease",
                        outline: "none",
                        boxShadow: isDarkTheme()
                          ? "0 2px 8px rgba(153,27,27,0.5)"
                          : "0 2px 8px rgba(220,38,38,0.35)",
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.filter = "brightness(1.15)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.filter = "none";
                      }}
                    >
                      <i className="bi bi-x-circle-fill" />
                      Confirm Rejection
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {showCancelModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="cancel-modal-title"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowCancelModal(false);
          }}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15,23,42,0.65)",
            backdropFilter: "blur(3px)",
            zIndex: 1080,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "1.5rem",
          }}
        >
          <div
            style={{
              background: isDarkTheme() ? "#1e293b" : "#ffffff",
              border: `1px solid ${isDarkTheme() ? "#2d4163" : "#e8ecf0"}`,
              borderRadius: "0.85rem",
              boxShadow: "0 25px 60px rgba(0,0,0,0.45)",
              width: "min(420px, 100%)",
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
                borderTop: `2px solid ${isDarkTheme() ? "#475569" : "#cbd5e1"}`,
                borderBottom: `1px solid ${isDarkTheme() ? "#2d4163" : "#e8ecf0"}`,
                background: isDarkTheme()
                  ? "linear-gradient(90deg,#1e293b,#162032)"
                  : "linear-gradient(90deg,#ffffff,#f8fafd)",
              }}
            >
              <span
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: "50%",
                  background: isDarkTheme() ? "#3b2f0d" : "#fff7e0",
                  color: "#d97706",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "1.05rem",
                  flexShrink: 0,
                }}
              >
                <i className="bi bi-exclamation-triangle-fill" />
              </span>
              <div style={{ flex: 1 }}>
                <h6
                  id="cancel-modal-title"
                  style={{
                    margin: 0,
                    fontSize: "1rem",
                    fontWeight: 700,
                    color: isDarkTheme() ? "#e2e8f0" : "#0d1b3e",
                  }}
                >
                  Cancel DNS Change
                </h6>
                <div
                  style={{
                    marginTop: 2,
                    fontSize: "0.75rem",
                    color: isDarkTheme() ? "#94a3b8" : "#64748b",
                  }}
                >
                  This action cannot be undone
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowCancelModal(false)}
                aria-label="Close"
                style={{
                  background: "transparent",
                  border: "none",
                  color: isDarkTheme() ? "#94a3b8" : "#64748b",
                  fontSize: "1rem",
                  cursor: "pointer",
                  padding: "0.25rem 0.5rem",
                  borderRadius: "0.4rem",
                }}
              >
                <i className="bi bi-x-lg" />
              </button>
            </div>

            {/* Body */}
            <div
              style={{
                padding: "1.25rem 1.4rem",
                fontSize: "0.9rem",
                color: isDarkTheme() ? "#cbd5e1" : "#334155",
                lineHeight: 1.6,
              }}
            >
              Are you sure you want to cancel this DNS Change? All pending
              records in this batch will be cancelled.
            </div>

            {/* Footer */}
            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: "0.6rem",
                padding: "0.9rem 1.4rem",
                borderTop: `1px solid ${isDarkTheme() ? "#2d4163" : "#e8ecf0"}`,
                background: isDarkTheme() ? "#162032" : "#f8fafd",
              }}
            >
              <button
                type="button"
                onClick={() => setShowCancelModal(false)}
                style={{
                  padding: "0.5rem 1.1rem",
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  border: isDarkTheme()
                    ? "1px solid #4a6fa5"
                    : "1px solid #93b4e0",
                  background: isDarkTheme() ? "#1e3a5f" : "#e8f0fb",
                  color: isDarkTheme() ? "#93c5fd" : "#1e40af",
                  borderRadius: "0.5rem",
                  cursor: "pointer",
                  fontSize: "0.85rem",
                  fontWeight: 500,
                  transition: "all 0.15s ease",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = isDarkTheme()
                    ? "#1e4d80"
                    : "#dbeafe";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = isDarkTheme()
                    ? "#1e3a5f"
                    : "#e8f0fb";
                }}
              >
                Decline
              </button>
              <button
                type="button"
                onClick={handleCancelChange}
                style={{
                  padding: "0.5rem 1.25rem",
                  background: "linear-gradient(135deg,#f59e0b,#d97706)",
                  border: "none",
                  color: "#fff",
                  borderRadius: "0.5rem",
                  cursor: "pointer",
                  fontSize: "0.85rem",
                  fontWeight: 600,
                  boxShadow: "0 4px 12px rgba(245,158,11,0.35)",
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <i className="bi bi-check2" />
                Confirm Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
