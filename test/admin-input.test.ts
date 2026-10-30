import { describe, expect, it } from 'vitest';
import {
  centsToInput,
  MAX_VARIANT_ROWS,
  parsePriceToCents,
  parseQuickEdit,
  parseProductForm,
  PRICE_ERRORS,
  STOCK_ERROR,
} from '../src/lib/admin-input';

describe('prices typed in euros', () => {
  it.each([
    ['129.90', 12990],
    ['129,90', 12990],
    ['129', 12900],
    ['129.9', 12990],
    ['129,9', 12990],
    ['0,01', 1],
    ['0.10', 10],
    ['€ 129,90', 12990],
    ['129,90 €', 12990],
    ['€129.90', 12990],
    ['1 299,90', 129990],
    ['1 299.90', 129990],
    ['12 345 ', 1234500],
    ['1 299,90', 129990],
    ['1299,90', 129990],
    ['100000', 10_000_000],
    ['100 000,00', 10_000_000],
    // Exact cents where floating point would drift (0.29 * 100 = 28.999…, 1.15 * 100 = 114.999…).
    ['0,29', 29],
    ['1.15', 115],
    ['4.35', 435],
    ['19.99', 1999],
  ])('accepts %j as %d cents', (typed, cents) => {
    expect(parsePriceToCents(typed)).toEqual({ ok: true, value: cents });
  });

  it.each([
    ['', PRICE_ERRORS.empty],
    ['   ', PRICE_ERRORS.empty],
    [null, PRICE_ERRORS.empty],
    ['1.299,90', PRICE_ERRORS.dotThousands],
    ['1.299', PRICE_ERRORS.dotThousands],
    ['12.345.678', PRICE_ERRORS.dotThousands],
    ['129,999', PRICE_ERRORS.decimals],
    ['129.9050', PRICE_ERRORS.decimals],
    // A dot and exactly three digits reads as 129 905, so it gets the thousands message.
    ['129.905', PRICE_ERRORS.dotThousands],
    ['0', PRICE_ERRORS.zero],
    ['0,00', PRICE_ERRORS.zero],
    ['-5', PRICE_ERRORS.format],
    ['abc', PRICE_ERRORS.format],
    ['12a', PRICE_ERRORS.format],
    ['1e3', PRICE_ERRORS.format],
    ['12 34', PRICE_ERRORS.format],
    ['1  299', PRICE_ERRORS.format],
    ['129,', PRICE_ERRORS.format],
    [',90', PRICE_ERRORS.format],
    ['$129', PRICE_ERRORS.format],
    ['100000,01', PRICE_ERRORS.tooHigh],
    ['9999999', PRICE_ERRORS.tooHigh],
    ['99999999999999999999', PRICE_ERRORS.tooHigh],
  ])('rejects %j', (typed, error) => {
    expect(parsePriceToCents(typed)).toEqual({ ok: false, error });
  });

  it('shows the correct format in the dot-thousands message', () => {
    expect(PRICE_ERRORS.dotThousands).toContain('1299,90');
    expect(PRICE_ERRORS.dotThousands).toContain('1 299,90');
  });

  it.each([
    [12990, '129,90'],
    [1, '0,01'],
    [100, '1,00'],
    [129990, '1299,90'],
  ])('shows %d cents in the form as %j, which parses back', (cents, shown) => {
    expect(centsToInput(cents)).toBe(shown);
    expect(parsePriceToCents(shown)).toEqual({ ok: true, value: cents });
  });
});

/** A valid form for a product with the given size rows. */
function form(fields: Record<string, string> = {}, rows: Record<string, string>[] = [{ price: '129,90', stock: '3' }]) {
  const fd = new FormData();
  const base = { name: 'Гюто Шибата', category: 'gotvarski', status: 'draft', ...fields };
  for (const [k, v] of Object.entries(base)) fd.set(k, v);
  rows.forEach((row, i) => {
    for (const [k, v] of Object.entries(row)) fd.set(`v.${i}.${k}`, v);
  });
  return fd;
}

