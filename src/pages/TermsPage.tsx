import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Scale, ArrowLeft } from 'lucide-react'

export default function TermsPage() {
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'auto' })
  }, [])

  return (
    <div className="min-h-screen bg-muted/20">
      <header className="border-b border-border bg-white/90 backdrop-blur-sm sticky top-0 z-30">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <Link to="/" className="inline-flex items-center gap-2 hover:opacity-80 transition-opacity">
            <Scale className="h-6 w-6 text-primary" />
            <span className="font-semibold text-foreground">ConveyQuote</span>
          </Link>
          <Link
            to="/"
            className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-accent"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to landing
          </Link>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <article className="bg-card border border-border rounded-2xl p-8 lg:p-12 shadow-sm space-y-8">
          <div>
            <h1 className="text-3xl sm:text-4xl font-bold text-foreground">Terms of Service</h1>
            <p className="mt-3 text-muted-foreground">
              Effective date: {new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
            </p>
          </div>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground">1. Agreement and Scope</h2>
            <p className="text-muted-foreground leading-relaxed">
              These Terms of Service (“Terms”) govern your access to and use of ConveyQuote, including all hosted software,
              quote widgets, dashboards, integrations, APIs, communications, and support services (collectively, the “Service”).
              By creating an account, using the Service, or allowing users under your organisation to use the Service, you
              agree to these Terms and represent that you have authority to bind your organisation.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground">2. Eligibility and Account Responsibilities</h2>
            <ul className="list-disc pl-6 text-muted-foreground space-y-2">
              <li>You must provide accurate registration details and keep them up to date.</li>
              <li>You are responsible for all activity under your account, including actions by invited team members.</li>
              <li>You must maintain reasonable security controls, including strong passwords and restricted admin access.</li>
              <li>You must promptly notify us of any suspected unauthorised access or security incident.</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground">3. Service Use and Permitted Purpose</h2>
            <p className="text-muted-foreground leading-relaxed">
              ConveyQuote is intended to support conveyancing firms in generating and managing quote estimate invoices,
              capturing enquiries, and managing related workflow data. You agree to use the Service lawfully and in a manner
              consistent with applicable professional, consumer, and data-protection obligations.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground">4. Prohibited Conduct</h2>
            <ul className="list-disc pl-6 text-muted-foreground space-y-2">
              <li>Reverse engineering, probing, scanning, or attempting to bypass Service security controls.</li>
              <li>Using the Service to distribute unlawful, deceptive, defamatory, or malicious content.</li>
              <li>Interfering with platform stability, including abusive automation, scraping, or denial-of-service activity.</li>
              <li>Misrepresenting fees, legal services, or consumer rights using generated materials.</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground">5. Commercial Terms and Billing</h2>
            <p className="text-muted-foreground leading-relaxed">
              Plan availability, features, and pricing are described in-product and may vary by subscription tier.
              Paid subscriptions renew automatically unless cancelled. You authorise charges through your selected payment
              method. Fees are non-refundable except where required by law or explicitly stated.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground">6. Data, Content, and Ownership</h2>
            <p className="text-muted-foreground leading-relaxed">
              You retain ownership of your firm data and uploaded content. You grant us a limited licence to host, process,
              transmit, and display such data solely to provide and improve the Service. We may generate anonymised,
              aggregated analytics for operational and product purposes.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground">7. Privacy and Data Protection</h2>
            <p className="text-muted-foreground leading-relaxed">
              Your use of the Service is also governed by our Privacy Policy. Where required, you are responsible for
              establishing an appropriate lawful basis for processing personal data and for presenting required notices
              to your website visitors and clients.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground">8. Availability and Changes</h2>
            <p className="text-muted-foreground leading-relaxed">
              We strive for high availability but do not guarantee uninterrupted operation. We may update, suspend, or
              discontinue features to improve security, performance, legal compliance, or product direction.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground">9. Warranties and Disclaimers</h2>
            <p className="text-muted-foreground leading-relaxed">
              The Service is provided on an “as is” and “as available” basis. To the maximum extent permitted by law,
              we disclaim implied warranties including merchantability, fitness for a particular purpose, and non-infringement.
              You remain responsible for final legal review and compliance of generated quote materials.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground">10. Limitation of Liability</h2>
            <p className="text-muted-foreground leading-relaxed">
              To the maximum extent permitted by law, ConveyQuote shall not be liable for indirect, incidental, special,
              consequential, or punitive damages, or for loss of profits, revenue, goodwill, or data. Aggregate liability
              is limited to the fees paid by you in the 12 months preceding the event giving rise to liability.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground">11. Suspension and Termination</h2>
            <p className="text-muted-foreground leading-relaxed">
              We may suspend or terminate access for material breach, abuse, legal risk, or non-payment. You may stop using
              the Service at any time. Upon termination, rights granted under these Terms cease, subject to provisions that
              by nature survive termination (including payment obligations, liability limits, and legal clauses).
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground">12. Governing Law</h2>
            <p className="text-muted-foreground leading-relaxed">
              These Terms are governed by the laws of England and Wales unless otherwise required by mandatory local law.
              Courts of England and Wales will have exclusive jurisdiction unless otherwise required.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground">13. Contact</h2>
            <p className="text-muted-foreground leading-relaxed">
              Questions about these Terms can be submitted through the support channels made available in your dashboard.
            </p>
          </section>
        </article>
      </main>
    </div>
  )
}
