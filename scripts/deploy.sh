#!/usr/bin/env bash
# DESPLEGAR EN PRODUCCIÓN (o volver atrás) UNA VERSIÓN QUE YA CONSTRUYÓ CI.
#
#   git pull && ./scripts/deploy.sh          despliega el HEAD recién bajado
#   ./scripts/deploy.sh <sha>                despliega ESE commit de main (así se vuelve atrás)
#   ./scripts/deploy.sh --construir-aqui     EMERGENCIA: construye en el servidor (ver abajo)
#
# El servidor NO compila: CI (.github/workflows/imagenes.yml) construye las imágenes de cada commit de
# main, SOLO si pasan los tests, y las publica en ghcr.io con el SHA completo. Este script:
#
#   1. Decide QUÉ SHA despliega (HEAD o el que se le pase) y comprueba que es de main.
#   2. Pregunta a la versión EN MARCHA qué commit es (su /api/health). Si el SHA pedido es ANTERIOR,
#      es una vuelta atrás: ver «VOLVER ATRÁS Y LAS MIGRACIONES».
#   3. ESPERA a que existan las cuatro imágenes de ese SHA. Si CI aún no ha terminado, espera (con
#      tope); si CI FALLÓ, lo dice y NO despliega: sin tests verdes no hay imagen.
#   4. Las descarga y migra con la imagen `migrate` de ESE SHA (scripts/migrate-prod.sh).
#   5. Las etiqueta en local como `desplegada` (lo que usa el compose sin IMAGE_TAG) y `up -d`.
#   6. Espera al health y COMPRUEBA que el commit que responde es el desplegado. Si es otro, lo dice
#      claramente y sale con error: lo que sirve NO es lo que se pidió. Y después, que el WORKER
#      (su latido en el health) es ese commit y sigue vivo: sin él no hay correos ni tareas de fondo.
#      Y por último, que CADDY sirve el Caddyfile de ese commit: lo valida dentro de su contenedor y
#      solo entonces lo recarga (sin recargar si no valida; ver el paso 6c).
#
# VOLVER ATRÁS Y LAS MIGRACIONES. Prisma no deshace migraciones: volver a un SHA anterior cambia el
# CÓDIGO, nunca el ESQUEMA. La versión vieja arranca contra un esquema más nuevo que el suyo, y eso es
# seguro solo si las migraciones posteriores fueron ADITIVAS (tabla nueva, columna nueva con default o
# que admite NULL, índice nuevo): el código viejo no las conoce y no le estorban. NO es seguro si
# alguna BORRÓ o RENOMBRÓ algo que el código viejo usa, o añadió una columna obligatoria sin default
# (los INSERT viejos fallarían). Por eso, en una vuelta atrás, el script:
#   - NO migra (todas las migraciones del SHA viejo ya están aplicadas);
#   - lista las migraciones posteriores al SHA de destino y, si hay alguna, NO sigue sin
#     `--acepto-esquema-nuevo`: hay que mirarlas antes y decidir.
#
# EMERGENCIA (--construir-aqui): si CI o el registro no están, construye en el servidor con
# docker-compose.construir.yml, SOLO el HEAD y con el árbol limpio, y sigue igual (migrar, arrancar,
# comprobar el health). En 1 vCPU el build carga la web mientras dura: es la última opción.
#
# Variables (para pruebas; no hace falta tocarlas): DEPLOY_ESPERA_MAX_S, DEPLOY_ESPERA_PASO_S,
# DEPLOY_HEALTH_MAX_S, DEPLOY_HEALTH_PASO_S, DEPLOY_LATIDO_MAX_S, DEPLOY_WORKER_VIVO_MIN_S.
set -euo pipefail
cd "$(dirname "$0")/.."

