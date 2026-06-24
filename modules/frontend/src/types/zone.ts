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

export interface ZoneConnection {
  name?: string;
  keyName?: string;
  key?: string;
  algorithm?: string;
  primaryServer?: string;
}

export interface AclRule {
  accessLevel: 'NoAccess' | 'Read' | 'Write' | 'Delete';
  description?: string;
  userId?: string;
  groupId?: string;
  recordMask?: string;
  recordTypes?: string[];
  displayName?: string;
  userName?: string;
  priority?: 'User' | 'Group' | 'All Users';
}

export interface ZoneAcl {
  rules: AclRule[];
}

export interface Zone {
  id: string;
  name: string;
  email: string;
  status: 'Active' | 'Deleted' | 'Syncing' | 'PendingDelete' | 'PendingUpdate';
  created?: string;
  updated?: string;
  latestSync?: string;
  adminGroupId: string;
  adminGroupName?: string;
  connection?: ZoneConnection;
  transferConnection?: ZoneConnection;
  acl?: ZoneAcl;
  shared?: boolean;
  backendId?: string;
  recurrenceSchedule?: string;
  accessLevel?: string;
  account?: string;
}

export interface ZoneListResponse {
  zones: Zone[];
  startFrom?: string;
  nextId?: string;
  maxItems: number;
  ignoreAccess: boolean;
}

export interface DeletedZoneChange {
  zoneChange: {
    zone: Zone;
    changeType: string;
    status: string;
    systemMessage?: string;
    created: string;
    userId: string;
    id: string;
  };
  adminGroupName: string;
  userName: string;
  accessLevel: string;
}

export interface DeletedZonesResponse {
  zonesDeletedInfo: DeletedZoneChange[];
  startFrom?: string;
  nextId?: string;
  maxItems: number;
}

export interface ZoneChange {
  zone: Zone;
  changeType: string;
  status: string;
  systemMessage?: string;
  created: string;
  userId: string;
  userName?: string;
  id: string;
}

export interface ZoneCount {
  totalCount: number;
  myZonesCount: number;
  sharedCount: number;
  privateCount: number;
  activeCount: number;
  syncingCount: number;
  abandonedCount: number;
  ptrCount: number;
  sharedPtrCount: number;
  privatePtrCount: number;
  abandonedPtrCount: number;
  abandonedSharedCount: number;
  myActiveCount: number;
  mySyncingCount: number;
  mySharedCount: number;
  myPrivateCount: number;
  myPtrCount: number;
  myAbandonedCount: number;
  myAbandonedPtrCount: number;
  myAbandonedSharedCount: number;
}

export interface ZoneChangesResponse {
  zoneChanges: ZoneChange[];
  startFrom?: string;
  nextId?: string;
  maxItems: number;
}
