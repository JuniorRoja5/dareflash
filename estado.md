# DareFlash — Estado del codigo (LA PARTE QUE CADUCA)

> **Foto del 2026-11-11, con la Fase 9 CERRADA salvo la P13 (la P14, la portada, recien
> fusionada).** La foto describe el commit en el que se escribio: `git log` de este fichero da el
> SHA exacto, que es mas fiable que una cifra copiada a mano que nadie vuelve a tocar.
>
> Todo lo de este fichero **caduca**: el resto de la documentacion (CLAUDE.md, AGENTS.md, MARCA.md,
> los docblocks) describe decisiones que apenas cambian; esto cambia cada dos semanas.
>
> **Es una PISTA, no una verdad.** Si el codigo contradice este fichero, **gana el codigo**. Antes
> de afirmar nada de aqui, compruebalo contra el repositorio.
>
> **QUE NO ENTRA AQUI.** Este repositorio es PUBLICO. La operacion (runbook, despliegue, servidor,
> correo, copias, credenciales), la estrategia legal, los datos de la entidad y los datos de negocio
> viven FUERA, y ahi se quedan — igual que `/security/audits/` esta en `.gitignore` a proposito. Si
> falta un dato de esos para una tarea, se **pide**; no se escribe aqui "para tenerlo a mano". Por
> eso varias cosas de abajo dicen "decision de negocio, fuera del repositorio" y no dicen cual.

## 1. Fase actual

**Fases 0–6 CERRADAS y desplegadas.** De la **Fase 7 (monedero, premios, retiradas)** esta construido
el **rail MANUAL completo**: el premio se acredita al cerrar un reto, la persona puede pedir un cobro
y un administrador lo mueve por su maquina de estados desde `/panel/monedero`.

**La transferencia la hace una persona, fuera de DareFlash.** No hay pago automatico ni verificacion
de identidad del proveedor de pagos: eso es opcional y posterior. Lo que el producto garantiza es que
el dinero SALE del monedero al pedirlo y VUELVE entero si se rechaza; el envio en si es manual.

Quedan 4 fases (8–11): 8 VIP · 9 Brand Challenges · 10 1vs1 · 11 multiidioma/PWA.

**FASE 9 (portal de empresa y publicidad) CERRADA, salvo la P13.** En `main` estan de la P1 a la
P12 y la P14: cuenta y portal de empresa, retos de empresa con pago, campanas de publicidad con su
reparto, cobro diario, moderacion, metricas, compra de creditos, el resumen diario del admin y la
portada `/inicio` con datos reales y el reto destacado que elige el admin. **La P13 (la factura)
sigue BLOQUEADA** y no se empieza sin su encargo. El plan por piezas vive fuera del repositorio, en
el informe de diseno de la fase.

**Infraestructura: las imagenes se construyen en CI** y el servidor solo las descarga (mas abajo,
con el runbook). **Desde que esto esta en main, el flujo viejo (`up -d --build`) ya no construye
nada**: el primer despliegue y todos los siguientes son con `deploy.sh`.

Tres decisiones de P1 que siguen condicionando todo lo de empresa:

- **Una cuenta de empresa MIRA Y NO PARTICIPA.** El candado esta en `mutatingRoute` —el chokepoint
  por el que pasa toda mutacion— y esta CERRADO POR DEFECTO: una ruta mutante nueva nace bloqueada
  para empresas y abrirla exige escribir `cuentaEmpresa: "permite"`. Hoy solo lo dicen las de
  gobierno de la propia cuenta (salir, contrasena, correo). El censo vive en
  `tests/empresa-no-participa.test.ts` y se compone con `route-csrf`.
- **El ambito sale de un solo sitio.** `requireEmpresa()` es el unico productor de un `empresaId`, y
  los servicios lo reciben como parametro OBLIGATORIO. Un filtro opcional se olvida y compila.
