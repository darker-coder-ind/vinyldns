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

import React, {
  useState,
  useRef,
  useEffect,
  useCallback,
  useMemo,
} from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { RecordsSearchTable } from "../components/records/RecordsSearchTable";
import { Pagination } from "../components/common/Pagination";
import { LoadingSpinner } from "../components/common/LoadingSpinner";
import { useRecords } from "../hooks/useRecords";
import { recordsService } from "../services/recordsService";
import { groupsService } from "../services/groupsService";
import { zonesService } from "../services/zonesService";
import { TimeFilterDropdown } from "../components/common/TimeFilterDropdown";
import type { TimeRange } from "../components/common/TimeFilterDropdown";
import { RecordHistoryModal } from "../components/records/RecordHistoryModal";

// Readable display labels for VinylDNS record status values.
// Kept module-level so both the filter dropdown and active-chip row share the
// same source of truth without needing a utility import.
const STATUS_LABELS: Record<string, string> = {
  Active: "Active",
  Inactive: "Inactive",
  Pending: "Pending",
  PendingDelete: "Pending Delete",
  PendingUpdate: "Pending Update",
};

/**
 * Global RecordSet Search page.
 *
 * Provides a read-only, cross-zone view of all records in VinylDNS.
 * Search is driven by the API (FQDN, type, owner group, sort order), while
 * Status / Access / Zone / Time filters are applied client-side on the
 * already-fetched page of results — keeping the API surface minimal while
 * still giving power users fine-grained filtering without extra round-trips.
 */
