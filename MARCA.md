# MARCA.md

La marca, **en lo que afecta al código**. No es el brief: el brief decide, esto traduce la decisión a
reglas que se pueden comprobar. Si los dos se contradicen, manda el brief y este fichero está
desactualizado.

Para qué sirve: para que quien toque un color sepa **dónde** se toca, **qué significa** lo que está
tocando y **qué tiene que seguir siendo verdad** después. Para qué no sirve: para elegir un color. Eso
no se decide aquí.

## 1. La dirección

**Verde y blanco.** El verde es el color de la marca y el de la acción; el blanco es el aire del tema
claro. El realce ambiental (el "glow") es verde, y el logotipo es una marca gráfica propia —rayo en
círculo— que toma su color de los tokens, no de valores incrustados.

Los dos temas están repintados: la acción es `#2be84b` en oscuro y `#15803d` en claro, el mismo verde
ajustado a su fondo. Esos valores están **firmados**, y los clava
[tests/marca-v3-firmada.test.ts](tests/marca-v3-firmada.test.ts) con las cifras escritas, no leyendo
el token (un test que lea la constante para compararla consigo misma está siempre verde).

Tres cosas que el repintado dejó decididas y conviene no redescubrir:

- **La confirmación es un TEAL, no una menta.** Con la acción en verde, una menta se le quedaba a ΔE
  8,7 —el mínimo son 15— y "confirmado" se leía como "pulsa aquí".
- **El dinero se quedó en el lima**, movido lo justo (ΔE 2,8). Es lo que compra el margen de la regla
  de oro sin tocar el verde de marca: en oscuro los dos brillan, así que quien los separa es el TONO.
- **Los oscuros tiran a verde**, no a azul: dos temperaturas discutiendo se nota aunque nadie sepa
  decir por qué.

El tema claro está en el **techo de AA** y por eso no se subió de brillo: medido, un verde más claro
deja el texto del CTA en 3,31:1.

**El tinte ambiental pesa MÁS en claro, que es lo contrario de lo que dice la intuición.** Sobre
negro un color saturado al 18% es luz y con poco basta; sobre blanco solo puede restar luminosidad,
así que el mismo número se lee casi la mitad (ΔE 20,1 contra 11,9). Las fuerzas van por tema
(`--df-glow-*-fuerza`, `--df-halo-fuerza`) y el techo no es de gusto: por encima, el texto
secundario deja de leerse **encima del tinte**.

## 2. El color se usa por TOKEN, nunca por valor

Un color se escribe una vez, en [src/app/globals.css](src/app/globals.css), como token `--df-*`, y se
usa siempre a través de él (`var(--df-action)`, o la utilidad de Tailwind que lo envuelve). En una
vista no hay hex. Los cuatro sitios donde sí hay, y por qué, están en la sección 5; no hay un quinto,
y el censo de [tests/marca-hex-duplicados.test.ts](tests/marca-hex-duplicados.test.ts) lo vigila.

**Un comentario también nombra el token, no el color.** Decir "el botón magenta" en un docblock
convierte ese comentario en mentira el día del repintado, y hay docenas así de la paleta anterior. Lo
correcto es "el botón de `--df-action`": sigue siendo verdad en cualquier tema y en cualquier versión
de la marca.

## 3. Un trabajo por token

| token                          | trabajo                                                           |
| ------------------------------ | ----------------------------------------------------------------- |
| `--df-action`                  | la acción principal. **Una por pantalla.**                        |
| `--df-money`                   | dinero y solo dinero: premios, saldo, bote. Nunca un recuento.    |
| `--df-time`                    | tiempo restante no crítico                                        |
| `--df-alarm`                   | tiempo crítico (<24 h) **y** error/peligro                        |
| `--df-ok`                      | confirmaciones                                                    |
| `--df-rank`                    | el oro del podio (y el emblema de Legend, que es el mismo oro)    |
| `--df-silver`/`--bronze`       | exclusivos de las medallas del puesto 2 y 3                       |
| `--df-nivel-*`                 | el emblema de cada nivel; misma familia de color en los dos temas |
| `--df-void`/`surface`/`raised` | la profundidad se da por LUMINOSIDAD, no por sombra               |
| `--df-qr-tinta`/`fondo`        | el QR **no sigue al tema**: lo lee una cámara, no una persona     |

Los puntos, los votos y los recuentos van en **neutro**. Que una cifra sea grande no la convierte en
dinero.

## 4. La regla de oro: ACCIÓN ≠ DINERO

Son los dos colores que la gente usa para decidir, y no pueden confundirse nunca. Mientras la acción
fue magenta y el dinero lima, la regla se cumplía sola por el tono. Con la acción en verde ya no: hay
que medirla, y además hay que medir las dos parejas que el verde pone en riesgo sin que se note —la
acción contra `--df-ok` (los dos verdes) y el dinero contra `--df-rank` (los dos dorados)—. Las tres
son casos de test, no buenas intenciones.