- **La identificacion fiscal no se pinta: se pide**, y pedirla escribe en `AuditLog` sin copiar el
  valor. Mismo trato que el correo de una cuenta en `/panel/usuarios`.

Pre-lanzamiento: el sitio sigue tras el pestillo (`robots: Disallow: /` + `X-Robots-Tag: noindex`).

## 2. Que esta cerrado y desplegado

- **Fase 0** andamiaje · **Fase 1** auth, perfiles, feed, diseno, Bunny · **Fase 2** retos +
  comentarios sobre el video · **Fase 3** votacion + antifraude · **Fase 4** puntos/DareUp/niveles/
  ranking + panel de admin · **Fase 5** moderacion completa · **Fase 6** Stripe/Boost.
- **Fase 6 (Boost), completa:** compra (Checkout + webhook, acreditado exactamente una vez),
  comprobacion de moneda antes del importe, UI de compra, activacion (debito + ventana + limite
  diario bajo lock), destacados en portada, vitrina `/destacados`, y `/panel/boost` (ver vigentes,
  regalar/ajustar creditos con motivo obligatorio, retirar del escaparate expirando TODAS las
  apariciones vigentes de esa persona).
  **Boost esta INERTE en produccion a proposito:** sin credenciales de Stripe configuradas no se
  puede comprar. El bucle completo se probo en modo TEST.
- **Marca v3:** identidad **verde + blanco en los dos temas**. El brief vigente es **v3**, no v2.
  Logotipo propio (SVG inline por `currentColor`, cero hex), glow verde por tema, y de camino se
  tapo una **fuga de AA del tema claro** que llevaba ahi desde que nacio: el texto secundario sobre
  el tinte del glow estaba por debajo del minimo, y no lo veia nadie porque las reglas de color
  median token contra token y no la COMPOSICION. Los valores y las reglas, en
  [MARCA.md](MARCA.md).
- **`/destacados` como "escenario":** tejido de rayos (UNA capa de fondo, nunca un efecto por
  tarjeta), titular grande, CTA de dos lineas, y **el halo de cada tarjeta es el color de su NIVEL**
  (Rookie sin halo), no un verde forzado igual para todos.
- **`/privacidad`**, con marcadores `[PENDIENTE]` VISIBLES donde faltan datos, y la casilla del
  registro enlazada a ella. `/terminos` se nombra pero no se enlaza mientras no exista.
- **Fase 7, rail manual:** premio acreditado al cierre (fuera de la transaccion del hecho — el veto
  del deadlock), `/cobros` con la puerta del minimo y la solicitud, y `/panel/monedero` con la cola.

## 3. Rol MODERATOR

Desde Fase 5 el panel se abre a **MODERATOR** ademas de ADMIN. El rol **vive en `secciones.ts` y en
ningun otro sitio**: el layout deja entrar a MODERATOR o superior (el shell NO es la barrera) y cada
pagina exige el rol de SU seccion con `requireSeccion`. **Prohibido** un `requireRole("ADMIN")`
suelto en una pagina: seria una segunda verdad. Moderacion y Usuarios son del moderador;
retos/dinero/puntos/anuncios, del administrador. Solo el superadmin asigna roles, y solo
USER↔MODERATOR; ADMIN unicamente por el script de bootstrap. Solo se banea a cuentas USER.

## 4. Fase 7 — lo construido, y lo que falta para que SIRVA

Construido y con tests: credito al ganador al cerrar, solicitud de cobro (debito inmediato del
importe completo, idempotente por intencion), y el panel con la maquina de estados
`PENDING -> APPROVED -> PROCESSING -> PAID`, mas `REJECTED` que DEVUELVE el dinero. `PAID` y
`REJECTED` son finales: cada uno ya movio dinero y repetirlo cuesta dinero de verdad.

**Dos cosas lo mantienen inerte, y las dos son de fuera del repositorio:**

