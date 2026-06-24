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
 * Tests for groupsService — mirrors the groups/membership sections of
 * VinylDNSSpec.scala and UserAccountAccessorSpec.scala from the old portal.
 *
 * Old equivalents:
 *  VinylDNSSpec         → group listing, membership, admin operations
 *  UserAccountAccessorSpec → create, update, get, getAllUsers (user ↔ group member)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { groupsService } from '../../services/groupsService';
import api from '../../services/api';
import { hobbitGroup, frodoMember, buildGroup, buildGroupMember } from '../fixtures/testData';

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
      .filter(([, v]) => v !== undefined && v !== null)
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

// ── groupsService ─────────────────────────────────────────────────────────────

describe('groupsService', () => {
  // ── createGroup ───────────────────────────────────────────────────────────

  describe('createGroup', () => {
    it('calls POST /groups with the group payload', () => {
      mockApi.post.mockResolvedValueOnce({ data: hobbitGroup });
      groupsService.createGroup({ name: 'hobbits', email: 'hobbits@example.com' });
      expect(mockApi.post).toHaveBeenCalledWith(
        '/groups',
        expect.objectContaining({ name: 'hobbits' })
      );
    });

    it('returns the created group', async () => {
      mockApi.post.mockResolvedValueOnce({ data: hobbitGroup });
      const res = await groupsService.createGroup({ name: 'hobbits', email: 'hobbits@example.com' });
      expect(res.data.id).toBe('group-id-1');
      expect(res.data.name).toBe('hobbits');
    });
  });

  // ── getGroup ──────────────────────────────────────────────────────────────

  describe('getGroup', () => {
    it('calls GET /groups/:id', () => {
      mockApi.get.mockResolvedValueOnce({ data: hobbitGroup });
      groupsService.getGroup('group-id-1');
      expect(mockApi.get).toHaveBeenCalledWith('/groups/group-id-1');
    });

    it('returns the group matching the id', async () => {
      mockApi.get.mockResolvedValueOnce({ data: hobbitGroup });
      const res = await groupsService.getGroup('group-id-1');
      expect(res.data.name).toBe('hobbits');
      expect(res.data.email).toBe('hobbits@hobbitmail.me');
    });
  });

  // ── updateGroup ───────────────────────────────────────────────────────────

  describe('updateGroup', () => {
    it('calls PUT /groups/:id with the updated payload', () => {
      const updated = buildGroup({ email: 'new-email@example.com' });
      mockApi.put.mockResolvedValueOnce({ data: updated });
      groupsService.updateGroup('group-id-1', { email: 'new-email@example.com' });
      expect(mockApi.put).toHaveBeenCalledWith(
        '/groups/group-id-1',
        expect.objectContaining({ email: 'new-email@example.com' })
      );
    });
  });

  // ── deleteGroup ───────────────────────────────────────────────────────────

  describe('deleteGroup', () => {
    it('calls DELETE /groups/:id', () => {
      mockApi.delete.mockResolvedValueOnce({});
      groupsService.deleteGroup('group-id-1');
      expect(mockApi.delete).toHaveBeenCalledWith('/groups/group-id-1');
    });
  });

  // ── getGroupMemberList ────────────────────────────────────────────────────

  describe('getGroupMemberList', () => {
    it('calls GET /groups/:groupId/members with maxItems=1000', () => {
      mockApi.get.mockResolvedValueOnce({ data: { members: [frodoMember] } });
      groupsService.getGroupMemberList('group-id-1');
      const [url] = mockApi.get.mock.calls[0];
      expect(url).toContain('/groups/group-id-1/members');
      expect(url).toContain('maxItems=1000');
    });

    it('returns the member list', async () => {
      const member2 = buildGroupMember({ id: 'member-2', userName: 'samwise' });
      mockApi.get.mockResolvedValueOnce({ data: { members: [frodoMember, member2] } });
      const res = await groupsService.getGroupMemberList('group-id-1');
      expect(res.data.members).toHaveLength(2);
      expect(res.data.members[0].userName).toBe('fbaggins');
    });
  });

  // ── addGroupMember ────────────────────────────────────────────────────────

  describe('addGroupMember', () => {
    it('calls PUT /groups/:groupId/members/:memberId', () => {
      mockApi.put.mockResolvedValueOnce({});
      groupsService.addGroupMember('group-id-1', 'member-uuid', frodoMember);
      expect(mockApi.put).toHaveBeenCalledWith(
        '/groups/group-id-1/members/member-uuid',
        frodoMember
      );
    });
  });

  // ── deleteGroupMember ─────────────────────────────────────────────────────

  describe('deleteGroupMember', () => {
    it('calls DELETE /groups/:groupId/members/:memberId', () => {
      mockApi.delete.mockResolvedValueOnce({});
      groupsService.deleteGroupMember('group-id-1', 'member-uuid');
      expect(mockApi.delete).toHaveBeenCalledWith(
        '/groups/group-id-1/members/member-uuid'
      );
    });
  });

  // ── getGroups ─────────────────────────────────────────────────────────────

  describe('getGroups', () => {
    it('calls GET /groups with a nameFilter when a query is provided', () => {
      mockApi.get.mockResolvedValueOnce({ data: { groups: [] } });
      groupsService.getGroups(false, 'hobbits');
      const [url] = mockApi.get.mock.calls[0];
      expect(url).toContain('groupNameFilter=hobbits');
    });

    it('omits groupNameFilter when query is an empty string', () => {
      mockApi.get.mockResolvedValueOnce({ data: { groups: [] } });
      groupsService.getGroups(false, '');
      const [url] = mockApi.get.mock.calls[0];
      expect(url).not.toContain('groupNameFilter');
    });

    it('includes ignoreAccess when true', () => {
      mockApi.get.mockResolvedValueOnce({ data: { groups: [] } });
      groupsService.getGroups(true);
      const [url] = mockApi.get.mock.calls[0];
      expect(url).toContain('ignoreAccess=true');
    });
  });

  // ── listEmailDomains ──────────────────────────────────────────────────────

  describe('listEmailDomains', () => {
    it('calls GET /groups/valid/domains', () => {
      mockApi.get.mockResolvedValueOnce({ data: ['example.com', 'test.org'] });
      groupsService.listEmailDomains();
      expect(mockApi.get).toHaveBeenCalledWith('/groups/valid/domains');
    });

    it('returns the list of valid email domains', async () => {
      mockApi.get.mockResolvedValueOnce({ data: ['example.com', 'test.org'] });
      const res = await groupsService.listEmailDomains();
      expect(res.data).toContain('example.com');
    });
  });
});
