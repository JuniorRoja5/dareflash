import { Boton } from "@/components/ui/boton";
import { Tarjeta } from "@/components/ui/tarjeta";
import { textos } from "@/textos/servidor";

/**
 * EL CORREO SIN VERIFICAR, CONTADO. Las pantallas del portal lo usan, y todas CUENTAN qué falta en vez
 * de rebotar a la portada: quien acaba de registrarse y no ha confirmado el correo no tiene por qué
 * deducir por qué no puede seguir.
 *
 * Sus palabras, en el diccionario (`portalAviso`, P5b2b): solo lo pinta el portal.
 */
export async function AvisoVerificar() {
  const t = await textos("portalAviso");
  return (
    <Tarjeta className="max-w-prose">
      <h2 className="text-sm font-semibold text-text">{t("titulo")}</h2>
      <p className="mt-2 text-sm text-text-dim">{t("texto")}</p>
      <Boton href="/perfil" variante="secundario" className="mt-4">
        {t("cta")}
      </Boton>
    </Tarjeta>
  );
}
