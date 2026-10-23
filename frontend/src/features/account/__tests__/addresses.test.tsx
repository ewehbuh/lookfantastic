import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import apiClient from '@/lib/api/client';
import AccountAddressesPage from '../screens/account-addresses-page';
const home = {id: 25, label: 'Home', full_name: 'Customer', line1: 'First Street', line2: '', city: 'City', postcode: 'ABC', country: 'GB', phone: '', is_default: false};
const book = {count: 1, next: null, previous: null, results: [home]};

describe('address book', () => {
  it('creates addresses using backend fields and normalizes country codes', async () => {
    vi.spyOn(apiClient, 'get').mockResolvedValue({data: {...book, results: []}});
    const post = vi.spyOn(apiClient, 'post').mockResolvedValue({data: home});
    render(<AccountAddressesPage />); const user = userEvent.setup();
    await screen.findByText('No saved addresses yet.');
    for (const [label, value] of [['Label', 'Home'], ['Full name', 'Customer'], ['Address line 1', 'First Street'], ['City', 'City'], ['Postcode', 'ABC']]) await user.type(screen.getByLabelText(label), value);
    await user.clear(screen.getByLabelText('Country code')); await user.type(screen.getByLabelText('Country code'), 'gb');
    await user.click(screen.getByRole('checkbox', {name: 'Use as default address'}));
    await user.click(screen.getByRole('button', {name: 'Add address'}));
    expect(post).toHaveBeenCalledWith('/api/accounts/addresses/', expect.objectContaining({full_name: 'Customer', line1: 'First Street', country: 'GB', is_default: true}));
    expect(post.mock.calls[0][1]).not.toHaveProperty('user');
    expect(await screen.findByText('Address added.')).toBeInTheDocument();
  });
  it('loads existing details into the editor and PATCHes only the selected address', async () => {
    vi.spyOn(apiClient, 'get').mockResolvedValue({data: book});
    const patch = vi.spyOn(apiClient, 'patch').mockResolvedValue({data: home});
    render(<AccountAddressesPage />); const user = userEvent.setup();
    await user.click(await screen.findByRole('button', {name: 'Edit Home'}));
    expect(screen.getByLabelText('Full name')).toHaveValue('Customer');
    await user.clear(screen.getByLabelText('City')); await user.type(screen.getByLabelText('City'), 'New City');
    await user.click(screen.getByRole('button', {name: 'Save address'}));
    expect(patch).toHaveBeenCalledWith('/api/accounts/addresses/25/', expect.objectContaining({city: 'New City'}));
    expect(await screen.findByText('Address updated.')).toBeInTheDocument();
  });
  it('sets defaults through the backend instead of changing only local state', async () => {
    vi.spyOn(apiClient, 'get').mockResolvedValue({data: book});
    const patch = vi.spyOn(apiClient, 'patch').mockResolvedValue({data: {...home, is_default: true}});
    render(<AccountAddressesPage />);
    await userEvent.setup().click(await screen.findByRole('button', {name: 'Make Home default'}));
    expect(patch).toHaveBeenCalledWith('/api/accounts/addresses/25/', {is_default: true});
    expect(await screen.findByText('Default address updated.')).toBeInTheDocument();
  });
  it('requires confirmation before deleting an address', async () => {
    vi.spyOn(apiClient, 'get').mockResolvedValueOnce({data: book}).mockResolvedValue({data: {...book, results: []}});
    const remove = vi.spyOn(apiClient, 'delete').mockResolvedValue({});
    render(<AccountAddressesPage />); const user = userEvent.setup();
    await user.click(await screen.findByRole('button', {name: 'Delete Home'}));
    expect(remove).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', {name: 'Confirm delete'}));
    expect(remove).toHaveBeenCalledWith('/api/accounts/addresses/25/');
    expect(await screen.findByText('Address deleted.')).toBeInTheDocument();
    expect(await screen.findByText('No saved addresses yet.')).toBeInTheDocument();
  });
  it('retains submitted values when backend validation rejects a save', async () => {
    vi.spyOn(apiClient, 'get').mockResolvedValue({data: book});
    vi.spyOn(apiClient, 'patch').mockRejectedValue({isAxiosError: true, response: {data: {postcode: ['Invalid postcode.']}}});
    render(<AccountAddressesPage />); const user = userEvent.setup();
    await user.click(await screen.findByRole('button', {name: 'Edit Home'}));
    await user.click(screen.getByRole('button', {name: 'Save address'}));
    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid postcode');
    expect(screen.getByLabelText('Postcode')).toHaveValue('ABC');
  });
  it('paginates through local API paths and offers retry for failed lists', async () => {
    const get = vi.spyOn(apiClient, 'get').mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce({data: {...book, next: 'https://backend.invalid/page2'}}).mockResolvedValue({data: {...book, results: []}});
    render(<AccountAddressesPage />); const user = userEvent.setup();
    await user.click(await screen.findByRole('button', {name: 'Retry addresses'}));
    await user.click(await screen.findByRole('button', {name: 'Next addresses'}));
    await waitFor(() => expect(get).toHaveBeenLastCalledWith('/api/accounts/addresses/', expect.objectContaining({params: {page: 2}})));
  });
});
