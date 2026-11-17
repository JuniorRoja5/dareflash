#!/usr/bin/env bash
# LA SUITE ENTERA CON EL RELOJ ADELANTADO (Fase 11 · PT). Uso: bash scripts/ci-tests-reloj-adelantado.sh <días>
#
# Por qué existe: el 2026-11-15 `empresa-retos` se puso rojo en TODAS las ramas, main incluida, sin que
# nadie tocara nada. Fijaba `AHORA = 2026-11-05`, creaba propuestas que cerraban diez días después y
# preguntaba el estado con el reloj REAL. Un test así es una bomba con fecha: verde hasta el día que el
# calendario pasa sus fechas. Este job adelanta el reloj HOY, así que la bomba estalla en la rama que la
# mete, no meses después en la de otro.
#
# Cómo: libfaketime (LD_PRELOAD) adelanta el reloj de pared de Node y de cada worker de vitest (heredan
# el entorno). El MONÓTONO no se toca (FAKETIME_DONT_FAKE_MONOTONIC): los temporizadores, el driver de
# MariaDB y los timeouts de vitest siguen a velocidad real.
#
# MariaDB NO se adelanta, a propósito: un test que siembra con la hora de Node y pregunta con NOW() de la
# BD mezcla dos relojes, y aquí se ve (pasó con `boost-indice-vigentes`). Los servicios reciben `ahora`
# desde Node; la BD solo pone `updatedAt`.
#
# Solo Linux (Debian/Ubuntu): libfaketime no existe en Windows. En local, el mismo comando dentro de un
# contenedor `node:<versión de .nvmrc>` con el paquete `faketime`.
set -euo pipefail

DIAS="${1:?uso: ci-tests-reloj-adelantado.sh <días>}"
[[ "$DIAS" =~ ^[0-9]+$ ]] || { echo "días no es un número: '$DIAS'" >&2; exit 2; }

LIB="$(dpkg -L libfaketime 2>/dev/null | grep -E '/libfaketime\.so\.1$' | head -n1 || true)"
[[ -n "$LIB" && -f "$LIB" ]] || { echo "falta libfaketime (apt-get install faketime)" >&2; exit 2; }

# La hora REAL, antes de adelantar nada: con ella se comprueba que el adelanto se aplica de verdad.
REAL="$(date +%s)"

export LD_PRELOAD="$LIB"
export FAKETIME="+${DIAS}d"
export FAKETIME_DONT_FAKE_MONOTONIC=1
# Lo lee `tests/reloj-adelantado.test.ts` para comprobar, DESDE un worker de vitest, que el adelanto
# llega hasta donde corren los tests (si no llegara, este job sería verde sin mirar nada).
export TEST_RELOJ_ADELANTADO_DIAS="$DIAS"

VISTO="$(node -e 'process.stdout.write(String(Math.floor(Date.now() / 1000)))')"
ADELANTO=$(( (VISTO - REAL) / 86400 ))
if (( ADELANTO < DIAS - 1 )); then
  echo "::error::el reloj de Node no se ha adelantado: ve +${ADELANTO} días, se pidieron +${DIAS}" >&2
  exit 1
fi
echo "Reloj de Node adelantado +${ADELANTO} días: $(node -e 'process.stdout.write(new Date().toISOString())')"

npx vitest run
