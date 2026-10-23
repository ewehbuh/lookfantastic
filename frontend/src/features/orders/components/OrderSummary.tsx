import type { Order } from '../types/order';
import { formatCurrency } from '@/lib/utils';
const labels: Record<Order['status'], string> = {
  pending: 'Payment pending', paid: 'Payment confirmed', processing: 'Preparing your order',
  shipped: 'Order shipped', cancelled: 'Order cancelled', refunded: 'Order refunded',
};
export default function OrderSummary({order}: {order: Order}) {
  return <article className="space-y-5">
    <h2 className="text-xl font-bold">Order {order.order_number}</h2>
    <p role="status" className="font-semibold">{labels[order.status] ?? 'Order status unavailable'}</p>
    {order.status === 'pending' && <p>Your payment has not been confirmed. Bank and crypto payments may take time. Refresh this status later; do not place another order while confirmation is pending.</p>}
    <ul className="divide-y">{order.items.map(item => <li key={item.id} className="py-3">{item.product_name} {item.size} {item.shade} × {item.quantity}<span className="block">{formatCurrency(item.line_total, order.currency)}</span></li>)}</ul>
    <dl><dt>Subtotal</dt><dd>{formatCurrency(order.subtotal, order.currency)}</dd><dt>Voucher discount</dt><dd>−{formatCurrency(order.discount_amount, order.currency)}</dd>
      <dt>Shipping</dt><dd>{formatCurrency(order.shipping_cost, order.currency)}</dd><dt>Total</dt><dd className="font-bold">{formatCurrency(order.total, order.currency)}</dd>
      {Number(order.refunded_amount) > 0 && <><dt>Refunded</dt><dd>{formatCurrency(order.refunded_amount, order.currency)}</dd></>}
    </dl>
    <section><h3 className="font-bold">Delivery address</h3><address className="not-italic whitespace-pre-line">{order.shipping_name}<br />{order.shipping_address}<br />{order.shipping_city}, {order.shipping_postcode}, {order.shipping_country}</address></section>
    {order.shipments.map(shipment => {
      let tracking: string | null = null;
      try {const url = new URL(shipment.tracking_url); if (url.protocol === 'https:' && !url.username && !url.password) tracking = url.href;} catch { /* Tracking is optional. */ }
      return <section key={shipment.id}><h3 className="font-bold">{shipment.carrier} · {shipment.status.replaceAll('_', ' ')}</h3>
        <p>Tracking number: {shipment.tracking_number}</p>{tracking && <a href={tracking} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer" className="underline">Track shipment</a>}
        <ul>{shipment.events.map((event, index) => <li key={`${event.occurred_at}-${index}`}>{event.status.replaceAll('_', ' ')} · {event.occurred_at.slice(0, 10)}</li>)}</ul>
      </section>;
    })}
    {order.returns.length > 0 && <section><h3 className="font-bold">Returns</h3><ul>{order.returns.map(item => <li key={item.id}>Return {item.id}: {item.status} · {item.quantity} item(s)</li>)}</ul></section>}
    {order.refunds.length > 0 && <section><h3 className="font-bold">Refunds</h3><ul>{order.refunds.map(refund => <li key={refund.id}>{formatCurrency(refund.amount, refund.currency)} · {refund.status.replaceAll('_', ' ')}</li>)}</ul></section>}
  </article>;
}
