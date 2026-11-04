import { Boton } from "@/components/ui/boton";
import { Tarjeta } from "@/components/ui/tarjeta";
import { MSG_EMPRESA_SIN_VERIFICAR } from "@/config/constants";

/**
 * EL CORREO SIN VERIFICAR, CONTADO. Las dos pantallas del portal lo usan, y las dos CUENTAN qué
 * falta en vez de rebotar a la portada: quien acaba de registrarse y no ha confirmado el correo no
 * tiene por qué deducir por qué no puede seguir.
 *
 * El mismo texto que devuelve la ruta (`MSG_EMPRESA_SIN_VERIFICAR`): una sola frase para la barrera,
 * aquí y en la API.
 */
export function AvisoVerificar() {
  return (
    <Tarjeta className="max-w-prose">
      <h2 className="text-sm font-semibold text-text">Antes, confirma tu correo</h2>
      <p className="mt-2 text-sm text-text-dim">{MSG_EMPRESA_SIN_VERIFICAR}</p>
      <Boton href="/perfil" variante="secundario" className="mt-4">
        Ir a mi cuenta
      </Boton>
    </Tarjeta>
  );
}