- **`PAGOS_SECRET`** no esta en el `.env` del servidor. Sin el, pedir un cobro falla EN ALTO a
  proposito: los datos de pago se cifran o no se guardan. Guardar un IBAN en claro "mientras tanto"
  es la fuga que ese cifrado evita, y ademas silenciosa.
- **El minimo de retirada** (`RETIRADA_MINIMA_CENTS`) arranca en 50 $ como **marcador**, pendiente
  de decidir contra lo que cueste la via de pago real.

Reglas que aplican desde el primer commit y no se renegocian:

- Dinero en **centimos enteros**, ledger de **solo insercion** con `idempotencyKey`, saldo ajustado
  en la misma transaccion bloqueando **primero** la fila del `User` con `FOR UPDATE`.
- **El VETO del deadlock:** nunca se anida un bloqueo de `User` dentro de una transaccion que ya
  tiene bloqueada una fila de contenido. Primero se escribe quien gano; el credito va aparte.
- **18+ es el suelo**, declarado en el registro. La fecha de nacimiento **no autoriza a cobrar**: la
  verificacion real la hace el proveedor de pagos al reclamar. Hay guard que lo vigila.
- `WalletLedger`, `AuditLog` y `ChallengeResult` **ya existen** en el esquema.

## Despliegue: las imagenes se construyen FUERA del servidor

**El servidor no compila.** En cada push a `main`, CI ([imagenes.yml](.github/workflows/imagenes.yml))
pasa typecheck, lint y la suite contra MariaDB 11.8 y, **solo si pasan**, construye las cuatro
imagenes (`web`, `worker`, `migrate`, `geoip`), las revisa (ningun `.env`, solo variables conocidas,
el SHA correcto) y las publica en `ghcr.io/juniorroja5/dareflash-<servicio>` con el **SHA completo**
como etiqueta (y `main`). El servidor solo descarga, con [scripts/deploy.sh](scripts/deploy.sh). En
una rama, CI hace lo mismo menos publicar.

**Motivo (2026-11-06):** `next build` se hacia en la misma maquina que sirve la web, y su pico de
memoria crece con cada pieza. En un despliegue de la Fase 9 esa construccion dejo la maquina sin
memoria y la web dejo de responder mientras compilaba. El detalle es operacion y vive fuera.

**Las imagenes son PUBLICAS**, como el repositorio: llevan su codigo, dependencias publicas de npm y
el resultado del build, que se hace SIN variables. Ningun secreto entra en el build y CI lo comprueba
antes de publicar. Si el repositorio se cierra, los paquetes pasan a privados a la vez y el servidor
necesita el `docker login` de abajo.

### Runbook (comandos genericos; lo especifico del servidor, fuera)

Desde el directorio del repositorio en el servidor:

```bash
git pull && ./scripts/deploy.sh           # desplegar main (espera a CI si no ha terminado)
./scripts/deploy.sh <sha>                 # volver atras a ese commit de main
docker compose -f docker-compose.prod.yml logs -f --tail=100 web    # logs (o worker)
./scripts/deploy.sh --construir-aqui      # EMERGENCIA, sin CI ni registro: construye aqui
```

`deploy.sh`: comprueba que el SHA es de main → mira que version esta en marcha → espera a las cuatro
imagenes (si CI fallo, lo dice y no despliega; si no ha terminado, espera hasta 25 min) → descarga →
migra con la imagen `migrate` de ESE SHA → etiqueta en local como `desplegada` y `up -d` → espera al
health y **comprueba que responde ese commit** (si responde otro, sale con error y lo dice).

**Volver atras y las migraciones.** Prisma no deshace: volver a un SHA anterior cambia el codigo, no
el esquema. Es seguro si las migraciones posteriores fueron ADITIVAS (tablas o columnas nuevas con
default o NULL, indices). No lo es si alguna borro o renombro algo que el codigo viejo usa, o anadio
una columna obligatoria sin default. Al volver atras, `deploy.sh` NO migra, lista las migraciones
posteriores y no sigue sin `--acepto-esquema-nuevo`.

