import { notFound } from "next/navigation";
import { getBookingByToken, type BookingDetail } from "@/lib/booking/queries";
import ManageBooking from "@/components/booking/ManageBooking";

export const dynamic = "force-dynamic";

export default async function ManagePage({ params }: { params: { token: string } }) {
  const booking = await getBookingByToken(params.token);
  if (!booking) notFound();
  return <ManageBooking booking={booking} token={params.token} />;
}

export type { BookingDetail };
