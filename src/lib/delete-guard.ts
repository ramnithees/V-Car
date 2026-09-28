/**
 * Referential-integrity guard for library entities (roads, vehicles).
 *
 * The database enforces ON DELETE RESTRICT on simulations.road_id /
 * simulations.vehicle_id, so a delete with dependents fails server-side.
 * These helpers mirror that rule in the UI so the user sees a clear reason
 * before the request is ever made.
 */

export type DeletableEntity = "road" | "vehicle";

export interface DeleteGuardResult {
  /** True when the entity has no dependent simulations and may be deleted. */
  allowed: boolean;
  /** Human-readable reason when blocked; empty string when allowed. */
  message: string;
}

export function checkDeleteAllowed(
  entity: DeletableEntity,
  dependentSimulations: number | null | undefined,
): DeleteGuardResult {
  const count = Number(dependentSimulations ?? 0);
  if (!Number.isFinite(count) || count <= 0) {
    return { allowed: true, message: "" };
  }
  return {
    allowed: false,
    message:
      count === 1
        ? `1 simulation uses this ${entity} — delete or reassign it first`
        : `${count} simulations use this ${entity} — delete or reassign them first`,
  };
}

/** Maps a Postgres foreign-key violation into the same user-facing wording. */
export function describeDeleteError(entity: DeletableEntity, error: unknown): string {
  const code = (error as { code?: string } | null)?.code;
  const message = error instanceof Error ? error.message : String(error ?? "");
  if (code === "23503" || /foreign key|violates/i.test(message)) {
    return `This ${entity} is still used by saved simulations — delete or reassign them first`;
  }
  return message || "Failed";
}
