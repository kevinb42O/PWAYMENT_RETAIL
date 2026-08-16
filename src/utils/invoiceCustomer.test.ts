import { describe, expect, it } from "vitest";
import type { Customer } from "../types";
import { hasCompleteBillingProfile, invoiceRequestFromCustomer } from "./invoiceCustomer";

const customer = (overrides: Partial<Customer> = {}): Customer => ({
  id: "customer-1",
  name: "Acme BV",
  totalSpentCents: 0,
  visitCount: 0,
  createdAt: "2026-08-16T10:00:00.000Z",
  isActive: true,
  billingProfile: {
    type: "business",
    companyName: "Acme BV",
    contactName: "Ari Acme",
    addressLine1: "Kerkstraat 1",
    postalCode: "9000",
    city: "Gent",
    countryCode: "BE",
    vatNumber: "BE0123.456.789",
    email: "factuur@acme.be",
  },
  ...overrides,
});

describe("invoice customer", () => {
  it("requires the business identity fields before an invoice can be made", () => {
    const incomplete = customer({
      billingProfile: { ...customer().billingProfile!, vatNumber: "" },
    });
    expect(hasCompleteBillingProfile(incomplete.billingProfile)).toBe(false);
    expect(invoiceRequestFromCustomer(incomplete)).toBeNull();
  });

  it("creates an immutable B2B recipient snapshot from the customer profile", () => {
    expect(invoiceRequestFromCustomer(customer())).toEqual({
      type: "invoice-b2b",
      recipient: {
        customerId: "customer-1",
        name: "Ari Acme",
        companyName: "Acme BV",
        addressLine1: "Kerkstraat 1",
        postalCode: "9000",
        city: "Gent",
        countryCode: "BE",
        vatNumber: "BE0123.456.789",
        email: "factuur@acme.be",
        purchaseOrderReference: undefined,
      },
    });
  });
});
