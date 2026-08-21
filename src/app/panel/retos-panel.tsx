"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

import type { RetoAdminFila } from "@/server/services/retos-admin";

import { FormularioReto } from "./formulario-reto";
import { ListaRetos } from "./lista-retos";

/**
 * Sección RETOS del panel (isla cliente): comparte estado entre el FORMULARIO y la LISTA para poder
 * EDITAR. Sin `editando`, el formulario CREA; al pulsar "Editar" en una fila, el mismo formulario se
 * precarga con ese reto (y desde ahí guarda cambios). Tras crear/editar, `router.refresh()` recarga el
 * server component (datos reales) y la edición se cierra. La `key` del formulario fuerza un remontaje
 * limpio al cambiar de reto (el estado inicial se toma de props una sola vez).
 */
export function RetosPanel({ retos }: { retos: RetoAdminFila[] }) {
  const router = useRouter();
  const [editando, setEditando] = useState<RetoAdminFila | null>(null);
  const formRef = useRef<HTMLDivElement | null>(null);

  function editar(reto: RetoAdminFila): void {
    setEditando(reto);
    // Lleva el foco visual al formulario (que puede estar arriba, fuera de la vista).
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function onGuardado(): void {
    setEditando(null);
    router.refresh();
  }

  return (
    <div className="space-y-8">
      <div ref={formRef} className="scroll-mt-24">
        <FormularioReto
          key={editando?.id ?? "crear"}
          reto={editando ?? undefined}
          onGuardado={onGuardado}
          onCancelar={editando ? () => setEditando(null) : undefined}
        />
      </div>

      <section>
        <h2 className="mb-3 text-sm font-semibold tracking-widest text-text-dim uppercase">
          Retos existentes
        </h2>
        <ListaRetos retos={retos} onEditar={editar} />
      </section>
    </div>
  );
}
