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
import { AlertBanner } from '../../components/common/AlertBanner';
import type { Alert } from '../../types/common';

// ── Mock useAlerts hook ───────────────────────────────────────────────────────

const mockRemoveAlert = vi.fn();

vi.mock('../../contexts/AlertContext', () => ({
  useAlerts: vi.fn(),
}));

import { useAlerts } from '../../contexts/AlertContext';

// ── Test helpers ──────────────────────────────────────────────────────────────

function buildAlert(overrides: Partial<Alert> = {}): Alert {
  return { id: 'test-id-1', type: 'danger', content: 'Something went wrong', ...overrides };
}

function setupAlerts(alerts: Alert[], removeAlert = mockRemoveAlert) {
  vi.mocked(useAlerts).mockReturnValue({
    alerts,
    addAlert: vi.fn(),
    removeAlert,
    clearAlerts: vi.fn(),
  });
}

function renderWithAlerts(alerts: Alert[], removeAlert = mockRemoveAlert) {
  setupAlerts(alerts, removeAlert);
  return render(<AlertBanner />);
}

// ── AlertBanner ───────────────────────────────────────────────────────────────

describe('AlertBanner', () => {
  describe('when there are no alerts', () => {
    it('renders nothing', () => {
      const { container } = renderWithAlerts([]);
      expect(container.firstChild).toBeNull();
    });
  });

  describe('when alerts are present', () => {
    it('renders the alert message content', () => {
      renderWithAlerts([buildAlert({ content: 'Zone not found' })]);
      expect(screen.getByText('Zone not found')).toBeInTheDocument();
    });

    it('applies the correct Bootstrap alert type class', () => {
      renderWithAlerts([buildAlert({ type: 'danger' })]);
      const alertEl = screen.getByRole('alert');
      expect(alertEl).toHaveClass('alert-danger');
    });

    it('applies alert-success class for a success alert', () => {
      renderWithAlerts([buildAlert({ type: 'success', content: 'Zone created successfully' })]);
      const alertEl = screen.getByRole('alert');
      expect(alertEl).toHaveClass('alert-success');
    });

    it('applies alert-warning class for a warning alert', () => {
      renderWithAlerts([buildAlert({ type: 'warning', content: 'Approaching zone limit' })]);
      const alertEl = screen.getByRole('alert');
      expect(alertEl).toHaveClass('alert-warning');
    });

    it('renders multiple alerts when more than one is present', () => {
      renderWithAlerts([
        buildAlert({ id: 'a1', content: 'First error' }),
        buildAlert({ id: 'a2', content: 'Second error' }),
      ]);
      expect(screen.getByText('First error')).toBeInTheDocument();
      expect(screen.getByText('Second error')).toBeInTheDocument();
    });
  });

  describe('close button', () => {
    it('calls removeAlert with the correct id when the close button is clicked', async () => {
      const removeAlert = vi.fn();
      renderWithAlerts([buildAlert({ id: 'test-id-1' })], removeAlert);

      await userEvent.click(screen.getByLabelText('Close'));

      expect(removeAlert).toHaveBeenCalledOnce();
      expect(removeAlert).toHaveBeenCalledWith('test-id-1');
    });

    it('calls removeAlert for the correct alert when multiple are displayed', async () => {
      const removeAlert = vi.fn();
      renderWithAlerts(
        [
          buildAlert({ id: 'id-A', content: 'Error A' }),
          buildAlert({ id: 'id-B', content: 'Error B' }),
        ],
        removeAlert
      );

      const closeButtons = screen.getAllByLabelText('Close');
      await userEvent.click(closeButtons[1]); // close second alert

      expect(removeAlert).toHaveBeenCalledWith('id-B');
    });
  });
});
