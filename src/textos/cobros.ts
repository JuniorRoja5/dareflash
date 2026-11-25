/**
 * EL NOMBRE DE UN MÉTODO DE COBRO EN EL IDIOMA DE LA PÁGINA (Fase 11 · P5b2a). El mismo criterio que
 * `nombreDeMetodo` (lib/retirada, el del panel): la cuenta bancaria por su nombre y, FAIL-OPEN, un
 * genérico para un método que ya no está en el catálogo. Pura: recibe la `t` del espacio `cobros`.
 */
import type { FuncionT } from "./plantilla";
import type { Textos } from "./servidor";

export function nombreMetodo(t: FuncionT<Textos["cobros"]>, m: { metodo: string }): string {
  return m.metodo === "BANK" ? t("metodo_BANK") : t("metodoGenerico");
}
