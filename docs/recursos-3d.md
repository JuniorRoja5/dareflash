# Recursos 3D de la portada

Las imágenes 3D de `/inicio` (el rayo del hero, la moneda junto a los premios, el trofeo de «Últimos
ganadores» y los tres pasos de «Cómo funciona»).

## Procedencia y licencia

**Aportados por Junior; licencia de uso público.**

| Fichero original   | Dónde se usa               | Licencia             |
| ------------------ | -------------------------- | -------------------- |
| `rayo.png`         | Hero                       | Uso público (Junior) |
| `moneda.png`       | Cifras de premios del hero | Uso público (Junior) |
| `trofeo.png`       | «Últimos ganadores»        | Uso público (Junior) |
| `paso-1-reto.png`  | «Cómo funciona», paso 1    | Uso público (Junior) |
| `paso-2-video.png` | «Cómo funciona», paso 2    | Uso público (Junior) |
| `paso-3-voto.png`  | «Cómo funciona», paso 3    | Uso público (Junior) |

Los metadatos de los originales no llevan ninguna licencia que exija atribución (solo el programa con el
que se exportaron), así que no se añade ninguna atribución en la web.

## Originales y versiones servidas

- Los **originales** (PNG de 512 × 512 con transparencia) viven en `recursos/3d/`, **fuera del
  repositorio** (`.gitignore` y `.dockerignore`): el repositorio es público y no se redistribuyen.
- Lo que se sirve son las versiones optimizadas de `public/img/3d/` (AVIF y WebP, a 1× y 2×, una por
  tema), que sí se versionan. Las genera `scripts/optimizar-recursos-3d.mjs`:

  ```bash
  node scripts/optimizar-recursos-3d.mjs
  ```

- El **color** sale de los tokens de cada tema (`--df-action` el rayo, `--df-money` la moneda,
  `--df-rank` el trofeo; los pasos, en neutro), leídos de `src/app/globals.css`: si cambia la paleta, se
  vuelve a ejecutar el script. El glow no va en la imagen: lo pone la página con los tokens.
- Ninguna se pinta a más de su tamaño 1× (los originales son de 512 px: más grandes se verían borrosas),
  y ninguna pasa de 80 KB (el script falla si pasara).
