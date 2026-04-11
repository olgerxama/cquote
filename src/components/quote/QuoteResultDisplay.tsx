import { cn } from '@/lib/utils';
import { formatCurrency } from '@/lib/utils';
import type { QuoteBreakdown } from '@/types';

interface QuoteResultDisplayProps {
  breakdown: QuoteBreakdown;
  noMatchFallback: boolean;
  firmName?: string;
}

export default function QuoteResultDisplay({
  breakdown,
  noMatchFallback,
  firmName,
}: QuoteResultDisplayProps) {
  if (noMatchFallback) {
    return (
      <div className="rounded-lg border border-input bg-background p-6 text-center">
        <p className="text-sm text-muted-foreground">
          We need to review your details manually. We&apos;ll be in touch
          shortly.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-input bg-background">
      {firmName && (
        <div className="border-b border-input px-6 py-4">
          <h3 className="text-lg font-semibold text-foreground">{firmName}</h3>
        </div>
      )}

      {/* Line items */}
      <div className="divide-y divide-input">
        {breakdown.items.map((item, idx) => (
          <div
            key={idx}
            className="flex items-center justify-between px-6 py-3"
          >
            <span className="text-sm text-foreground">{item.description}</span>
            <span
              className={cn(
                'text-sm font-medium',
                item.amount < 0 ? 'text-green-600' : 'text-foreground'
              )}
            >
              {item.amount < 0 && '\u2212'}
              {formatCurrency(Math.abs(item.amount))}
            </span>
          </div>
        ))}
      </div>

      {/* Totals */}
      <div className="border-t-2 border-input">
        {/* Subtotal */}
        <div className="flex items-center justify-between px-6 py-2">
          <span className="text-sm text-muted-foreground">Subtotal</span>
          <span className="text-sm font-medium text-foreground">
            {formatCurrency(breakdown.subtotal)}
          </span>
        </div>

        {/* Discount */}
        {breakdown.discountTotal > 0 && (
          <div className="flex items-center justify-between px-6 py-2">
            <span className="text-sm text-muted-foreground">Discount</span>
            <span className="text-sm font-medium text-green-600">
              &minus;{formatCurrency(breakdown.discountTotal)}
            </span>
          </div>
        )}

        {/* VAT */}
        <div className="flex items-center justify-between px-6 py-2">
          <span className="text-sm text-muted-foreground">VAT</span>
          <span className="text-sm font-medium text-foreground">
            {formatCurrency(breakdown.vatAmount)}
          </span>
        </div>

        {/* Grand Total */}
        <div className="flex items-center justify-between border-t border-input px-6 py-4">
          <span className="text-base font-bold text-foreground">
            Grand Total
          </span>
          <span className="text-lg font-bold text-foreground">
            {formatCurrency(breakdown.grandTotal)}
          </span>
        </div>
      </div>
    </div>
  );
}
