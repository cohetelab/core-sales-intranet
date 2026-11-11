export type SalesInvoiceDraft = {
  id: string;
  customerId: string;
  customerName: string;
  customerBusinessNumber: string;
  customerRepresentative: string;
  customerEmail: string;
  supplierName: string;
  supplierBusinessNumber: string;
  supplierRepresentative: string;
  supplierEmail: string;
  issueDate: string;
  purpose: "CLAIM" | "RECEIPT";
  itemName: string;
  supplyCost: number;
  tax: number;
  updatedAt: string;
};

const KEY = "core-sales-invoice-drafts-v1";

export function readSalesInvoiceDrafts(): SalesInvoiceDraft[] {
  try {
    const value = JSON.parse(window.localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

export function writeSalesInvoiceDrafts(drafts: SalesInvoiceDraft[]) {
  window.localStorage.setItem(KEY, JSON.stringify(drafts));
}

export function boltaIssuePayload(draft: SalesInvoiceDraft) {
  return {
    date: draft.issueDate,
    purpose: draft.purpose,
    taxType: "TAXABLE",
    supplier: {
      identificationNumber: draft.supplierBusinessNumber.replace(/\D/g, ""),
      organizationName: draft.supplierName.trim(),
      representativeName: draft.supplierRepresentative.trim(),
      manager: { email: draft.supplierEmail.trim() },
    },
    supplied: {
      identificationNumber: draft.customerBusinessNumber.replace(/\D/g, ""),
      organizationName: draft.customerName.trim(),
      representativeName: draft.customerRepresentative.trim(),
      managers: [{ email: draft.customerEmail.trim() }],
    },
    items: [{
      date: draft.issueDate,
      name: draft.itemName.trim(),
      supplyCost: draft.supplyCost,
      tax: draft.tax,
    }],
  };
}
