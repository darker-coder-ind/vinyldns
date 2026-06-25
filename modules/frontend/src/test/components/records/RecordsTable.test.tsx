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
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RecordsTable } from "../../../components/records/RecordsTable";
import { renderWithProviders } from "../../utils/renderWithProviders";

function recordRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "rec-1",
    name: "host",
    type: "A",
    ttl: 300,
    fqdn: "host.example.com.",
    zoneName: "example.com.",
    zoneId: "zone-1",
    status: "Active",
    records: [{ address: "1.2.3.4" }],
    accessLevel: "Write",
    zoneShared: false,
    ...overrides,
  };
}

describe("<RecordsTable />", () => {
  it("renders the empty state when no records are provided", () => {
    renderWithProviders(<RecordsTable records={[]} />);
    expect(screen.getByText("No records found")).toBeInTheDocument();
  });

  it("renders the table headers in the default configuration", () => {
    renderWithProviders(<RecordsTable records={[recordRow()]} />);
    expect(screen.getByText("FQDN")).toBeInTheDocument();
    expect(screen.getByText("TYPE")).toBeInTheDocument();
    expect(screen.getByText("TTL")).toBeInTheDocument();
    expect(screen.getByText("RECORD DATA")).toBeInTheDocument();
    expect(screen.getByText("ZONE")).toBeInTheDocument();
  });

  it("omits the ZONE column when showZone=false", () => {
    renderWithProviders(
      <RecordsTable records={[recordRow()]} showZone={false} />,
    );
    expect(screen.queryByText("ZONE")).not.toBeInTheDocument();
  });

  it("renders the OWNER GROUP column when showOwnerGroup=true", () => {
    renderWithProviders(
      <RecordsTable
        records={[recordRow({ ownerGroupName: "Team Eng" })]}
        showOwnerGroup
      />,
    );
    expect(screen.getByText("OWNER GROUP")).toBeInTheDocument();
  });

  it("renders the FQDN and the type badge", () => {
    renderWithProviders(<RecordsTable records={[recordRow()]} />);
    expect(screen.getByText("host.example.com.")).toBeInTheDocument();
    expect(screen.getByText("A")).toBeInTheDocument();
  });

  it("invokes onToggleSort when the FQDN header is clicked", async () => {
    const onToggleSort = vi.fn();
    renderWithProviders(
      <RecordsTable
        records={[recordRow()]}
        nameSort="ASC"
        onToggleSort={onToggleSort}
      />,
    );
    await userEvent.click(screen.getByText("FQDN"));
    expect(onToggleSort).toHaveBeenCalledWith("DESC");
  });

  it("flips sort DESC → ASC when nameSort is DESC", async () => {
    const onToggleSort = vi.fn();
    renderWithProviders(
      <RecordsTable
        records={[recordRow()]}
        nameSort="DESC"
        onToggleSort={onToggleSort}
      />,
    );
    await userEvent.click(screen.getByText("FQDN"));
    expect(onToggleSort).toHaveBeenCalledWith("ASC");
  });

  it("defaults toggle to ASC when nameSort is not provided", async () => {
    const onToggleSort = vi.fn();
    renderWithProviders(
      <RecordsTable records={[recordRow()]} onToggleSort={onToggleSort} />,
    );
    await userEvent.click(screen.getByText("FQDN"));
    expect(onToggleSort).toHaveBeenCalledWith("ASC");
  });

  it("renders TTL with a trailing 's' suffix", () => {
    renderWithProviders(<RecordsTable records={[recordRow({ ttl: 600 })]} />);
    expect(screen.getByText("600s")).toBeInTheDocument();
  });

  it("renders an em-dash when ttl is null", () => {
    renderWithProviders(<RecordsTable records={[recordRow({ ttl: null })]} />);
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
  });

  it("renders a Shared access badge when zoneShared=true", () => {
    renderWithProviders(
      <RecordsTable records={[recordRow({ zoneShared: true })]} />,
    );
    expect(screen.getByText("Shared")).toBeInTheDocument();
  });

  it("renders a Private access badge when zoneShared=false", () => {
    renderWithProviders(
      <RecordsTable records={[recordRow({ zoneShared: false })]} />,
    );
    expect(screen.getByText("Private")).toBeInTheDocument();
  });

  it("renders View history / Edit / Delete buttons when the callbacks are provided", async () => {
    const onViewHistory = vi.fn();
    const onEdit = vi.fn();
    const onDelete = vi.fn();
    renderWithProviders(
      <RecordsTable
        records={[recordRow()]}
        onViewHistory={onViewHistory}
        onEdit={onEdit}
        onDelete={onDelete}
      />,
    );
    await userEvent.click(screen.getByTitle("View history"));
    await userEvent.click(screen.getByTitle("Edit record"));
    await userEvent.click(screen.getByTitle("Delete record"));
    expect(onViewHistory).toHaveBeenCalledTimes(1);
    expect(onEdit).toHaveBeenCalledTimes(1);
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it("hides Edit / Delete / View history buttons when callbacks are omitted", () => {
    renderWithProviders(<RecordsTable records={[recordRow()]} />);
    expect(screen.queryByTitle("Edit record")).not.toBeInTheDocument();
    expect(screen.queryByTitle("Delete record")).not.toBeInTheDocument();
    expect(screen.queryByTitle("View history")).not.toBeInTheDocument();
  });

  it("copies the FQDN to the clipboard when the copy button is clicked", async () => {
    const writeText = vi
      .spyOn(navigator.clipboard, "writeText")
      .mockResolvedValue(undefined);
    renderWithProviders(
      <RecordsTable records={[recordRow({ fqdn: "abc.example.com." })]} />,
    );
    await userEvent.click(screen.getByTitle("Copy FQDN"));
    expect(writeText).toHaveBeenCalledWith("abc.example.com.");
    writeText.mockRestore();
  });

  it("renders the empty-state hint text", () => {
    renderWithProviders(<RecordsTable records={[]} />);
    expect(
      screen.getByText(/Enter a FQDN above and press Enter/i),
    ).toBeInTheDocument();
  });

  it("falls back to constructing FQDN from name + zone when fqdn is missing", () => {
    renderWithProviders(
      <RecordsTable
        records={[
          recordRow({
            fqdn: undefined,
            name: "web",
            zoneName: "example.com.",
          }),
        ]}
      />,
    );
    expect(screen.getByText("web.example.com.")).toBeInTheDocument();
  });
});
