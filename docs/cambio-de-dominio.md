# Cambio de dominio a revolflash.com (Fase 11 · PM2)

Para Junior, en el VPS. Sin un solo valor secreto: donde hay que mirar una variable, se comprueba con
`grep -c` (cuenta líneas, no imprime el valor).

El dominio anterior **desaparece sin redirección**. La plataforma solo responde en `revolflash.com`;
`www.revolflash.com` redirige (301) al apex.

## 1. Lo que ya está hecho (19 nov): solo comprobar

**DNS** (desde cualquier máquina):

```bash
dig +short revolflash.com           # → 145.223.99.62
dig +short www.revolflash.com       # → 145.223.99.62
dig +short mail.revolflash.com      # → el servidor del correo (cPanel), NO el VPS
dig +short MX revolflash.com        # → apunta a mail.revolflash.com
dig +short TXT revolflash.com       # → incluye el SPF (v=spf1 …)
dig +short TXT _dmarc.revolflash.com  # → v=DMARC1; p=none …
```

El DKIM se comprueba con el selector que muestra cPanel (`dig +short TXT <selector>._domainkey.revolflash.com`).

**`.env`** (`~/dareflash-config/.env`). Cada línea tiene que dar `1`:

```bash
E=~/dareflash-config/.env
grep -c '^APP_URL=https://revolflash.com$' "$E"
grep -c '^EMAIL_FROM=[^@]*@revolflash\.com$' "$E"
grep -c '^ADMIN_EMAIL=admin@revolflash\.com$' "$E"
grep -c '^SMTP_HOST=mail\.revolflash\.com$' "$E"
# EMAIL_FROM y SMTP_USER tienen que ser LA MISMA dirección (si no, el worker no arranca):
[ "$(grep '^EMAIL_FROM=' "$E" | cut -d= -f2-)" = "$(grep '^SMTP_USER=' "$E" | cut -d= -f2-)" ] && echo 1
```

Y esta tiene que dar `0`, porque `SMTP_HELO_NAME` sin definir sale ya del host de `APP_URL`:

```bash
grep -c '^SMTP_HELO_NAME=' "$E"
```

## 2. Desplegar la PM2

Desde el directorio del repositorio en el servidor, como siempre:

```bash
git pull
./scripts/deploy.sh
```

**`deploy.sh` NO recarga Caddy.** Comprueba el health por dentro (`127.0.0.1:3000`), así que dirá
`DESPLEGADO` aunque Caddy siga sirviendo el Caddyfile viejo. El fichero nuevo ya está en disco (el
compose monta el directorio `caddy/`), pero Caddy no lo vuelve a leer solo. Hay que recargarlo:

```bash
docker compose -f docker-compose.prod.yml exec caddy caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile
```

Los certificados de `revolflash.com` y `www.revolflash.com` los pide Caddy solo en ese momento (Let's
Encrypt). Si la recarga falla, el error sale en esa misma orden; los logs, con
`docker compose -f docker-compose.prod.yml logs --tail=50 caddy`.

## 3. Lo que sigue pendiente

1. **Stripe (sandbox):** EDITAR la URL de los tres endpoints de webhook, no crear otros nuevos (así se
   conservan sus secretos de firma `whsec_`, que ya están en el `.env`):
   - `https://revolflash.com/api/boost/webhook`
   - `https://revolflash.com/api/vip/webhook`
   - `https://revolflash.com/api/empresa/creditos/webhook`

   Y el nombre comercial de la cuenta, a **RevolFlash**. Stripe no sigue redirecciones: si las URLs no
   se editan, los pagos se cobran y no se activan.

2. **Bunny:** si la librería de vídeo tiene una lista de dominios permitidos, añadir `revolflash.com` (y
   quitar el anterior).
3. **Certificado del correo:** en cPanel, AutoSSL para `mail.revolflash.com`.
4. **Cuenta admin:** hoy su correo en la base de datos es el del dominio anterior. Cambiarlo a
   `admin@revolflash.com` desde la propia app (Perfil → correo), con el enlace de confirmación que
   llega al buzón nuevo.

## 4. Comprobaciones finales (lo que debe salir)

```bash
curl -s https://revolflash.com/api/health       # → status ok, el SHA desplegado, jobsFailed 0
curl -sI https://www.revolflash.com/ | head -3  # → 301 y Location: https://revolflash.com/
curl -sI https://revolflash.com/ | grep -i strict-transport  # → la cabecera HSTS
```

- El candado del navegador es válido en `revolflash.com` y en `www`.
- **Una acción con sesión funciona** (por ejemplo, votar): el CSRF compara el origen con `APP_URL`; si
  no coincidiera, todas las acciones darían error.
- **El correo de verificación** de un registro de prueba llega con el remitente en `@revolflash.com` y
  sus enlaces apuntan a `https://revolflash.com/…`.
- **Una compra de créditos de prueba** (tarjeta de test de Stripe) se abona en el saldo de la empresa.
- **Un vídeo reproduce** en el feed.
- **Los títulos de las pestañas** dicen «… · RevolFlash».

## 5. Vuelta atrás

**No hay vuelta al dominio anterior:** ya no apunta al VPS. Volver atrás la PM2 es volver al commit
anterior SIN tocar el `.env`:

```bash
./scripts/deploy.sh <sha anterior>
docker compose -f docker-compose.prod.yml exec caddy caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile
```

Ojo: con el commit anterior, el Caddyfile solo tiene el bloque del dominio viejo, así que **la web
seguirá sin verse desde fuera** hasta arreglar el Caddyfile. Volver atrás solo tiene sentido si lo que
falla es el código, no el dominio.

## 6. Al final, con todo comprobado

```bash
grep -ci dareflash ~/dareflash-config/.env
```

Tiene que dar `3`: las tres variables internas que se quedan (`DATABASE_URL`, `MARIADB_DATABASE` y
`MARIADB_USER`; el nombre de la carpeta no cuenta). Ninguna otra puede llevarlo: si sale más, alguna
apunta todavía al dominio anterior.

Después, en la zona DNS del dominio anterior:

1. borrar lo que quede de A/AAAA y `www`;
2. cuando el correo esté llegando a `admin@revolflash.com`, borrar el MX y el buzón viejo.
