import type { PurchaseAnswers } from '@/types';

interface PurchaseSectionProps {
  data: PurchaseAnswers;
  onChange: (updates: Partial<PurchaseAnswers>) => void;
  hiddenFields?: string[];
}

const inputClassName =
  'w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring';

export default function PurchaseSection({
  data,
  onChange,
  hiddenFields,
}: PurchaseSectionProps) {
  const isHidden = (field: string) =>
    hiddenFields?.includes(`purchase.${field}`);

  return (
    <div>
      <h3 className="text-lg font-semibold text-foreground mb-4">
        Purchase Details
      </h3>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* purchase_price — full width */}
        {!isHidden('purchase_price') && (
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-foreground mb-1.5">
              Purchase Price
            </label>
            <input
              type="number"
              required
              placeholder="e.g. 250000"
              className={inputClassName}
              value={data.purchase_price}
              onChange={(e) => onChange({ purchase_price: e.target.value })}
            />
          </div>
        )}

        {!isHidden('property_postcode') && (
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">
              Property Postcode
            </label>
            <input
              type="text"
              className={inputClassName}
              value={data.property_postcode}
              onChange={(e) => onChange({ property_postcode: e.target.value })}
            />
          </div>
        )}

        {!isHidden('tenure') && (
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">
              Tenure
            </label>
            <select
              className={inputClassName}
              value={data.tenure}
              onChange={(e) =>
                onChange({ tenure: e.target.value as PurchaseAnswers['tenure'] })
              }
            >
              <option value="freehold">Freehold</option>
              <option value="leasehold">Leasehold</option>
            </select>
          </div>
        )}

        {!isHidden('is_newbuild') && (
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">
              New Build
            </label>
            <select
              className={inputClassName}
              value={data.is_newbuild}
              onChange={(e) =>
                onChange({
                  is_newbuild: e.target.value as PurchaseAnswers['is_newbuild'],
                })
              }
            >
              <option value="no">No</option>
              <option value="yes">Yes</option>
            </select>
          </div>
        )}

        {!isHidden('is_shared_ownership') && (
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">
              Shared Ownership
            </label>
            <select
              className={inputClassName}
              value={data.is_shared_ownership}
              onChange={(e) =>
                onChange({
                  is_shared_ownership: e.target
                    .value as PurchaseAnswers['is_shared_ownership'],
                })
              }
            >
              <option value="no">No</option>
              <option value="yes">Yes</option>
            </select>
          </div>
        )}

        {!isHidden('has_mortgage') && (
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">
              Mortgage Required
            </label>
            <select
              className={inputClassName}
              value={data.has_mortgage}
              onChange={(e) =>
                onChange({
                  has_mortgage: e.target
                    .value as PurchaseAnswers['has_mortgage'],
                })
              }
            >
              <option value="no">No</option>
              <option value="yes">Yes</option>
            </select>
          </div>
        )}

        {!isHidden('is_first_time_buyer') && (
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">
              First Time Buyer
            </label>
            <select
              className={inputClassName}
              value={data.is_first_time_buyer}
              onChange={(e) =>
                onChange({
                  is_first_time_buyer: e.target
                    .value as PurchaseAnswers['is_first_time_buyer'],
                })
              }
            >
              <option value="no">No</option>
              <option value="yes">Yes</option>
            </select>
          </div>
        )}

        {!isHidden('buyer_count') && (
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">
              Number of Buyers
            </label>
            <input
              type="number"
              min={1}
              className={inputClassName}
              value={data.buyer_count}
              onChange={(e) =>
                onChange({ buyer_count: parseInt(e.target.value, 10) || 1 })
              }
            />
          </div>
        )}

        {!isHidden('gifted_deposit') && (
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">
              Gifted Deposit
            </label>
            <select
              className={inputClassName}
              value={data.gifted_deposit}
              onChange={(e) =>
                onChange({
                  gifted_deposit: e.target
                    .value as PurchaseAnswers['gifted_deposit'],
                })
              }
            >
              <option value="no">No</option>
              <option value="yes">Yes</option>
              <option value="not_sure">Not Sure</option>
            </select>
          </div>
        )}

        {!isHidden('uses_help_to_buy_isa') && (
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">
              Help to Buy ISA
            </label>
            <select
              className={inputClassName}
              value={data.uses_help_to_buy_isa}
              onChange={(e) =>
                onChange({
                  uses_help_to_buy_isa: e.target
                    .value as PurchaseAnswers['uses_help_to_buy_isa'],
                })
              }
            >
              <option value="no">No</option>
              <option value="yes">Yes</option>
            </select>
          </div>
        )}

        {!isHidden('uses_right_to_buy') && (
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">
              Right to Buy
            </label>
            <select
              className={inputClassName}
              value={data.uses_right_to_buy}
              onChange={(e) =>
                onChange({
                  uses_right_to_buy: e.target
                    .value as PurchaseAnswers['uses_right_to_buy'],
                })
              }
            >
              <option value="no">No</option>
              <option value="yes">Yes</option>
            </select>
          </div>
        )}

        {!isHidden('uses_help_to_buy_equity_loan') && (
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">
              Help to Buy Equity Loan
            </label>
            <select
              className={inputClassName}
              value={data.uses_help_to_buy_equity_loan}
              onChange={(e) =>
                onChange({
                  uses_help_to_buy_equity_loan: e.target
                    .value as PurchaseAnswers['uses_help_to_buy_equity_loan'],
                })
              }
            >
              <option value="no">No</option>
              <option value="yes">Yes</option>
            </select>
          </div>
        )}
      </div>
    </div>
  );
}
