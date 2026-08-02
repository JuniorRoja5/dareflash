# Procedencia — skills de Trail of Bits

Material de terceros vendorizado (copiado) en este directorio para uso interno de auditoría de
seguridad asistida. **No es código fuente nuestro; no es obra derivada de nuestro código.**

## Origen y atribución (CC-BY-SA-4.0)

- **Material:** Trail of Bits — *skills* (skills de seguridad para agentes de código).
- **Autor:** Trail of Bits.
- **Fuente:** https://github.com/trailofbits/skills
- **Commit fijado:** `1256982d4d925a0acfe11e26c2253c32052c6247` (nunca `main` ni marketplace flotante).
- **Licencia:** Creative Commons Attribution-ShareAlike 4.0 International (CC-BY-SA-4.0).
  Texto completo en [`LICENSE`](./LICENSE) de este mismo directorio.
  https://creativecommons.org/licenses/by-sa/4.0/
- **Fecha de copia:** 2026-08-02.
- **Aprobó la vendorización:** Junior.

## Cambios sobre el material: NINGUNO

Cada fichero de terceros incluido (`.md`, `.ql`, `.yaml`, `LICENSE`) es **byte-idéntico** al del
commit de origen. Verificado con `git hash-object` == SHA de blob del árbol del commit: **22/22
coincidencias, 0 mismatches** (salida en [`INVENTARIO.md`](./INVENTARIO.md)). No se ha editado,
traducido, reordenado ni "adaptado" ningún fichero.

Sí se han **excluido ficheros completos** (runners de terceros, ejecutables, logos y plantillas de
lenguajes que no usamos); la lista exacta con su motivo está en [`INVENTARIO.md`](./INVENTARIO.md).
Excluir ficheros enteros no es modificar los que quedan.

Si algún día queremos reglas propias, van en un fichero **nuestro**, aparte, fuera de este
directorio — no se mezclan con el material de terceros (obligación del *share-alike*).

## Por qué copiar y no enlazar

Una skill es una instrucción que el agente **obedece**, y varias declaran `Bash`/`WebFetch`. Si
apuntáramos a su repositorio, un cambio suyo alteraría nuestro comportamiento sin revisión.
Copiado y fijado al SHA, cualquier actualización futura entra como **diff** y pasa el mismo control
que cualquier otro cambio del proyecto. El repo es **público**: copiar es redistribución pública,
por eso la atribución de arriba es obligación, no cortesía.

## Estado: VENDORIZADO, no habilitado

Vendorizar (copiar al repo para revisar como diff) **no es** habilitar (cargar en `.claude/skills/`).
**No se ha ejecutado ninguna skill.** La primera pasada de auditoría —solo la superficie de auth
(`src/server/auth/`, `src/server/security/`, `src/server/services/` email-verification y ledger,
`src/app/api/auth/`)— va en una ronda aparte, con el visto bueno de Junior.

## Skills incluidas (5)

`insecure-defaults`, `differential-review`, `variant-analysis`, `vulnerability-triage-brocards`,
`fp-check`. Todas de solo lectura / razonamiento local; verificado que su cuerpo no usa la red.

## Descartadas (no entran, ni con permiso puntual)

Regla de Junior: *nada de enviar nosotros nada a ninguna parte*.

- **`second-opinion`** — hace shell-out a CLIs de LLM externos (OpenAI Codex / Google Gemini) y les
  manda nuestro código.
- **`semgrep-rule-creator`** — usa `WebFetch`. Las reglas propias se escriben a mano.

## Aplazadas (fuera de esta tanda)

- **`constant-time-analysis`** — NO es de solo lectura: ejecuta un analizador Python
  (`uv run ct_analyzer/analyzer.py`), que no tenemos (ni `uv` ni el paquete), y apunta a cripto
  nativa/bytecode, no a nuestro TypeScript. Una skill que no podemos ejecutar es cobertura falsa
  (mismo patrón que un comentario que promete una protección inexistente). Nuestra exposición a
  fugas de tiempo ya está atendida en el código (argon2, `verifyPasswordConstantTime` contra un
  hash señuelo, tokens buscados por índice en BD).
- **`static-analysis/semgrep`** — el binario no está instalado y su método exige rulesets de
  terceros del registro (red). No se pueden cumplir las condiciones (reglas locales + `--metrics=off`
  + ejecución sin red demostrada).
- **`static-analysis/codeql`** — pesada (construye base de datos y compila). Segunda vuelta, solo si
  semgrep se queda corto.
- **`supply-chain-risk-auditor`**, **`agentic-actions-auditor`** — fuera de la superficie de auth
  de esta primera pasada.
