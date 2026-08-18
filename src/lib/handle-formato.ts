/**
 * FORMATO canónico del handle público (`username`). Módulo CLIENTE-SEGURO (sin `node:crypto`): es la
 * FUENTE ÚNICA del patrón, compartida por el generador del servidor (`server/auth/handle`, que sí usa
 * crypto y re-exporta este `HANDLE_RE`), la validación del servidor al editar (`services/perfil`) y la
 * UX del formulario (`perfil-logic`). Así el formato no se duplica y el navegador no arrastra crypto.
 *
 * `^[a-z0-9._]{3,30}$`: minúsculas, dígitos, punto y guion bajo; 3-30 caracteres. El almacenamiento en
 * minúsculas + la collation `_ci` de MariaDB dan la unicidad case-insensitive.
 */
export const HANDLE_RE = /^[a-z0-9._]{3,30}$/;

/** Longitud (para `maxLength` del input y copy de ayuda). */
export const USERNAME_MIN = 3;
export const USERNAME_MAX = 30;