REGISTRO="ghcr.io/juniorroja5"
REPO_GITHUB="JuniorRoja5/dareflash"
WORKFLOW="imagenes.yml"
SERVICIOS=(web worker migrate geoip)
COMPOSE=(docker compose -f docker-compose.prod.yml)
ESPERA_MAX_S="${DEPLOY_ESPERA_MAX_S:-1500}"
# 60 s entre vueltas. Cada vuelta mira PRIMERO el registro (no gasta cuota de GitHub) y solo si aún no
# están las imágenes pregunta a la API si CI falló. La API sin autenticar admite 60 consultas por hora y
# por IP: con 60 s y el tope de 25 min, un despliegue gasta como mucho 25, y dos seguidos caben.
ESPERA_PASO_S="${DEPLOY_ESPERA_PASO_S:-60}"
HEALTH_MAX_S="${DEPLOY_HEALTH_MAX_S:-180}"
HEALTH_PASO_S="${DEPLOY_HEALTH_PASO_S:-5}"
# El worker vivo (paso 6b): latido de hace menos de 60 s (cuatro de LATIDO_WORKER_CADENCIA_MS, 15 s) y
# proceso vivo al menos 30 s (dos latidos: uno en bucle de reinicios no llega). Ver constants.ts.
LATIDO_MAX_S="${DEPLOY_LATIDO_MAX_S:-60}"
WORKER_VIVO_MIN_S="${DEPLOY_WORKER_VIVO_MIN_S:-30}"

morir() {
  echo >&2
  echo "ERROR: $*" >&2
  echo "No se ha desplegado nada nuevo." >&2
  exit 1
}
paso() { echo; echo "==> $*"; }

# --- Argumentos ----------------------------------------------------------------------------------------
PEDIDO=""
ACEPTO_ESQUEMA=0
CONSTRUIR_AQUI=0
for a in "$@"; do
  case "$a" in
    --acepto-esquema-nuevo) ACEPTO_ESQUEMA=1 ;;
    --construir-aqui) CONSTRUIR_AQUI=1 ;;
    -*) morir "opción desconocida: $a" ;;
    *) [ -z "$PEDIDO" ] || morir "solo se despliega un SHA cada vez"; PEDIDO="$a" ;;
  esac
done

# Lo que responde la versión EN MARCHA: "<commit> <status> <worker.commit> <worker.haceS> <worker.vivoS>",
# o nada si `web` no responde. Sin latido del worker, sus tres campos salen `null`.
salud() {
  "${COMPOSE[@]}" exec -T web node -e '
    fetch("http://127.0.0.1:3000/api/health")
      .then((r) => r.json())
      .then((j) => { const w = j.worker || {};
        console.log([j.commit || "null", j.status, w.commit || "null", w.haceS ?? "null", w.vivoS ?? "null"].join(" ")); })
      .catch(() => process.exit(1));' 2>/dev/null | tr -d '\r' || true
}

imagenes_existen() {
  local s
  for s in "${SERVICIOS[@]}"; do
    docker manifest inspect "$REGISTRO/dareflash-$s:$SHA" >/dev/null 2>&1 || return 1
  done
}

# Estado de CI para el SHA: exito | fallo:<conclusión> | en_curso | sin_ejecucion | desconocido |
# limitado:<HH:MM>.
# Sin jq (el servidor no tiene por qué tenerlo): la respuesta de la API trae UNA ejecución
# (per_page=1) y sus campos `status`/`conclusion` son los primeros con ese nombre.
#
# LÍMITE DE LA API: sin token, GitHub responde 403 (o 429) cuando se acaba la cuota de la IP. Eso NO es
# que CI haya fallado, y no puede confundirse: se devuelve `limitado` con la hora a la que se renueva
# (cabecera X-RateLimit-Reset, segundos desde 1970).
estado_ci() {
  local tmp codigo json total status conclusion reset
  tmp=$(mktemp -d)
  codigo=$(curl -sS --max-time 20 -D "$tmp/cabeceras" -o "$tmp/cuerpo" -w '%{http_code}' \
    "https://api.github.com/repos/$REPO_GITHUB/actions/workflows/$WORKFLOW/runs?head_sha=$SHA&per_page=1" \
    2>/dev/null) || codigo=000
  json=$(cat "$tmp/cuerpo" 2>/dev/null || true)
  reset=$(tr -d '\r' <"$tmp/cabeceras" 2>/dev/null | grep -i '^x-ratelimit-reset:' | grep -o '[0-9]*$' || true)
  local restantes
  restantes=$(tr -d '\r' <"$tmp/cabeceras" 2>/dev/null | grep -i '^x-ratelimit-remaining:' | grep -o '[0-9]*$' || true)
  rm -rf "$tmp"
  if { [ "$codigo" = 403 ] && [ "${restantes:-}" = 0 ]; } || [ "$codigo" = 429 ]; then
    if [ -n "$reset" ]; then echo "limitado:$(date -d "@$reset" '+%H:%M %Z')"; else echo "limitado:?"; fi
    return
  fi
  [ "$codigo" = 200 ] || { echo desconocido; return; }
  total=$(echo "$json" | grep -o '"total_count": *[0-9]*' | head -1 | grep -o '[0-9]*$' || true)
  if [ "${total:-0}" = "0" ]; then echo sin_ejecucion; return; fi
  status=$(echo "$json" | grep -o '"status": *"[a-z_]*"' | head -1 | sed 's/.*"\([a-z_]*\)"$/\1/' || true)
  conclusion=$(echo "$json" | grep -o '"conclusion": *"[a-z_]*"' | head -1 | sed 's/.*"\([a-z_]*\)"$/\1/' || true)
  if [ "$status" != "completed" ]; then echo en_curso
  elif [ "$conclusion" = "success" ]; then echo exito
  else echo "fallo:${conclusion:-desconocida}"
  fi
}

