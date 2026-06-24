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

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { zonesService } from '../../services/zonesService';
import api from '../../services/api';
import type { Zone } from '../../types/zone';

// ── Mock the axios api instance ───────────────────────────────────────────────

vi.mock('../../services/api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
  urlBuilder: vi.fn((path: string, params?: Record<string, unknown>) => {
    if (!params) return path;
    const query = Object.entries(params)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => `${k}=${v}`)
      .join('&');
    return query ? `${path}?${query}` : path;
  }),
}));

const mockApi = api as unknown as {
  get: ReturnType<typeof vi.fn>;
  post: ReturnType<typeof vi.fn>;
  put: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
};

// ── Test data ─────────────────────────────────────────────────────────────────

function buildZone(overrides: Partial<Zone> = {}): Zone {
  return {
    id: 'zone-id-1',
    name: 'example.com.',
    email: 'admin@example.com',
    status: 'Active',
    shared: false,
    adminGroupId: 'group-id-1',
    ...overrides,
  } as Zone;
}

// ── zonesService ──────────────────────────────────────────────────────────────

describe('zonesService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── getZones ────────────────────────────────────────────────────────────────

  describe('getZones', () => {
    it('calls GET /zones with the maxItems limit', () => {
      mockApi.get.mockResolvedValueOnce({ data: { zones: [] } });
      zonesService.getZones(100);
      expect(mockApi.get).toHaveBeenCalledWith(expect.stringContaining('maxItems=100'));
    });

    it('includes nameFilter when a query string is provided', () => {
      mockApi.get.mockResolvedValueOnce({ data: { zones: [] } });
      zonesService.getZones(100, undefined, 'example');
      expect(mockApi.get).toHaveBeenCalledWith(expect.stringContaining('nameFilter=example'));
    });

    it('includes startFrom when a pagination token is provided', () => {
      mockApi.get.mockResolvedValueOnce({ data: { zones: [] } });
      zonesService.getZones(100, 'next-page-token');
      expect(mockApi.get).toHaveBeenCalledWith(expect.stringContaining('startFrom=next-page-token'));
    });

    it('does not include nameFilter when query is empty', () => {
      mockApi.get.mockResolvedValueOnce({ data: { zones: [] } });
      zonesService.getZones(100, undefined, '');
      expect(mockApi.get).toHaveBeenCalledWith(expect.not.stringContaining('nameFilter'));
    });
  });

  // ── getZone ─────────────────────────────────────────────────────────────────

  describe('getZone', () => {
    it('calls GET /zones/:id', () => {
      mockApi.get.mockResolvedValueOnce({ data: { zone: buildZone() } });
      zonesService.getZone('zone-id-1');
      expect(mockApi.get).toHaveBeenCalledWith('/zones/zone-id-1');
    });
  });

  // ── getZoneByName ───────────────────────────────────────────────────────────

  describe('getZoneByName', () => {
    it('calls GET /zones/name/:name', () => {
      mockApi.get.mockResolvedValueOnce({ data: { zone: buildZone() } });
      zonesService.getZoneByName('example.com.');
      expect(mockApi.get).toHaveBeenCalledWith('/zones/name/example.com.');
    });
  });

  // ── createZone ──────────────────────────────────────────────────────────────

  describe('createZone', () => {
    it('calls POST /zones with the zone payload', () => {
      const zone = buildZone();
      mockApi.post.mockResolvedValueOnce({ data: { zone } });
      zonesService.createZone(zone);
      expect(mockApi.post).toHaveBeenCalledWith('/zones', expect.objectContaining({ name: zone.name }));
    });

    it('strips an empty connection object from the payload', () => {
      const zone = buildZone({
        connection: { name: 'example.com.', keyName: '', key: '', primaryServer: '' } as Zone['connection'],
      });
      mockApi.post.mockResolvedValueOnce({ data: { zone } });
      zonesService.createZone(zone);

      const [, sentPayload] = mockApi.post.mock.calls[0];
      expect((sentPayload as Partial<Zone>).connection).toBeUndefined();
    });

    it('keeps a fully populated connection in the payload', () => {
      const zone = buildZone({
        connection: { name: 'example.com.', keyName: 'mykey', key: 'secret', primaryServer: '10.0.0.1' } as Zone['connection'],
      });
      mockApi.post.mockResolvedValueOnce({ data: { zone } });
      zonesService.createZone(zone);

      const [, sentPayload] = mockApi.post.mock.calls[0];
      expect((sentPayload as Partial<Zone>).connection).toBeDefined();
      expect((sentPayload as Partial<Zone>).connection?.keyName).toBe('mykey');
    });
  });

  // ── updateZone ──────────────────────────────────────────────────────────────

  describe('updateZone', () => {
    it('calls PUT /zones/:id with the zone payload', () => {
      const zone = buildZone();
      mockApi.put.mockResolvedValueOnce({ data: { zone } });
      zonesService.updateZone('zone-id-1', zone);
      expect(mockApi.put).toHaveBeenCalledWith('/zones/zone-id-1', expect.any(Object));
    });
  });

  // ── deleteZone ──────────────────────────────────────────────────────────────

  describe('deleteZone', () => {
    it('calls DELETE /zones/:id', () => {
      mockApi.delete.mockResolvedValueOnce({});
      zonesService.deleteZone('zone-id-1');
      expect(mockApi.delete).toHaveBeenCalledWith('/zones/zone-id-1');
    });
  });

  // ── syncZone ─────────────────────────────────────────────────────────────────

  describe('syncZone', () => {
    it('calls POST /zones/:id/sync', () => {
      mockApi.post.mockResolvedValueOnce({ data: { zone: buildZone() } });
      zonesService.syncZone('zone-id-1');
      expect(mockApi.post).toHaveBeenCalledWith('/zones/zone-id-1/sync', {});
    });
  });

  // ── normalizeZoneDates ───────────────────────────────────────────────────────

  describe('normalizeZoneDates', () => {
    it('converts the created field to API ISO format without milliseconds', () => {
      const zone = buildZone({ created: '2024-01-15T12:00:00.000Z' });
      const result = zonesService.normalizeZoneDates(zone);
      expect(result.created).toBe('2024-01-15T12:00:00Z');
    });

    it('converts the updated field to API ISO format', () => {
      const zone = buildZone({ updated: '2024-06-01T08:30:00.000Z' });
      const result = zonesService.normalizeZoneDates(zone);
      expect(result.updated).toBe('2024-06-01T08:30:00Z');
    });

    it('does not modify the zone when no date fields are set', () => {
      const zone = buildZone();
      const result = zonesService.normalizeZoneDates(zone);
      expect(result.created).toBeUndefined();
      expect(result.updated).toBeUndefined();
    });
  });

  // ── checkSharedStatus ────────────────────────────────────────────────────────

  describe('checkSharedStatus', () => {
    it('converts the string "true" to boolean true', () => {
      const zone = buildZone({ shared: 'true' as unknown as boolean });
      expect(zonesService.checkSharedStatus(zone).shared).toBe(true);
    });

    it('converts the string "false" to boolean false', () => {
      const zone = buildZone({ shared: 'false' as unknown as boolean });
      expect(zonesService.checkSharedStatus(zone).shared).toBe(false);
    });

    it('keeps boolean false as false', () => {
      const zone = buildZone({ shared: false });
      expect(zonesService.checkSharedStatus(zone).shared).toBe(false);
    });
  });

  // ── checkBackendId ───────────────────────────────────────────────────────────

  describe('checkBackendId', () => {
    it('sets backendId to undefined when it is an empty string', () => {
      const zone = buildZone({ backendId: '' });
      expect(zonesService.checkBackendId(zone).backendId).toBeUndefined();
    });

    it('keeps backendId when it has a value', () => {
      const zone = buildZone({ backendId: 'default' });
      expect(zonesService.checkBackendId(zone).backendId).toBe('default');
    });
  });
});