**El cron mensual de geoip** usa la imagen `desplegada`: `docker compose -f docker-compose.prod.yml
run --rm geoip` (una linea vieja con `--build` sigue funcionando: ya no hay nada que construir).

### Configuracion de UNA vez (PENDIENTE de Junior hasta el primer despliegue con esto)

1. Tras el primer push a `main` con este workflow: en GitHub, Paquetes, poner los cuatro
   `dareflash-*` en **Public** (si no salen ya publicos) y comprobar que estan enlazados al repo.
2. Si algun dia son privados: un token _classic_ con solo `read:packages` y, en el servidor, una vez:
   `docker login ghcr.io -u <usuario>` (pega el token). Sin eso, `deploy.sh` no ve las imagenes.
3. Cambiar la linea del cron de geoip a la de arriba (sin `--build`).
4. Primer despliegue: `git pull && ./scripts/deploy.sh`.
5. Despues de comprobarlo, liberar disco: las imagenes viejas construidas en el servidor
   (`dareflash-web`, `-worker`, `-migrate`, `-geoip` sin registro delante) y la cache de build.

## Antes de abrir la compra de creditos (P11)

La compra esta construida e INERTE sin claves: los paquetes se ven y el boton no se ofrece. Antes de
encenderla:

1. **Comprobar en el modo test de Stripe que el numero fiscal sale en el RECIBO.** Se recoge en el
   Checkout (`tax_id_collection`, con direccion y cliente), pero sin claves no se pudo ver el
   documento. Si no sale, la via de Stripe es generar una factura, y eso depende de la P13 (la
   factura, bloqueada): no se abre la compra prometiendo un numero fiscal que no aparece.
2. **Dar de alta el webhook** `/api/empresa/creditos/webhook` en Stripe, con los eventos
   `checkout.session.completed` y `checkout.session.async_payment_succeeded`, y poner su secreto en
   `STRIPE_WEBHOOK_SECRET_CREDITOS` (es SUYO: no el de Boost ni el de VIP).
3. **Un reembolso hecho desde Stripe NO resta los creditos.** Es proceso, no codigo: quien reembolsa
   quita a mano esos creditos desde la ficha de la empresa en el panel (ajuste del equipo, con su
   nota). Sin ese paso, la empresa conserva lo que se le devolvio.

## 5. Piezas cortas pendientes

Trabajo acotado y listo para instruir.

- **Fuentes en el repositorio, sin Google (SIGUIENTE, tras fusionar la de imagenes).** `next build`
  descarga las fuentes de `next/font/google` al construir, y esa descarga falla a veces: fue la causa
  de los dos rojos de `docker-build` del 2026-11-06 (`199c1d8` y `29c9a1d`; el mismo SHA paso en otra
  ejecucion ese dia). Pasar a `next/font/local` con los ficheros de fuente en el repositorio, CON sus
  licencias, para que el build no descargue nada y la web no pida fuentes a Google. Las fuentes son las
  de MARCA.md: no cambia cual, solo de donde salen.
- **`likeCount` en la reconciliacion.** Falta el barrido que lo cuadre contra el `COUNT` real, como
  ya tiene `voteCount`. Con el cerrojo no deberia descuadrarse, pero es la red que los otros
  contadores si tienen.
- **Dos acciones de puntos sin asignar.** Siguen en `ACCIONES_PUNTOS` como `activa: false`. No son
  piezas cortas de verdad: "registro desde video" y "100 visitas externas" necesitan subsistemas
  (atribucion a video, conteo verificado de vistas externas). Son features, no flecos.
- **Like en rejilla y perfil.** Hoy solo esta en el feed. El DTO ya lleva `likes`/`miLike` a la
  rejilla del reto, asi que es trabajo de vista.