# --- 1. Qué se despliega -------------------------------------------------------------------------------
paso "[1/6] Qué se despliega"
SHA=$(git rev-parse --verify --quiet "${PEDIDO:-HEAD}^{commit}") \
  || morir "'${PEDIDO:-HEAD}' no es un commit que este repositorio conozca (¿falta un git pull?)."
[[ "$SHA" =~ ^[0-9a-f]{40}$ ]] || morir "'$SHA' no es un SHA de 40 hex."
git fetch --quiet origin main || morir "no se pudo consultar origin/main (git fetch)."
git merge-base --is-ancestor "$SHA" origin/main \
  || morir "$SHA no está en main. CI solo publica imágenes de los commits de main."
if [ "$CONSTRUIR_AQUI" = 1 ]; then
  [ "$SHA" = "$(git rev-parse HEAD)" ] \
    || morir "--construir-aqui construye lo que hay en disco: solo sirve para el HEAD, no para $SHA."
  git diff --quiet HEAD \
    || morir "--construir-aqui necesita el árbol limpio: hay cambios sin commit y la imagen no sería $SHA."
fi
echo "    $SHA"

# --- 2. Qué está en marcha, y si esto es volver atrás --------------------------------------------------
paso "[2/6] La versión en marcha"
read -r ACTUAL _ <<<"$(salud)" || true
ACTUAL="${ACTUAL:-}"
VOLVER_ATRAS=0
if [[ ! "$ACTUAL" =~ ^[0-9a-f]{40}$ ]]; then
  echo "    web no responde o no dice su commit: se despliega como versión nueva."
  ACTUAL=""
elif [ "$ACTUAL" = "$SHA" ]; then
  echo "    Ya está en marcha $SHA: se vuelve a aplicar (no cambia nada que no estuviera)."
elif git merge-base --is-ancestor "$SHA" "$ACTUAL" 2>/dev/null; then
  VOLVER_ATRAS=1
  echo "    En marcha: $ACTUAL"
  echo "    VUELTA ATRÁS a un commit ANTERIOR. No se migra: Prisma no deshace migraciones."
  POSTERIORES=$(git diff --name-only --diff-filter=A "$SHA" "$ACTUAL" -- prisma/migrations \
    | awk -F/ 'NF >= 4 { print $3 }' | sort -u)
  if [ -n "$POSTERIORES" ]; then
    echo "    El esquema de la base de datos va POR DELANTE del código al que se vuelve. Migraciones"
    echo "    aplicadas que ese código no conoce:"
    echo "$POSTERIORES" | sed 's/^/      - /'
    echo "    Es seguro solo si son ADITIVAS (tablas o columnas nuevas con default o NULL). Si alguna"
    echo "    borra o renombra algo, o añade una columna obligatoria sin default, el código viejo falla."
    [ "$ACEPTO_ESQUEMA" = 1 ] \
      || morir "revisa esas migraciones y, si son aditivas, repite con --acepto-esquema-nuevo."
    echo "    --acepto-esquema-nuevo: se sigue."
  else
    echo "    Ninguna migración posterior: el esquema es el mismo que conocía ese código."
  fi
else
  echo "    En marcha: $ACTUAL → se despliega $SHA (versión nueva)."
fi

# --- 3. Las imágenes de ese SHA ------------------------------------------------------------------------
if [ "$CONSTRUIR_AQUI" = 1 ]; then
  paso "[3/6] EMERGENCIA: construyendo las imágenes en el servidor (carga la web mientras dura)"
  GIT_SHA="$SHA" IMAGE_TAG="$SHA" docker compose -f docker-compose.prod.yml \
    -f docker-compose.construir.yml build "${SERVICIOS[@]}"
