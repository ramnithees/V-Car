import { Button } from "@/components/ui/button";
import { Link } from "@tanstack/react-router";
import { AlertTriangle, Loader2, SearchX } from "lucide-react";

/**
 * Shared loading / error / not-found presentation so a failed fetch never
 * leaves a page stuck on a permanent "Loading…" string.
 */
export function QueryStateView({
  isLoading,
  error,
  notFound,
  entity,
  backTo,
  backLabel,
  onRetry,
}: {
  isLoading: boolean;
  error: unknown;
  notFound?: boolean;
  entity: string;
  backTo: "/dashboard" | "/roads" | "/vehicles" | "/simulations";
  backLabel: string;
  onRetry: () => void;
}) {
  if (isLoading) {
    return (
      <div className="p-8 flex items-center gap-2 text-muted-foreground text-sm">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading {entity}…
      </div>
    );
  }

  if (error) {
    const message = error instanceof Error ? error.message : `Could not load this ${entity}.`;
    return (
      <div className="p-4 sm:p-8 max-w-lg mx-auto">
        <div className="panel p-6 text-center">
          <AlertTriangle className="w-8 h-8 mx-auto text-destructive" />
          <h2 className="mt-4 font-semibold">Could not load this {entity}</h2>
          <p className="mt-2 text-sm text-muted-foreground break-words">{message}</p>
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            <Button onClick={onRetry}>Retry</Button>
            <Link to={backTo}>
              <Button variant="outline">{backLabel}</Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="p-4 sm:p-8 max-w-lg mx-auto">
        <div className="panel p-6 text-center">
          <SearchX className="w-8 h-8 mx-auto text-muted-foreground" />
          <h2 className="mt-4 font-semibold">
            {entity[0].toUpperCase() + entity.slice(1)} not found
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            It may have been deleted, or you may not have access to it.
          </p>
          <div className="mt-6">
            <Link to={backTo}>
              <Button variant="outline">{backLabel}</Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
