# DareFlash — Estado del codigo (LA PARTE QUE CADUCA)

> **Foto del 2026-10-14. `main` = `81fd0bc`, pendiente de desplegar.**
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

## 5. Piezas cortas pendientes

Trabajo acotado y listo para instruir.

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

## 7. Deuda de producto

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
