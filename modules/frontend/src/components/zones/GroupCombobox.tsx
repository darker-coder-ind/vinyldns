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

import React, { useEffect, useRef, useState } from 'react';
import type { Group } from '../../types/group';

interface GroupComboboxProps {
  groups: Group[];
  value: string;
  onChange: (id: string) => void;
  invalid?: boolean;
  errorMessage?: string;
}

export function GroupCombobox({ groups, value, onChange, invalid, errorMessage }: GroupComboboxProps) {
  const [search, setSearch] = useState('');
  const [open, setOpen]     = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const isDark = document.documentElement.getAttribute('data-vds-theme') === 'dark';


  const selected = groups.find((g) => g.id === value);
  const filtered = search
    ? groups.filter((g) =>
        g.name.toLowerCase().includes(search.toLowerCase()) ||
        (g.description ?? '').toLowerCase().includes(search.toLowerCase())
      )
    : groups;

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      {/* Trigger — looks like a standard dropdown */}
      <div
        className={`form-select vds-zone-form__input ${invalid ? 'is-invalid' : ''}`}
        style={{ cursor: 'pointer', userSelect: 'none' }}
        onClick={() => { setOpen((v) => !v); setSearch(''); }}
      >
        {selected
          ? <>{selected.name}{selected.description ? <span className="text-muted ms-1" style={{ fontSize: '0.85em' }}>({selected.description})</span> : null}</>
          : <span className="text-muted">— Select a group —</span>
        }
      </div>
      {invalid && errorMessage && (
        <div className="invalid-feedback d-block">{errorMessage}</div>
      )}

      {/* Dropdown panel */}
      {open && (
        <div style={{
          position: 'absolute', zIndex: 1050, left: 0, right: 0, top: '100%',
          background: isDark ? '#1a2840' : '#fff',
          border: isDark ? '1px solid rgba(127,168,216,0.2)' : '1px solid #ced4da',
          borderRadius: '0.375rem',
          boxShadow: isDark ? '0 4px 20px rgba(0,0,0,0.55)' : '0 4px 12px rgba(0,0,0,0.12)',
          maxHeight: 240, display: 'flex', flexDirection: 'column',
        }}>
          <div style={{ padding: '6px 8px', borderBottom: isDark ? '1px solid rgba(127,168,216,0.12)' : '1px solid #e9ecef' }}>
            <input
              autoFocus
              type="text"
              className="form-control form-control-sm"
              placeholder="Type to filter groups…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onClick={(e) => e.stopPropagation()}
            />
          </div>
          <div style={{ overflowY: 'auto', flex: 1 }}>
            <div
              style={{ padding: '6px 12px', cursor: 'pointer', color: isDark ? '#5a7898' : '#6c757d' }}
              onMouseDown={() => { onChange(''); setOpen(false); setSearch(''); }}
            >
              — Select a group —
            </div>
            {filtered.length === 0 && (
              <div style={{ padding: '6px 12px', color: isDark ? '#5a7898' : '#6c757d', fontStyle: 'italic' }}>No groups match</div>
            )}
            {filtered.map((g) => (
              <div
                key={g.id}
                style={{
                  padding: '6px 12px', cursor: 'pointer',
                  background: g.id === value
                    ? (isDark ? 'rgba(30,95,168,0.25)' : '#e8f4ff')
                    : undefined,
                  color: isDark ? (g.id === value ? '#90c2f0' : '#c8d8ee') : undefined,
                  fontWeight: g.id === value ? 600 : undefined,
                }}
                onMouseDown={() => { onChange(g.id); setOpen(false); setSearch(''); }}
              >
                {g.name}{g.description ? <span className="text-muted ms-1" style={{ fontSize: '0.85em' }}>({g.description})</span> : null}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
