import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import apiClient, {sessionClient} from '@/lib/api/client';
import type { Order } from '@/features/orders/types/order';
import ReturnRequestForm from '../components/ReturnRequestForm';
const order: Order = {
  id: 1, order_number: 'ORDER', status: 'paid', shipping_name: '', shipping_address: '', shipping_city: '', shipping_postcode: '', shipping_country: 'GB', subtotal: '30', discount_amount: '0', refunded_amount: '0', shipping_cost: '0', total: '30', currency: 'gbp', base_currency: 'gbp', exchange_rate: '1', exchange_rate_at: null, created_at: '', payment_method: 'stripe',
  items: [{id: 501, sku: 'cream', product_name: 'Cream', size: '', shade: '', quantity: 3, unit_price: '10', line_total: '30', promotion_discount: '0'}], shipments: [], returns: [], refunds: [],
};

describe('return requests', () => {
  it('only offers return submission for paid fulfilment states', () => {
    render(<ReturnRequestForm order={{...order, status: 'pending'}} onCreated={vi.fn()} />);
    expect(screen.queryByRole('button', {name: 'Submit return request'})).not.toBeInTheDocument();
  });
  it('reserves quantities already requested except rejected requests', () => {
    render(<ReturnRequestForm order={{...order, returns: [{id: 1, item: 501, quantity: 2, reason: '', status: 'requested'}, {id: 2, item: 501, quantity: 1, reason: '', status: 'rejected'}]}} onCreated={vi.fn()} />);
    expect(screen.getByRole('option')).toHaveTextContent('1 remaining');
    expect(screen.getByLabelText('Return quantity')).toHaveAttribute('max', '1');
  });
  it('submits the order-item id and trimmed reason and never claims an immediate refund', async () => {
    const post = vi.spyOn(apiClient, 'post').mockResolvedValue({data: {id: 44, status: 'requested'}}); const created = vi.fn();
    render(<ReturnRequestForm order={order} onCreated={created} />); const user = userEvent.setup();
    await user.type(screen.getByLabelText('Reason'), '  Damaged product  ');
    await user.clear(screen.getByLabelText('Return quantity')); await user.type(screen.getByLabelText('Return quantity'), '2');
    await user.click(screen.getByRole('button', {name: 'Submit return request'}));
    expect(post).toHaveBeenCalledWith('/api/returns/', {order_number: 'ORDER', item_id: 501, quantity: 2, reason: 'Damaged product'});
    expect(await screen.findByRole('status')).toHaveTextContent('A refund has not been issued');
    expect(created).toHaveBeenCalledOnce();
  });
  it('sends guest capability only in the return POST body', async () => {
    const post = vi.spyOn(sessionClient, 'post').mockResolvedValue({data: {id: 44}});
    render(<ReturnRequestForm order={order} token="guest-capability" onCreated={vi.fn()} />); const user = userEvent.setup();
    await user.type(screen.getByLabelText('Reason'), 'Wrong item'); await user.click(screen.getByRole('button', {name: 'Submit return request'}));
    expect(post).toHaveBeenCalledWith('/api/returns/', expect.objectContaining({token: 'guest-capability', item_id: 501}));
    expect(post.mock.calls[0][0]).not.toContain('guest-capability');
  });
  it('shows backend return-window failures and preserves the request for correction', async () => {
    vi.spyOn(apiClient, 'post').mockRejectedValue({isAxiosError: true, response: {data: {order_number: ['The return window has expired.']}}}); const created = vi.fn();
    render(<ReturnRequestForm order={order} onCreated={created} />); const user = userEvent.setup();
    await user.type(screen.getByLabelText('Reason'), 'Damaged'); await user.click(screen.getByRole('button', {name: 'Submit return request'}));
    expect(await screen.findByRole('alert')).toHaveTextContent('return window has expired');
    expect(screen.getByLabelText('Reason')).toHaveValue('Damaged'); expect(created).not.toHaveBeenCalled();
  });
  it('requires an order refresh after an ambiguous network failure', async () => {
    vi.spyOn(apiClient, 'post').mockRejectedValue(new Error('offline')); const created = vi.fn();
    render(<ReturnRequestForm order={order} onCreated={created} />); const user = userEvent.setup();
    await user.type(screen.getByLabelText('Reason'), 'Damaged');
    await user.click(screen.getByRole('button', {name: 'Submit return request'}));
    expect(await screen.findByRole('alert')).toHaveTextContent('Refresh order status before trying again');
    expect(screen.getByRole('button', {name: 'Submit return request'})).toBeDisabled();
    expect(created).not.toHaveBeenCalled();
  });
  it('does not offer another request once all quantities have been requested', () => {
    render(<ReturnRequestForm order={{...order, returns: [{id: 1, item: 501, quantity: 3, reason: '', status: 'received'}]}} onCreated={vi.fn()} />);
    expect(screen.getByText('All purchased quantities already have return requests.')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
