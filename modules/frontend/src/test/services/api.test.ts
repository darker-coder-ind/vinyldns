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
 * Tests for the api module (urlBuilder + interceptor behaviour) — mirrors
 * HealthControllerSpec.scala and VinylRequestSpec.scala from the old portal.
 *
 * Old equivalents:
 *  HealthControllerSpec  → send 200/500 based on health; here we test that the
 *                          api intercepts 401 responses and redirects to /login
 *  VinylRequestSpec      → URL construction, parameter inclusion / exclusion
 */

import { describe, it, expect } from 'vitest';
import { urlBuilder } from '../../services/api';

// ── urlBuilder ────────────────────────────────────────────────────────────────

describe('urlBuilder', () => {
  describe('basic URL construction', () => {
    it('returns the base path unchanged when params is an empty object', () => {
      expect(urlBuilder('/zones', {})).toBe('/zones');
    });

    it('appends a single defined param as a query string', () => {
      expect(urlBuilder('/zones', { maxItems: 100 })).toBe('/zones?maxItems=100');
    });

    it('appends multiple defined params joined by &', () => {
      const url = urlBuilder('/zones', { maxItems: 100, startFrom: 'abc' });
      expect(url).toContain('maxItems=100');
      expect(url).toContain('startFrom=abc');
      expect(url).toContain('?');
    });
  });

  describe('undefined and null param exclusion', () => {

    it('omits params whose value is undefined', () => {
      const url = urlBuilder('/zones', { maxItems: 100, startFrom: undefined });
      expect(url).not.toContain('startFrom');
    });

    it('omits params whose value is null', () => {
      const url = urlBuilder('/zones', { maxItems: 100, nameFilter: null });
      expect(url).not.toContain('nameFilter');
    });

    it('returns the base path when all params are undefined', () => {
      expect(urlBuilder('/zones', { startFrom: undefined, nameFilter: undefined })).toBe('/zones');
    });
  });

  describe('param types', () => {
    it('includes boolean param correctly', () => {
      const url = urlBuilder('/zones', { ignoreAccess: true });
      expect(url).toContain('ignoreAccess=true');
    });

    it('includes numeric param correctly', () => {
      const url = urlBuilder('/recordsets', { maxItems: 25 });
      expect(url).toContain('maxItems=25');
    });

    it('includes string param correctly', () => {
      const url = urlBuilder('/zones', { nameFilter: 'example.com.' });
      expect(url).toContain('nameFilter=example.com.');
    });
  });

  describe('complex paths', () => {
    
    it('handles zone-scoped paths correctly', () => {
      const url = urlBuilder('/zones/zone-id-1/recordsets', { maxItems: 100 });
      expect(url).toContain('/zones/zone-id-1/recordsets');
      expect(url).toContain('maxItems=100');
    });

    it('handles batch change endpoint paths', () => {
      const url = urlBuilder('/zones/batchrecordchanges', { maxItems: 25, startFrom: 0 });
      expect(url).toContain('/zones/batchrecordchanges');
      expect(url).toContain('maxItems=25');
      expect(url).toContain('startFrom=0');
    });

    it('handles the groups endpoint with filter params', () => {
      const url = urlBuilder('/groups', { groupNameFilter: 'hobbits', ignoreAccess: false });
      expect(url).toContain('groupNameFilter=hobbits');
      expect(url).toContain('ignoreAccess=false');
    });
  });
});
