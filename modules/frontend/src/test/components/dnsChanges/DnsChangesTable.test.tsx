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
import { describe, it, expect, vi } from "vitest";
import {
  screen,
  within,
  fireEvent,
  act,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  DnsChangesTable,
  changeStatusClass,
  changeStatusLabel,
} from "../../../components/dnsChanges/DnsChangesTable";
import { renderWithProviders } from "../../utils/renderWithProviders";
import type { DnsChangeSummary } from "../../../types/dnsChange";

function summary(overrides: Partial<DnsChangeSummary> = {}): DnsChangeSummary {
  return {
    id: "11111111-2222-3333-4444-555555555555",
    userId: "u-1",
    userName: "alice",
    comments: "add some records",
    createdTimestamp: "2024-01-15T12:00:00Z",
    totalChanges: 3,
    status: "Complete",
    approvalStatus: "AutoApproved",
    ...overrides,
  };
}

describe("changeStatusClass", () => {
  it.each([
    ["Complete", "vds-status-badge--success"],
    ["Failed", "vds-status-badge--danger"],
    ["PartialFailure", "vds-status-badge--warning"],
    ["PendingReview", "vds-status-badge--warning"],
    ["PendingProcessing", "vds-status-badge--info"],
    ["Pending", "vds-status-badge--info"],
    ["Rejected", "vds-status-badge--danger"],
    ["Scheduled", "vds-status-badge--info"],
    ["Cancelled", "vds-status-badge--secondary"],
  ])("maps %s → %s", (status, expected) => {
    expect(changeStatusClass(status)).toBe(expected);
  });

  it("falls back to secondary for unknown statuses", () => {
    expect(changeStatusClass("SomethingNew")).toBe(
      "vds-status-badge--secondary",
    );
  });
});

describe("changeStatusLabel", () => {
  it("humanises CamelCase compound statuses", () => {
    expect(changeStatusLabel("PartialFailure")).toBe("Partial Failure");
    expect(changeStatusLabel("PendingReview")).toBe("Pending Review");
    expect(changeStatusLabel("PendingProcessing")).toBe("Pending Processing");
  });

  it("returns single-word statuses unchanged", () => {
    expect(changeStatusLabel("Complete")).toBe("Complete");
    expect(changeStatusLabel("Anything")).toBe("Anything");
  });
});

