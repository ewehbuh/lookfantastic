import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import type { AnchorHTMLAttributes } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import apiClient from '@/lib/api/client';
import { makeStore } from '@/store/store';
import RegisterPage from '../screens/register-page';
import ResetPasswordPage from '../screens/reset-password-page';
import VerifyEmailPage from '../screens/verify-email-page';
import GoogleLoginButton from '../components/GoogleLoginButton';
import GoogleCallbackPage from '../screens/google-callback-page';
const {navigation, router} = vi.hoisted(() => ({navigation: {params: ''}, router: {push: vi.fn(), replace: vi.fn()}}));
vi.mock('next/navigation', () => ({useSearchParams: () => new URLSearchParams(navigation.params)}));
vi.mock('@/i18n/navigation', () => ({Link: (props: AnchorHTMLAttributes<HTMLAnchorElement>) => <a {...props} />, useRouter: () => router}));
beforeEach(() => {navigation.params = ''; window.history.replaceState(null, '', '/en/login');});

async function registerForm() {
  render(<Provider store={makeStore()}><RegisterPage /></Provider>);
  const user = userEvent.setup();
  await user.type(screen.getByLabelText('Email'), 'new@example.com');
  await user.type(screen.getByLabelText('Password'), 'long-password');
  await user.type(screen.getByLabelText('Confirm password'), 'long-password');
  return user;
}

describe('account forms', () => {
  it('sends registration password1/password2 and shows verification guidance only after success', async () => {
    const post = vi.spyOn(apiClient, 'post').mockResolvedValue({data: {detail: 'Verification email sent.'}});
    const user = await registerForm();
    await user.click(screen.getByRole('button', {name: 'Create account'}));
    expect(post).toHaveBeenCalledWith('/api/accounts/register/', {email: 'new@example.com', password1: 'long-password', password2: 'long-password'});
    expect(await screen.findByRole('status')).toHaveTextContent('Check your email');
  });
  it('keeps the registration form and backend validation message on rejection', async () => {
    vi.spyOn(apiClient, 'post').mockRejectedValue({isAxiosError: true, response: {data: {email: ['This email already exists.']}}});
    const user = await registerForm();
    await user.click(screen.getByRole('button', {name: 'Create account'}));
    expect(await screen.findByRole('alert')).toHaveTextContent('email already exists');
    expect(screen.queryByRole('heading', {name: 'Account created'})).not.toBeInTheDocument();
  });
  it('requests password reset without disclosing whether the account exists', async () => {
    const post = vi.spyOn(apiClient, 'post').mockResolvedValue({data: {}});
    render(<ResetPasswordPage />); const user = userEvent.setup();
    await user.type(screen.getByLabelText('Email'), 'test@example.com');
    await user.click(screen.getByRole('button', {name: 'Send reset link'}));
    expect(post).toHaveBeenCalledWith('/api/accounts/password-reset/', {email: 'test@example.com'});
    expect(await screen.findByRole('status')).toHaveTextContent('If this email belongs to an account');
  });
  it('confirms password reset using uid, token and both new password fields', async () => {
    navigation.params = 'uid=user-id&token=reset-token';
    const post = vi.spyOn(apiClient, 'post').mockResolvedValue({data: {}});
    render(<ResetPasswordPage />); const user = userEvent.setup();
    await user.type(screen.getByLabelText('New password'), 'new-password');
    await user.type(screen.getByLabelText('Confirm password'), 'new-password');
    await user.click(screen.getByRole('button', {name: 'Set new password'}));
    expect(post).toHaveBeenCalledWith('/api/accounts/password-reset/confirm/', {uid: 'user-id', token: 'reset-token', new_password1: 'new-password', new_password2: 'new-password'});
    expect(await screen.findByRole('status')).toHaveTextContent('Password changed');
  });
  it('verifies an email only after explicit form submission', async () => {
    navigation.params = 'key=verification-key';
    const post = vi.spyOn(apiClient, 'post').mockResolvedValue({data: {}});
    render(<VerifyEmailPage />);
    expect(post).not.toHaveBeenCalled();
    await userEvent.setup().click(screen.getByRole('button', {name: 'Verify email'}));
    expect(post).toHaveBeenCalledWith('/api/accounts/verify-email/', {key: 'verification-key'});
    expect(await screen.findByRole('status')).toHaveTextContent('Email verified');
  });
  it('does not offer Google sign-in when the backend disables it', async () => {
    const get = vi.spyOn(apiClient, 'get').mockResolvedValue({data: {google: {enabled: false}}});
    render(<GoogleLoginButton />);
    await waitFor(() => expect(get).toHaveBeenCalledWith('/api/accounts/auth/providers/'));
    expect(screen.queryByRole('button', {name: 'Sign in with Google'})).not.toBeInTheDocument();
  });
  it('gets Google authorization through the session-bound start endpoint', async () => {
    const get = vi.spyOn(apiClient, 'get').mockResolvedValueOnce({data: {google: {enabled: true}}}).mockResolvedValueOnce({data: {authorization_url: 'https://accounts.google.com/o/oauth2/v2/auth?state=test'}});
    render(<GoogleLoginButton />);
    await userEvent.setup().click(await screen.findByRole('button', {name: 'Sign in with Google'}));
    expect(get).toHaveBeenLastCalledWith('/api/accounts/google/start/');
    expect(await screen.findByRole('link', {name: 'Continue with Google'})).toHaveAttribute('href', 'https://accounts.google.com/o/oauth2/v2/auth?state=test');
  });
  it('exchanges callback code/state once and removes them from browser history', async () => {
    window.history.replaceState(null, '', '/en/auth/google/callback?code=google-code&state=google-state');
    const post = vi.spyOn(apiClient, 'post').mockResolvedValue({data: {access: 'google-access', user: {id: 5}}});
    render(<Provider store={makeStore()}><GoogleCallbackPage /></Provider>);
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/account'));
    expect(post).toHaveBeenCalledOnce();
    expect(post).toHaveBeenCalledWith('/api/accounts/google/', {code: 'google-code', state: 'google-state'});
    expect(window.location.search).toBe('');
  });
});
