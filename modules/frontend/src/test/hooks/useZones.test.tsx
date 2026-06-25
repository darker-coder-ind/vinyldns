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

/**
 * Tests for useZones hook — mirrors UserSyncTaskSpec.scala and the zone
 * sections of VinylDNSSpec.scala from the old portal.
 *
 * Old equivalents:
 *  UserSyncTaskSpec → "successfully lock unauthorized users" (mutation side-effects)
 *                     "successfully process if no users are found" (empty-list case)
 *  VinylDNSSpec     → mutation success/error alert behaviour, search filtering
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useZones } from '../../hooks/useZones';
import { activeZone, buildZone } from '../fixtures/testData';

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockAddAlert = vi.fn();

vi.mock('../../contexts/AlertContext', () => ({
  useAlerts: vi.fn(() => ({
    alerts: [],
    addAlert: mockAddAlert,
    removeAlert: vi.fn(),
    clearAlerts: vi.fn(),
  })),
}));

vi.mock('../../services/zonesService', () => ({
  zonesService: {
    getZones: vi.fn(),
    createZone: vi.fn(),
    updateZone: vi.fn(),
    deleteZone: vi.fn(),
    syncZone: vi.fn(),
    getDeletedZones: vi.fn(),
    getZoneChanges: vi.fn(),
    getBackendIds: vi.fn(),
    countZones: vi.fn(),
  },
}));

import { zonesService } from '../../services/zonesService';
const mockZonesService = zonesService as unknown as {
  getZones: ReturnType<typeof vi.fn>;
  createZone: ReturnType<typeof vi.fn>;
  updateZone: ReturnType<typeof vi.fn>;
  deleteZone: ReturnType<typeof vi.fn>;
};

// ── Test wrapper ──────────────────────────────────────────────────────────────

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: 0 },
      mutations: { retry: false },
    },
  });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockZonesService.getZones.mockResolvedValue({ data: { zones: [], maxItems: 100 } });
});

// ── useZones ──────────────────────────────────────────────────────────────────

describe('useZones', () => {
  // ── initial state ──────────────────────────────────────────────────────────

  describe('initial state', () => {
    it('returns an empty zones array before data loads', () => {
      const { result } = renderHook(() => useZones(), { wrapper: makeWrapper() });
      // Before the query resolves, zones defaults to []
      expect(result.current.zones).toEqual([]);
    });

    it('starts with isLoading true while the query is in flight', () => {
      mockZonesService.getZones.mockReturnValueOnce(new Promise(() => {}));
      const { result } = renderHook(() => useZones(), { wrapper: makeWrapper() });
      expect(result.current.isLoading).toBe(true);
    });

    it('populates zones after a successful fetch', async () => {
      mockZonesService.getZones.mockResolvedValueOnce({
        data: { zones: [activeZone], maxItems: 100 },
      });
      const { result } = renderHook(() => useZones(), { wrapper: makeWrapper() });
      await waitFor(() => expect(result.current.zones).toHaveLength(1));
      expect(result.current.zones[0].name).toBe('example.com.');
    });
  });

  // ── createZone mutation ────────────────────────────────────────────────────

  describe('createZone mutation', () => {
    it('adds a success alert when the zone is created successfully', async () => {
      const zone = buildZone();
      mockZonesService.createZone.mockResolvedValueOnce({ data: { zone } });

      const { result } = renderHook(() => useZones(), { wrapper: makeWrapper() });

      act(() => { result.current.createZone(zone); });

      await waitFor(() =>
        expect(mockAddAlert).toHaveBeenCalledWith('success', 'Zone created successfully')
      );
    });

    it('adds a danger alert when zone creation fails', async () => {
      mockZonesService.createZone.mockRejectedValueOnce({
        response: { status: 409, statusText: 'Conflict', data: { errors: ['Zone already exists'] } },
      });

      const { result } = renderHook(() => useZones(), { wrapper: makeWrapper() });

      act(() => { result.current.createZone(buildZone()); });

      await waitFor(() =>
        expect(mockAddAlert).toHaveBeenCalledWith('danger', expect.stringContaining('Zone already exists'))
      );
    });
  });

  // ── deleteZone mutation ────────────────────────────────────────────────────

  describe('deleteZone mutation', () => {
    it('adds a success alert when the zone is deleted', async () => {
      mockZonesService.deleteZone.mockResolvedValueOnce({});

      const { result } = renderHook(() => useZones(), { wrapper: makeWrapper() });

      act(() => { result.current.deleteZone('zone-id-1'); });

      await waitFor(() =>
        expect(mockAddAlert).toHaveBeenCalledWith('success', 'Zone deleted successfully')
      );
    });

    it('adds a danger alert when zone deletion fails', async () => {
      mockZonesService.deleteZone.mockRejectedValueOnce({
        response: { status: 403, statusText: 'Forbidden', data: 'Not authorized' },
      });

      const { result } = renderHook(() => useZones(), { wrapper: makeWrapper() });

      act(() => { result.current.deleteZone('zone-id-1'); });

      await waitFor(() =>
        expect(mockAddAlert).toHaveBeenCalledWith('danger', expect.any(String))
      );
    });
  });

  // ── updateZone mutation ────────────────────────────────────────────────────

  describe('updateZone mutation', () => {
    it('adds a success alert when the zone is updated', async () => {
      const zone = buildZone();
      mockZonesService.updateZone.mockResolvedValueOnce({ data: { zone } });

      const { result } = renderHook(() => useZones(), { wrapper: makeWrapper() });

      act(() => { result.current.updateZone({ id: 'zone-id-1', zone }); });

      await waitFor(() =>
        expect(mockAddAlert).toHaveBeenCalledWith('success', 'Zone updated successfully')
      );
    });
  });

  // ── search ─────────────────────────────────────────────────────────────────

  describe('search', () => {
    it('updates the query state when search is called', () => {
      const { result } = renderHook(() => useZones(), { wrapper: makeWrapper() });
      act(() => result.current.search('example'));
      expect(result.current.query).toBe('example');
    });

    it('resets the query when search is called with an empty string', () => {
      const { result } = renderHook(() => useZones(), { wrapper: makeWrapper() });
      act(() => result.current.search('example'));
      act(() => result.current.search(''));
      expect(result.current.query).toBe('');
    });
  });

  // ── pagination ─────────────────────────────────────────────────────────────

  describe('pagination', () => {
    it('starts with prevPage disabled', () => {
      const { result } = renderHook(() => useZones(), { wrapper: makeWrapper() });
      expect(result.current.prevPageEnabled).toBe(false);
    });

    it('starts with nextPage disabled when zones list is empty', async () => {
      const { result } = renderHook(() => useZones(), { wrapper: makeWrapper() });
      await waitFor(() => expect(result.current.isLoading).toBe(false));
      expect(result.current.nextPageEnabled).toBe(false);
    });
  });
});
