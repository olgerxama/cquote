import type {
  QuoteFormData,
  PricingBand,
  PricingExtra,
  DiscountCode,
  QuoteLineItem,
  QuoteBreakdown,
} from '@/types'

const VAT_RATE = 0.20

interface FlatAnswers {
  [key: string]: string | number | boolean | undefined
}

export function flattenAnswers(formData: QuoteFormData): FlatAnswers {
  const flat: FlatAnswers = {}

  // Service type
  flat.service_type = formData.serviceType

  // Purchase
  if (formData.serviceType === 'purchase' || formData.serviceType === 'sale_purchase') {
    Object.entries(formData.purchase).forEach(([k, v]) => { flat[k] = v })
    flat.mortgage_required = formData.purchase.has_mortgage
    flat.first_time_buyer = formData.purchase.is_first_time_buyer
  }

  // Sale
  if (formData.serviceType === 'sale' || formData.serviceType === 'sale_purchase') {
    Object.entries(formData.sale).forEach(([k, v]) => { flat[k] = v })
    if (!flat.tenure) flat.tenure = formData.sale.tenure
  }

  // Remortgage
  if (formData.serviceType === 'remortgage') {
    Object.entries(formData.remortgage).forEach(([k, v]) => { flat[k] = v })
    flat.tenure = formData.remortgage.tenure
    flat.mortgage_required = 'yes'
  }

  // Additional
  Object.entries(formData.additional).forEach(([k, v]) => {
    if (v && v !== 'no' && v !== '') flat[k] = v
  })

  // Aliases
  if (flat.is_buy_to_let) flat.buy_to_let = flat.is_buy_to_let
  if (flat.buy_to_let) flat.is_buy_to_let = flat.buy_to_let

  // Common
  Object.entries(formData.common).forEach(([k, v]) => { if (v) flat[k] = v })

  return flat
}

function findBand(bands: PricingBand[], serviceType: string, propertyValue: number): PricingBand | undefined {
  return bands.find(
    (b) =>
      b.service_type === serviceType &&
      propertyValue >= b.min_value &&
      propertyValue <= b.max_value
  )
}

function getApplicableExtras(extras: PricingExtra[], answers: FlatAnswers, serviceType: string): PricingExtra[] {
  return extras.filter((extra) => {
    if (!extra.is_active) return false
    if (extra.apply_mode !== 'automatic') return false

    // Service type filter
    if (extra.service_type && extra.service_type !== serviceType) return false

    // Condition check
    if (!extra.condition_field || !extra.condition_value) return false

    // Normalize field key: strip section prefixes
    const fieldKey = extra.condition_field.replace(/^(purchase|sale|remortgage|additional|common)\./, '')
    const answerValue = String(answers[fieldKey] ?? answers[extra.condition_field] ?? '')

    if (extra.trigger_operator === 'equals') {
      return answerValue.toLowerCase() === extra.condition_value.toLowerCase()
    }
    if (extra.trigger_operator === 'not_equals') {
      return answerValue.toLowerCase() !== extra.condition_value.toLowerCase()
    }
    return false
  })
}

export function recalculateTotals(items: QuoteLineItem[]): {
  subtotal: number
  discountTotal: number
  vatableTotal: number
  vatAmount: number
  grandTotal: number
} {
  const positiveItems = items.filter((i) => i.amount > 0)
  const negativeItems = items.filter((i) => i.amount < 0)

  const subtotal = positiveItems.reduce((s, i) => s + i.amount, 0)
  const discountTotal = Math.abs(negativeItems.reduce((s, i) => s + i.amount, 0))
  const vatableTotal = positiveItems.filter((i) => i.is_vatable).reduce((s, i) => s + i.amount, 0)
  const vatAmount = Math.round(vatableTotal * VAT_RATE * 100) / 100
  const grandTotal = Math.max(0, subtotal - discountTotal + vatAmount)

  return { subtotal, discountTotal, vatableTotal, vatAmount, grandTotal }
}

export interface QuoteCalculationResult {
  breakdown: QuoteBreakdown
  noMatchFallback: boolean
}

