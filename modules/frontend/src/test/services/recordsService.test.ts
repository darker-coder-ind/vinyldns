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
 * Tests for recordsService — mirrors the record-set sections of VinylDNSSpec.scala
 * and the VinylRequestSpec.scala (URL construction) from the old portal.
 *
 * Old equivalents:
 *  VinylDNSSpec        → API call assertions for record-set endpoints
 *  VinylRequestSpec    → getResourcePath, parameters, request construction
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { recordsService } from '../../services/recordsService';
import api from '../../services/api';
import { aRecord, buildRecordSet } from '../fixtures/testData';

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
      .filter(([, v]) => v !== undefined && v !== null && v !== '')
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

beforeEach(() => {
  vi.clearAllMocks();
});

// ── recordsService ────────────────────────────────────────────────────────────

describe('recordsService', () => {
  // ── listRecordSetData ─────────────────────────────────────────────────────

  describe('listRecordSetData', () => {
    it('calls GET /recordsets with the maxItems limit', () => {
      mockApi.get.mockResolvedValueOnce({ data: { recordSets: [] } });
      recordsService.listRecordSetData(100);
      const [url] = mockApi.get.mock.calls[0];
      expect(url).toContain('maxItems=100');
    });

    it('includes recordNameFilter when a nameFilter is provided', () => {
      mockApi.get.mockResolvedValueOnce({ data: { recordSets: [] } });
      recordsService.listRecordSetData(100, undefined, 'test');
      const [url] = mockApi.get.mock.calls[0];
      expect(url).toContain('recordNameFilter=test');
    });

    it('includes recordTypeFilter when a typeFilter is provided', () => {
      mockApi.get.mockResolvedValueOnce({ data: { recordSets: [] } });
      recordsService.listRecordSetData(100, undefined, undefined, 'A');
      const [url] = mockApi.get.mock.calls[0];
      expect(url).toContain('recordTypeFilter=A');
    });

    it('includes startFrom when a pagination token is provided', () => {
      mockApi.get.mockResolvedValueOnce({ data: { recordSets: [] } });
      recordsService.listRecordSetData(100, 'next-page-token');
      const [url] = mockApi.get.mock.calls[0];
      expect(url).toContain('startFrom=next-page-token');
    });

    it('omits recordNameFilter when nameFilter is empty', () => {
      mockApi.get.mockResolvedValueOnce({ data: { recordSets: [] } });
      recordsService.listRecordSetData(100, undefined, '');
      const [url] = mockApi.get.mock.calls[0];
      expect(url).not.toContain('recordNameFilter');
    });
  });

  // ── listRecordSetsByZone ──────────────────────────────────────────────────

  describe('listRecordSetsByZone', () => {
    it('calls GET /zones/:zoneId/recordsets', () => {
      mockApi.get.mockResolvedValueOnce({ data: { recordSets: [] } });
      recordsService.listRecordSetsByZone('zone-id-1', 100);
      const [url] = mockApi.get.mock.calls[0];
      expect(url).toContain('/zones/zone-id-1/recordsets');
    });

    it('includes nameSort in the URL when provided', () => {
      mockApi.get.mockResolvedValueOnce({ data: { recordSets: [] } });
      recordsService.listRecordSetsByZone('zone-id-1', 100, undefined, undefined, undefined, 'ASC');
      const [url] = mockApi.get.mock.calls[0];
      expect(url).toContain('nameSort=ASC');
    });
  });

  // ── getRecordSet ──────────────────────────────────────────────────────────

  describe('getRecordSet', () => {
    it('calls GET /zones/:zoneId/recordsets/:recordSetId', () => {
      mockApi.get.mockResolvedValueOnce({ data: { recordSet: aRecord } });
      recordsService.getRecordSet('zone-id-1', 'recordset-id-1');
      expect(mockApi.get).toHaveBeenCalledWith(
        '/zones/zone-id-1/recordsets/recordset-id-1'
      );
    });

    it('returns the record set', async () => {
      mockApi.get.mockResolvedValueOnce({ data: { recordSet: aRecord } });
      const res = await recordsService.getRecordSet('zone-id-1', 'recordset-id-1');
      expect(res.data.recordSet.type).toBe('A');
      expect(res.data.recordSet.name).toBe('test');
    });
  });

  // ── createRecordSet ───────────────────────────────────────────────────────

  describe('createRecordSet', () => {
    it('calls POST /zones/:zoneId/recordsets with the record set data', () => {
      mockApi.post.mockResolvedValueOnce({ data: { recordSet: aRecord } });
      recordsService.createRecordSet('zone-id-1', { name: 'test', type: 'A', ttl: 300 });
      expect(mockApi.post).toHaveBeenCalledWith(
        '/zones/zone-id-1/recordsets',
        expect.objectContaining({ name: 'test', type: 'A', ttl: 300 })
      );
    });

    it('returns the created record set', async () => {
      mockApi.post.mockResolvedValueOnce({ data: { recordSet: aRecord } });
      const res = await recordsService.createRecordSet('zone-id-1', { name: 'test', type: 'A', ttl: 300 });
      expect(res.data.recordSet.id).toBe('recordset-id-1');
    });
  });

  // ── updateRecordSet ───────────────────────────────────────────────────────

  describe('updateRecordSet', () => {
    it('calls PUT /zones/:zoneId/recordsets/:recordSetId', () => {
      const updated = buildRecordSet({ ttl: 600 });
      mockApi.put.mockResolvedValueOnce({ data: { recordSet: updated } });
      recordsService.updateRecordSet('zone-id-1', 'recordset-id-1', { ttl: 600 });
      expect(mockApi.put).toHaveBeenCalledWith(
        '/zones/zone-id-1/recordsets/recordset-id-1',
        expect.objectContaining({ ttl: 600 })
      );
    });
  });

  // ── deleteRecordSet ───────────────────────────────────────────────────────

  describe('deleteRecordSet', () => {
    it('calls DELETE /zones/:zoneId/recordsets/:recordSetId', () => {
      mockApi.delete.mockResolvedValueOnce({});
      recordsService.deleteRecordSet('zone-id-1', 'recordset-id-1');
      expect(mockApi.delete).toHaveBeenCalledWith(
        '/zones/zone-id-1/recordsets/recordset-id-1'
      );
    });
  });

  // ── getRecordSetChanges ───────────────────────────────────────────────────

  describe('getRecordSetChanges', () => {
    it('calls GET /zones/:zoneId/recordsetchanges with maxItems', () => {
      mockApi.get.mockResolvedValueOnce({ data: { recordSetChanges: [] } });
      recordsService.getRecordSetChanges('zone-id-1', 100);
      const [url] = mockApi.get.mock.calls[0];
      expect(url).toContain('/zones/zone-id-1/recordsetchanges');
      expect(url).toContain('maxItems=100');
    });

    it('includes startFrom when a pagination token is provided', () => {
      mockApi.get.mockResolvedValueOnce({ data: { recordSetChanges: [] } });
      recordsService.getRecordSetChanges('zone-id-1', 100, 'next-page-token');
      const [url] = mockApi.get.mock.calls[0];
      expect(url).toContain('startFrom=next-page-token');
    });
  });
});
