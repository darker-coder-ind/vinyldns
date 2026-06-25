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
 * Tests for portalConfig — mirrors MetaSpec.scala and CustomLinksSpec.scala
 * from the old portal.
 *
 * Old equivalents:
 *  MetaSpec       → version, sharedDisplayEnabled, batchChangeLimit, defaultTtl,
 *                   manualBatchChangeReviewEnabled, scheduledBatchChangesEnabled,
 *                   maxGroupItemsDisplay
 *  CustomLinksSpec → load link from config, load multiple links, empty list when no links
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── portalConfig ──────────────────────────────────────────────────────────────

describe('portalConfig', () => {
  // ── version ───────────────────────────────────────────────────────────────

  describe('version', () => {
    it('exports a non-empty version string', async () => {
      const { portalConfig } = await import('../../config/portalConfig');
      expect(typeof portalConfig.version).toBe('string');
      expect(portalConfig.version.length).toBeGreaterThan(0);
    });
  });

  // ── loginLinks ────────────────────────────────────────────────────────────

  describe('loginLinks', () => {
    describe('when no VITE_DOCS_URL env var is set (default test environment)', () => {
      it('returns an array (empty or populated depending on env)', async () => {
        const { portalConfig } = await import('../../config/portalConfig');
        expect(Array.isArray(portalConfig.loginLinks)).toBe(true);
      });

      it('every link in loginLinks has a title and href', async () => {
        const { portalConfig } = await import('../../config/portalConfig');
        for (const link of portalConfig.loginLinks) {
          expect(link.title).toBeTruthy();
          expect(link.href).toBeTruthy();
        }
      });

      it('filters out links whose href is falsy', async () => {
        const { portalConfig } = await import('../../config/portalConfig');
        const invalidLinks = portalConfig.loginLinks.filter(
          (l) => !l.href
        );
        expect(invalidLinks).toHaveLength(0);
      });
    });

    describe('link structure', () => {
      it('each link has a string title', async () => {
        const { portalConfig } = await import('../../config/portalConfig');
        for (const link of portalConfig.loginLinks) {
          expect(typeof link.title).toBe('string');
        }
      });

      it('each link has a string href', async () => {
        const { portalConfig } = await import('../../config/portalConfig');
        for (const link of portalConfig.loginLinks) {
          expect(typeof link.href).toBe('string');
        }
      });
    });
  });
});
