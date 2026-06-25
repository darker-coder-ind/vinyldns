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

import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { DnsChangeForm } from "../components/dnsChanges/DnsChangeForm";
import { useDnsChanges } from "../hooks/useDnsChanges";
import { useAlerts } from "../contexts/AlertContext";
import { useBreadcrumbs } from "../contexts/BreadcrumbContext";
import type { CreateDnsChangeRequest } from "../types/dnsChange";

/**
 * Page for creating a new batch DNS change.
 *
 * Delegates form rendering to `DnsChangeForm` and handles the two-phase API
 * response: a clean 2xx navigates away, while a 400 with an array body routes
 * per-row validation errors back into the form without a full page reload.
 * This mirrors the legacy portal's `formatErrors` behavior so users see
 * inline feedback on the exact row that failed server-side validation.
 */
export function DnsChangeNewPage() {
  const navigate = useNavigate();
  const { createBatchChange, isSubmitting } = useDnsChanges();
  const { addAlert } = useAlerts();
  const { setCrumbs } = useBreadcrumbs();
  // Stores per-row validation errors returned by the API on a 400 response.
  // Each index maps to a change row in the form; an empty array means no
  // errors for that row.
  const [serverRowErrors, setServerRowErrors] = useState<string[][]>([]);

  useEffect(() => {
    setCrumbs([
      { label: "DNS Changes", to: "/dnschanges" },
      { label: "New Batch Change" },
    ]);
    return () => setCrumbs(null);
  }, [setCrumbs]);

  const handleSubmit = (
    data: CreateDnsChangeRequest,
    allowManualReview: boolean,
  ) => {
    setServerRowErrors([]);
    createBatchChange(
      { data, allowManualReview },
      {
        onSuccess: () => void navigate("/dnschanges"),
        onError: (err: unknown) => {
          const error = err as {
            response?: { status?: number; data?: unknown };
          };
          const status = error.response?.status;
          const responseData = error.response?.data;

          // 400 with an array body means the API returned per-change validation
          // errors. Surface them inline rather than showing a generic alert so
          // the user can fix the exact row without re-entering the whole form.
          if (status === 400 && Array.isArray(responseData)) {
            const perRow = (responseData as Array<{ errors?: string[] }>).map(
              (change) => change.errors ?? [],
            );
            setServerRowErrors(perRow);
            const hasErrors = perRow.some((e) => e.length > 0);
            if (hasErrors) {
              addAlert(
                "danger",
                "Errors found in one or more rows. Please correct and resubmit.",
              );
            }
          }
        },
      },
    );
  };

  return (
    <div>
      <div className="rounded-3 mb-4 d-flex justify-content-between align-items-center vds-page-header">
        <div className="d-flex align-items-center gap-3">
          <div className="rounded-3 d-flex align-items-center justify-content-center vds-page-header__icon">
            <i className="bi bi-plus-circle-fill text-white fs-5" />
          </div>
          <div>
            <h4 className="mb-0 fw-bold vds-page-header__title">
              New Batch Change
            </h4>
            <small className="text-muted">
              Submit a new DNS batch change request for review and processing
            </small>
          </div>
        </div>
        <button
          type="button"
          className="btn btn-sm d-flex align-items-center gap-2 vds-btn-flat"
          onClick={() => navigate("/dnschanges")}
        >
          <i className="bi bi-arrow-left" />
          <span className="vds-btn-flat__label">Back to DNS Changes</span>
        </button>
      </div>

      <div className="card vds-form-card overflow-hidden">
        <div className="card-header vds-form-card__header vds-form-card__header--create d-flex align-items-center gap-2">
          <i className="bi bi-pencil-square" />
          Change Details
          {isSubmitting && (
            <span className="ms-auto d-flex align-items-center gap-2 small text-muted">
              <span
                className="spinner-border spinner-border-sm"
                role="status"
              />
              Submitting…
            </span>
          )}
        </div>
        <div className="card-body vds-form-card__body p-4">
          <DnsChangeForm
            onSubmit={handleSubmit}
            onCancel={() => navigate("/dnschanges")}
            isSubmitting={isSubmitting}
            serverRowErrors={serverRowErrors}
          />
        </div>
      </div>
    </div>
  );
}
