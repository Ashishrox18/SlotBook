import { z } from "zod";

const uuid = z.string().uuid();
const isoInstant = z.string().datetime({ message: "must be an ISO 8601 UTC instant" });
const timeRe = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;
const localTime = z.string().regex(timeRe, "must be HH:MM");
const dateRe = /^\d{4}-\d{2}-\d{2}$/;
const localDate = z.string().regex(dateRe, "must be YYYY-MM-DD");
const ianaZone = z
  .string()
  .min(1)
  .refine((v) => {
    try {
      return Intl.DateTimeFormat(undefined, { timeZone: v }).resolvedOptions().timeZone === v || v.includes("/");
    } catch {
      return false;
    }
  }, "must be a valid IANA timezone");
const slugRe = /^[a-z0-9-]+$/;
const slug = z.string().regex(slugRe, "must be lowercase letters, digits, and hyphens").max(80);

export const CreateHoldSchema = z.object({
  event_type_id: uuid,
  starts_at: isoInstant,
});

export const ConfirmHoldSchema = z.object({
  guest_name: z.string().min(1).max(120),
  guest_email: z.string().email().max(320),
});

export const RescheduleSchema = z.object({
  starts_at: isoInstant,
});

export const CancelSchema = z.object({
  cancellation_reason: z.string().min(1).max(500),
});

export const SlotsQuerySchema = z.object({
  from: localDate.optional(),
  to: localDate.optional(),
  tz: z.string().optional(),
});

export const EventTypeCreateSchema = z.object({
  name: z.string().min(1).max(120),
  slug: slug,
  duration_minutes: z.number().int().min(15).max(120),
  capacity: z.number().int().min(1).max(1000),
  buffer_before_minutes: z.number().int().min(0).max(30),
  buffer_after_minutes: z.number().int().min(0).max(30),
  minimum_notice_minutes: z.number().int().min(0).max(1440),
  booking_horizon_days: z.number().int().min(1).max(365),
});

export const EventTypeUpdateSchema = EventTypeCreateSchema.partial();

export const WeeklyAvailabilitySchema = z.object({
  weekday: z.number().int().min(0).max(6),
  start_local_time: localTime,
  end_local_time: localTime,
}).refine((d) => d.end_local_time > d.start_local_time, { message: "end must be after start" });

export const OverrideSchema = z.object({
  local_date: localDate,
  override_type: z.enum(["day_off", "custom_hours"]),
  start_local_time: localTime.nullable(),
  end_local_time: localTime.nullable(),
}).superRefine((d, ctx) => {
  if (d.override_type === "custom_hours") {
    if (!d.start_local_time || !d.end_local_time) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "custom_hours requires start and end", path: ["start_local_time"] });
    } else if (d.end_local_time <= d.start_local_time) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "end must be after start", path: ["end_local_time"] });
    }
  }
});

export const HostSettingsSchema = z.object({
  name: z.string().min(1).max(120),
  timezone: ianaZone,
});

export type CreateHoldInput = z.infer<typeof CreateHoldSchema>;
export type ConfirmHoldInput = z.infer<typeof ConfirmHoldSchema>;
export type RescheduleInput = z.infer<typeof RescheduleSchema>;
export type CancelInput = z.infer<typeof CancelSchema>;
export type SlotsQuery = z.infer<typeof SlotsQuerySchema>;
export type EventTypeCreateInput = z.infer<typeof EventTypeCreateSchema>;
export type EventTypeUpdateInput = z.infer<typeof EventTypeUpdateSchema>;
export type WeeklyAvailabilityInput = z.infer<typeof WeeklyAvailabilitySchema>;
export type OverrideInput = z.infer<typeof OverrideSchema>;
export type HostSettingsInput = z.infer<typeof HostSettingsSchema>;
