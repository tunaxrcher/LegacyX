/**
 * LegacyX Event Dictionary — single source of truth for event names.
 * Reference: docs/design/03-event-dictionary.md
 */
export const EVENT_NAMES = {
  // Phase 1
  APPOINTMENT_CREATED: "appointment.created",
  APPOINTMENT_CANCELLED: "appointment.cancelled",
  APPOINTMENT_RESCHEDULED: "appointment.rescheduled",
  VISIT_CHECKED_IN: "visit.checked_in",

  // Phase 2
  EMR_SIGNED: "emr.signed",
  EMR_AMENDED: "emr.amended",
  LAB_ORDERED: "lab.ordered",
  LAB_RESULTED: "lab.resulted",
  DOCUMENT_REQUESTED: "document.requested",
  DOCUMENT_GENERATED: "document.generated",
  ORDER_CREATED: "order.created",
  ORDER_CANCELLED: "order.cancelled",

  // Phase 3
  INVOICE_CREATED: "invoice.created",
  INVOICE_ISSUED: "invoice.issued",
  INVOICE_PAID: "invoice.paid",
  PAYMENT_AUTHORIZED: "payment.authorized",
  PAYMENT_COMPLETED: "payment.completed",
  PAYMENT_SETTLED: "payment.settled",
  PAYMENT_FAILED: "payment.failed",
  PAYMENT_REFUNDED: "payment.refunded",
  INVOICE_VOIDED: "invoice.voided",
  WALLET_PURCHASED: "wallet.purchased",
  WALLET_USED: "wallet.used",
  WALLET_REVERSED: "wallet.reversed",
  WALLET_EXPIRING: "wallet.expiring",
  PHARMACY_PREPARING: "pharmacy.preparing",
  PHARMACY_DISPENSED: "pharmacy.dispensed",

  // Phase 4
  PROCEDURE_STARTED: "procedure.started",
  PROCEDURE_COMPLETED: "procedure.completed",
  PROCEDURE_CANCELLED: "procedure.cancelled",
  INVENTORY_ADJUSTED: "inventory.adjusted",
  STOCK_RECEIVED: "stock.received",
  STOCK_DISPENSED: "stock.dispensed",
  STOCK_REVERSED: "stock.reversed",
  INVENTORY_RECONCILED: "inventory.reconciled",

  // Resource Engine (Phase 6.6)
  RESOURCE_CREATED: "resource.created",
  RESOURCE_UPDATED: "resource.updated",
  RESOURCE_RESERVED: "resource.reserved",
  RESOURCE_RELEASED: "resource.released",
  RESOURCE_MAINTENANCE_STARTED: "resource.maintenance_started",
  RESOURCE_MAINTENANCE_ENDED: "resource.maintenance_ended",

  // Phase 6 / 7
  SHIFT_CLOSED: "shift.closed",
  PATIENT_REVIEW_REQUESTED: "patient.review_requested",
  CAMPAIGN_REBOOKING_REMINDER: "campaign.rebooking_reminder",
  CAMPAIGN_BIRTHDAY_BONUS: "campaign.birthday_bonus",
  WALLET_EXPIRING_REMINDER: "wallet.expiring_reminder",

  // Cross-cutting
  AUDIT_RECORDED: "audit.recorded",
  CONSENT_SIGNED: "consent.signed",
  PATIENT_MERGED: "patient.merged",
  // Phase K — PDPA Data Subject Rights (DSR)
  PDPA_EXPORTED: "pdpa.exported",
  PDPA_ANONYMIZED: "pdpa.anonymized",
  // Phase O — Promotion / voucher engine
  PROMOTION_REDEEMED: "promotion.redeemed",
  AI_DRAFT_CREATED: "ai.draft.created",
  AI_DRAFT_APPROVED: "ai.draft.approved",
  AI_DRAFT_REJECTED: "ai.draft.rejected",
} as const;

export type EventName = (typeof EVENT_NAMES)[keyof typeof EVENT_NAMES];
