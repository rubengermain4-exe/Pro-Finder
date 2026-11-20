# Déployer Pro Finder sur Cloudflare Pages

## Option A — Depuis GitHub (recommandé)
1. Poussez le projet sur GitHub :
```bash
git init && git add . && git commit -m "Pro Finder"
git branch -M main
git remote add origin https://github.com/VOTRE_COMPTE/pro-finder.git
git push -u origin main
```
2. Cloudflare Dashboard → **Workers & Pages → Create → Pages → Connect to Git** → choisissez le dépôt.
3. Paramètres de build :
   - Framework preset : **None** (ou Vite)
   - Build command : `npm run build`
   - Build output directory : `dist`
   - Variable d'environnement `NODE_VERSION` = `20`
4. **Environment variables** (Production et Preview) : `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_APP_URL` (URL finale), et facultatif `VITE_COMPANY_NAME`, `VITE_COMPANY_LEGAL_INFO`, `VITE_CONTACT_EMAIL`, `VITE_CONTACT_PHONE`.
5. **Save and Deploy**. `public/_redirects` gère le routage SPA et `public/_headers` applique la CSP.
6. Retournez dans Supabase → Authentication → URL Configuration et ajoutez l'URL Cloudflare.

## Option B — Ligne de commande
```bash
npm run build
npx wrangler login
npx wrangler pages project create pro-finder
npm run deploy:pages
```

## Domaine personnalisé
Pages → votre projet → **Custom domains** → ajoutez votre domaine, puis mettez à jour `VITE_APP_URL` et les URLs de redirection Supabase.

## Worker de paiement (plus tard, quand l'intégration opérateur est prête)
```bash
npx wrangler secret put SUPABASE_URL --config workers/payments/wrangler.toml
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY --config workers/payments/wrangler.toml
npx wrangler secret put WEBHOOK_SECRET_AIRTEL --config workers/payments/wrangler.toml
npx wrangler secret put WEBHOOK_SECRET_MOOV --config workers/payments/wrangler.toml
npm run deploy:worker
```
Ne passez `payment_mode` à `live` (Administration → Paramètres) qu'après des tests réussis dans le bac à sable de l'opérateur.

## Avant d'ouvrir au public — checklist
- [ ] Migrations exécutées sans erreur, premier admin créé
- [ ] SMTP configuré, confirmation d'e-mail activée
- [ ] `VITE_COMPANY_LEGAL_INFO` renseigné et pages légales relues par un juriste
- [ ] Sauvegardes Supabase vérifiées (plan adapté)
- [ ] Test complet du parcours pro → admin → client → message → avis
