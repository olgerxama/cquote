import type { RemortgageAnswers } from '@/types';

interface RemortgageSectionProps {
  data: RemortgageAnswers;
  onChange: (updates: Partial<RemortgageAnswers>) => void;
  hiddenFields?: string[];
}

const inputClassName =
  'w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring';

export default function RemortgageSection({
  data,
  onChange,
  hiddenFields,
}: RemortgageSectionProps) {
  const isHidden = (field: string) =>
    hiddenFields?.includes(`remortgage.${field}`);

  return (
    <div>
      <h3 className="text-lg font-semibold text-foreground mb-4">
        Remortgage Details
      </h3>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* remortgage_property_value — full width */}
        {!isHidden('remortgage_property_value') && (
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-foreground mb-1.5">
              Property Value
            </label>
            <input
              type="number"
              required
              placeholder="e.g. 250000"
              className={inputClassName}
              value={data.remortgage_property_value}
              onChange={(e) =>
                onChange({ remortgage_property_value: e.target.value })
              }
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
                onChange({
                  tenure: e.target.value as RemortgageAnswers['tenure'],
                })
              }
            >
              <option value="freehold">Freehold</option>
              <option value="leasehold">Leasehold</option>
            </select>
          </div>
        )}

        {!isHidden('is_buy_to_let') && (
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">
              Buy to Let
            </label>
            <select
              className={inputClassName}
              value={data.is_buy_to_let}
              onChange={(e) =>
                onChange({
                  is_buy_to_let: e.target
                    .value as RemortgageAnswers['is_buy_to_let'],
                })
              }
            >
              <option value="no">No</option>
              <option value="yes">Yes</option>
            </select>
          </div>
        )}

        {!isHidden('transfer_of_equity') && (
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">
              Transfer of Equity
            </label>
            <select
              className={inputClassName}
              value={data.transfer_of_equity}
              onChange={(e) =>
                onChange({
                  transfer_of_equity: e.target
                    .value as RemortgageAnswers['transfer_of_equity'],
                })
              }
            >
              <option value="no">No</option>
              <option value="yes">Yes</option>
            </select>
          </div>
        )}

        {!isHidden('remortgagor_count') && (
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">
              Number of Remortgagors
            </label>
            <input
              type="number"
              min={1}
              className={inputClassName}
              value={data.remortgagor_count}
              onChange={(e) =>
                onChange({
                  remortgagor_count: parseInt(e.target.value, 10) || 1,
                })
              }
            />
          </div>
        )}

        {!isHidden('recommend_mortgage_broker') && (
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">
              Recommend Mortgage Broker
            </label>
            <select
              className={inputClassName}
              value={data.recommend_mortgage_broker}
              onChange={(e) =>
                onChange({
                  recommend_mortgage_broker: e.target
                    .value as RemortgageAnswers['recommend_mortgage_broker'],
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