const errorsOf = (fd: FormData, ids: string[] = []) => {
  const r = parseProductForm(fd, new Set(ids));
  return r.ok ? {} : r.errors;
};

describe('the product form', () => {
  it('accepts a minimal product with one size, and trims and maps every field', () => {
    const r = parseProductForm(
      form({
        name: '  Гюто  ',
        brand: 'Шибата',
        type: 'Гюто',
        steel: 'Aogami Super',
        blade_length_mm: '210',
        handle: 'Магнолия',
        weight_g: '180',
        summary: 'Кратко',
        description: 'Ред 1\r\nРед 2',
        series: 'kotetsu',
        name_en: 'Gyuto',
        summary_en: '',
      }),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.fields).toEqual({
      name: 'Гюто',
      brand: 'Шибата',
      category: 'gotvarski',
      type: 'Гюто',
      steel: 'Aogami Super',
      bladeLengthMm: 210,
      handle: 'Магнолия',
      weightG: 180,
      summary: 'Кратко',
      description: 'Ред 1\nРед 2',
      series: 'kotetsu',
      status: 'draft',
      optionName: '',
      optionLabel: '',
      nameEn: 'Gyuto',
      summaryEn: null,
      descriptionEn: null,
    });
    expect(r.value.variants).toEqual([
      { id: null, optionValue: '', sku: null, priceCents: 12990, stock: 3, stockWas: null },
    ]);
  });

  it.each([
    [{ name: '' }, 'name', 'Required.'],
    [{ name: 'x'.repeat(121) }, 'name', 'At most 120 characters.'],
    [{ summary: 'x'.repeat(301) }, 'summary', 'At most 300 characters.'],
    [{ description: 'x'.repeat(10_001) }, 'description', 'At most 10000 characters.'],
    [{ category: 'nozhove' }, 'category', 'Choose a category.'],
    [{ category: '' }, 'category', 'Choose a category.'],
    [{ status: 'live' }, 'status', 'Choose a status.'],
    [{ blade_length_mm: '0' }, 'blade_length_mm', 'Leave empty or enter a whole number from 1 to 1000.'],
    [{ blade_length_mm: '210.5' }, 'blade_length_mm', 'Leave empty or enter a whole number from 1 to 1000.'],
    [{ blade_length_mm: '1001' }, 'blade_length_mm', 'Leave empty or enter a whole number from 1 to 1000.'],
    [{ weight_g: '-1' }, 'weight_g', 'Leave empty or enter a whole number from 1 to 20000.'],
  ])('rejects %j', (fields, key, message) => {
    expect(errorsOf(form(fields))).toEqual({ [key]: message });
  });

  it('rejects bad sizes, each error on its own row', () => {
    const errors = errorsOf(
      form({ option_name: 'Length', option_label: 'Дължина' }, [
        { option: '210 мм', price: '1.299,90', stock: '2' },
        { option: '240 мм', price: '129,90', stock: '-1', sku: 'bad sku!' },
        { option: '', price: '', stock: '1' },
      ]),
    );
    expect(errors).toEqual({
      'v.0.price': PRICE_ERRORS.dotThousands,
      'v.1.stock': STOCK_ERROR,
      'v.1.sku': 'Letters, digits, dot, dash and underscore only; at most 40.',
      'v.2.price': PRICE_ERRORS.empty,
      'v.2.option': 'Required when there is more than one size.',
    });
  });

  it('needs option name, label and distinct values when there is more than one size', () => {
    const errors = errorsOf(
      form({}, [
        { option: '210 мм', price: '100', stock: '1' },
        { option: '210 ММ', price: '100', stock: '1' },
      ]),
    );
    expect(errors).toEqual({
      option_name: 'Required when there is more than one size.',
      option_label: 'Required when there is more than one size.',
      'v.1.option': 'Another size already has this value.',
    });
  });

  it('rejects the same SKU twice in one form, ignoring case', () => {
    const errors = errorsOf(
      form({ option_name: 'Length', option_label: 'Дължина' }, [
        { option: '210 мм', price: '100', stock: '1', sku: 'KT-210' },
        { option: '240 мм', price: '100', stock: '1', sku: 'kt-210' },
      ]),
    );
    expect(errors).toEqual({ 'v.1.sku': 'Another size in this form has this SKU.' });
  });

  it('ignores completely empty new rows, and needs at least one size', () => {
    const r = parseProductForm(form({}, [{ price: '50', stock: '1' }, { option: '', sku: '', price: '', stock: '' }]));
    expect(r.ok && r.value.variants).toHaveLength(1);
    expect(errorsOf(form({}, [{ price: '', stock: '' }]))).toEqual({ variants: 'Add at least one size.' });
    expect(errorsOf(form({ status: 'published' }, []))).toEqual({
      variants: 'Add at least one size.',
      status: 'A published product needs at least one size.',
    });
  });

  it('orders sizes by position, and keeps existing ids, removals and the stock that was shown', () => {
    const r = parseProductForm(
      form({ option_name: 'Length', option_label: 'Дължина', updated_at: '2026-10-30T10:00:00.000Z' }, [
        { id: 'v_a', option: '210 мм', price: '100', stock: '4', stock_was: '5', pos: '2' },
        { id: 'v_b', option: '240 мм', price: '120', stock: '1', stock_was: '1', pos: '3', remove: '1' },
        { option: '180 мм', price: '90', stock: '2', pos: '1' },
      ]),
      new Set(['v_a', 'v_b']),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.variants.map((v) => [v.id, v.optionValue, v.stockWas])).toEqual([
      [null, '180 мм', null],
      ['v_a', '210 мм', 5],
    ]);
    expect(r.value.removed).toEqual(['v_b']);
    expect(r.value.expectedUpdatedAt).toBe('2026-10-30T10:00:00.000Z');
  });

  it('refuses ids that are not sizes of this product, or sent twice', () => {
    const changed = { variants: 'The sizes changed while you were editing. Reload the page.' };
    expect(errorsOf(form({}, [{ id: 'v_other', price: '1', stock: '1', stock_was: '1' }]), ['v_a'])).toMatchObject(changed);
    expect(
      errorsOf(
        form({}, [
          { id: 'v_a', price: '1', stock: '1', stock_was: '1' },
          { id: 'v_a', price: '1', stock: '1', stock_was: '1' },
        ]),
        ['v_a'],
      ),
    ).toMatchObject(changed);
  });

  it('refuses an existing size without the stock that was shown', () => {
    expect(errorsOf(form({}, [{ id: 'v_a', price: '1', stock: '1' }]), ['v_a'])).toEqual({
      variants: 'The form is incomplete. Reload the page.',
    });
  });

  it(`refuses more than ${MAX_VARIANT_ROWS} sizes`, () => {
    const rows = Array.from({ length: MAX_VARIANT_ROWS + 1 }, (_, i) => ({ option: `${i} мм`, price: '1', stock: '1' }));
    expect(errorsOf(form({ option_name: 'Length', option_label: 'Дължина' }, rows))).toEqual({
      variants: `At most ${MAX_VARIANT_ROWS} sizes.`,
    });
  });

  it('keeps everything as typed when there are errors', () => {
    const r = parseProductForm(form({ name: '', brand: 'Шибата' }, [{ option: '', price: '1.299', stock: '7' }]));
    expect(r.ok).toBe(false);
    expect(r.raw.fields.brand).toBe('Шибата');
    expect(r.raw.rows).toEqual([
      { id: '', option: '', sku: '', price: '1.299', stock: '7', stockWas: '', remove: false },
    ]);
  });
});