## 5. Los cuatro sitios con un hex escrito a mano

Ninguno es un descuido: en los cuatro, el token **no llega**.

| fichero                                                        | por qué                                                 |
| -------------------------------------------------------------- | ------------------------------------------------------- |
| [src/server/email/plantilla.ts](src/server/email/plantilla.ts) | un cliente de correo no lee custom properties           |
| [src/app/icon.svg](src/app/icon.svg)                           | el favicon se sirve suelto, sin la página que lo enlaza |
| [src/lib/tema.ts](src/lib/tema.ts) (`TEMA_COLOR_BARRA`)        | la meta `theme-color` necesita un literal               |
| [src/app/style-guide/page.tsx](src/app/style-guide/page.tsx)   | publica los valores como texto: es la referencia        |

**Un repintado los mueve todos a la vez.** El fallo que esto evita no revienta nada: el producto
cambia de color y los correos, la barra del navegador y el icono de la pestaña se quedan con el color
viejo. Nadie se entera hasta que un usuario manda una captura.

## 6. Lo que está medido, y quién lo mide

Nada de esto se revisa a ojo. Contraste WCAG para "¿se lee?" y CIEDE2000 (ΔE) para "¿se distinguen?",
con las fórmulas en [tests/helpers/color.ts](tests/helpers/color.ts) y la paleta leída del CSS por
[tests/helpers/paleta.ts](tests/helpers/paleta.ts).

| qué                                                                                            | mínimo |
| ---------------------------------------------------------------------------------------------- | ------ |
| texto principal sobre el fondo y sobre la tarjeta                                              | 7:1    |
| texto secundario, y cualquier color usado COMO texto                                           | 4.5:1  |
| el texto de un CTA sólido sobre su propio relleno                                              | 4.5:1  |
| un gráfico (medallas, emblemas, aros)                                                          | 3:1    |
| ΔE acción vs dinero                                                                            | 20     |
| ΔE entre significados vecinos (los dos verdes, los dos dorados, tiempo vs alarma, los metales) | 15     |
| ΔE entre dos niveles                                                                           | 20     |
| ΔE de un nivel contra un token semántico                                                       | 8      |

Quién lo comprueba:

- [tests/paleta-clara.test.ts](tests/paleta-clara.test.ts) — el tema claro, y que `/style-guide` no
  publique un valor que ya no existe.
- [tests/paleta-oscura.test.ts](tests/paleta-oscura.test.ts) — el tema oscuro. Mide el par **real**
  del CTA sólido leyéndolo de `botonTokens`, porque ahí el texto es oscuro sobre el relleno y
  suponerlo blanco daría una medida que nadie usa.
- [tests/paleta-niveles.test.ts](tests/paleta-niveles.test.ts) — los emblemas, en los dos temas.
- [tests/marca-hex-duplicados.test.ts](tests/marca-hex-duplicados.test.ts) — los cuatro hex de la
  sección 5, y el censo de que no haya un quinto.
- [tests/glow-por-tema.test.ts](tests/glow-por-tema.test.ts) — la fuerza del tinte verde, que va por
  TEMA, y el contraste del texto **sobre el fondo ya tintado**. Es la medida que faltaba: las demás
  comparan token contra token, pero donde el glow pega el fondo deja de ser `--df-void`.
- [tests/marca-prosa.test.ts](tests/marca-prosa.test.ts) — ningún comentario nombra un color, y el
  realce del dinero se llama por su trabajo.
- [tests/marca-v3-firmada.test.ts](tests/marca-v3-firmada.test.ts) — los valores firmados, clavados
  con cifras escritas, y que no sobreviva ningún magenta ni morado en el repositorio. Los otros
  cuatro miden **cualquier** paleta y sobreviven al próximo repintado; este clava **esta**. Hacen
  falta los dos: medir sin clavar deja que el verde se vaya moviendo un dígito cada vez, y clavar
  sin medir no dice si lo clavado se lee.

## 7. Movimiento

Discreto y de interfaz, nunca del contenido. En un bucle se animan **solo** `opacity` y `transform`:
cualquier otra propiedad obliga al navegador a recalcular la página en cada fotograma. Las duraciones
son tokens (`--df-dur-*`), y `prefers-reduced-motion` apaga todas las animaciones y transiciones de
forma global — así que una animación nueva en CSS ya viene cubierta; una hecha en JavaScript, no: esa
tiene que preguntar.

## 8. Qué puede cambiar, y quién

Los **valores** de la paleta se cambian en `globals.css`, y después se pasan los tests de la sección
6: si alguno se pone rojo, el valor rompe un significado y no entra. Los **significados** —qué
trabajo tiene cada token, cuántos acentos lleva una pantalla, qué familia es cada nivel— y ampliar la
paleta con un color nuevo son decisiones de marca, no de implementación: se deciden en el brief y
luego bajan aquí.
