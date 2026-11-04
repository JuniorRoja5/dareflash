import { Boton } from "@/components/ui/boton";
import { Tarjeta } from "@/components/ui/tarjeta";
import {
  CAMINO_EMPRESA,
  CAMINO_PARTICIPANTE,
  SUBTITULO_EMPEZAR,
  TITULO_EMPEZAR,
  msgSocioFundador,
} from "@/config/constants";

export const metadata = { title: "Empezar · DareFlash" };

/**
 * /empezar — ¿CÓMO QUIERES USAR DAREFLASH?
 *
 * Existe porque hay DOS cuentas que no se pueden mezclar: la de participante (sube, vota, gana) y
 * la de empresa (mira, patrocina, se anuncia). Sin esta pantalla, un negocio se registraba como
 * participante —el único registro que había— y después pedía por soporte que le convirtieran la
 * cuenta, que es justo lo que no se puede hacer.
 *
 * UN SOLO ACENTO. El sistema reserva `--df-action` para una acción por pantalla, y aquí la
 * principal es participar: es el producto. El camino del negocio va en secundario, que lo hace
 * igual de visible sin competir por el mismo color.
 *
 * ESTÁTICA a propósito: no lee sesión ni base de datos, así que no necesita `force-dynamic`.
 */
export default function PaginaEmpezar() {
  return (
    <div className="df-rise mx-auto w-full max-w-4xl px-4 py-10 lg:px-8 lg:py-16">
      <h1 className="text-3xl text-text">{TITULO_EMPEZAR}</h1>
      <p className="mt-2 max-w-prose text-sm text-text-dim">{SUBTITULO_EMPEZAR}</p>

      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        <Tarjeta className="flex flex-col">
          <h2 className="text-lg text-text">{CAMINO_PARTICIPANTE.titulo}</h2>
          <p className="mt-2 flex-1 text-sm text-text-dim">{CAMINO_PARTICIPANTE.cuerpo}</p>
          <Boton href={CAMINO_PARTICIPANTE.href} className="mt-5 self-start">
            {CAMINO_PARTICIPANTE.cta}
          </Boton>
        </Tarjeta>

        <Tarjeta className="flex flex-col">
          <h2 className="text-lg text-text">{CAMINO_EMPRESA.titulo}</h2>
          <p className="mt-2 text-sm text-text-dim">{CAMINO_EMPRESA.cuerpo}</p>
          {/* El aviso se construye con las constantes (fecha y cifra), nunca escrito a mano: si se
              mueven, la promesa se mueve con ellas. */}
          <p className="mt-3 flex-1 text-sm text-text">{msgSocioFundador()}</p>
          <Boton href={CAMINO_EMPRESA.href} variante="secundario" className="mt-5 self-start">
            {CAMINO_EMPRESA.cta}
          </Boton>
        </Tarjeta>
      </div>
    </div>
  );
}