- **`/terminos`.** No existe: la casilla del registro lo nombra y su enlace esta inerte a proposito
  hasta que haya texto final. `/privacidad` ya existe, con marcadores `[PENDIENTE]` visibles. El
  test de paginas legales **cambia de lado solo** el dia que la pagina aparezca: entonces exige que
  se enlace, asi que no hay que acordarse.
- **Repartir un premio entre VARIOS ganadores.** Hoy el importe se congela integro al rank 1 y 0 al
  resto, en los dos caminos del cierre, porque el reparto no esta decidido. Pagar el premio completo
  a cada ganador multiplicaria el coste del reto por su numero, asi que cambiarlo es una decision de
  dinero y toca el congelado del cierre y la creacion de retos. No es un fleco.
- **Reconciliacion del monedero.** El `LEDGER_RECONCILE` deberia cuadrar `walletBalanceCents` contra
  `SUM(amountCents)` y, ademas, comprobar que nadie tiene movimientos en DOS monedas: el saldo es un
  solo numero y da por hecho una moneda por persona. Un invariante que nadie comprueba deja de serlo.

## 6. Deuda tecnica viva (no bloquea)

- **Feed:** conserva la debilidad del cursor de Prisma (retirar una fila entre paginas se come
  otra). El detalle del reto ya usa keyset explicito; el feed no. Arreglar al tocar el feed.
- **Keyset en la pestana "Cerrados"** de `/retos`: se acumula sin limite ("Activos" si esta
  acotado).
- **Maquetas con tripwire (`MAQUETA_PENDIENTE`):** `retos-datos.ts` (`RETOS_SEED`).
- `tests/buscar.test.ts` es **flaky conocido**: el FULLTEXT de InnoDB se asienta tras reiniciar
  MariaDB. **No es regresion**; ignorar si salta aislado.
- Un rojo suelto de la suite entera con 4 workers que no se reproduce aislado. Acordado: si vuelve,
  **capturar el log completo** antes de tocar nada, y serializar los tests de concurrencia antes que
  cambiar el codigo.
- Prisma 7.9.x. Vulnerabilidades moderadas de postcss (build-time, no explotables). **Nunca
  `npm audit fix --force`**: degrada Next.

### Descartado: mover la compresion a Caddy (4-nov-2026)

Se propuso `encode zstd gzip` en el Caddyfile + `compress: false` en `next.config.ts`, con el
argumento de **descargar la CPU de `web`**. **Descartado por medicion**, no por opinion.

Banco de carga con los limites de produccion (1 nucleo compartido, sin swap), 200 personas
simultaneas con pausas de 3-8 s, Caddy delante:

|                              | `/inicio` mediana | CPU de `web` | CPU del nucleo |
| ---------------------------- | ----------------- | ------------ | -------------- |
| Con gzip (hoy, lo hace Next) | 26 ms             | 68 %         | 60 %           |
| Sin comprimir                | 27 ms             | 71 %         | 60 %           |

**Sin diferencia medible**: comprimir no le cuesta a Next nada por encima del ruido del banco
(+-5 puntos). Y el argumento no podia sostenerse de entrada: en una maquina de UN nucleo, mover
trabajo de un contenedor a otro no lo quita de ningun sitio porque no hay un segundo sitio. De
hecho meter Caddy delante **cuesta** ~4 puntos del nucleo y triplica el p95 (505 ms vs 172 ms), no
porque Caddy sea caro — su contenedor no pasa del 9 % — sino porque compite por el mismo nucleo.

Lo que si se ganaria (zstd y comprimir tambien los estaticos de `/avatars` y `/portadas`, que hoy
no pasan por Next) **no compensa hoy**: las dos rutas sirven imagenes ya comprimidas, y el ahorro
de bytes de zstd frente a gzip es pequeno. Si algun dia se retoma, que sea por el ancho de banda y
con su medicion, nunca por la CPU.