export function RecordsPage() {
  const queryClient = useQueryClient();

  const [nameInput, setNameInput] = useState("");
  const [typeFilters, setTypeFilters] = useState<string[]>([]);
  const [nameSort, setNameSort] = useState("ASC");
  const [ownerGroupFilter, setOwnerGroupFilter] = useState("");

  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [accessFilter, setAccessFilter] = useState<"shared" | "private" | null>(
    null,
  );
  const [zoneFilter, setZoneFilter] = useState<string | null>(null);
  const [timeRange, setTimeRange] = useState<TimeRange>("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const [showInstructions, setShowInstructions] = useState(false);
  const [typeDropdownOpen, setTypeDropdownOpen] = useState(false);
  const [statusDropdownOpen, setStatusDropdownOpen] = useState(false);
  const [accessDropdownOpen, setAccessDropdownOpen] = useState(false);
  const [zoneDropdownOpen, setZoneDropdownOpen] = useState(false);
  const [ownerGroupDropdownOpen, setOwnerGroupDropdownOpen] = useState(false);
  const [ownerGroupInput, setOwnerGroupInput] = useState("");

  const [historyRecord, setHistoryRecord] = useState<any | null>(null);

  const [suggestions, setSuggestions] = useState<
    Array<{ value: string; label: string }>
  >([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [activeSuggestion, setActiveSuggestion] = useState(-1);

  const suggestionsRef = useRef<HTMLDivElement>(null);
  const typeDropdownRef = useRef<HTMLDivElement>(null);
  // Each dropdown owns its own ref so the global mousedown handler can
  // distinguish between clicks inside vs. outside a specific popover.
  const statusDropdownRef = useRef<HTMLDivElement>(null);
  const accessDropdownRef = useRef<HTMLDivElement>(null);
  const zoneDropdownRef = useRef<HTMLDivElement>(null);
  const ownerGroupDropdownRef = useRef<HTMLDivElement>(null);
  const justSelectedRef = useRef(false);

  // Fetch the user's groups so the owner group filter can show a named dropdown
  // rather than requiring the user to type a raw group ID.
  const { data: groupsData } = useQuery({
    queryKey: ["groups-for-records-filter"],
    queryFn: async () => {
      const res = await groupsService.getGroups(true);
      return res.data.groups ?? [];
    },
    staleTime: 5 * 60 * 1000,
  });
  const groups = groupsData ?? [];

  const {
    records,
    isLoading,
    nameFilter,
    search,
    nextPage,
    prevPage,
    nextPageEnabled,
    prevPageEnabled,
    getPanelTitle,
    pageSize,
    setPageSize,
    pageSizes,
    currentPage,
  } = useRecords();

  // Type and Owner Group filters require a prior FQDN search with results —
  // disabling them before any search or when results are empty prevents
  // unnecessary API calls for filters that would return nothing.
  const apiFiltersDisabled = !nameFilter || records.length === 0;

  // Collect unique zone IDs from non-shared-zone records so we can
  // back-fill ownerGroupName via GET /zones/:id/details — mirroring the
  // AngularJS portal behavior where each non-shared record's ownerGroup
  // is resolved from the zone's adminGroup.
  const nonSharedZoneIds = useMemo(
    () =>
      [
        ...new Set(
          records
            .filter((r: any) => !r.zoneShared)
            .map((r: any) => r.zoneId as string)
            .filter(Boolean),
        ),
      ] as string[],
    [records],
  );

  // Fetch zone details for all non-shared zones in the current result page.
  // Results are keyed by zoneId so the record mapping below can look them up
  // in O(1). Failures for individual zones are swallowed so a single
  // inaccessible zone does not break the whole table.
  const { data: zoneDetailsMap } = useQuery({
    queryKey: ["zoneDetails", nonSharedZoneIds],
    queryFn: async () => {
      const settled = await Promise.allSettled(
        nonSharedZoneIds.map((id) =>
          zonesService
            .getZoneDetails(id)
            .then((r) => ({ id, zone: r.data.zone })),
        ),
      );
      const map: Record<
        string,
        { adminGroupId: string; adminGroupName: string }
      > = {};
      for (const result of settled) {
        if (result.status === "fulfilled") {
          map[result.value.id] = result.value.zone;
        }
      }
      return map;
    },
    enabled: nonSharedZoneIds.length > 0,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });

  // A single document-level mousedown listener closes any open popover when
  // the user clicks outside it. Using `mousedown` instead of `click` ensures
  // the list closes before onMouseDown handlers on list items fire, preventing
  // a race where the suggestion/dropdown unmounts before the click registers.
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const t = e.target as Node;
      if (suggestionsRef.current && !suggestionsRef.current.contains(t))
        setShowSuggestions(false);
      if (typeDropdownRef.current && !typeDropdownRef.current.contains(t))
        setTypeDropdownOpen(false);
      if (statusDropdownRef.current && !statusDropdownRef.current.contains(t))
        setStatusDropdownOpen(false);
      if (accessDropdownRef.current && !accessDropdownRef.current.contains(t))
        setAccessDropdownOpen(false);
      if (zoneDropdownRef.current && !zoneDropdownRef.current.contains(t))
        setZoneDropdownOpen(false);
      if (
        ownerGroupDropdownRef.current &&
        !ownerGroupDropdownRef.current.contains(t)
      )
        setOwnerGroupDropdownOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Debounced typeahead: waits 250 ms after the user stops typing before
  // hitting the API. The " | type" suffix appended when a
  // suggestion was previously selected is stripped, so the search is by FQDN fragment only.
  // The 2-character minimum mirrors the server's validation rule.
  useEffect(() => {
    if (justSelectedRef.current) {
      justSelectedRef.current = false;
      return;
    }
    const rawTerm = nameInput.split(" | ")[0].trim();
    if (rawTerm.length < 2) {
      setSuggestions([]); // clear immediately so stale results don't linger
      setShowSuggestions(false);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const res = await recordsService.getRecordSuggestions(rawTerm);
        // Encode both FQDN and type into a single `value` string so that
        // picking a suggestion can auto-populate the type filter without any
        // extra parsing state.
        const items = (res.data.recordSets ?? []).map((rs) => ({
          value: `${rs.fqdn ?? rs.name} | ${rs.type}`,
          label: `name: ${rs.fqdn ?? rs.name} | type: ${rs.type}`,
        }));
        setSuggestions(items);
        setShowSuggestions(items.length > 0);
        setActiveSuggestion(-1);
      } catch {
        setSuggestions([]);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [nameInput]);

  // Filter option lists are derived from the current page of results rather
  // than fetched separately. This keeps the filter dropdowns scoped to what's
  // actually on screen and avoids an extra API call for enumeration.
  const availableTypes = useMemo(
    () =>
      Array.from(new Set(records.map((r: any) => r.type as string)))
        .filter(Boolean)
        .sort() as string[],
    [records],
  );
  const availableStatuses = useMemo(
    () =>
      Array.from(new Set(records.map((r: any) => r.status as string))).filter(
        Boolean,
      ) as string[],
    [records],
  );
  const availableZones = useMemo(
    () =>
      Array.from(new Set(records.map((r: any) => r.zoneName as string)))
        .filter(Boolean)
        .sort() as string[],
    [records],
  );
  const hasShared = records.some((r: any) => r.zoneShared === true);
  const hasPrivate = records.some((r: any) => r.zoneShared === false);

  /**
   * Returns true when `dateStr` falls inside the requested time window.
   *
   * Records that have no timestamp are treated as excluded when any filter is
   * active — consistent with VinylDNS API semantics where absence of a field
   * means "not yet set". The `to` date is extended to end-of-day (T23:59:59)
   * so a user picking a single date gets all records created that calendar day.
   */
  const isWithinRange = useCallback(
    (
      dateStr: string | undefined,
      range: TimeRange,
      from: string,
      to: string,
    ): boolean => {
      if (range === "all") return true;
      if (!dateStr) return false; // no date → exclude when a time filter is active
      const ts = new Date(dateStr).getTime();
      const now = Date.now();
      if (range === "1d") return ts >= now - 86400000;
      if (range === "7d") return ts >= now - 7 * 86400000;
      if (range === "30d") return ts >= now - 30 * 86400000;
      if (range === "90d") return ts >= now - 90 * 86400000;
      if (range === "custom") {
        if (from && ts < new Date(from).getTime()) return false;
        if (to && ts > new Date(to + "T23:59:59").getTime()) return false;
      }
      return true;
    },
    [],
  );

  // Client-side filters are layered on top of the already-fetched page from
  // the API. The filter pass only runs when at least one filter is active;
  // otherwise it short-circuits and returns the raw `records` array to avoid
  // allocating a new array on every render.
  const anyClientFilterActive = !!(
    statusFilter ||
    accessFilter ||
    zoneFilter ||
    timeRange !== "all"
  );
  const displayedRecords = anyClientFilterActive
    ? records.filter((r: any) => {
        const matchesStatus = !statusFilter || r.status === statusFilter;
        const matchesAccess =
          !accessFilter ||
          (accessFilter === "shared"
            ? r.zoneShared === true
            : r.zoneShared === false);
        const matchesZone = !zoneFilter || r.zoneName === zoneFilter;
        const matchesTime = isWithinRange(
          // prefer `updated`; fall back to `created` for records that have never been modified
          (r.updated ?? r.created) as string | undefined,
          timeRange,
          dateFrom,
          dateTo,
        );
        return matchesStatus && matchesAccess && matchesZone && matchesTime;
      })
    : records;

  // When the user types "fqdn | TYPE" manually (or accepts a suggestion and
  // then presses Enter), the embedded type is parsed out so both the name and
  // type parameters reach the API correctly. typeFilters is joined to a comma-
  // separated string to match the VinylDNS API's multi-type filter format.
  const handleSearch = useCallback(() => {
    setShowSuggestions(false);
    let name = nameInput;
    let types = typeFilters;
    if (nameInput.includes(" | ")) {
      const parts = nameInput.split(" | ");
      name = parts[0].trim();
      const parsedType = parts[1]?.trim();
      if (parsedType) {
        types = [parsedType];
        setTypeFilters(types);
      }
    }
    search({
      name,
      type: types.join(","),
      sort: nameSort,
      ownerGroup: ownerGroupFilter,
    });
  }, [nameInput, typeFilters, nameSort, ownerGroupFilter, search]);

  // Setting justSelectedRef prevents the nameInput change from immediately
  // triggering another suggestions fetch for the value just selected.
  const handleSuggestionClick = (value: string) => {
    justSelectedRef.current = true;
    setNameInput(value);
    setShowSuggestions(false);
    const parts = value.split(" | ");
    const name = parts[0].trim();
    const type = parts[1]?.trim();
    const newTypes = type ? [type] : typeFilters;
    if (type) setTypeFilters(newTypes);
    search({
      name,
      type: newTypes.join(","),
      sort: nameSort,
      ownerGroup: ownerGroupFilter,
    });
  };

  // Keyboard navigation for the suggestion list.
  // Enter commits the highlighted suggestion (or falls through to a plain
  // search if no item is active); arrows move the cursor; Escape dismisses.
  const handleNameKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      if (showSuggestions && activeSuggestion >= 0)
        handleSuggestionClick(suggestions[activeSuggestion].value);
      else handleSearch();
      return;
    }
    if (!showSuggestions) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveSuggestion((p) => Math.min(p + 1, suggestions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveSuggestion((p) => Math.max(p - 1, 0));
    } else if (e.key === "Escape") setShowSuggestions(false);
  };

  const handleToggleSort = () => {
    const next = nameSort === "ASC" ? "DESC" : "ASC";
    setNameSort(next);
    search({
      name: nameInput,
      type: typeFilters.join(","),
      sort: next,
      ownerGroup: ownerGroupFilter,
    });
  };

  // Full reset: clears every API param and every client-side filter, then
  // fires a fresh search and invalidates the React Query cache so stale data
  // from a previous session doesn't linger in the background.
  const handleRefresh = () => {
    setNameInput("");
    setTypeFilters([]);
    setNameSort("ASC");
    setOwnerGroupFilter("");
    setStatusFilter(null);
    setAccessFilter(null);
    setZoneFilter(null);
    setTimeRange("all");
    setDateFrom("");
    setDateTo("");
    search({ name: "", type: "", sort: "ASC", ownerGroup: "" });
    void queryClient.invalidateQueries({ queryKey: ["recordsets"] });
  };

  // Wraps matched substrings in <strong> for the suggestion dropdown.
  // The regex special characters in `term` are escaped before constructing the
  // pattern so that FQDN fragments containing dots don't widen the match.
  const highlightMatch = (text: string, term: string) => {
    if (!term) return <>{text}</>;
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(`(${escaped})`, "gi");
    return (
      <>
        {text
          .split(regex)
          .map((part, i) =>
            regex.test(part) ? <strong key={i}>{part}</strong> : part,
          )}
      </>
    );
  };

  // Drives the aggregate filter indicator in the toolbar. Counts each active
  // API filter (type selections, owner group) and all client-side filters so
  // the user knows at a glance how many constraints are in effect.
  const activeFilterCount =
    [
      typeFilters.length > 0,
      ownerGroupFilter,
      statusFilter,
      accessFilter,
      zoneFilter,
    ].filter(Boolean).length + (timeRange !== "all" ? 1 : 0);

  return (
    <div>
      <div className="rounded-3 mb-4 d-flex justify-content-between align-items-center vds-page-header">
        <div className="d-flex align-items-center gap-3">
          <div className="rounded-3 d-flex align-items-center justify-content-center vds-page-header__icon">
            <i className="bi bi-search text-white fs-5" />
          </div>
          <div>
            <h4 className="mb-0 fw-bold vds-page-header__title">
              Global RecordSet Search
            </h4>
            <small className="text-muted">
              Read-only view of the current disposition of records in VinylDNS
            </small>
          </div>
        </div>
        <button
          type="button"
          className="btn btn-sm d-flex align-items-center gap-2 vds-btn-flat"
          onClick={() => setShowInstructions((v) => !v)}
        >
          <i
            className={`bi ${showInstructions ? "bi-chevron-up" : "bi-info-circle"}`}
          />
          <span className="vds-btn-flat__label">How to Search</span>
        </button>
      </div>

      {showInstructions && (
        <div className="card mb-3 vds-instructions-card">
          <div className="card-body" style={{ fontSize: "0.875rem" }}>
            <p className="mb-2">
              The search is based on the fully qualified domain name (FQDN) of a
              record. You can do an exact match search or fuzzy match to lookup
              records.
            </p>
            <p className="mb-2">
              A minimum of <strong>two alphanumeric characters</strong> for the
              record name is <em>required</em> for searching. Also, a search
              term cannot <strong>both start and end</strong> with a wildcard
              character.
            </p>
            <p className="fw-semibold mb-1">Examples:</p>
            <ul className="mb-3 ps-3 small">
              <li>
                <code>test.example.com.</code> → <code>test.example.com.</code>
              </li>
              <li>
                <code>test.example.com</code> → <code>test.example.com.</code>
              </li>
              <li>
                <code>test.*</code> →{" "}
                <code>test.example.com., test.example.net., test.net.</code>
              </li>
              <li>
                <code>*example.com</code> →{" "}
                <code>one.example.com., test.example.com.</code>
              </li>
              <li>
                <code>*example*</code> → <strong>INVALID</strong>
              </li>
            </ul>
            <hr className="my-2" />
            <p className="fw-semibold mb-1">PTR Records</p>
            <p className="mb-2">
              For PTR records you can look up records by their IP address or by
              their FQDN. Compressed or expanded formats of IPv6 addresses are
              supported.
            </p>
            <p className="mb-2">
              Partial matching of IP addresses is not supported, but partial
              matching of the FQDN is supported.
            </p>
            <p className="fw-semibold mb-1">Examples:</p>
            <ul className="mb-0 ps-3 small">
              <li>
                <code>4.4.8.8.in-addr.arpa.</code> →{" "}
                <code>4.4.8.8.in-addr.arpa.</code>
              </li>
              <li>
                <code>*.4.8.8.in-addr.arpa.</code> →{" "}
                <code>
                  2.4.8.8.in-addr.arpa., 3.4.8.8.in-addr.arpa.,
                  4.4.8.8.in-addr.arpa.
                </code>
              </li>
              <li>
                <code>8.8.4.4</code> → <code>4.4.8.8.in-addr.arpa.</code>
              </li>
              <li>
                <code>2001:db8::567:89ab</code> →{" "}
                <code>
                  b.a.9.8.7.6.5.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.8.b.d.0.1.0.0.2.ip6.arpa.
                </code>
              </li>
            </ul>
          </div>
        </div>
      )}

      <div className="card mb-3 vds-toolbar-card">
        <div className="card-body py-2 px-3">
          <div className="d-flex gap-2 flex-wrap align-items-center">
            <div
              className="position-relative flex-grow-1"
              ref={suggestionsRef}
              style={{ minWidth: 180 }}
            >
              <div className="input-group input-group-sm vds-search-group">
                <span className="input-group-text border-0 bg-transparent pe-1">
                  <i className="bi bi-search text-muted" />
                </span>
                <input
                  type="text"
                  className="form-control border-0 ps-0 shadow-none bg-transparent"
                  placeholder="Search by FQDN"
                  value={nameInput}
                  autoComplete="off"
                  onChange={(e) => setNameInput(e.target.value)}
                  onKeyDown={handleNameKeyDown}
                />
              </div>
              {showSuggestions && (
                <ul
                  className="list-group position-absolute shadow-lg vds-suggestions-list"
                  style={{ width: "100%", zIndex: 1050 }}
                >
                  {suggestions.map((item, i) => {
                    const [fqdnPart, typePart] = item.value.split(" | ");
                    const term = nameInput.split(" | ")[0];
                    return (
                      <li
                        key={item.value}
                        className={`list-group-item list-group-item-action vds-suggestion-item d-flex justify-content-between align-items-center${i === activeSuggestion ? " active" : ""}`}
                        onMouseDown={() => handleSuggestionClick(item.value)}
                      >
                        <span className="text-truncate me-2">
                          {highlightMatch(fqdnPart, term)}
                        </span>
                        <span className="vds-type-badge flex-shrink-0">
                          {typePart}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
            {/* Type filter dropdown — disabled until a FQDN search returns results */}
            <div
              ref={typeDropdownRef}
              className="position-relative"
              title={
                apiFiltersDisabled
                  ? "Search for a record name first"
                  : undefined
              }
              style={
                apiFiltersDisabled
                  ? { opacity: 0.45, pointerEvents: "none" }
                  : undefined
              }
            >
              <button
                className="btn btn-sm d-flex align-items-center gap-1 vds-btn-flat"
                onClick={() => setTypeDropdownOpen((o) => !o)}
              >
                <i className="bi bi-tag" />
                <span className="vds-btn-flat__label">Type</span>
                {typeFilters.length > 0 && (
                  <span className="vds-filter-chip--accent">
                    {typeFilters.length === 1
                      ? typeFilters[0]
                      : `${typeFilters.length} selected`}
                  </span>
                )}
                <i
                  className={`bi bi-chevron-${typeDropdownOpen ? "up" : "down"} ms-1`}
                  style={{ fontSize: "0.65rem", color: "#506080" }}
                />
              </button>
              {typeDropdownOpen && (
                <ul
                  className="list-group position-absolute shadow vds-toolbar-filter-list"
                  style={{
                    zIndex: 1050,
                    top: "calc(100% + 4px)",
                    left: 0,
                    minWidth: "150px",
                    maxHeight: "280px",
                    overflowY: "auto",
                    borderRadius: "0.55rem",
                    overflow: "hidden",
                    border: "1px solid #d4dbe8",
                  }}
                >
                  {(availableTypes.length > 0
                    ? availableTypes
                    : [
                        "A",
                        "AAAA",
                        "CNAME",
                        "DS",
                        "MX",
                        "NS",
                        "NAPTR",
                        "PTR",
                        "SOA",
                        "SPF",
                        "SRV",
                        "SSHFP",
                        "TXT",
                      ]
                  ).map((t) => {
                    const checked = typeFilters.includes(t);
                    return (
                      <li
                        key={t}
                        className={`list-group-item list-group-item-action py-2 px-3 d-flex align-items-center gap-2 vds-suggestion-item${checked ? " vds-role-item--selected" : ""}`}
                        style={{ cursor: "pointer", fontSize: "0.85rem" }}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          const newTypes = checked
                            ? typeFilters.filter((x) => x !== t)
                            : [...typeFilters, t];
                          setTypeFilters(newTypes);
                          search({
                            name: nameInput,
                            type: newTypes.join(","),
                            sort: nameSort,
                            ownerGroup: ownerGroupFilter,
                          });
                        }}
                      >
                        <input
                          type="checkbox"
                          className="form-check-input me-1"
                          checked={checked}
                          onChange={() => {}}
                          style={{ cursor: "pointer", pointerEvents: "none" }}
                        />
                        <span
                          className="vds-type-badge"
                          style={{ fontSize: "0.68rem", padding: "1px 6px" }}
                        >
                          {t}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            {/* Owner Group combobox — disabled until a FQDN search returns results */}
            {groups.length > 0 && (
              <div
                ref={ownerGroupDropdownRef}
                className="position-relative"
                style={{ width: 190 }}
              >
                <div
                  className="input-group input-group-sm vds-search-group"
                  title={
                    apiFiltersDisabled
                      ? "Search for a record name first"
                      : undefined
                  }
                  style={
                    apiFiltersDisabled
                      ? { opacity: 0.45, pointerEvents: "none" }
                      : undefined
                  }
                >
                  <span
                    className="input-group-text border-0 bg-transparent ps-2 pe-1"
                    style={{ color: "#506080" }}
                  >
                    <i
                      className="bi bi-people"
                      style={{ fontSize: "0.8rem" }}
                    />
                  </span>
                  <input
                    type="text"
                    className="form-control border-0 ps-0 shadow-none bg-transparent"
                    placeholder="Owner Group"
                    value={ownerGroupInput}
                    onChange={(e) => {
                      const val = e.target.value;
                      setOwnerGroupInput(val);
                      setOwnerGroupDropdownOpen(true);
                      // If the user clears the box, remove the filter immediately
                      if (!val.trim()) {
                        setOwnerGroupFilter("");
                        search({
                          name: nameInput,
                          type: typeFilters.join(","),
                          sort: nameSort,
                          ownerGroup: "",
                        });
                      }
                    }}
                    onFocus={() => setOwnerGroupDropdownOpen(true)}
                  />
                  {ownerGroupInput && (
                    <button
                      type="button"
                      className="btn btn-sm border-0 vds-table-secondary px-1"
                      tabIndex={-1}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        setOwnerGroupInput("");
                        setOwnerGroupFilter("");
                        setOwnerGroupDropdownOpen(false);
                        search({
                          name: nameInput,
                          type: typeFilters.join(","),
                          sort: nameSort,
                          ownerGroup: "",
                        });
                      }}
                    >
                      <i className="bi bi-x" style={{ fontSize: "0.8rem" }} />
                    </button>
                  )}
                  <button
                    type="button"
                    className="btn btn-sm border-0 vds-table-secondary px-1"
                    tabIndex={-1}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      setOwnerGroupDropdownOpen((o) => !o);
                    }}
                  >
                    <i
                      className={`bi bi-chevron-${ownerGroupDropdownOpen ? "up" : "down"}`}
                      style={{ fontSize: "0.65rem" }}
                    />
                  </button>
                </div>
                {ownerGroupDropdownOpen && (
                  <ul
                    className="list-group position-absolute shadow vds-toolbar-filter-list"
                    style={{
                      zIndex: 1050,
                      top: "calc(100% + 4px)",
                      left: 0,
                      right: 0,
                      maxHeight: "220px",
                      overflowY: "auto",
                      borderRadius: "0.55rem",
                      border: "1px solid #d4dbe8",
                    }}
                  >
                    {[...groups]
                      .sort((a, b) => a.name.localeCompare(b.name))
                      .filter(
                        (g) =>
                          !ownerGroupInput.trim() ||
                          g.name
                            .toLowerCase()
                            .includes(ownerGroupInput.toLowerCase()),
                      )
                      .map((g) => (
                        <li
                          key={g.id}
                          className={`list-group-item list-group-item-action py-2 px-3 vds-suggestion-item${ownerGroupFilter === g.id ? " vds-role-item--selected" : ""}`}
                          style={{ cursor: "pointer", fontSize: "0.85rem" }}
                          onMouseDown={(e) => {
                            e.preventDefault();
                            setOwnerGroupInput(g.name);
                            setOwnerGroupFilter(g.id);
                            setOwnerGroupDropdownOpen(false);
                            search({
                              name: nameInput,
                              type: typeFilters.join(","),
                              sort: nameSort,
                              ownerGroup: g.id,
                            });
                          }}
                        >
                          {g.name}
                        </li>
                      ))}
                    {[...groups].filter(
                      (g) =>
                        !ownerGroupInput.trim() ||
                        g.name
                          .toLowerCase()
                          .includes(ownerGroupInput.toLowerCase()),
                    ).length === 0 && (
                      <li
                        className="list-group-item py-2 px-3 text-muted"
                        style={{ fontSize: "0.85rem" }}
                      >
                        No groups match
                      </li>
                    )}
                  </ul>
                )}
              </div>
            )}

            {/* Status filter dropdown */}
            <div ref={statusDropdownRef} className="position-relative">
              <button
                className="btn btn-sm d-flex align-items-center gap-1 vds-btn-flat"
                onClick={() => setStatusDropdownOpen((o) => !o)}
              >
                <i className="bi bi-activity" />
                <span className="vds-btn-flat__label">Status</span>
                {statusFilter && (
                  <span className="vds-filter-chip--accent">
                    {STATUS_LABELS[statusFilter] ?? statusFilter}
                  </span>
                )}
                <i
                  className={`bi bi-chevron-${statusDropdownOpen ? "up" : "down"} ms-1`}
                  style={{ fontSize: "0.65rem", color: "#506080" }}
                />
              </button>
              {statusDropdownOpen && availableStatuses.length > 0 && (
                <ul
                  className="list-group position-absolute shadow vds-toolbar-filter-list"
                  style={{
                    zIndex: 1050,
                    top: "calc(100% + 4px)",
                    left: 0,
                    minWidth: "155px",
                    borderRadius: "0.55rem",
                    overflow: "hidden",
                    border: "1px solid #d4dbe8",
                  }}
                >
                  {availableStatuses.map((s) => (
                    <li
                      key={s}
                      className={`list-group-item list-group-item-action py-2 px-3 d-flex align-items-center gap-2 vds-suggestion-item${statusFilter === s ? " vds-role-item--selected" : ""}`}
                      style={{ cursor: "pointer", fontSize: "0.85rem" }}
                      onMouseDown={() => {
                        setStatusFilter(statusFilter === s ? null : s);
                        setStatusDropdownOpen(false);
                      }}
                    >
                      <i
                        className={`bi ${s === "Active" ? "bi-check-circle-fill text-success" : s.startsWith("Pending") ? "bi-clock text-warning" : "bi-dash-circle text-secondary"}`}
                      />
                      {STATUS_LABELS[s] ?? s}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Zone Access filter dropdown */}
            <div ref={accessDropdownRef} className="position-relative">
              <button
                className="btn btn-sm d-flex align-items-center gap-1 vds-btn-flat"
                onClick={() => setAccessDropdownOpen((o) => !o)}
              >
                <i className="bi bi-shield-lock" />
                <span className="vds-btn-flat__label">Access</span>
                {accessFilter && (
                  <span className="vds-filter-chip--accent">
                    {accessFilter === "shared" ? "Shared" : "Private"}
                  </span>
                )}
                <i
                  className={`bi bi-chevron-${accessDropdownOpen ? "up" : "down"} ms-1`}
                  style={{ fontSize: "0.65rem", color: "#506080" }}
                />
              </button>
              {accessDropdownOpen && (hasShared || hasPrivate) && (
                <ul
                  className="list-group position-absolute shadow vds-toolbar-filter-list"
                  style={{
                    zIndex: 1050,
                    top: "calc(100% + 4px)",
                    left: 0,
                    minWidth: "135px",
                    borderRadius: "0.55rem",
                    overflow: "hidden",
                    border: "1px solid #d4dbe8",
                  }}
                >
                  {hasShared && (
                    <li
                      className={`list-group-item list-group-item-action py-2 px-3 d-flex align-items-center gap-2 vds-suggestion-item${accessFilter === "shared" ? " vds-role-item--selected" : ""}`}
                      style={{ cursor: "pointer", fontSize: "0.85rem" }}
                      onMouseDown={() => {
                        setAccessFilter(
                          accessFilter === "shared" ? null : "shared",
                        );
                        setAccessDropdownOpen(false);
                      }}
                    >
                      <i className="bi bi-share-fill" /> Shared
                    </li>
                  )}
                  {hasPrivate && (
                    <li
                      className={`list-group-item list-group-item-action py-2 px-3 d-flex align-items-center gap-2 vds-suggestion-item${accessFilter === "private" ? " vds-role-item--selected" : ""}`}
                      style={{ cursor: "pointer", fontSize: "0.85rem" }}
                      onMouseDown={() => {
                        setAccessFilter(
                          accessFilter === "private" ? null : "private",
                        );
                        setAccessDropdownOpen(false);
                      }}
                    >
                      <i className="bi bi-lock-fill text-secondary" /> Private
                    </li>
                  )}
                </ul>
              )}
            </div>

            {/* Last Updated time filter */}
            <TimeFilterDropdown
              value={timeRange}
              dateFrom={dateFrom}
              dateTo={dateTo}
              onChange={setTimeRange}
              onDateFromChange={setDateFrom}
              onDateToChange={setDateTo}
            />

            {/* Refresh */}
            <button
              type="button"
              className="btn btn-sm d-flex align-items-center gap-1 vds-btn-flat"
              onClick={handleRefresh}
            >
              <i className="bi bi-arrow-clockwise" />
              <span className="vds-btn-flat__label">Refresh</span>
            </button>
          </div>
        </div>
      </div>

      {/* ── Active filter chips ── */}
      {activeFilterCount > 0 && (
        <div className="d-flex justify-content-end gap-2 mb-2 flex-wrap align-items-center px-1">
          {typeFilters.length > 0 && (
            <span className="vds-active-filter-tag d-flex align-items-center gap-1">
              <i className="bi bi-tag" /> Type: {typeFilters.join(", ")}
              <button
                type="button"
                className="btn-close ms-1"
                style={{
                  fontSize: "0.5rem",
                  filter:
                    "invert(30%) sepia(80%) saturate(500%) hue-rotate(190deg)",
                }}
                onClick={() => {
                  setTypeFilters([]);
                  search({
                    name: nameInput,
                    type: "",
                    sort: nameSort,
                    ownerGroup: ownerGroupFilter,
                  });
                }}
              />
            </span>
          )}
          {ownerGroupFilter && (
            <span className="vds-active-filter-tag d-flex align-items-center gap-1">
              <i className="bi bi-people" /> Owner Group:{" "}
              {groups.find((g) => g.id === ownerGroupFilter)?.name ??
                ownerGroupFilter}
              <button
                type="button"
                className="btn-close ms-1"
                style={{
                  fontSize: "0.5rem",
                  filter:
                    "invert(30%) sepia(80%) saturate(500%) hue-rotate(190deg)",
                }}
                onClick={() => {
                  setOwnerGroupFilter("");
                  search({
                    name: nameInput,
                    type: typeFilters.join(","),
                    sort: nameSort,
                    ownerGroup: "",
                  });
                }}
              />
            </span>
          )}
          {statusFilter && (
            <span className="vds-active-filter-tag d-flex align-items-center gap-1">
              <i className="bi bi-activity" /> Status:{" "}
              {STATUS_LABELS[statusFilter] ?? statusFilter}
              <button
                type="button"
                className="btn-close ms-1"
                style={{
                  fontSize: "0.5rem",
                  filter:
                    "invert(30%) sepia(80%) saturate(500%) hue-rotate(190deg)",
                }}
                onClick={() => setStatusFilter(null)}
              />
            </span>
          )}
          {accessFilter && (
            <span className="vds-active-filter-tag d-flex align-items-center gap-1">
              <i
                className={`bi ${accessFilter === "shared" ? "bi-share-fill" : "bi-lock-fill"}`}
              />
              Access: {accessFilter === "shared" ? "Shared" : "Private"}
              <button
                type="button"
                className="btn-close ms-1"
                style={{
                  fontSize: "0.5rem",
                  filter:
                    "invert(30%) sepia(80%) saturate(500%) hue-rotate(190deg)",
                }}
                onClick={() => setAccessFilter(null)}
              />
            </span>
          )}
          {zoneFilter && (
            <span className="vds-active-filter-tag d-flex align-items-center gap-1">
              <i className="bi bi-diagram-3" /> Zone: {zoneFilter}
              <button
                type="button"
                className="btn-close ms-1"
                style={{
                  fontSize: "0.5rem",
                  filter:
                    "invert(30%) sepia(80%) saturate(500%) hue-rotate(190deg)",
                }}
                onClick={() => setZoneFilter(null)}
              />
            </span>
          )}
          {/* Time filter chip — shows either a preset label or the custom date range */}
          {timeRange !== "all" && (
            <span className="vds-active-filter-tag d-flex align-items-center gap-1">
              <i className="bi bi-clock" />
              Last Updated:{" "}
              {timeRange === "1d"
                ? "Today"
                : timeRange === "7d"
                  ? "Last 7 days"
                  : timeRange === "30d"
                    ? "Last 30 days"
                    : timeRange === "90d"
                      ? "Last 90 days"
                      : `${dateFrom || "…"} – ${dateTo || "…"}`}
              <button
                type="button"
                className="btn-close ms-1"
                style={{
                  fontSize: "0.5rem",
                  filter:
                    "invert(30%) sepia(80%) saturate(500%) hue-rotate(190deg)",
                }}
                onClick={() => {
                  setTimeRange("all");
                  setDateFrom("");
                  setDateTo("");
                }}
              />
            </span>
          )}
          <button
            type="button"
            className="btn btn-sm vds-btn-clear-all d-flex align-items-center gap-1"
            onClick={() => {
              setTypeFilters([]);
              setOwnerGroupFilter("");
              setOwnerGroupInput("");
              setStatusFilter(null);
              setAccessFilter(null);
              setZoneFilter(null);
              setTimeRange("all");
              setDateFrom("");
              setDateTo("");
              search({
                name: nameInput,
                type: "",
                sort: nameSort,
                ownerGroup: "",
              });
            }}
            title="Clear all filters"
          >
            <i className="bi bi-x-circle" />
            <span>Clear All</span>
          </button>
        </div>
      )}

      {isLoading ? (
        <LoadingSpinner />
      ) : (
        <>
          {(prevPageEnabled || nextPageEnabled) && (
            <div className="d-flex align-items-center justify-content-end px-3 pt-2">
              <Pagination
                onPrev={prevPage}
                onNext={nextPage}
                prevEnabled={prevPageEnabled}
                nextEnabled={nextPageEnabled}
                rangeLabel={
                  records.length > 0
                    ? `${(currentPage - 1) * pageSize + 1}–${(currentPage - 1) * pageSize + records.length}`
                    : undefined
                }
              />
            </div>
          )}
          <RecordsSearchTable
            records={displayedRecords.map((rec) => {
              // For non-shared zones the Angular portal resolves ownerGroup from
              // the zone's adminGroup via GET /zones/:id/details. We replicate
              // that here: prefer the API-embedded ownerGroupName, then the zone
              // admin group from the details endpoint, then the user's own groups
              // list as a last resort.
              const zoneDetail = !rec.zoneShared
                ? zoneDetailsMap?.[rec.zoneId as string]
                : undefined;
              return {
                ...rec,
                ownerGroupId: rec.ownerGroupId ?? zoneDetail?.adminGroupId,
                ownerGroupName:
                  rec.ownerGroupName ??
                  zoneDetail?.adminGroupName ??
                  (rec.ownerGroupId
                    ? (groups.find(
                        (g: { id: string }) => g.id === rec.ownerGroupId,
                      )?.name ?? rec.ownerGroupId)
                    : "Unowned"),
              };
            })}
            showZone
            showOwnerGroup
            nameSort={nameSort}
            onToggleSort={handleToggleSort}
            onViewHistory={(rec) => setHistoryRecord(rec)}
          />
          {(prevPageEnabled || nextPageEnabled) && (
            <div className="card-footer d-flex align-items-center justify-content-end py-2 px-3 mt-1">
              <Pagination
                onPrev={prevPage}
                onNext={nextPage}
                prevEnabled={prevPageEnabled}
                nextEnabled={nextPageEnabled}
                rangeLabel={
                  records.length > 0
                    ? `${(currentPage - 1) * pageSize + 1}–${(currentPage - 1) * pageSize + records.length}`
                    : undefined
                }
              />
            </div>
          )}
        </>
      )}

      {/* ── Record History Modal ── */}
      {historyRecord && (
        <RecordHistoryModal
          record={historyRecord}
          onClose={() => setHistoryRecord(null)}
        />
      )}
    </div>
  );
}