else
  paso "[3/6] Las imágenes de $SHA en $REGISTRO"
  INICIO=$(date +%s)
  until imagenes_existen; do
    ESTADO=$(estado_ci)
    case "$ESTADO" in
      limitado:*)
        morir "GitHub ha limitado las consultas de este servidor a su API; vuelve a intentarlo a las ${ESTADO#limitado:}.
       Esto NO dice nada de CI: no se sabe si terminó. Las imágenes de $SHA aún no estaban en el registro." ;;
      fallo:*)
        morir "CI FALLÓ para $SHA (${ESTADO#fallo:}): sin tests verdes no hay imagen, y no se despliega.
       Detalle: https://github.com/$REPO_GITHUB/actions/workflows/$WORKFLOW" ;;
      exito)
        # Termina DESPUÉS de publicar: si ya terminó bien, las imágenes tendrían que verse. Se mira una
        # vez más por si terminó entre las dos consultas.
        imagenes_existen && break
        morir "CI terminó bien para $SHA pero sus imágenes no se ven desde este servidor. Si los
       paquetes de ghcr.io son privados, falta el docker login de la configuración inicial." ;;
    esac
    TRANSCURRIDO=$(($(date +%s) - INICIO))
    if [ "$TRANSCURRIDO" -ge "$ESPERA_MAX_S" ]; then
      morir "CI no ha publicado las imágenes de $SHA en $((ESPERA_MAX_S / 60)) min (estado: $ESTADO).
       Mira https://github.com/$REPO_GITHUB/actions y vuelve a lanzar el script cuando termine."
    fi
    echo "    Aún no están (CI: $ESTADO). Esperando… ${TRANSCURRIDO}s de ${ESPERA_MAX_S}s"
    sleep "$ESPERA_PASO_S"
  done
  for s in "${SERVICIOS[@]}"; do
    docker pull --quiet "$REGISTRO/dareflash-$s:$SHA"
  done
fi

# --- 4. Migraciones ------------------------------------------------------------------------------------
if [ "$VOLVER_ATRAS" = 1 ]; then
  paso "[4/6] Migraciones: NO en una vuelta atrás (ver arriba)"
else
  paso "[4/6] Migraciones, con la imagen migrate de $SHA"
  IMAGE_TAG="$SHA" ./scripts/migrate-prod.sh
fi

# --- 5. Arrancar ---------------------------------------------------------------------------------------
paso "[5/6] Arrancando $SHA"
# `desplegada` es lo que usa el compose cuando nadie fija IMAGE_TAG (un `up -d` a mano, el cron de
# geoip): así ningún comando suelto arranca otra versión que la desplegada.
for s in "${SERVICIOS[@]}"; do
  docker tag "$REGISTRO/dareflash-$s:$SHA" "$REGISTRO/dareflash-$s:desplegada"
done
"${COMPOSE[@]}" up -d

# --- 6. El health tiene que ser ESTE commit ------------------------------------------------------------
paso "[6/6] Comprobando que responde $SHA"
INICIO=$(date +%s)
while :; do
  read -r COMMIT STATUS _ <<<"$(salud)" || true
  COMMIT="${COMMIT:-}"
  STATUS="${STATUS:-}"
  if [ -n "$COMMIT" ] && [ "$COMMIT" != "$SHA" ]; then
    echo >&2
    echo "ERROR: el health responde con el commit $COMMIT, NO con $SHA." >&2
    echo "Lo que está sirviendo NO es lo que se quería desplegar." >&2
    exit 3
  fi
  if [ "$COMMIT" = "$SHA" ] && [ "$STATUS" = "ok" ]; then
    break
  fi
  if [ $(($(date +%s) - INICIO)) -ge "$HEALTH_MAX_S" ]; then
    echo >&2
    echo "ERROR: en ${HEALTH_MAX_S}s el health no ha respondido ok con $SHA (último: '${COMMIT:-sin respuesta} ${STATUS}')." >&2
    echo "Mira los logs: docker compose -f docker-compose.prod.yml logs --tail=100 web" >&2
    [ -n "$ACTUAL" ] && echo "Para volver a lo que había: ./scripts/deploy.sh $ACTUAL" >&2
    exit 4
  fi
  sleep "$HEALTH_PASO_S"
done

