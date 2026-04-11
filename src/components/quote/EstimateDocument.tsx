import { cn } from '@/lib/utils';
import { formatCurrency } from '@/lib/utils';
import type { QuoteLineItem } from '@/types';

interface EstimateDocumentProps {
  firmName: string;
  leadName: string;
  items: QuoteLineItem[];
  totals: {
    subtotal: number;
    discountTotal: number;
    vatAmount: number;
    grandTotal: number;
  };
  documentType?: 'estimate' | 'invoice';
  referenceCode?: string;
  serviceType?: string;
}

export default function EstimateDocument({
  firmName,
  leadName,
  items,
  totals,
  documentType = 'estimate',
  referenceCode,
  serviceType,
}: EstimateDocumentProps) {
  const title = documentType === 'invoice' ? 'Invoice' : 'Estimate';

  return (
    <div
      id="estimate-document"
      className="mx-auto max-w-2xl rounded-lg border border-input bg-white shadow-lg"
    >
      {/* Header */}
      <div className="border-b border-input px-8 py-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">{firmName}</h1>
          </div>
          <div className="text-right">
            <h2 className="text-2xl font-bold text-gray-900">{title}</h2>
            {referenceCode && (
              <p className="mt-1 text-sm text-gray-500">
                Ref: {referenceCode}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Client / service info */}
      <div className="border-b border-input px-8 py-4">
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="font-medium text-gray-500">Prepared for</span>
            <p className="mt-0.5 text-gray-900">{leadName}</p>
          </div>
          {serviceType && (
            <div className="text-right">
              <span className="font-medium text-gray-500">Service</span>
              <p className="mt-0.5 text-gray-900">{serviceType}</p>
            </div>
          )}
        </div>
      </div>

      {/* Items table */}
      <div className="px-8 py-4">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-input">
              <th className="pb-2 text-left font-medium text-gray-500">
                Description
              </th>
              <th className="pb-2 text-right font-medium text-gray-500">
                Amount
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {items.map((item, idx) => (
              <tr key={idx}>
                <td className="py-2.5 text-gray-900">{item.description}</td>
                <td
                  className={cn(
                    'py-2.5 text-right font-medium',
                    item.amount < 0 ? 'text-green-600' : 'text-gray-900'
                  )}
                >
                  {item.amount < 0 && '\u2212'}
                  {formatCurrency(Math.abs(item.amount))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Totals */}
      <div className="border-t border-input px-8 py-4">
        <div className="ml-auto max-w-xs space-y-1">
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">Subtotal</span>
            <span className="font-medium text-gray-900">
              {formatCurrency(totals.subtotal)}
            </span>
          </div>

          {totals.discountTotal > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Discount</span>
              <span className="font-medium text-green-600">
                &minus;{formatCurrency(totals.discountTotal)}
              </span>
            </div>
          )}

          <div className="flex justify-between text-sm">
            <span className="text-gray-500">VAT</span>
            <span className="font-medium text-gray-900">
              {formatCurrency(totals.vatAmount)}
            </span>
          </div>

          <div className="flex justify-between border-t border-input pt-2 text-base">
            <span className="font-bold text-gray-900">Grand Total</span>
            <span className="font-bold text-gray-900">
              {formatCurrency(totals.grandTotal)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
