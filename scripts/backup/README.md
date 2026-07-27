# Respaldos de MariaDB — Parte 1 (dump + validación local)

> ⚠️ **ESTO TODAVÍA NO ES UN RESPALDO.** El `.gz` vive en el **mismo disco del mismo servidor**
> que la base de datos: si el disco falla o alguien entra en la máquina, se pierde todo a la
> vez. La Parte 1 **fabrica y valida** el artefacto; la que lo pone **a salvo** (cifrado +
> subida fuera del VPS) es la **Parte 2**. Hasta entonces, seguimos sin red.

Volcado consistente + validación real (restauración en base **desechable**, comparación de
tablas contra producción, cuenta **canario**), con guardas de sentinela, tamaño, disco, lock
y timeouts. **Aún no** cifra, sube a B2 ni se programa en systemd (partes siguientes).

## Defensa estructural: DOS usuarios de base de datos

El script hace `DROP DATABASE` de la base desechable. Para que **ni un error tipográfico ni un
`.env` mal puesto** puedan tocar producción, el usuario que ejecuta el `DROP` **no tiene
permiso sobre `dareflash`**. Junior ejecuta estas `GRANT` **una vez** (como root):

```sql
-- Usuario de VOLCADO: SOLO LECTURA sobre dareflash. No puede escribir en ninguna parte.
CREATE USER 'dfbackup_dump'@'%' IDENTIFIED BY '<clave-volcado>';
GRANT SELECT, SHOW VIEW, TRIGGER, EVENT, LOCK TABLES ON `dareflash`.* TO 'dfbackup_dump'@'%';

-- Usuario de VERIFICACION: ALL SOLO sobre la base desechable (crear/borrar/restaurar).
-- El grant sobre `dareflash_backup_verify`.* NO da NINGUN permiso sobre `dareflash`.
CREATE USER 'dfbackup_verify'@'%' IDENTIFIED BY '<clave-verify>';
GRANT ALL PRIVILEGES ON `dareflash_backup_verify`.* TO 'dfbackup_verify'@'%';

FLUSH PRIVILEGES;
```

Las cuatro credenciales van al `.env` de **`/root/dareflash-config/.env`** (nunca al repo):

```
BACKUP_DUMP_USER=dfbackup_dump
BACKUP_DUMP_PASSWORD=<clave-volcado>
BACKUP_VERIFY_USER=dfbackup_verify
BACKUP_VERIFY_PASSWORD=<clave-verify>
```

Las comparaciones de cadena del script (`VERIFY_DB != DB`, identificador válido) se quedan
como **defensa en profundidad**, pero ya no son la única barrera.

## Directorio de respaldos (persistente, en el anfitrión)

`estado.json` guarda el tamaño del último dump bueno; la guarda de tamaño lo compara para
cazar truncaduras. Con `run --rm` el FS del contenedor se destruye, así que **OUT_DIR debe ser
un volumen del anfitrión**. Crear una vez con permisos cerrados:

```bash
install -d -m 0700 /root/dareflash-backups
```

## Cuenta canario — PASO PREVIO OBLIGATORIO a la primera ejecución

La validación del respaldo comprueba que el canario sobrevive al ciclo dump/restore. Si no
existe, **la primera ejecución falla en la validación** (el mensaje de error apunta aquí). Hay
que aprovisionarlo **una vez**, desde el servicio `backup` del compose:

```bash
docker compose -f docker-compose.prod.yml run --rm backup npx tsx scripts/backup/provision-canary.ts
```

> Ojo de secuencia: si se borran todas las cuentas (p.ej. limpieza tras verificar un paso), el
> canario se borra con ellas y hay que **volver a aprovisionarlo** antes del siguiente respaldo.

Nace **inutilizable** (`bannedAt` puesto, `emailVerified` null): `login` y `validateSession` la
rechazan. La validación llama directo a `verifyPassword`. **No le quites el baneo**: si lo
haces, la validación del respaldo falla a propósito (ver `canary.ts`).

## Ejecutar un respaldo

```bash
docker compose -f docker-compose.prod.yml run --rm backup
```

Pasos: comprobación de disco (tamaño real de producción × margen) + lock → dump por flujo (sin
texto plano en disco) → sentinela → restaurar en `dareflash_backup_verify` con el usuario de
verificación → validar (tablas == producción + suelo crítico incl. `_prisma_migrations` +
**conteos de filas** de User/WalletLedger/PointsLedger ≥ producción + canário íntegro) →
comprimir → guarda de tamaño → `estado.json`. Deja un `.sql.gz` validado en `/backups`.
Cualquier fallo borra el `.gz` parcial de esa ejecución.

> **Suelo de tamaño:** `BACKUP_MIN_BYTES=1024` es simbólico (un dump del esquema vacío ya pasa
> de 50 KB). Subir a una línea base real cuando la haya. Ajustables por entorno también
> `BACKUP_TIMEOUT_MS`, `BACKUP_DISK_FACTOR`, `BACKUP_MIN_BYTES`, `BACKUP_VERIFY_DB`.

## Pendiente (siguientes partes)

1. Cifrado `age` (clave pública en el VPS; privada fuera) → subida a **B2** (credencial de solo
   escritura + Object Lock) → borrado del `.gz` local.
2. **systemd** timers (diario + cada 6 h) + **healthchecks.io** (dead-man's-switch + aviso a un
   correo fuera del dominio + Telegram).
3. Simulacro de restauración **mensual fuera del VPS** (cadena completa: descargar + descifrar +
   restaurar + login real). PITR con binlogs = requisito de entrada de la Fase 7.
