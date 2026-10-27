// Prices are stored as integer euro cents everywhere. Format only for display.
const eur = new Intl.NumberFormat('bg-BG', { style: 'currency', currency: 'EUR' });
export const formatPrice = (cents: number) => eur.format(cents / 100);