# --- 6b. Y el WORKER tiene que ser ESTE commit, y estar vivo -------------------------------------------
# El 19 nov un `.env` mal puesto mató al worker al arrancar, en bucle de reinicios, y este script dijo
# «DESPLEGADO»: solo preguntaba a la web. Ahora se espera, con el mismo tope, al LATIDO del worker que
# enseña el health (`services/latido-worker`): de ESTE commit, de hace menos de LATIDO_MAX_S, y de un
# proceso que lleve vivo al menos WORKER_VIVO_MIN_S. Lo último es lo que distingue uno sano de uno en
# bucle, que alcanza a latir alguna vez antes de morir. Un latido de OTRO commit no es error en el acto:
# es el del worker viejo, que sigue en la base hasta que el nuevo escriba el suyo.
#
# PERO un commit ANTERIOR a esta vigilancia no late (su worker no anota, su imagen no lleva GIT_SHA y su
# health no tiene `worker`), y la fila del latido conserva el del worker NUEVO. Sin distinguirlo, volver
# atrás a uno de esos —la vía de emergencia— esperaría el tope, diría «el worker no arranca» con todo
# sano y no llegaría a recargar Caddy. Se decide por el COMMIT, no por el health (que no distingue
# «versión vieja» de «sin latido»): sabe latir si SU `scripts/worker.ts` llama a `anotarLatido(`, que es
# lo que de verdad escribe el latido (no basta con que exista el módulo). `deploy-script` exige que el
# worker de hoy la contenga, para que un renombrado no apague la vigilancia en silencio.
MARCA_LATIDO='anotarLatido('
if ! git show "$SHA:scripts/worker.ts" 2>/dev/null | grep -qF "$MARCA_LATIDO"; then
  paso "El worker de $SHA no se puede comprobar"
  echo "AVISO: este commit es anterior a la vigilancia del worker: no se puede comprobar que esté vivo."
  echo "Míralo con: docker compose -f docker-compose.prod.yml logs --tail=100 worker"
else
paso "Comprobando que el worker es $SHA y está vivo"
INICIO=$(date +%s)
while :; do
  read -r _ _ W_COMMIT W_HACE W_VIVO <<<"$(salud)" || true
  W_COMMIT="${W_COMMIT:-null}"
  W_HACE="${W_HACE:-null}"
  W_VIVO="${W_VIVO:-null}"
  if [ "$W_COMMIT" = "$SHA" ] && [[ "$W_HACE" =~ ^[0-9]+$ ]] && [[ "$W_VIVO" =~ ^[0-9]+$ ]] \
    && [ "$W_HACE" -le "$LATIDO_MAX_S" ] && [ "$W_VIVO" -ge "$WORKER_VIVO_MIN_S" ]; then
    break
  fi
  if [ $(($(date +%s) - INICIO)) -ge "$HEALTH_MAX_S" ]; then
    echo >&2
    if [ "$W_COMMIT" = "null" ]; then
      echo "ERROR: el worker no arranca: en ${HEALTH_MAX_S}s no ha dado ni un latido." >&2
    elif [ "$W_COMMIT" != "$SHA" ]; then
      echo "ERROR: el worker no arranca: el último latido es del commit $W_COMMIT, NO de $SHA." >&2
    else
      echo "ERROR: el worker no arranca o no se queda vivo (último latido hace ${W_HACE}s, vivo ${W_VIVO}s)." >&2
    fi
    echo "La web responde, pero sin worker no salen correos ni corren las tareas de fondo." >&2
    echo "Mira los logs: docker compose -f docker-compose.prod.yml logs --tail=100 worker" >&2
    [ -n "$ACTUAL" ] && [ "$ACTUAL" != "$SHA" ] \
      && echo "Para volver a lo que había: ./scripts/deploy.sh $ACTUAL" >&2
    exit 5
  fi
  sleep "$HEALTH_PASO_S"
done
fi

# --- 6c. Y CADDY tiene que servir el Caddyfile de ESTE commit ----------------------------------------
# Caddy monta `caddy/` y NO relee el fichero solo: hasta ahora había que hacer `caddy reload` a mano, y
# si se olvidaba este script decía «DESPLEGADO» con el servidor web sirviendo la configuración vieja (la
# PM2, el cambio de dominio, fue el primer caso). Ahora:
#   - se toma el Caddyfile DEL SHA QUE SE DESPLIEGA (`git show`), no el del árbol de trabajo: en una
#     vuelta atrás son distintos, y lo que se despliega es el SHA;
#   - se copia a un temporal DENTRO del contenedor de Caddy y se VALIDA allí, con su versión de Caddy;
#   - si no valida, error SIN recargar: Caddy sigue con la configuración que tiene en marcha;
#   - si valida, `caddy reload` (idempotente: sin cambios no hace nada). Si falla, error.
paso "Caddy: validando y recargando el Caddyfile de $SHA"
CADDY_TMP=/tmp/Caddyfile.desplegado
CADDY_SALIDA=$(mktemp)
git show "$SHA:caddy/Caddyfile" \
  | "${COMPOSE[@]}" exec -T caddy sh -c "cat > $CADDY_TMP" >"$CADDY_SALIDA" 2>&1 \
  || { echo >&2; echo "ERROR: no se pudo llevar el Caddyfile de $SHA al contenedor de Caddy." >&2;
       cat "$CADDY_SALIDA" >&2; rm -f "$CADDY_SALIDA"; exit 6; }
