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

import React from "react";

interface DeleteConfirmationModalProps {
  isOpen: boolean;
  title?: string;
  description?: React.ReactNode;
  cancelLabel?: string;
  confirmLabel?: string;
  confirmIcon?: string;
  cancelDisabled?: boolean;
  confirmDisabled?: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

export function DeleteConfirmationModal({
  isOpen,
  title = "Delete Item",
  description = "This action cannot be undone.",
  cancelLabel = "Cancel",
  confirmLabel = "Delete",
  confirmIcon = "bi-trash",
  cancelDisabled = false,
  confirmDisabled = false,
  onClose,
  onConfirm,
}: DeleteConfirmationModalProps) {
  if (!isOpen) return null;

  return (
    <div
      className="vds-delete-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-confirm-title"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="vds-delete-modal">
        <div className="rhm-header vds-dark-modal-header vds-delete-modal__header">
          <div className="d-flex align-items-center justify-content-between gap-3 min-h-100">
            <div className="d-flex align-items-center gap-3 min-w-0">
              <span className="vds-delete-modal__header-icon">
                <i className="bi bi-exclamation-triangle-fill" />
              </span>
              <div className="min-w-0">
                <h5
                  id="delete-confirm-title"
                  className="m-0 fw-semibold text-white vds-dark-modal-title"
                >
                  {title}
                </h5>
              </div>
            </div>

            <div className="d-flex align-items-center gap-2 flex-shrink-0">
              <button
                type="button"
                aria-label="Close"
                title="Close"
                onClick={onClose}
                className="rhm-header-btn"
              >
                <i
                  className="rhm-close-icon bi bi-x-lg"
                  style={{ fontSize: "0.85rem" }}
                />
              </button>
            </div>
          </div>
        </div>

        <div className="vds-delete-modal__body">
          {typeof description === "string" ? (
            <p className="vds-delete-modal__description">{description}</p>
          ) : (
            <div className="vds-delete-modal__description">{description}</div>
          )}
        </div>

        <div className="vds-delete-modal__footer">
          <button
            type="button"
            className="vds-delete-modal__btn vds-delete-modal__btn--secondary"
            onClick={onClose}
            disabled={cancelDisabled}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className="vds-delete-modal__btn vds-delete-modal__btn--danger"
            onClick={onConfirm}
            disabled={confirmDisabled}
          >
            <i className={`bi ${confirmIcon} me-1`} />
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