describe("<DnsChangesTable />", () => {
  it("shows the empty state when there are no changes", () => {
    renderWithProviders(<DnsChangesTable changes={[]} />);
    expect(screen.getByText("No DNS changes found")).toBeInTheDocument();
  });

  it("renders a row per change with the status badge text", () => {
    renderWithProviders(
      <DnsChangesTable
        changes={[
          summary({
            id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
            status: "Complete",
          }),
          summary({
            id: "ffffffff-1111-2222-3333-444444444444",
            status: "PendingReview",
            approvalStatus: "PendingReview",
            userName: "bob",
          }),
        ]}
      />,
    );
    const rows = screen.getAllByRole("row");
    // 1 header row + 2 data rows
    expect(rows).toHaveLength(3);
    expect(within(rows[1]).getByText("Complete")).toBeInTheDocument();
    expect(within(rows[2]).getByText("Pending Review")).toBeInTheDocument();
  });

  it("hides the submitter column when ignoreAccess is omitted", () => {
    renderWithProviders(
      <DnsChangesTable changes={[summary({ userName: "alice" })]} />,
    );
    expect(screen.queryByText("SUBMITTER")).not.toBeInTheDocument();
  });

  it("shows the submitter column when ignoreAccess is true", () => {
    renderWithProviders(
      <DnsChangesTable
        changes={[summary({ userName: "alice" })]}
        ignoreAccess
      />,
    );
    expect(screen.getByText("SUBMITTER")).toBeInTheDocument();
    expect(screen.getByText("alice")).toBeInTheDocument();
  });

  it("renders cancel button only for the submitter on PendingReview", async () => {
    const onCancel = vi.fn();
    renderWithProviders(
      <DnsChangesTable
        changes={[
          summary({
            id: "cancelable-id-0000-0000-000000000000",
            userId: "u-alice",
            status: "PendingReview",
            approvalStatus: "PendingReview",
            userName: "alice",
          }),
          summary({
            id: "someone-else-id-0000-000000000000",
            userId: "u-bob",
            status: "PendingReview",
            approvalStatus: "PendingReview",
            userName: "bob",
          }),
        ]}
        onCancel={onCancel}
        currentUserId="u-alice"
      />,
    );
    const cancelButtons = screen.getAllByTitle("Cancel");
    // Only the row owned by alice exposes a Cancel button.
    expect(cancelButtons).toHaveLength(1);
    await userEvent.click(cancelButtons[0]);
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onCancel.mock.calls[0][0].id).toBe(
      "cancelable-id-0000-0000-000000000000",
    );
  });

  it("copies the full ID to the clipboard when the copy button is clicked", async () => {
    const writeText = vi
      .spyOn(navigator.clipboard, "writeText")
      .mockResolvedValue(undefined);
    renderWithProviders(
      <DnsChangesTable
        changes={[summary({ id: "abcdef12-3456-7890-abcd-ef1234567890" })]}
      />,
    );
    await act(async () => {
      fireEvent.click(screen.getByTitle("Copy ID"));
    });
    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith(
        "abcdef12-3456-7890-abcd-ef1234567890",
      );
    });
    writeText.mockRestore();
  });

  it("renders a View link pointing at /dnschanges/<id>", () => {
    renderWithProviders(
      <DnsChangesTable
        changes={[summary({ id: "view-link-id-1234-1234-123456789012" })]}
      />,
    );
    const viewLink = screen.getByTitle("View");
    expect(viewLink).toHaveAttribute(
      "href",
      "/dnschanges/view-link-id-1234-1234-123456789012",
    );
  });

  it("renders an em-dash placeholder when the comments field is empty", () => {
    renderWithProviders(
      <DnsChangesTable changes={[summary({ comments: "" })]} />,
    );
    // The placeholder span contains the U+2014 em-dash character.
    expect(screen.getByText("\u2014")).toBeInTheDocument();
  });

  it("does NOT render a Cancel button when status is Complete (even for owner)", () => {
    renderWithProviders(
      <DnsChangesTable
        changes={[
          summary({
            id: "complete-no-cancel-0000-0000-000000000000",
            userId: "u-alice",
            status: "Complete",
            approvalStatus: "AutoApproved",
          }),
        ]}
        onCancel={vi.fn()}
        currentUserId="u-alice"
      />,
    );
    expect(screen.queryByTitle("Cancel")).not.toBeInTheDocument();
  });

  it("does NOT render a Cancel button when onCancel is not provided", () => {
    renderWithProviders(
      <DnsChangesTable
        changes={[
          summary({
            id: "no-cb-id-0000-0000-0000-000000000000",
            userId: "u-alice",
            status: "PendingReview",
            approvalStatus: "PendingReview",
          }),
        ]}
        currentUserId="u-alice"
      />,
    );
    expect(screen.queryByTitle("Cancel")).not.toBeInTheDocument();
  });

  it("renders the change count badge per row", () => {
    renderWithProviders(
      <DnsChangesTable
        changes={[
          summary({
            id: "count-id-0000-0000-0000-000000000000",
            totalChanges: 7,
          }),
        ]}
      />,
    );
    expect(screen.getByText("7")).toBeInTheDocument();
  });

  it("renders the same number of data rows as items in the changes prop", () => {
    renderWithProviders(
      <DnsChangesTable
        changes={[
          summary({ id: "id-a-0000-0000-0000-000000000000" }),
          summary({ id: "id-b-0000-0000-0000-000000000000" }),
          summary({ id: "id-c-0000-0000-0000-000000000000" }),
        ]}
      />,
    );
    // 1 header + 3 data rows.
    expect(screen.getAllByRole("row")).toHaveLength(4);
  });

  it("does not render the Submitter cell content when ignoreAccess is false", () => {
    renderWithProviders(
      <DnsChangesTable changes={[summary({ userName: "alice-no-show" })]} />,
    );
    expect(screen.queryByText("alice-no-show")).not.toBeInTheDocument();
  });
});
