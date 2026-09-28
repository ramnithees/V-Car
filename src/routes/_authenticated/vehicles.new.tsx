import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/PageHeader";
import { VehicleWizard } from "@/components/vehicles/wizard/VehicleWizard";

export const Route = createFileRoute("/_authenticated/vehicles/new")({
  component: NewVehicle,
});

function NewVehicle() {
  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-5xl mx-auto">
      <PageHeader
        title="New vehicle"
        subtitle="Enter engineering specs used for dynamics, physics, braking, aero, and AI safety prediction."
      />
      <VehicleWizard />
    </div>
  );
}
