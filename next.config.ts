import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Salida autocontenida para una imagen Docker ligera (VPS): Next traza las
  // dependencias necesarias y emite `.next/standalone` con un server.js minimo.
  output: "standalone",
  // Paquetes que NO deben empaquetarse en el bundle del servidor: nativos (argon2)
  // o clientes de infraestructura. Se tratan como externos y se resuelven en runtime.
  serverExternalPackages: ["argon2", "@prisma/adapter-mariadb", "mariadb", "nodemailer"],
  // argon2 es NATIVO (lo usa la capa de sesion/auth PROPIA, no Auth.js —descartado—). El tracing
  // de modulos nativos no siempre los arrastra, asi que se fuerza su inclusion —con sus deps de
  // runtime y el binario .node— para que la imagen standalone lo lleve con seguridad.
  outputFileTracingIncludes: {
    "/**": [
      "./node_modules/argon2/**",
      "./node_modules/@phc/format/**",
      "./node_modules/node-gyp-build/**",
    ],
  },
  // BLOQUEO DE INDEXACION (decision de Junior: dareflash.com NO se indexa hasta la Fase 1).
  // Cabecera en TODAS las rutas: robots.txt evita el RASTREO, pero Google puede indexar igual una
  // URL que le llega enlazada desde fuera; esta cabecera es la que impide DE VERDAD la indexacion.
  // VA FIJO EN CODIGO, sin variable de entorno: `next build` corre SIN variables (asi construye
  // Docker) y un valor leido de env se hornearia mal. Quitarlo el dia del lanzamiento es un cambio
  // de UNA linea y debe ser una decision CONSCIENTE (tests/noindex.test.ts salta si se quita).
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" }],
      },
    ];
  },
};

export default nextConfig;
