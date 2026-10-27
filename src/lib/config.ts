import { env } from 'cloudflare:workers';

export type BankDetails = { iban: string; bic: string; holder: string };

/** Bank details when bank transfer is switched on (ENABLE_BANK_TRANSFER = "true" in wrangler.jsonc), else null. */
export function bankTransfer(): BankDetails | null {
  if (env.ENABLE_BANK_TRANSFER !== 'true') return null;
  return { iban: env.BANK_IBAN, bic: env.BANK_BIC, holder: env.BANK_HOLDER };
}
