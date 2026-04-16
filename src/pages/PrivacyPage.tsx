import { Link } from 'react-router-dom'
import { Scale, ArrowLeft } from 'lucide-react'

export default function PrivacyPage() {
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
            <h1 className="text-3xl sm:text-4xl font-bold text-foreground">Privacy Policy</h1>
            <p className="mt-3 text-muted-foreground">
              Effective date: {new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
            </p>
          </div>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground">1. Introduction</h2>
            <p className="text-muted-foreground leading-relaxed">
              This Privacy Policy explains how ConveyQuote collects, uses, stores, and protects personal data when you use
              our website, embedded quote forms, and software platform.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground">2. Data We Collect</h2>
            <ul className="list-disc pl-6 text-muted-foreground space-y-2">
              <li>Account data: name, email address, role, and authentication metadata.</li>
              <li>Firm data: firm profile information, configuration settings, and team access controls.</li>
              <li>Quote workflow data: property and transaction details submitted through quote forms.</li>
              <li>Communication data: support requests, transactional emails, and system notifications.</li>
              <li>Technical data: device/browser metadata, IP addresses, logs, and security telemetry.</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground">3. How We Use Data</h2>
            <ul className="list-disc pl-6 text-muted-foreground space-y-2">
              <li>To operate and maintain the Service and user accounts.</li>
              <li>To generate quote estimate invoices and related communications.</li>
              <li>To provide analytics, reporting, and workflow features requested by users.</li>
              <li>To detect abuse, maintain security, and enforce terms and legal obligations.</li>
              <li>To provide support and improve usability, reliability, and performance.</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground">4. Lawful Bases (UK GDPR)</h2>
            <p className="text-muted-foreground leading-relaxed">
              Depending on context, we process personal data on the basis of contract performance, legitimate interests,
              legal obligations, and consent where required. Customers remain responsible for identifying lawful bases for
              data they collect from their own website visitors and clients.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground">5. Sharing and Processors</h2>
            <p className="text-muted-foreground leading-relaxed">
              We may share data with trusted infrastructure, authentication, analytics, and communications providers acting
              under contractual safeguards. We do not sell personal data. We may disclose data where legally required,
              to protect rights and security, or in connection with corporate restructuring.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground">6. International Transfers</h2>
            <p className="text-muted-foreground leading-relaxed">
              Where personal data is transferred internationally, we implement appropriate safeguards such as contractual
              protections and organisational measures designed to maintain equivalent protection standards.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground">7. Retention</h2>
            <p className="text-muted-foreground leading-relaxed">
              We retain personal data for as long as needed to provide the Service, comply with legal obligations, resolve
              disputes, and enforce agreements. Retention periods vary by data category and account status.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground">8. Security Measures</h2>
            <p className="text-muted-foreground leading-relaxed">
              We implement technical and organisational safeguards including access controls, encryption in transit,
              environment separation, audit logging, and least-privilege principles. No platform can guarantee absolute
              security, but we continuously improve our controls.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground">9. Data Subject Rights</h2>
            <p className="text-muted-foreground leading-relaxed">
              Subject to applicable law, individuals may request access, correction, deletion, restriction, portability,
              and objection to processing. Requests may be submitted via support channels. We may request verification
              before processing requests.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground">10. Cookies and Similar Technologies</h2>
            <p className="text-muted-foreground leading-relaxed">
              We use essential and operational cookies/technologies to maintain sessions, secure authentication, and improve
              performance. Where non-essential cookies are used, we will present appropriate controls and notices.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground">11. Children’s Privacy</h2>
            <p className="text-muted-foreground leading-relaxed">
              The Service is not directed to children. We do not knowingly collect personal data from children under the
              age where parental consent is required by law.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground">12. Policy Updates</h2>
            <p className="text-muted-foreground leading-relaxed">
              We may update this Privacy Policy from time to time to reflect legal, technical, or business changes.
              Material updates will be communicated through the Service or by other appropriate means.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground">13. Contact and Complaints</h2>
            <p className="text-muted-foreground leading-relaxed">
              If you have privacy questions or wish to submit a rights request, use the support channels in the Service.
              You may also lodge a complaint with the UK Information Commissioner’s Office (ICO) where applicable.
            </p>
          </section>
        </article>
      </main>
    </div>
  )
}
