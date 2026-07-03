/**
 * @chatcouncil/adapters
 * ------------------------------------------------------------------
 * Placeholder intencional. Los adaptadores concretos (uno por
 * proveedor, BYOK primero por ser mas rapidos de verificar, BYOA
 * despues por requerir ingenieria inversa) se construyen en las Fases
 * 2 y 3 del blueprint (docs/BLUEPRINT.md). Este paquete existe desde
 * ya para fijar el limite arquitectonico: nada en apps/web ni en
 * apps/extension deberia importar logica especifica de un proveedor
 * directamente — todo pasa por el contrato `Adapter` de
 * @chatcouncil/shared, implementado aqui.
 */
import type { Adapter } from "@chatcouncil/shared";

export const registeredAdapters: Adapter[] = [];