**No se toca el Caddyfile.** Ver el informe de capacidad para las tablas completas.

### Descartado: cachear portada y ranking en Redis (4-nov-2026)

Se propuso guardar los destacados de portada y el top del ranking en Redis con un TTL corto, para
quitarle trabajo a MariaDB. **Descartado por medicion**, y por el mismo motivo estructural que la
compresion: en un nucleo compartido, lo que decide es donde se va el tiempo de CPU, y **no se va en
la base de datos**.

Reparto medido con `main` = `10cea40` (feed ya arreglado), personas con pausas de 3-8 s, rampa y
Caddy delante:

| Personas | `web`  | **mariadb** | caddy | redis | Nucleo |
| -------- | ------ | ----------- | ----- | ----- | ------ |
| 200      | 37,9 % | **4,5 %**   | 4,6 % | 0,3 % | 47 %   |
| 300      | 53,1 % | **6,5 %**   | 6,5 % | 0,2 % | 67 %   |
| 400      | 77,7 % | **8,0 %**   | 8,5 % | 0,2 % | 96 %   |

Son medianas. La proporcion se mantiene en **8 a 1 a favor de `web`** en los tres escalones, y
MariaDB no pasa del 8 % ni a 400 personas con 218 consultas por segundo. Cachear la portada (~1 ms)
y el ranking (~2,4 ms) movería el techo de ~300 a quiza ~310 personas, a cambio de una cache con su
invalidacion, su clave por ventana de rotacion y su camino de respaldo cuando Redis no responda.

Ademas, la portada **ya rota cada minuto**, asi que el TTL util queda acotado por la propia rotacion:
la cache ahorraria como mucho las visitas de un mismo minuto.

**CONDICION PARA RETOMARLO:** que una medicion nueva muestre que MariaDB se ha vuelto cara. El numero
a vigilar esta en la tabla: hoy es **4,5 %** a 200 personas. No se retoma por costumbre.

**No lo contradice la cache de la P14** (`datosPortadaCacheados`, 30 s, en memoria del proceso, sin
Redis). Es otra cosa: la portada real paso de 5 a 11 consultas por visita y esa cache la devuelve a 5,
lo que costaba antes de la P14. Marcar o quitar el destacado la vacia. La medicion esta en el commit de
la P14.

### Techo de capacidad medido (4-nov-2026, `10cea40`)

Con el criterio de la portada por debajo de medio segundo en el p95: **~300 personas a la vez**
(45 peticiones/s). Antes del arreglo del feed eran ~200.

|                          | Antes (`659875b`) | Ahora (`10cea40`) |
| ------------------------ | ----------------- | ----------------- |
| Techo (p95 < 500 ms)     | ~200 personas     | **~300 personas** |
| CPU a 200 personas       | 64 %              | **47 %**          |
| `/inicio` a 200 personas | 42 ms             | **29 ms**         |
| p95 a 200 personas       | 505 ms            | **156 ms**        |

**Parte de la mejora NO es del feed:** la tanda vieja tenia 500 Boosts vigentes sembrados y ahora el
cupo los limita a 60. Lo que si es limpio y no depende de esa comparacion es el reparto de la tabla
de arriba.

El banco **no mide TLS** (su Caddy escucha en claro), asi que en produccion el techo sera algo menor
que 300. El sesgo va en contra del margen, que es el lado seguro.

## 7. Deuda de producto

- **Para la Fase 11: «medianoche UTC» en textos de participantes.** Los avisos del limite diario de
  toques (`MSG_TOQUE_LIMITE_DIARIO`) y de Boost (`MSG_BOOST_LIMITE_DIARIO`, y `/boosts`) dicen que el
  contador se reinicia «a medianoche UTC»: jerga, y en America el dia se reinicia por la tarde. Mismo
  arreglo que el portal de empresas en P10 (`fraseInicioDelDia`): la hora LOCAL de quien lee, con su
  horario de verano. Para participantes, la zona sale de su ubicacion o de su navegador, no del pais
  de una empresa. No se hace antes de la Fase 11 (Boost esta fuera de lo que se toca ahora).
