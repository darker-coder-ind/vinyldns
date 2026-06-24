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
import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Mock the groupsService BEFORE importing the form. The form spins up a
// React Query to fetch the user's groups for the owner-group dropdown.
vi.mock("../../../services/groupsService", () => ({
  groupsService: {
    getGroups: vi.fn().mockResolvedValue({ data: { groups: [] } }),
  },
}));

import { DnsChangeForm } from "../../../components/dnsChanges/DnsChangeForm";
import { renderWithProviders } from "../../utils/renderWithProviders";

const HEADER = "Change Type,Record Type,Input Name,TTL,Record Data";

/** Build a CSV File the browser FileReader.readAsText() can consume. */
function csvFile(name: string, body: string): File {
  return new File([body], name, { type: "text/csv" });
}

describe("<DnsChangeForm /> CSV import + duplicate review", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders without crashing and surfaces the CSV import control", async () => {
    const { container } = renderWithProviders(
      <DnsChangeForm
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
        isSubmitting={false}
      />,
    );
    expect(container.querySelector("#batchChangeCsv")).not.toBeNull();
  });

  it("shows an inline error when the CSV has the wrong header", async () => {
    const { container } = renderWithProviders(
      <DnsChangeForm
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
        isSubmitting={false}
      />,
    );
    const input = container.querySelector(
      "#batchChangeCsv",
    ) as HTMLInputElement;
    await userEvent.upload(input, csvFile("bad.csv", "wrong,header\nadd,A"));
    expect(await screen.findByText(/CSV header must be/i)).toBeInTheDocument();
  });

  it("opens the duplicate review modal when imported rows collide", async () => {
    const { container } = renderWithProviders(
      <DnsChangeForm
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
        isSubmitting={false}
      />,
    );
    const input = container.querySelector(
      "#batchChangeCsv",
    ) as HTMLInputElement;
    const csv = [
      HEADER,
      "Add,A,host.example.,300,1.2.3.4",
      "Add,A,host.example.,300,1.2.3.4",
      "Add,A,unique.example.,300,9.9.9.9",
    ].join("\n");

    await userEvent.upload(input, csvFile("dup.csv", csv));

    const dialog = await screen.findByRole("dialog");
    expect(
      within(dialog).getByText(/duplicate records found/i),
    ).toBeInTheDocument();
    // The modal explains the dedupe criteria — assert the explanatory copy
    // is present rather than a count phrase that the UI no longer renders.
    expect(
      within(dialog).getByText(/Change Type, Record Type, Input Name,/i),
    ).toBeInTheDocument();
    // Default selection keeps the first occurrence → 2 rows kept, 1 removed.
    expect(within(dialog).getByText(/Apply.*2 rows?/i)).toBeInTheDocument();
  });

  it("cancelling the duplicate modal leaves the form empty", async () => {
    const { container } = renderWithProviders(
      <DnsChangeForm
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
        isSubmitting={false}
      />,
    );
    const input = container.querySelector(
      "#batchChangeCsv",
    ) as HTMLInputElement;
    const csv = [
      HEADER,
      "Add,A,host.example.,300,1.2.3.4",
      "Add,A,host.example.,300,1.2.3.4",
    ].join("\n");
    await userEvent.upload(input, csvFile("dup.csv", csv));

    const dialog = await screen.findByRole("dialog");
    await userEvent.click(
      within(dialog).getByRole("button", { name: /cancel import/i }),
    );

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    expect(screen.getByText(/Import cancelled/i)).toBeInTheDocument();
  });
});
