import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, beforeEach, vi } from 'vitest';

// Vitest renders browser components without Next's module-marker handling.
vi.mock('client-only', () => ({}));

beforeEach(() => {localStorage.clear(); sessionStorage.clear();});
afterEach(() => cleanup());
