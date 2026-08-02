# Inventario — vendorizado de skills de Trail of Bits

Origen: `github.com/trailofbits/skills` @ `1256982d4d925a0acfe11e26c2253c32052c6247`.
Fecha: 2026-08-02. Ver [`PROCEDENCIA.md`](./PROCEDENCIA.md) para atribución, licencia y estado.

## Integridad: byte-idéntico al origen

Cada fichero de terceros incluido se verificó con `git hash-object` contra el SHA de blob del
árbol del commit de origen. **Resultado: 22/22 coincidencias, 0 mismatches.** Nada se ha
modificado.

## Incluido (material de terceros, sin modificar)

```
LICENSE                                                  (CC-BY-SA-4.0, íntegra)
insecure-defaults/SKILL.md
insecure-defaults/references/examples.md
differential-review/SKILL.md
differential-review/adversarial.md
differential-review/methodology.md
differential-review/patterns.md
differential-review/reporting.md
variant-analysis/SKILL.md
variant-analysis/METHODOLOGY.md
variant-analysis/resources/variant-report-template.md
variant-analysis/resources/codeql/javascript.ql
variant-analysis/resources/semgrep/javascript.yaml
vulnerability-triage-brocards/SKILL.md
vulnerability-triage-brocards/references/brocards-detail.md
fp-check/SKILL.md
fp-check/references/bug-class-verification.md
fp-check/references/deep-verification.md
fp-check/references/evidence-templates.md
fp-check/references/false-positive-patterns.md
fp-check/references/gate-reviews.md
fp-check/references/standard-verification.md
```

Ficheros nuestros (no son de terceros, documentan la vendorización): `PROCEDENCIA.md`,
`INVENTARIO.md`, `.gitattributes`.

## Excluido (copiado el directorio entero y luego retirado por lista explícita)

| Fichero(s) | Motivo |
|---|---|
| `insecure-defaults/agents/openai.yaml`, `differential-review/agents/openai.yaml`, `variant-analysis/agents/openai.yaml`, `fp-check/agents/openai.yaml` | Configuración para correr la skill bajo runners de terceros (OpenAI Codex). No los usamos, y es justo el tipo de fichero que podría redirigir comportamiento. |
| `insecure-defaults/assets/trail-of-bits-mark.svg`, `differential-review/assets/…`, `variant-analysis/assets/…`, `fp-check/assets/…` | Logo/marca de Trail of Bits. Sin función, y es su marca. |
| `variant-analysis/resources/codeql/{cpp,go,java,python}.ql` (4) | Plantillas CodeQL de lenguajes que no usamos. Conservada la de `javascript`. |
| `variant-analysis/resources/semgrep/{cpp,go,java,python}.yaml` (4) | Plantillas Semgrep de lenguajes que no usamos. Conservada la de `javascript`. |

`constant-time-analysis` y las demás **aplazadas/descartadas** no se copiaron en absoluto; motivos
en [`PROCEDENCIA.md`](./PROCEDENCIA.md).

## Divergencia documentada — variant-analysis

variant-analysis: el apartado Resources del SKILL.md (líneas 134-142) lista plantillas .ql/.yaml
para python, javascript, java, go y cpp. Vendorizadas SOLO las de javascript (útiles para nuestro
TypeScript). Las otras 8 se excluyen por la norma de no copiar plantillas de lenguajes que no
usamos. NO es una rotura: el apartado es un índice informativo; el cuerpo del método (líneas
1-130) no carga ninguna plantilla ni menciona lenguaje alguno. Verificado contra el SHA
1256982… El fichero NO se ha modificado (licencia CC-BY-SA: no se crean obras derivadas).

## Comprobación de referencias

Para cada `.md` copiado se extrajeron las referencias a otros ficheros y se clasificaron contra
el origen: `OK` (existía en origen y sigue en la copia) / `EXCLUIDO-REFERENCIADO` (existía en
origen pero se excluyó). Resultado:

```
===== insecure-defaults =====        (sin referencias no resueltas)
===== differential-review =====      (sin referencias no resueltas)
===== variant-analysis =====
  EXCLUIDO-REFERENCIADO  resources/codeql/cpp.ql       (ref en SKILL.md)
  EXCLUIDO-REFERENCIADO  resources/semgrep/cpp.yaml    (ref en SKILL.md)
  EXCLUIDO-REFERENCIADO  resources/codeql/go.ql        (ref en SKILL.md)
  EXCLUIDO-REFERENCIADO  resources/semgrep/go.yaml     (ref en SKILL.md)
  EXCLUIDO-REFERENCIADO  resources/codeql/java.ql      (ref en SKILL.md)
  EXCLUIDO-REFERENCIADO  resources/semgrep/java.yaml   (ref en SKILL.md)
  EXCLUIDO-REFERENCIADO  resources/codeql/python.ql    (ref en SKILL.md)
  EXCLUIDO-REFERENCIADO  resources/semgrep/python.yaml (ref en SKILL.md)
===== vulnerability-triage-brocards =====   (sin referencias no resueltas)
===== fp-check =====                 (sin referencias no resueltas)
```

Las 8 de variant son el índice del apartado Resources (ver divergencia arriba): índice
informativo, no carga funcional; decisión de Junior = mantener y documentar. El resto resuelve.
Señales del primer barrido que resultaron ser prosa, NO ficheros: `hashlib.md` era
`hashlib.md5(password)` en un snippet Python; los `*.py` (app.py, auth.py, config.py…) son
ejemplos de código dentro del markdown; `DIFFERENTIAL_REVIEW_REPORT.md` es el nombre del informe
que differential-review genera, no un acompañante.

Criterio aplicado (para futuras vendorizaciones): si el cuerpo INSTRUYE cargar un fichero ausente
→ rotura funcional, parar y preguntar; si solo lo MENCIONA en un índice/lista → divergencia, se
documenta aquí y se sigue.