describe('the quick edit form', () => {
  const quick = (fields: Record<string, string>) => {
    const fd = new FormData();
    for (const [k, v] of Object.entries(fields)) fd.set(k, v);
    return parseQuickEdit(fd);
  };

  it('reads price, stock and the stock that was shown', () => {
    expect(quick({ id: 'v_1', price: '1 299,90', stock: ' 4 ', stock_was: '5' })).toEqual({
      ok: true,
      value: { variantId: 'v_1', priceCents: 129990, stock: 4, stockWas: 5 },
    });
  });

  // The cases the old /admin/stock/ form rejected, now on the quick edit.
  it.each(['', '   ', '-5', '2.5', '1e3', 'abc', '100001'])('rejects the stock %j', (stock) => {
    expect(quick({ id: 'v_1', price: '10', stock, stock_was: '5' })).toEqual({ ok: false, variantId: 'v_1', errors: { stock: STOCK_ERROR } });
  });

  it('reports a bad price and a bad stock together', () => {
    expect(quick({ id: 'v_1', price: '1.299', stock: 'x', stock_was: '5' })).toEqual({
      ok: false,
      variantId: 'v_1',
      errors: { price: PRICE_ERRORS.dotThousands, stock: STOCK_ERROR },
    });
  });

  it('refuses a post without the size or the stock that was shown', () => {
    const broken = { form: 'The form is incomplete. Reload the page.' };
    expect(quick({ price: '10', stock: '1', stock_was: '1' })).toMatchObject({ ok: false, errors: broken });
    expect(quick({ id: 'v_1', price: '10', stock: '1' })).toMatchObject({ ok: false, errors: broken });
  });
});

