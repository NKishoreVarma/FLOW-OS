# FLOW OS — Landing Page

Single self-contained `index.html`. No build step. Only external dependency is Google Fonts.

## Before you deploy (2 minutes)

1. Create a free form at [formspree.io](https://formspree.io) → copy your form id (looks like `xdorwkpq`).
2. In `index.html`, replace `YOUR_FORM_ID` (one line, near the bottom `<script>`) with it.
   - Until you do, the form still works — it just shows the success state without recording the email.

## Deploy

```bash
# Vercel (zero config)
npx vercel landing/ --prod

# Netlify
npx netlify deploy --prod --dir=landing

# Or drag the landing/ folder into the Netlify/Vercel dashboard.
```

## Point flowos.dev at it

- **Vercel:** Project → Settings → Domains → add `flowos.dev` → set the DNS records it shows at your registrar.
- **Netlify:** Site → Domain settings → add custom domain → follow the DNS steps.

## Verify after deploy

- [ ] Opens with no console errors
- [ ] "Request early access" visible above the fold
- [ ] Connector marquee scrolling
- [ ] All 7 sections render
- [ ] Readable at 375px width
- [ ] Loads in under 2s
