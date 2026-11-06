import { notFound } from "next/navigation";
import { getEventTypeByHostSlug } from "@/lib/availability/queries";
import BookingFlow from "@/components/booking/BookingFlow";
import { ErrorBoundary } from "@/components/booking/ErrorBoundary";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function BookingPage({
  params,
}: {
  params: { host: string; eventSlug: string };
}) {
  const found = await getEventTypeByHostSlug(params.host, params.eventSlug);
  if (!found) notFound();
  const { host, eventType } = found;

  return (
    <ErrorBoundary>
      <BookingFlow
        hostSlug={host.slug}
        hostName={host.name}
        hostTimezone={host.timezone}
        eventName={eventType.name}
        eventSlug={eventType.slug}
        eventTypeId={eventType.id}
        durationMinutes={eventType.duration_minutes}
        capacity={eventType.capacity}
      />
    </ErrorBoundary>
  );
}
