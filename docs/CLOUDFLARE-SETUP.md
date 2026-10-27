# Cloudflare setup

What has to be configured outside the code before checkout and `/admin` work in production.
All settings below live in `wrangler.jsonc` unless noted otherwise.

## 1. D1 database

```
npx wrangler d1 create karniktochi          # paste the id into database_id in wrangler.jsonc
npx wrangler d1 migrations apply karniktochi --remote
```

## 2. Resend

- Add the domain `karniktochi.com` in Resend and add the DNS records it gives you in Cloudflare DNS.
- Create an API key with sending access, then run `npx wrangler secret put RESEND_API_KEY`.
- In `wrangler.jsonc`, set `SHOP_NOTIFY_EMAIL` to your address. Change `EMAIL_FROM` if you want a different sender.

## 3. Access policy for `/admin`

- In Zero Trust, go to Access → Applications and add a self-hosted app for `karniktochi.com/admin`.
  Add a policy that allows only your email address.
- Until the domain is attached, protect the `workers.dev` address too: in the Worker's settings,
  under Domains & Routes, turn on Cloudflare Access for `workers.dev`.
- In `wrangler.jsonc`, set `ACCESS_AUD` to the app's Application Audience (AUD) tag and
  `ACCESS_TEAM_DOMAIN` to your team domain, like `yourteam.cloudflareaccess.com`.
- If those two values are empty, `/admin` stays locked (returns 403).

## 4. Bank transfer (when you want it)

- In `wrangler.jsonc`, set `ENABLE_BANK_TRANSFER` to `"true"` and fill in `BANK_IBAN`, `BANK_BIC` and `BANK_HOLDER`.
  To turn it off, set it back to `"false"`.
- Make the change in `wrangler.jsonc` rather than the dashboard, because each deploy overwrites dashboard values with the file.
