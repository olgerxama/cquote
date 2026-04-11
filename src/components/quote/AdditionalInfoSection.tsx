import type { AdditionalInfo, YesNo } from '@/types';

interface AdditionalInfoSectionProps {
  data: AdditionalInfo;
  onChange: (updates: Partial<AdditionalInfo>) => void;
  hiddenFields?: string[];
}

const inputClassName =
  'w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring';

export default function AdditionalInfoSection({
  data,
  onChange,
  hiddenFields,
}: AdditionalInfoSectionProps) {
  const isHidden = (field: string) =>
    hiddenFields?.includes(`additional.${field}`);

  return (
    <div>
      <h3 className="text-lg font-semibold text-foreground mb-4">
        Additional Information
      </h3>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {!isHidden('buy_to_let') && (
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">
              Buy to Let
            </label>
            <select
              className={inputClassName}
              value={data.buy_to_let}
              onChange={(e) =>
                onChange({ buy_to_let: e.target.value as YesNo })
              }
            >
              <option value="no">No</option>
              <option value="yes">Yes</option>
            </select>
          </div>
        )}

        {!isHidden('second_home') && (
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">
              Second Home
            </label>
            <select
              className={inputClassName}
              value={data.second_home}
              onChange={(e) =>
                onChange({ second_home: e.target.value as YesNo })
              }
            >
              <option value="no">No</option>
              <option value="yes">Yes</option>
            </select>
          </div>
        )}

        {!isHidden('company_purchase') && (
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">
              Company Purchase
            </label>
            <select
              className={inputClassName}
              value={data.company_purchase}
              onChange={(e) =>
                onChange({ company_purchase: e.target.value as YesNo })
              }
            >
              <option value="no">No</option>
              <option value="yes">Yes</option>
            </select>
          </div>
        )}

        {!isHidden('auction_purchase') && (
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">
              Auction Purchase
            </label>
            <select
              className={inputClassName}
              value={data.auction_purchase}
              onChange={(e) =>
                onChange({ auction_purchase: e.target.value as YesNo })
              }
            >
              <option value="no">No</option>
              <option value="yes">Yes</option>
            </select>
          </div>
        )}

        {!isHidden('probate_related') && (
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">
              Probate Related
            </label>
            <select
              className={inputClassName}
              value={data.probate_related}
              onChange={(e) =>
                onChange({ probate_related: e.target.value as YesNo })
              }
            >
              <option value="no">No</option>
              <option value="yes">Yes</option>
            </select>
          </div>
        )}

        {!isHidden('speed_essential') && (
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">
              Urgency Essential
            </label>
            <select
              className={inputClassName}
              value={data.speed_essential}
              onChange={(e) =>
                onChange({ speed_essential: e.target.value as YesNo })
              }
            >
              <option value="no">No</option>
              <option value="yes">Yes</option>
            </select>
          </div>
        )}

        {!isHidden('lender_name') && (
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">
              Lender Name
            </label>
            <input
              type="text"
              className={inputClassName}
              value={data.lender_name}
              onChange={(e) => onChange({ lender_name: e.target.value })}
            />
          </div>
        )}

        {!isHidden('source_of_funds_notes') && (
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-foreground mb-1.5">
              Source of Funds
            </label>
            <textarea
              className={inputClassName}
              rows={3}
              value={data.source_of_funds_notes}
              onChange={(e) =>
                onChange({ source_of_funds_notes: e.target.value })
              }
            />
          </div>
        )}

        {!isHidden('chain_related_notes') && (
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-foreground mb-1.5">
              Chain Notes
            </label>
            <textarea
              className={inputClassName}
              rows={3}
              value={data.chain_related_notes}
              onChange={(e) =>
                onChange({ chain_related_notes: e.target.value })
              }
            />
          </div>
        )}
      </div>
    </div>
  );
}
