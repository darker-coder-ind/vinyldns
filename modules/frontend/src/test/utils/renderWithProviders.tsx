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

import React from "react";
import { render, type RenderOptions } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AlertProvider } from "../../contexts/AlertContext";
import { BreadcrumbProvider } from "../../contexts/BreadcrumbContext";

/**
 * Build a QueryClient configured for tests: no retries (so failures surface
 * immediately) and zero stale/cache time (so each test starts clean).
 */
export function makeTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, staleTime: 0 },
      mutations: { retry: false },
    },
  });
}

interface WrapperOptions {
  routerEntries?: string[];
  client?: QueryClient;
}

/**
 * Wraps a UI under test with everything the components expect from the
 * app shell: a MemoryRouter, a QueryClient, and the Alert / Breadcrumb
 * context providers. Tests that don't need any of these can still call
 * the wrapper without configuration — the defaults are reasonable.
 */
export function renderWithProviders(
  ui: React.ReactElement,
  {
    routerEntries = ["/"],
    client = makeTestQueryClient(),
    ...options
  }: WrapperOptions & RenderOptions = {},
) {
  const Wrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={routerEntries}>
        <AlertProvider>
          <BreadcrumbProvider>{children}</BreadcrumbProvider>
        </AlertProvider>
      </MemoryRouter>
    </QueryClientProvider>
  );
  return {
    client,
    ...render(ui, { wrapper: Wrapper, ...options }),
  };
}
