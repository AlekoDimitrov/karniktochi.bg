// Order emails, sent through the Resend HTTP API. All text is Bulgarian.
import { formatPrice } from './format';
import { formatBgPhone } from './checkout-input';
import { itemTitle, type Order } from './orders';
import type { BankDetails } from './config';

type Email = { from: string; to: string; subject: string; text: string; html: string; replyTo?: string };

export async function sendEmail(apiKey: string, email: Email) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: email.from,
      to: [email.to],
      subject: email.subject,
      text: email.text,
      html: email.html,
      reply_to: email.replyTo,
    }),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`);
}

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

const deliveryLine = (o: Order) =>
  `${o.deliveryMethod === 'office' ? 'До офис на куриер' : 'До адрес'}: ${o.city}, ${o.deliveryDetails}`;
const paymentLine = (o: Order) => (o.paymentMethod === 'cod' ? 'Наложен платеж' : 'Банков превод');
const itemLines = (o: Order) =>
  o.items.map((i) => `${i.quantity} × ${itemTitle(i)} — ${formatPrice(i.unitPriceCents * i.quantity)}`);

const bankLines = (o: Order, bank: BankDetails) => [
  `Получател: ${bank.holder}`,
  `IBAN: ${bank.iban}`,
  ...(bank.bic ? [`BIC: ${bank.bic}`] : []),
  `Сума: ${formatPrice(o.totalCents)}`,
  `Основание за плащане: ${o.reference}`,
];

/** Plain-text paragraphs (blank-line separated) to a simple HTML email. */
function toHtml(paragraphs: string[][]) {
  return paragraphs.map((lines) => `<p>${lines.map(esc).join('<br>')}</p>`).join('\n');
}

export function customerEmail(o: Order, bank: BankDetails | null) {
  const paras = [
    [`Здравейте, ${o.customerName},`],
    [`Благодарим ви за поръчката! Номерът ѝ е ${o.reference}.`],
    [
      `Ще ви се обадим на ${formatBgPhone(o.phone)}, за да потвърдим поръчката, преди да я изпратим.`,
      'Поръчката не е изпратена, докато не я потвърдим по телефона.',
    ],
    ['Поръчани продукти:', ...itemLines(o), `Общо: ${formatPrice(o.totalCents)} (без доставката)`],
    [deliveryLine(o), `Плащане: ${paymentLine(o)}`],
    ...(o.paymentMethod === 'bank_transfer' && bank
      ? [['Моля, преведете сумата по сметката по-долу. Изпращаме поръчката, след като плащането постъпи.', ...bankLines(o, bank)]]
      : []),
    ['Ако имате въпроси, просто отговорете на този имейл.'],
    ['Поздрави,', 'Карник Точи'],
  ];
  return {
    subject: `Поръчка ${o.reference} е получена — Карник Точи`,
    text: paras.map((p) => p.join('\n')).join('\n\n'),
    html: toHtml(paras),
  };
}

export function ownerEmail(o: Order) {
  const paras = [
    [`Нова поръчка ${o.reference} — ${formatPrice(o.totalCents)}`],
    [
      `Клиент: ${o.customerName}`,
      `Телефон: ${formatBgPhone(o.phone)}`,
      ...(o.email ? [`Имейл: ${o.email}`] : []),
    ],
    [deliveryLine(o), `Плащане: ${paymentLine(o)}`],
    itemLines(o),
    ...(o.customerNote ? [[`Бележка от клиента: ${o.customerNote}`]] : []),
    ['Обадете се на клиента и сменете статуса в /admin.'],
  ];
  const html =
    toHtml(paras) + `<p><a href="tel:${esc(o.phone)}">Обади се на ${esc(formatBgPhone(o.phone))}</a></p>`;
  return {
    subject: `Нова поръчка ${o.reference} — ${o.customerName}, ${formatPrice(o.totalCents)}`,
    text: paras.map((p) => p.join('\n')).join('\n\n'),
    html,
  };
}
