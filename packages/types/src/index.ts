/**
 * @legacyx/types — Shared DTOs / API contracts (Zod schemas).
 * Will grow as api-server endpoints are implemented.
 */
import { z } from "zod";

export const PaginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(100).default(20),
});
export type Pagination = z.infer<typeof PaginationSchema>;

export const TenantContextSchema = z.object({
  tenantId: z.string().min(1),
  branchId: z.string().optional(),
  userId: z.string().optional(),
  correlationId: z.string().min(1),
});
export type TenantContext = z.infer<typeof TenantContextSchema>;
