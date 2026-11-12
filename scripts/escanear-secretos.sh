#!/usr/bin/env bash
# ESCÁNER DE SECRETOS (gitleaks v8.30.1, reglas en .gitleaks.toml). Corre en Docker para que nadie tenga
# que instalar un binario: el mismo en CI y en el ordenador de cada uno.
#
#   scripts/escanear-secretos.sh preparado   lo que se va a CONFIRMAR (el pre-commit de .husky)
#   scripts/escanear-secretos.sh arbol       TODOS los ficheros versionados, tal como están en disco
#                                            (lo que corre CI antes de los tests)
#
# `arbol` copia SOLO lo versionado a un directorio temporal y escanea eso: así ni el `.env` local (que sí
# lleva claves, y no se sube) ni `node_modules` ni `.next` entran en el resultado. Sale con código distinto
# de cero si encuentra algo; el detalle sale redactado (sin el valor).
set -euo pipefail
cd "$(dirname "$0")/.."

IMAGEN="ghcr.io/gitleaks/gitleaks:v8.30.1"

if ! docker info >/dev/null 2>&1; then
  echo "escáner de secretos: Docker no responde. Arráncalo (es el mismo que usa la BD de desarrollo)." >&2
  exit 1
fi

# Docker en Windows quiere la ruta de Windows; en Linux, la de siempre.
ruta() { if command -v cygpath >/dev/null 2>&1; then cygpath -w "$1"; else echo "$1"; fi; }

case "${1:-}" in
  preparado)
    # gitleaks lee el índice con git DENTRO del contenedor, que corre con otro usuario: sin
    # `safe.directory`, git se niega a leer un repositorio que no es suyo.
    MSYS_NO_PATHCONV=1 docker run --rm \
      -v "$(ruta "$PWD"):/repo" -w /repo \
      -e GIT_CONFIG_COUNT=1 -e GIT_CONFIG_KEY_0=safe.directory -e GIT_CONFIG_VALUE_0='*' \
      "$IMAGEN" git --pre-commit --staged --config .gitleaks.toml --no-banner --redact -v .
    ;;
  arbol)
    TMP=$(mktemp -d)
    trap 'rm -rf "$TMP"' EXIT
    # `--ignore-failed-read`: un fichero versionado que se ha borrado del disco y aún no está confirmado.
    git ls-files -z | tar --null -T - --ignore-failed-read -cf - 2>/dev/null | tar -xf - -C "$TMP"
    MSYS_NO_PATHCONV=1 docker run --rm \
      -v "$(ruta "$TMP"):/arbol:ro" -w /arbol \
      "$IMAGEN" dir . --config .gitleaks.toml --no-banner --redact -v
    ;;
  *)
    echo "Uso: scripts/escanear-secretos.sh preparado|arbol" >&2
    exit 2
    ;;
esac
