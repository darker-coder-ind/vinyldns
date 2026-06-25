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
 * Shared test data fixtures — mirrors TestApplicationData.scala from the old portal.
 *
 * Import individual builders or named fixtures into test files to avoid
 * duplicating data setup across the test suite.
 */

import type { UserProfile } from '../../types/profile';
import type { Zone } from '../../types/zone';
import type { Group, GroupMember } from '../../types/group';
import type { RecordSet } from '../../types/record';

// ── Users ─────────────────────────────────────────────────────────────────────

/** Standard authenticated user — mirrors frodoUser in TestApplicationData.scala */
export const frodoUser: UserProfile = {
  id: 'frodo-uuid',
  userName: 'fbaggins',
  firstName: 'Frodo',
  lastName: 'Baggins',
  email: 'fbaggins@hobbitmail.me',
  created: '2024-01-01T00:00:00Z',
  isSuper: false,
  isSupport: false,
  lockStatus: 'Unlocked',
};

/** Super/admin user — mirrors superFrodoUser in TestApplicationData.scala */
export const superFrodoUser: UserProfile = {
  id: 'super-frodo-uuid',
  userName: 'superBaggins',
  firstName: 'SuperFrodo',
  lastName: 'SuperBaggins',
  email: 'superfbaggins@hobbitmail.me',
  created: '2024-01-01T00:00:00Z',
  isSuper: true,
  isSupport: false,
  lockStatus: 'Unlocked',
};

/** Support user — mirrors support user variants in TestApplicationData.scala */
export const supportUser: UserProfile = {
  id: 'support-uuid',
  userName: 'supportUser',
  firstName: 'Support',
  lastName: 'User',
  email: 'support@vinyldns.io',
  created: '2024-01-01T00:00:00Z',
  isSuper: false,
  isSupport: true,
  lockStatus: 'Unlocked',
};

/** Locked user — mirrors lockedFrodoUser in TestApplicationData.scala */
export const lockedFrodoUser: UserProfile = {
  id: 'locked-frodo-uuid',
  userName: 'lockedFbaggins',
  firstName: 'LockedFrodo',
  lastName: 'LockedBaggins',
  email: 'lockedfbaggins@hobbitmail.me',
  created: '2024-01-01T00:00:00Z',
  isSuper: false,
  isSupport: false,
  lockStatus: 'Locked',
};

export function buildUser(overrides: Partial<UserProfile> = {}): UserProfile {
  return { ...frodoUser, ...overrides };
}

// ── Zones ─────────────────────────────────────────────────────────────────────

export const activeZone: Zone = {
  id: 'zone-id-1',
  name: 'example.com.',
  email: 'admin@example.com',
  status: 'Active',
  shared: false,
  adminGroupId: 'group-id-1',
  adminGroupName: 'example-admins',
  created: '2024-01-01T00:00:00Z',
  updated: '2024-06-01T00:00:00Z',
} as Zone;

export const sharedZone: Zone = {
  ...activeZone,
  id: 'zone-id-2',
  name: 'shared.example.com.',
  shared: true,
} as Zone;

export function buildZone(overrides: Partial<Zone> = {}): Zone {
  return { ...activeZone, ...overrides } as Zone;
}

// ── Groups ────────────────────────────────────────────────────────────────────

export const frodoMember: GroupMember = {
  id: 'frodo-uuid',
  userName: 'fbaggins',
  firstName: 'Frodo',
  lastName: 'Baggins',
  email: 'fbaggins@hobbitmail.me',
  isAdmin: true,
};

export const hobbitGroup: Group = {
  id: 'group-id-1',
  name: 'hobbits',
  email: 'hobbits@hobbitmail.me',
  description: 'The Fellowship hobbits',
  status: 'Active',
  members: [frodoMember],
  admins: [frodoMember],
};

export function buildGroup(overrides: Partial<Group> = {}): Group {
  return { ...hobbitGroup, ...overrides };
}

export function buildGroupMember(overrides: Partial<GroupMember> = {}): GroupMember {
  return { ...frodoMember, id: 'member-uuid', isAdmin: false, ...overrides };
}

// ── Record Sets ───────────────────────────────────────────────────────────────

export const aRecord: RecordSet = {
  id: 'recordset-id-1',
  zoneId: 'zone-id-1',
  name: 'test',
  type: 'A',
  ttl: 300,
  status: 'Active',
  records: [{ address: '10.0.0.1' }],
} as RecordSet;

export function buildRecordSet(overrides: Partial<RecordSet> = {}): RecordSet {
  return { ...aRecord, ...overrides } as RecordSet;
}
