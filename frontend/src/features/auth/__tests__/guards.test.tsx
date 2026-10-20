import { render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeStore } from '@/store/store';
import { fetchUser, restoreSession, setUser } from '../state/auth-slice';
import AdminGuard from '../components/AdminGuard';
import ProtectedRoute from '../components/ProtectedRoute';

const {push} = vi.hoisted(() => ({push: vi.fn()}));
vi.mock('@/i18n/navigation', () => ({useRouter: () => ({push})}));

function renderGuard(kind: 'admin' | 'account', status: 'initial' | 'restoring' | 'anonymous' | 'customer' | 'staff' | 'superuser') {
  const store = makeStore();
  if (status !== 'initial') {
    store.dispatch(restoreSession({accessToken: status === 'anonymous' ? null : 'access', refreshToken: null}));
    if (status !== 'restoring' && status !== 'anonymous') {
      store.dispatch(fetchUser.fulfilled({id: 1, email: 'test@example.com', is_staff: status === 'staff', is_superuser: status === 'superuser'}, 'test'));
    }
  }
  const Guard = kind === 'admin' ? AdminGuard : ProtectedRoute;
  render(<Provider store={store}><Guard><p>Private content</p></Guard></Provider>);
  return store;
}

beforeEach(() => push.mockClear());

describe('route permissions', () => {
  it.each(['admin', 'account'] as const)('%s waits for initialization and session restoration', (kind) => {
    renderGuard(kind, 'initial');
    expect(screen.queryByText('Private content')).not.toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });
  it.each(['admin', 'account'] as const)('%s does not redirect while restoring a session', (kind) => {
    renderGuard(kind, 'restoring');
    expect(screen.queryByText('Private content')).not.toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });
  it.each(['admin', 'account'] as const)('%s redirects anonymous visitors', (kind) => {
    renderGuard(kind, 'anonymous');
    expect(push).toHaveBeenCalledWith('/login');
    expect(screen.queryByText('Private content')).not.toBeInTheDocument();
  });
  it('rejects customer access to staff content', () => {
    renderGuard('admin', 'customer');
    expect(push).toHaveBeenCalledWith('/');
    expect(screen.queryByText('Private content')).not.toBeInTheDocument();
  });
  it.each(['staff', 'superuser'] as const)('allows a verified %s', (role) => {
    renderGuard('admin', role);
    expect(screen.getByText('Private content')).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });
  it('allows a signed-in customer account', () => {
    renderGuard('account', 'customer');
    expect(screen.getByText('Private content')).toBeInTheDocument();
  });
  it('hides stale staff details while a restored token is being verified', () => {
    const store = makeStore();
    store.dispatch(setUser({is_staff: true}));
    store.dispatch(restoreSession({accessToken: 'unverified', refreshToken: null}));
    render(<Provider store={store}><AdminGuard>Private content</AdminGuard></Provider>);
    expect(screen.queryByText('Private content')).not.toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });
});