if ! "${COMPOSE[@]}" exec -T caddy caddy validate --config "$CADDY_TMP" --adapter caddyfile \
  >"$CADDY_SALIDA" 2>&1; then
  echo >&2
  echo "ERROR: el Caddyfile de $SHA NO es válido. NO se ha recargado: Caddy sigue con la configuración" >&2
  echo "que tenía en marcha. La web y el worker nuevos están arrancados; lo que falla es el Caddyfile." >&2
  echo "Lo que dice Caddy:" >&2
  tail -20 "$CADDY_SALIDA" >&2
  [ -n "$ACTUAL" ] && [ "$ACTUAL" != "$SHA" ] \
    && echo "Para volver a lo que había: ./scripts/deploy.sh $ACTUAL" >&2
  rm -f "$CADDY_SALIDA"
  exit 6
fi
if ! "${COMPOSE[@]}" exec -T caddy caddy reload --config "$CADDY_TMP" --adapter caddyfile \
  >"$CADDY_SALIDA" 2>&1; then
  echo >&2
  echo "ERROR: el Caddyfile de $SHA es válido, pero Caddy NO lo ha podido recargar." >&2
  echo "Lo que dice Caddy:" >&2
  tail -20 "$CADDY_SALIDA" >&2
  echo "Mira los logs: docker compose -f docker-compose.prod.yml logs --tail=100 caddy" >&2
  [ -n "$ACTUAL" ] && [ "$ACTUAL" != "$SHA" ] \
    && echo "Para volver a lo que había: ./scripts/deploy.sh $ACTUAL" >&2
  rm -f "$CADDY_SALIDA"
  exit 7
fi
rm -f "$CADDY_SALIDA"
# Caddy queda sirviendo el temporal, pero si su contenedor se reinicia (reinicio del VPS, un `up` que lo
# recree) vuelve a leer el fichero MONTADO, el del árbol de trabajo. Tras una vuelta atrás son distintos,
# y ese reinicio cambiaría la configuración sin que nadie lo vea. Se avisa; no se cambia nada.
if ! git show "$SHA:caddy/Caddyfile" | cmp -s - caddy/Caddyfile; then
  echo
  echo "AVISO: Caddy sirve el Caddyfile de $SHA, pero el del disco (caddy/Caddyfile) es otro; si el"
  echo "contenedor de Caddy se reinicia, cargará el del disco. Para fijarlo, deja el árbol en $SHA o"
  echo "vuelve a desplegar."
fi

# --- Historial: una línea por despliegue con éxito. Es de donde `limpiar.sh` saca la versión ANTERIOR
#     (lo único que no se le puede preguntar a Docker). Sin repetir la última si se vuelve a aplicar. ---
HISTORIAL="${DEPLOY_HISTORIAL:-.despliegues}"
if [ "$(tail -1 "$HISTORIAL" 2>/dev/null || true)" != "$SHA" ]; then
  echo "$SHA" >>"$HISTORIAL"
fi

echo
echo "DESPLEGADO $SHA (el health responde ok con ese commit, el worker late con él y Caddy sirve su Caddyfile)."
if [ -n "$ACTUAL" ] && [ "$ACTUAL" != "$SHA" ]; then
  echo "Para volver a la versión anterior: ./scripts/deploy.sh $ACTUAL"
fi

# --- Limpieza: la ÚNICA forma de limpiar (`limpiar.sh`): conserva lo desplegado y lo anterior. Si falla,
#     el despliegue YA está hecho y comprobado: se avisa, no se deshace nada. ------------------------------
paso "Limpieza de disco"
./scripts/limpiar.sh || echo "AVISO: la limpieza no terminó; el despliegue está bien. Repítela con ./scripts/limpiar.sh" >&2
