export type PaceRecordEntity =
  | "transaction"
  | "product"
  | "customer"
  | "gift_card"
  | "daily_report"
  | "purchase_order"
  | "webshop_order"
  | "service_order"
  | "stock_movement"
  | "employee"
  | "leave_request"
  | "audit_entry";

export interface PaceRecordPlan {
  version: 1;
  entity: PaceRecordEntity;
  search: string;
  limit: number;
}

/** Select a bounded record projection only for explicit lookup/status questions. */
export const planPaceRecordLookup = (rawQuestion: string): PaceRecordPlan | null => {
  const question = rawQuestion.trim().toLocaleLowerCase("nl-BE");
  if (!/\b(zoek|vind|toon|open|status|details?|waar is|wat is er met|historiek|saldo|laatste|recent)\w*/.test(question)) return null;
  const entity: PaceRecordEntity | null = /\b(audit|logboek)\w*/.test(question) ? "audit_entry"
    : /\b(verlofaanvraag|leave request)\w*/.test(question) ? "leave_request"
      : /\b(voorraadbeweging|stock movement|voorraadcorrectie)\w*/.test(question) ? "stock_movement"
        : /\b(webshoporder|online order)\w*/.test(question) ? "webshop_order"
          : /\b(herstel|herstelling|servicedossier|serviceorder)\w*/.test(question) ? "service_order"
            : /\b(purchase order|inkooporder|bestelorder)\w*/.test(question) ? "purchase_order"
              : /\b(z[- ]?rapport|dagrapport|dagafsluiting)\w*/.test(question) ? "daily_report"
                : /\b(cadeaubon|gift ?card)\w*/.test(question) ? "gift_card"
                  : /\b(ticket|transactie|verkoopbon|factuur)\w*/.test(question) ? "transaction"
                    : /\b(klant|customer)\w*/.test(question) ? "customer"
                      : /\b(medewerker|werknemer|employee|kassier)\w*/.test(question) ? "employee"
                        : /\b(product|artikel|sku|barcode)\w*/.test(question) ? "product"
                          : null;
  if (!entity) return null;
  return { version: 1, entity, search: rawQuestion.slice(0, 240), limit: /\b(laatste|recent)\w*/.test(question) ? 10 : 15 };
};
