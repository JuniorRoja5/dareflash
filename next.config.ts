import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Salida autocontenida para una imagen Docker ligera (VPS): Next traza las
  // dependencias necesarias y emite `.next/standalone` con un server.js minimo.
  output: "standalone",
  // Paquetes que NO deben empaquetarse en el bundle del servidor: nativos (argon2)
  // o clientes de infraestructura. Se tratan como externos y se resuelven en runtime.
  serverExternalPackages: ["argon2", "@prisma/adapter-mariadb", "mariadb", "nodemailer"],
  // argon2 es NATIVO y aun no lo importa ninguna ruta (llega con Auth.js), asi que el
  // tracing no lo arrastraria. Lo forzamos —con sus deps de runtime y el binario .node—
  // para que la imagen standalone lo tenga desde ya.
  outputFileTracingIncludes: {
    "/**": [
      "./node_modules/argon2/**",
      "./node_modules/@phc/format/**",
      "./node_modules/node-gyp-build/**",
    ],
  },
};

export default nextConfig;
