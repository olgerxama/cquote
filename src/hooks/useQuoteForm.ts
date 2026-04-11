import { useState } from 'react'
import type {
  ServiceType,
  QuoteFormData,
  PurchaseAnswers,
  SaleAnswers,
  RemortgageAnswers,
  AdditionalInfo,
  CommonAnswers,
  ContactInfo,
} from '@/types'

const defaultPurchase: PurchaseAnswers = {
  property_postcode: '',
  purchase_price: '',
  tenure: 'freehold',
  is_newbuild: 'no',
  is_shared_ownership: 'no',
  has_mortgage: 'no',
  is_first_time_buyer: 'no',
  buyer_count: 1,
  gifted_deposit: 'no',
  uses_help_to_buy_isa: 'no',
  uses_right_to_buy: 'no',
  uses_help_to_buy_equity_loan: 'no',
}

const defaultSale: SaleAnswers = {
  property_postcode: '',
  sale_price: '',
  tenure: 'freehold',
  has_existing_mortgage: 'no',
  is_shared_ownership: 'no',
  seller_count: 1,
}

const defaultRemortgage: RemortgageAnswers = {
  property_postcode: '',
  remortgage_property_value: '',
  tenure: 'freehold',
  is_buy_to_let: 'no',
  transfer_of_equity: 'no',
  remortgagor_count: 1,
  recommend_mortgage_broker: 'no',
}

const defaultAdditional: AdditionalInfo = {
  buy_to_let: 'no',
  second_home: 'no',
  company_purchase: 'no',
  auction_purchase: 'no',
  probate_related: 'no',
  speed_essential: 'no',
  lender_name: '',
  source_of_funds_notes: '',
  chain_related_notes: '',
}

const defaultCommon: CommonAnswers = {
  instruct_timeline: '',
  special_instructions: '',
}

const defaultContact: ContactInfo = {
  first_name: '',
  surname: '',
  email: '',
  phone: '',
}

export function useQuoteForm() {
  const [serviceType, setServiceType] = useState<ServiceType>('purchase')
  const [purchase, setPurchase] = useState<PurchaseAnswers>(defaultPurchase)
  const [sale, setSale] = useState<SaleAnswers>(defaultSale)
  const [remortgage, setRemortgage] = useState<RemortgageAnswers>(defaultRemortgage)
  const [additional, setAdditional] = useState<AdditionalInfo>(defaultAdditional)
  const [common, setCommon] = useState<CommonAnswers>(defaultCommon)
  const [contact, setContact] = useState<ContactInfo>(defaultContact)

  function updatePurchase(updates: Partial<PurchaseAnswers>) {
    setPurchase((prev) => ({ ...prev, ...updates }))
  }
  function updateSale(updates: Partial<SaleAnswers>) {
    setSale((prev) => ({ ...prev, ...updates }))
  }
  function updateRemortgage(updates: Partial<RemortgageAnswers>) {
    setRemortgage((prev) => ({ ...prev, ...updates }))
  }
  function updateAdditional(updates: Partial<AdditionalInfo>) {
    setAdditional((prev) => ({ ...prev, ...updates }))
  }
  function updateCommon(updates: Partial<CommonAnswers>) {
    setCommon((prev) => ({ ...prev, ...updates }))
  }
  function updateContact(updates: Partial<ContactInfo>) {
    setContact((prev) => ({ ...prev, ...updates }))
  }

  function getFormData(): QuoteFormData {
    return { serviceType, purchase, sale, remortgage, additional, common, contact }
  }

  function getPropertyValue(): number {
    if (serviceType === 'purchase' || serviceType === 'sale_purchase') {
      return parseFloat(purchase.purchase_price) || 0
    }
    if (serviceType === 'sale') {
      return parseFloat(sale.sale_price) || 0
    }
    return parseFloat(remortgage.remortgage_property_value) || 0
  }

  function getAnswersJson(): Record<string, unknown> {
    const answers: Record<string, unknown> = { service_type: serviceType }

    if (serviceType === 'purchase' || serviceType === 'sale_purchase') {
      Object.entries(purchase).forEach(([k, v]) => { answers[k] = v })
    }
    if (serviceType === 'sale' || serviceType === 'sale_purchase') {
      Object.entries(sale).forEach(([k, v]) => { answers[k] = v })
    }
    if (serviceType === 'remortgage') {
      Object.entries(remortgage).forEach(([k, v]) => { answers[k] = v })
    }

    // Additional: only include non-default values
    Object.entries(additional).forEach(([k, v]) => {
      if (v && v !== 'no' && v !== '') answers[k] = v
    })

    if (common.instruct_timeline) answers.instruct_timeline = common.instruct_timeline
    if (common.special_instructions) answers.special_instructions = common.special_instructions

    return answers
  }

  return {
    serviceType,
    setServiceType,
    purchase,
    updatePurchase,
    sale,
    updateSale,
    remortgage,
    updateRemortgage,
    additional,
    updateAdditional,
    common,
    updateCommon,
    contact,
    updateContact,
    getFormData,
    getPropertyValue,
    getAnswersJson,
  }
}