- El texto legal dice 30 s y la regla real es 90 s. Corregir antes de lanzar.
- Anonimizacion real de cuenta: hoy solo hay tombstone `del_<aleatorio>`.
- Bloquear la indexacion del dominio temporal antiguo.

## 8. Lecciones de proceso

Valen mas que cualquier fase, porque se repiten.

- **Probar la COMPOSICION, no solo las piezas.** El like llego roto a produccion con el servicio, la
  ruta, `haySesion` y `esMio` todos probados: el rail tenia DOS corazones y el que se pulsaba era un
  adorno sin `onClick`. Al anadir un control a una superficie que ya existe van **dos** tests: el de
  **interaccion** y el de **composicion**.
- **Medir el plato, no los ingredientes.** Donde dos capas se superponen (tinte, velo, glass), la
  medida valida es sobre la COMPOSICION y en el caso peor. Todas las reglas de color comparaban
  token contra token, y por eso un incumplimiento de contraste del tema claro sobrevivio desde que
  el tema nacio: ningun guard mentia, es que ninguno miraba lo que la persona ve.
- **Un token de diseno es una variable global.** Subir `--df-glow-accion` para que el verde se
  leyera en `/destacados` se lo subio a NUEVE superficies, y en `/ranking` salio un verde de esquina
  que nadie habia pedido. Antes de subir un token: censar quien lo monta, partirlo por INTENCION, y
  poner tres candados (techo al suave, suelo al fuerte, y uno estructural de quien puede montarlo).
- **DOS DEFENSAS, UNA SOLA ATADA.** Salio TRES veces en la misma ronda y es el patron que mas verdes
  falsos ha dado: cuando dos mecanismos protegen lo mismo, los tests suelen ejercitar solo el de
  fuera, asi que romper el de dentro no enrojece nada. Paso con el cifrado (la PUERTA
  `cifradoDePagosDisponible` tapaba el fallo cerrado del cifrador), con el reembolso (la maquina de
  estados tapaba la clave de idempotencia) y con la traza (buscar el IBAN en claro tapaba que se
  colara CIFRADO). Las dos defensas estan bien; lo que no vale es tener atada solo una. Para
  probar la de dentro hay que **saltarse la de fuera a mano** —forzar el estado, importar el modulo
  sin la variable— y decir en el test por que.
- **Un test de reintento que no reintenta.** Donde hay un marcador de "ya hecho" (`premiadosEn`,
  `closedAt`, una clave de idempotencia), repetir la llamada NO es el reintento: la funcion vuelve
  antes de empezar y el caso pasa por no hacer nada. El reintento real se provoca BORRANDO el
  marcador, que ademas es el caso de produccion (el proceso que muere entre el pago y la marca).
- **Una tabla nueva que no entra en `resetDb`** vuelve a todos sus tests dependientes del ORDEN. Siete
  casos en rojo y ninguno hablaba del problema real.
- **Clavar los numeros de producto.** Los umbrales van fijados con un `toBe(...)` concreto. Si todos
  los casos se derivan de la constante, moverla no enrojece nada — y eso paso tres veces antes de
  sistematizarlo.
- **Un guard que enrojece por lo que no es, se acaba borrando; y uno que clava la implementacion en
  vez del acuerdo, defiende el bug.** Las dos caras del mismo problema. Un `\boffset\b` caza
  `underline-offset-2`; prohibir "verde" en los comentarios choca con que aqui "verde" significa
  "pasa"; exigir `var(--df-action)` como color de un halo protegio el fallo el dia que el halo paso
  a decir el nivel. Los guards miran el codigo sin comentarios, se acotan al sitio que DECIDE, y
  fijan el acuerdo, no la implementacion de hoy.
