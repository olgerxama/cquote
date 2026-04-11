import type { SaleAnswers } from '@/types';

interface SaleSectionProps {
  data: SaleAnswers;
  onChange: (updates: Partial<SaleAnswers>) => void;
  hiddenFields?: string[];
}

const inputClassName =
  'w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring';

export default function SaleSection({
  data,
  onChange,
  hiddenFields,
}: SaleSectionProps) {
  const isHidden = (field: string) =>
    hiddenFields?.includes(`sale.${field}`);

  return (
    <div>
      <h3 className="text-lg font-semibold text-foreground mb-4">
        Sale Details
      </h3>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* sale_price — full width */}
        {!isHidden('sale_price') && (
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-foreground mb-1.5">
              Sale Price
            </label>
            <input
              type="number"
              required
              placeholder="e.g. 250000"
              className={inputClassName}
              value={data.sale_price}
              onChange={(e) => onChange({ sale_price: e.target.value })}
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
                onChange({ tenure: e.target.value as SaleAnswers['tenure'] })
              }
            >
              <option value="freehold">Freehold</option>
              <option value="leasehold">Leasehold</option>
            </select>
          </div>
        )}

        {!isHidden('has_existing_mortgage') && (
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">
              Existing Mortgage
            </label>
            <select
              className={inputClassName}
              value={data.has_existing_mortgage}
              onChange={(e) =>
                onChange({
                  has_existing_mortgage: e.target
                    .value as SaleAnswers['has_existing_mortgage'],
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
                    .value as SaleAnswers['is_shared_ownership'],
                })
              }
            >
              <option value="no">No</option>
              <option value="yes">Yes</option>
            </select>
          </div>
        )}

        {!isHidden('seller_count') && (
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">
              Number of Sellers
            </label>
            <input
              type="number"
              min={1}
              className={inputClassName}
              value={data.seller_count}
              onChange={(e) =>
                onChange({ seller_count: parseInt(e.target.value, 10) || 1 })
              }
            />
          </div>
        )}
      </div>
    </div>
  );
}
