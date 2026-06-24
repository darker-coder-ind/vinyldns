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

import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Pagination, PaginatedSection } from '../../components/common/Pagination';

// ── Default props helper ──────────────────────────────────────────────────────

function defaultProps(overrides = {}) {
  return {
    onPrev: vi.fn(),
    onNext: vi.fn(),
    prevEnabled: false,
    nextEnabled: false,
    ...overrides,
  };
}

// ── Pagination ────────────────────────────────────────────────────────────────

describe('Pagination', () => {
  describe('on the first page (prevEnabled=false, nextEnabled=false)', () => {
    it('does not render a Previous button', () => {
      render(<Pagination {...defaultProps()} />);
      expect(screen.queryByRole('button', { name: /previous/i })).toBeNull();
    });

    it('does not render a Next button', () => {
      render(<Pagination {...defaultProps()} />);
      expect(screen.queryByRole('button', { name: /next/i })).toBeNull();
    });
  });

  describe('when only next page is available (nextEnabled=true)', () => {
    it('shows a Next button', () => {
      render(<Pagination {...defaultProps({ nextEnabled: true })} />);
      expect(screen.getByRole('button', { name: /next/i })).toBeInTheDocument();
    });

    it('does not show a Previous button', () => {
      render(<Pagination {...defaultProps({ nextEnabled: true })} />);
      expect(screen.queryByRole('button', { name: /previous/i })).toBeNull();
    });
  });

  describe('when both pages are available (prevEnabled=true, nextEnabled=true)', () => {
    it('shows both Previous and Next buttons', () => {
      render(<Pagination {...defaultProps({ prevEnabled: true, nextEnabled: true })} />);
      expect(screen.getByRole('button', { name: /previous/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /next/i })).toBeInTheDocument();
    });
  });

  describe('button click handlers', () => {
    it('calls onPrev when the Previous button is clicked', async () => {
      const onPrev = vi.fn();
      render(<Pagination {...defaultProps({ prevEnabled: true, onPrev })} />);

      await userEvent.click(screen.getByRole('button', { name: /previous/i }));

      expect(onPrev).toHaveBeenCalledOnce();
    });

    it('calls onNext when the Next button is clicked', async () => {
      const onNext = vi.fn();
      render(<Pagination {...defaultProps({ nextEnabled: true, onNext })} />);

      await userEvent.click(screen.getByRole('button', { name: /next/i }));

      expect(onNext).toHaveBeenCalledOnce();
    });
  });

  describe('label display', () => {
    it('renders the panelTitle as a label', () => {
      render(<Pagination {...defaultProps({ prevEnabled: true, panelTitle: 'My Zones' })} />);
      expect(screen.getByText('My Zones')).toBeInTheDocument();
    });

    it('renders rangeLabel instead of panelTitle when both are provided', () => {
      render(
        <Pagination
          {...defaultProps({ prevEnabled: true, panelTitle: 'My Zones', rangeLabel: '1–100 of 250' })}
        />
      );
      expect(screen.getByText('1–100 of 250')).toBeInTheDocument();
      expect(screen.queryByText('My Zones')).toBeNull();
    });
  });
});

// ── PaginatedSection ──────────────────────────────────────────────────────────

describe('PaginatedSection', () => {
  describe('when show=true', () => {
    it('renders pagination bars and child content', () => {
      render(
        <PaginatedSection
          show={true}
          onPrev={vi.fn()}
          onNext={vi.fn()}
          prevEnabled={true}
          nextEnabled={true}
        >
          <div>Zone list content</div>
        </PaginatedSection>
      );
      expect(screen.getByText('Zone list content')).toBeInTheDocument();
      // Two Pagination bars (top + bottom) so two Previous buttons
      expect(screen.getAllByRole('button', { name: /previous/i })).toHaveLength(2);
    });
  });

  describe('when show=false', () => {
    it('renders children but hides pagination bars', () => {
      render(
        <PaginatedSection
          show={false}
          onPrev={vi.fn()}
          onNext={vi.fn()}
          prevEnabled={true}
          nextEnabled={true}
        >
          <div>Zone list content</div>
        </PaginatedSection>
      );
      expect(screen.getByText('Zone list content')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /previous/i })).toBeNull();
      expect(screen.queryByRole('button', { name: /next/i })).toBeNull();
    });
  });
});