export function calculateQuote(
  formData: QuoteFormData,
  bands: PricingBand[],
  extras: PricingExtra[],
  discountCode?: DiscountCode | null
): QuoteCalculationResult {
  const answers = flattenAnswers(formData)
  const items: QuoteLineItem[] = []
  let noMatchFallback = false
  let sortOrder = 0

  if (formData.serviceType === 'sale_purchase') {
    // Dual service: sale + purchase
    const salePrice = parseFloat(formData.sale.sale_price) || 0
    const purchasePrice = parseFloat(formData.purchase.purchase_price) || 0

    const saleBand = findBand(bands, 'sale', salePrice) ?? findBand(bands, 'sale_purchase', salePrice)
    const purchaseBand = findBand(bands, 'purchase', purchasePrice) ?? findBand(bands, 'sale_purchase', purchasePrice)

    if (!saleBand && !purchaseBand) {
      noMatchFallback = true
    }

    if (saleBand) {
      items.push({
        description: 'Sale — Legal Fee',
        amount: Number(saleBand.base_fee),
        is_vatable: true,
        item_type: 'fee',
        source_type: 'band',
        source_reference_id: saleBand.id,
        sort_order: sortOrder++,
      })
    }
    if (purchaseBand) {
      items.push({
        description: 'Purchase — Legal Fee',
        amount: Number(purchaseBand.base_fee),
        is_vatable: true,
        item_type: 'fee',
        source_type: 'band',
        source_reference_id: purchaseBand.id,
        sort_order: sortOrder++,
      })
    }
  } else {
    // Single service
    let propertyValue = 0
    if (formData.serviceType === 'purchase') propertyValue = parseFloat(formData.purchase.purchase_price) || 0
    else if (formData.serviceType === 'sale') propertyValue = parseFloat(formData.sale.sale_price) || 0
    else if (formData.serviceType === 'remortgage') propertyValue = parseFloat(formData.remortgage.remortgage_property_value) || 0

    const band = findBand(bands, formData.serviceType, propertyValue)
    if (!band) {
      noMatchFallback = true
    } else {
      items.push({
        description: `${formData.serviceType.charAt(0).toUpperCase() + formData.serviceType.slice(1)} — Legal Fee`,
        amount: Number(band.base_fee),
        is_vatable: true,
        item_type: 'fee',
        source_type: 'band',
        source_reference_id: band.id,
        sort_order: sortOrder++,
      })
    }
  }

  // Automatic extras (only when we have base fees)
  if (!noMatchFallback) {
    const applicable = getApplicableExtras(extras, answers, formData.serviceType)
    for (const extra of applicable) {
      items.push({
        description: extra.name,
        amount: Number(extra.amount),
        is_vatable: extra.vat_applicable,
        item_type: 'extra',
        source_type: 'extra_auto',
        source_reference_id: extra.id,
        sort_order: sortOrder++,
      })
    }
  }

  // Discount (only when we have base fees)
  if (!noMatchFallback && discountCode) {
    const positiveSubtotal = items.filter((i) => i.amount > 0).reduce((s, i) => s + i.amount, 0)
    let discountAmount = 0
    if (discountCode.discount_type === 'fixed') {
      discountAmount = discountCode.discount_value
    } else {
      discountAmount = Math.round(positiveSubtotal * (discountCode.discount_value / 100) * 100) / 100
    }
    discountAmount = Math.min(discountAmount, positiveSubtotal)

    if (discountAmount > 0) {
      items.push({
        description: `Discount (${discountCode.code})`,
        amount: -discountAmount,
        is_vatable: false,
        item_type: 'discount',
        source_type: 'discount_code',
        source_reference_id: discountCode.id,
        sort_order: sortOrder++,
        is_discount: true,
      })
    }
  }

  const totals = recalculateTotals(items)

  return {
    breakdown: { items, ...totals },
    noMatchFallback,
  }
}

export function calculateQuoteWithFallback(
  formData: QuoteFormData,
  bands: PricingBand[],
  extras: PricingExtra[],
  discountCode?: DiscountCode | null
): QuoteCalculationResult {
  return calculateQuote(formData, bands, extras, discountCode)
}
