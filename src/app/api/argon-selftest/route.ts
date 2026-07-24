import { NextResponse } from "next/server";

/**
 * ENDPOINT TEMPORAL — verificar que argon2 (modulo NATIVO) funciona en el hosting
 * compartido de Hostinger antes de construir la autenticacion encima. Se despliega,
 * se comprueba y SE ELIMINA. No maneja contrasenas reales: hashea y verifica una
 * cadena de autotest fija.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const argon2 = await import("argon2");
    const SELFTEST = "dareflash-argon-selftest";
    const hash = await argon2.hash(SELFTEST, { type: argon2.argon2id });
    const ok = await argon2.verify(hash, SELFTEST);
    const rejectsWrong = !(await argon2.verify(hash, "valor-incorrecto"));

    return NextResponse.json({
      ok: ok && rejectsWrong,
      lib: "argon2",
      // Solo el prefijo del algoritmo (no es un secreto): confirma que es argon2id.
      algo: hash.slice(0, hash.indexOf("$", 1) + 1) + "argon2id-ok",
      variantPrefix: hash.slice(0, 12),
    });
  } catch (error) {
    // Si el binario nativo no carga en Hostinger, caemos aqui.
    return NextResponse.json(
      {
        ok: false,
        lib: "argon2",
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
