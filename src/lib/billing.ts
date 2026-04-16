import type { Firm } from '@/types'

const ACTIVE_STATUSES = new Set(['active', 'trialing'])

export function hasProfessionalAccess(firm: Pick<Firm, 'plan_type' | 'stripe_subscription_status'>): boolean {
  return firm.plan_type === 'professional' && ACTIVE_STATUSES.has((firm.stripe_subscription_status || '').toLowerCase())
}

