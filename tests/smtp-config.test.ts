/**
 * LA CONFIGURACIÓN DE SMTP SE QUEJA CON NOMBRE Y APELLIDOS.
 *
 * ┌─ POR QUÉ IMPORTA EL NOMBRE DE LA VARIABLE ──────────────────────────────────────────────────┐
 * │ Un correo que no sale no se nota: no hay error en pantalla, nadie reclama, y los jobs van    │
 * │ cayendo a FAILED uno a uno. La única pista es el mensaje del fallo — y si dice "faltan       │
 * │ variables SMTP_* / EMAIL_FROM", quien lo lee tiene que entrar al servidor a mirar las cinco. │
 * │ Decir EXACTAMENTE cuál falta es la diferencia entre arreglarlo en un minuto y una tarde.      │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ Y SE LLAMA `SMTP_PASSWORD`, NO `SMTP_PASS` ───────────────────────────────────────────────┐
 * │ Es el nombre que YA está en el `.env` del servidor. Renombrarlo en el código sin tocar el    │
 * │ servidor a la vez deja el correo muerto el día del despliegue, y con un error que nombra una │
 * │ variable que nadie ha visto nunca. Este test clava el nombre: si alguien lo cambia aquí,     │
 * │ tiene que acordarse del `.env` — que es justo lo que el rojo le va a recordar.                │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 */
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  leerConfigSmtp,
  mensajeSmtpIncompleto,
  variablesSmtpQueFaltan,
} from "../src/server/email/adapter";

const COMPLETA = {
  SMTP_HOST: "mail.example.test",
  SMTP_PORT: 465,
  SMTP_USER: "noreply@example.test",
  SMTP_PASSWORD: "secreto",
  EMAIL_FROM: "noreply@example.test",
};

describe("qué variables faltan", () => {
  it("con todo puesto, ninguna", () => {
    expect(variablesSmtpQueFaltan(COMPLETA)).toEqual([]);
  });

  it("nombra la que falta, una por una", () => {
    for (const clave of Object.keys(COMPLETA) as (keyof typeof COMPLETA)[]) {
      const faltando = { ...COMPLETA, [clave]: undefined };
      expect(variablesSmtpQueFaltan(faltando), clave).toEqual([clave]);
    }
  });

  it("y las nombra TODAS cuando falta más de una (no solo la primera)", () => {
    // Decir "falta SMTP_HOST", arreglarlo y volver a fallar por SMTP_USER es el bucle que hace
    // que un despliegue de cinco minutos dure una hora.
    const faltan = variablesSmtpQueFaltan({});
    expect(faltan).toEqual(["SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASSWORD", "EMAIL_FROM"]);
  });

  it("la contraseña se llama `SMTP_PASSWORD`, que es lo que hay en el `.env` del servidor", () => {
    expect(variablesSmtpQueFaltan({ ...COMPLETA, SMTP_PASSWORD: undefined })).toEqual([
      "SMTP_PASSWORD",
    ]);
  });

  it("una cadena vacía cuenta como ausente (un `.env` con `SMTP_PASSWORD=` no está configurado)", () => {
    expect(variablesSmtpQueFaltan({ ...COMPLETA, SMTP_PASSWORD: "" })).toEqual(["SMTP_PASSWORD"]);
  });
});

describe("el mensaje que acaba en el log", () => {
  it("lleva el nombre dentro y dice qué hacer", () => {
    const texto = mensajeSmtpIncompleto(["SMTP_PASSWORD"]);
    expect(texto).toContain("SMTP_PASSWORD");
    expect(texto).toMatch(/\.env/);
    expect(texto, "no dice la consecuencia: parece un aviso y es que no sale ni un correo").toMatch(
      /ningún correo sale/i,
    );
  });

  it("no es un mensaje genérico de los que no se pueden buscar", () => {
    expect(mensajeSmtpIncompleto(["SMTP_HOST"])).not.toMatch(/SMTP_\*/);
  });
});

describe("la lectura de la configuración", () => {
  it("completa, devuelve los valores ya estrechados", () => {
    const cfg = leerConfigSmtp(COMPLETA);
    expect(cfg.ok).toBe(true);
    if (cfg.ok) {
      expect(cfg.host).toBe("mail.example.test");
      expect(cfg.port).toBe(465);
      expect(cfg.password).toBe("secreto");
    }
  });

  it("incompleta, devuelve la lista y NADA más (no una config a medias)", () => {
    const cfg = leerConfigSmtp({ ...COMPLETA, SMTP_PASSWORD: undefined });
    expect(cfg.ok).toBe(false);
    if (!cfg.ok) expect(cfg.faltan).toEqual(["SMTP_PASSWORD"]);
  });
});

describe("el EHLO nunca puede anunciar el hostname del contenedor", () => {
  it("`SMTP_HELO_NAME` tiene DEFAULT en el esquema: no puede quedarse sin valor", () => {
    // Si fuera `.optional()` y el `.env` del servidor no la trajera, nodemailer anunciaría
    // `helo=[127.0.0.1]` y nada fallaría: se vería meses después, en la carpeta de spam de otros.
    const esquema = readFileSync("src/config/env.ts", "utf8");
    expect(esquema).toMatch(/SMTP_HELO_NAME:\s*z\.string\(\)[^\n]*\.default\(/);
    expect(esquema, "`SMTP_HELO_NAME` volvió a ser opcional-sin-valor").not.toMatch(
      /SMTP_HELO_NAME:\s*z\.string\(\)[^\n]*\.optional\(\)/,
    );
  });

  it("y el transporte lo pasa como `name` (que es lo que fija el EHLO)", () => {
    const adaptador = readFileSync("src/server/email/adapter.ts", "utf8");
    expect(adaptador).toMatch(/name:\s*env\.SMTP_HELO_NAME/);
  });
});
