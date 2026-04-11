import { Link } from 'react-router-dom'
import {
  Scale,
  FileText,
  Users,
  BarChart3,
  Shield,
  Zap,
  ArrowRight,
  CheckCircle2,
  Code,
  Mail,
} from 'lucide-react'

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-white">
      {/* Navigation */}
      <nav className="border-b border-border/40 bg-white/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-2">
              <Scale className="h-7 w-7 text-primary" />
              <span className="text-xl font-bold text-foreground">ConveyQuote</span>
            </div>
            <div className="hidden md:flex items-center gap-8">
              <a href="#features" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Features</a>
              <a href="#pricing" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Pricing</a>
              <a href="#how-it-works" className="text-sm text-muted-foreground hover:text-foreground transition-colors">How It Works</a>
            </div>
            <div className="flex items-center gap-3">
              <Link
                to="/admin/login"
                className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
              >
                Sign In
              </Link>
              <Link
                to="/admin/signup"
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                Get Started
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-chart-2/5" />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-20 pb-24 lg:pt-32 lg:pb-36">
          <div className="max-w-3xl mx-auto text-center">
            <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-4 py-1.5 text-sm font-medium text-primary mb-6">
              <Zap className="h-4 w-4" />
              Built for UK Conveyancing Firms
            </div>
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-foreground tracking-tight leading-tight">
              Instant Conveyancing Quotes,{' '}
              <span className="text-primary">Automated Workflows</span>
            </h1>
            <p className="mt-6 text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed">
              Embed a white-label quote calculator on your website. Capture leads automatically,
              send professional estimates, and manage your pipeline from one dashboard.
            </p>
            <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link
                to="/admin/signup"
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-8 py-3 text-base font-semibold text-primary-foreground hover:bg-primary/90 transition-colors shadow-lg shadow-primary/20"
              >
                Start Free Trial
                <ArrowRight className="h-5 w-5" />
              </Link>
              <Link
                to="/quote/demo"
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-lg border border-border px-8 py-3 text-base font-medium text-foreground hover:bg-accent transition-colors"
              >
                See Demo Quote
              </Link>
            </div>
            <div className="mt-8 flex items-center justify-center gap-6 text-sm text-muted-foreground">
              <span className="flex items-center gap-1.5"><CheckCircle2 className="h-4 w-4 text-green-500" /> No credit card required</span>
              <span className="flex items-center gap-1.5"><CheckCircle2 className="h-4 w-4 text-green-500" /> Setup in minutes</span>
              <span className="flex items-center gap-1.5"><CheckCircle2 className="h-4 w-4 text-green-500" /> White-label ready</span>
            </div>
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section id="features" className="py-20 lg:py-28 bg-muted/30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-foreground">Everything You Need</h2>
            <p className="mt-4 text-lg text-muted-foreground max-w-2xl mx-auto">
              A complete platform for generating, managing, and sending conveyancing quotes.
            </p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {[
              {
                icon: FileText,
                title: 'Instant Quote Calculator',
                description: 'Configurable pricing bands, automatic extras, and real-time calculations for purchase, sale, remortgage, and combined transactions.',
              },
              {
                icon: Code,
                title: 'Embeddable Widget',
                description: 'Drop a single script tag on your website. The quote form matches your brand colors and captures leads directly into your pipeline.',
              },
              {
                icon: Users,
                title: 'Lead Management',
                description: 'Track every enquiry from first touch to instruction. Filter, search, and manage your pipeline with status tracking.',
              },
              {
                icon: Mail,
                title: 'Automated Emails',
                description: 'Send professional quote estimates and invoices via email with PDF attachments. Auto-send or manual control.',
              },
              {
                icon: BarChart3,
                title: 'Dashboard Analytics',
                description: 'See your lead volume, conversion rates, and revenue at a glance. Track new enquiries and quotes needing review.',
              },
              {
                icon: Shield,
                title: 'Secure & Compliant',
                description: 'Row-level security on all data. Each firm sees only their own leads, quotes, and settings. Built on enterprise-grade infrastructure.',
              },
            ].map((feature) => (
              <div
                key={feature.title}
                className="relative rounded-xl border border-border bg-card p-8 hover:shadow-lg transition-shadow"
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 mb-5">
                  <feature.icon className="h-6 w-6 text-primary" />
                </div>
                <h3 className="text-lg font-semibold text-foreground mb-2">{feature.title}</h3>
                <p className="text-muted-foreground leading-relaxed">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section id="how-it-works" className="py-20 lg:py-28">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-foreground">How It Works</h2>
            <p className="mt-4 text-lg text-muted-foreground max-w-2xl mx-auto">
              Get up and running in three simple steps.
            </p>
          </div>
          <div className="grid md:grid-cols-3 gap-12">
            {[
              {
                step: '01',
                title: 'Configure Your Pricing',
                description: 'Set up fee bands for each service type, add conditional extras, and define discount codes. Control exactly what your clients see.',
              },
              {
                step: '02',
                title: 'Embed on Your Website',
                description: 'Copy a single embed snippet and paste it into your website. The form automatically adapts to your branding and captures leads.',
              },
              {
                step: '03',
                title: 'Manage & Convert',
                description: 'Review leads, edit quotes, send professional estimates by email, and track the full journey from enquiry to instruction.',
              },
            ].map((item) => (
              <div key={item.step} className="text-center">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 text-primary font-bold text-2xl mb-6">
                  {item.step}
                </div>
                <h3 className="text-xl font-semibold text-foreground mb-3">{item.title}</h3>
                <p className="text-muted-foreground leading-relaxed">{item.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" className="py-20 lg:py-28 bg-muted/30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-foreground">Simple, Transparent Pricing</h2>
            <p className="mt-4 text-lg text-muted-foreground">Start free. Upgrade when you are ready.</p>
          </div>
          <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
            {/* Free Plan */}
            <div className="rounded-xl border border-border bg-card p-8">
              <h3 className="text-lg font-semibold text-foreground">Free</h3>
              <div className="mt-4 flex items-baseline gap-1">
                <span className="text-4xl font-bold text-foreground">$0</span>
                <span className="text-muted-foreground">/month</span>
              </div>
              <p className="mt-4 text-muted-foreground">Perfect for getting started and testing the platform.</p>
              <ul className="mt-8 space-y-3">
                {['Lead capture & pipeline', 'Configurable pricing bands', 'Manual review workflow', 'Basic embed widget'].map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm">
                    <CheckCircle2 className="h-5 w-5 text-green-500 shrink-0 mt-0.5" />
                    <span className="text-foreground">{f}</span>
                  </li>
                ))}
              </ul>
              <Link
                to="/admin/signup"
                className="mt-8 block w-full text-center rounded-lg border border-border py-2.5 text-sm font-medium text-foreground hover:bg-accent transition-colors"
              >
                Get Started Free
              </Link>
            </div>

            {/* Professional Plan */}
            <div className="rounded-xl border-2 border-primary bg-card p-8 relative">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 inline-flex items-center rounded-full bg-primary px-3 py-1 text-xs font-medium text-primary-foreground">
                Popular
              </div>
              <h3 className="text-lg font-semibold text-foreground">Professional</h3>
              <div className="mt-4 flex items-baseline gap-1">
                <span className="text-4xl font-bold text-foreground">$49</span>
                <span className="text-muted-foreground">/month</span>
              </div>
              <p className="mt-4 text-muted-foreground">Everything you need for a professional conveyancing practice.</p>
              <ul className="mt-8 space-y-3">
                {[
                  'Everything in Free',
                  'Instant quote display',
                  'Estimate & invoice documents',
                  'Automated quote emails',
                  'Discount code system',
                  'Instruction workflow',
                  'PDF generation & download',
                  'Priority support',
                ].map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm">
                    <CheckCircle2 className="h-5 w-5 text-green-500 shrink-0 mt-0.5" />
                    <span className="text-foreground">{f}</span>
                  </li>
                ))}
              </ul>
              <Link
                to="/admin/signup"
                className="mt-8 block w-full text-center rounded-lg bg-primary py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                Start Free Trial
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 lg:py-28">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="rounded-2xl bg-primary p-12 lg:p-16 text-center">
            <h2 className="text-3xl sm:text-4xl font-bold text-primary-foreground">
              Ready to Streamline Your Quotes?
            </h2>
            <p className="mt-4 text-lg text-primary-foreground/80 max-w-2xl mx-auto">
              Join law firms already using ConveyQuote to automate their conveyancing quote process.
            </p>
            <Link
              to="/admin/signup"
              className="mt-8 inline-flex items-center gap-2 rounded-lg bg-white px-8 py-3 text-base font-semibold text-primary hover:bg-white/90 transition-colors"
            >
              Create Your Account
              <ArrowRight className="h-5 w-5" />
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <Scale className="h-5 w-5 text-primary" />
              <span className="font-semibold text-foreground">ConveyQuote</span>
            </div>
            <p className="text-sm text-muted-foreground">
              &copy; {new Date().getFullYear()} ConveyQuote. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  )
}
