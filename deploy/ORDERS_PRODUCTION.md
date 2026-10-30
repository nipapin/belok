# orders.belok.pro without the development server

The order board is already part of the **production** Next.js application:
`https://belok.pro/order-board`. Its root mapping is implemented in
`src/proxy.ts` (host `orders.belok.pro` + path `/` -> internal rewrite to
`/order-board`). The project already tests the host-specific rewrite in
`scripts/test-order-board.mjs`.

No second Next.js process or changes to `next.config.ts` are necessary.

## Migrate the existing Nginx vhost

**Perform on the target VPS, after production Next.js is running.** Do not
decommission the old `belok-dev` process until this host has been verified.

1. Confirm the actual production listen port. The examples below use 3000,
   but use the port configured by the running production PM2 application on
   the target VPS:

   ```sh
   pm2 list
   ss -ltnp | grep -E ':3000|:3001'
   curl -fsS http://127.0.0.1:3000/api/products >/dev/null
   ```

2. Find the effective vhost. Configuration can live under
   `sites-available`, `sites-enabled`, or `conf.d`:

   ```sh
   sudo nginx -T 2>/dev/null | grep -n -B 8 -A 45 'server_name orders.belok.pro'
   ```

3. Back up **the actual config file** and edit only the `location /` in the
   HTTPS `orders.belok.pro` server block. Keep the existing TLS/Certbot
   directives, other locations and virtual hosts intact. A suitable proxy
   location is:

   ```nginx
   location / {
       proxy_pass http://127.0.0.1:3000;
       proxy_http_version 1.1;
       proxy_set_header Host $host;
       proxy_set_header X-Forwarded-Host $host;
       proxy_set_header X-Forwarded-Proto $scheme;
       proxy_set_header X-Real-IP $remote_addr;
       proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
   }
   ```

   Do **not** proxy to `https://belok.pro/order-board` and do **not** add
   a path rewrite in Nginx: Next.js handles `orders.belok.pro/` itself.
   This preserves relative API requests, PWA assets, and same-host cookies.

4. Validate and reload, then verify the HTTPS subdomain:

   ```sh
   sudo nginx -t && sudo systemctl reload nginx
   curl -fsSI https://orders.belok.pro/
   curl -sS -o /dev/null -w '%{http_code}\n' https://orders.belok.pro/api/order-board
   ```

   Unauthenticated `/api/order-board` should return **401**, proving the
   protected API is reachable. Open the root URL in a browser and verify
   kiosk PIN login, orders and live refresh. A separately scoped session
   cookie on the subdomain is expected.

5. If the domain is being migrated to a **new VPS**, ensure
   `orders.belok.pro` DNS resolves there and that an appropriate TLS
   certificate is present. During DNS propagation, verify against the new
   public address from a client with
   `curl --resolve orders.belok.pro:443:NEW_SERVER_IP https://orders.belok.pro/`.
   Do not turn off the old server until production and order board pass
   checks at the new destination.

6. Only after the cutover works, disable the dev PM2/systemd process and
   GitHub Actions dev deployment, then remove the obsolete
   `/var/www/dev.belok.pro` and `/var/www/belok-dev-releases` after
   checking for local-only data. Do not delete the production directory or
   shared uploads. Remove unused Nginx dev vhosts only if they have no
   other consumers.

The production deploy receiver and its two-release rotation are independent
of this Nginx routing change.