describe('showing the form', () => {
  it('turns a stored product into a form that parses back to the same values', async () => {
    const { productToForm } = await import('../src/lib/admin-input');
    const product = {
      id: 'gyuto', name: 'Гюто', brand: 'Шибата', category: 'gotvarski', type: 'Гюто', steel: 'AS', bladeLengthMm: 210,
      handle: '', weightG: null, summary: 'Кратко', description: 'Ред 1\nРед 2', series: '', status: 'published',
      isDemo: false, optionName: 'Length', optionLabel: 'Дължина', nameEn: null, summaryEn: 'Short', descriptionEn: null,
      createdAt: '2026-10-01T00:00:00Z', updatedAt: '2026-10-02T00:00:00.123Z',
      variants: [
        { id: 'v_a', productId: 'gyuto', position: 0, optionValue: '210 мм', optionKey: '210-mm', sku: 'A', priceCents: 12990, status: 'active', stock: 3 },
        { id: 'v_x', productId: 'gyuto', position: 1, optionValue: '180 мм', optionKey: '180-mm', sku: null, priceCents: 9900, status: 'archived', stock: 0 },
        { id: 'v_b', productId: 'gyuto', position: 2, optionValue: '240 мм', optionKey: '240-mm', sku: null, priceCents: 100000, status: 'active', stock: 0 },
      ],
    } as const;
    const raw = productToForm(product as never);
    expect(raw.rows.map((r) => [r.id, r.price, r.stock, r.stockWas])).toEqual([
      ['v_a', '129,90', '3', '3'],
      ['v_b', '1000,00', '0', '0'],
    ]);
    const fd = new FormData();
    for (const [k, v] of Object.entries(raw.fields)) fd.set(k, v);
    fd.set('updated_at', raw.expectedUpdatedAt);
    raw.rows.forEach((r, i) => {
      fd.set(`v.${i}.id`, r.id);
      fd.set(`v.${i}.option`, r.option);
      fd.set(`v.${i}.sku`, r.sku);
      fd.set(`v.${i}.price`, r.price);
      fd.set(`v.${i}.stock`, r.stock);
      fd.set(`v.${i}.stock_was`, r.stockWas);
    });
    const parsed = parseProductForm(fd, new Set(['v_a', 'v_b', 'v_x']));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.fields).toMatchObject({ name: 'Гюто', bladeLengthMm: 210, weightG: null, summaryEn: 'Short', nameEn: null });
    expect(parsed.value.variants.map((v) => [v.id, v.priceCents, v.stock])).toEqual([
      ['v_a', 12990, 3],
      ['v_b', 100000, 0],
    ]);
    expect(parsed.value.expectedUpdatedAt).toBe('2026-10-02T00:00:00.123Z');
  });

  it('starts a new product as a draft with one size row', async () => {
    const { emptyProductForm } = await import('../src/lib/admin-input');
    const raw = emptyProductForm();
    expect(raw.fields.status).toBe('draft');
    expect(raw.rows).toHaveLength(1);
    expect(raw.expectedUpdatedAt).toBe('');
  });
});
