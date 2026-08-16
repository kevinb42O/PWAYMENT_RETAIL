import type {
  Customer,
  CustomerBillingProfile,
  InvoiceRecipientSnapshot,
  SaleDocumentRequest,
} from "../types";

export const hasCompleteBillingProfile = (profile?: CustomerBillingProfile): profile is CustomerBillingProfile =>
  Boolean(
    profile &&
      profile.contactName.trim() &&
      profile.addressLine1.trim() &&
      profile.postalCode.trim() &&
      profile.city.trim() &&
      profile.countryCode.trim() &&
      (profile.type !== "business" || (profile.companyName?.trim() && profile.vatNumber?.trim())),
  );

export const recipientFromCustomer = (customer: Customer): InvoiceRecipientSnapshot | null => {
  const profile = customer.billingProfile;
  if (!hasCompleteBillingProfile(profile)) return null;
  return {
    customerId: customer.id,
    name: profile.contactName,
    companyName: profile.companyName,
    addressLine1: profile.addressLine1,
    postalCode: profile.postalCode,
    city: profile.city,
    countryCode: profile.countryCode,
    vatNumber: profile.vatNumber,
    email: profile.email ?? customer.email,
    purchaseOrderReference: profile.purchaseOrderReference,
  };
};

export const invoiceRequestFromCustomer = (customer: Customer): SaleDocumentRequest | null => {
  const recipient = recipientFromCustomer(customer);
  if (!recipient) return null;
  return {
    type: customer.billingProfile?.type === "business" ? "invoice-b2b" : "invoice-b2c",
    recipient,
  };
};

export const formattedBillingAddress = (profile: CustomerBillingProfile): string =>
  [profile.addressLine1, `${profile.postalCode} ${profile.city}`, profile.countryCode]
    .filter(Boolean)
    .join(", ");
