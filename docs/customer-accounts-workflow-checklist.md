# Customer Accounts + Firm Workflow Checklist

Use this as an implementation checklist for a customer portal where firms can request documents and complete staged workflows.

---

## 1) Product scope and roles

- [ ] Confirm user roles and permissions matrix:
  - [ ] Platform Owner
  - [ ] Firm Admin
  - [ ] Firm Read-only Team Member
  - [ ] Customer
- [ ] Decide if one customer can belong to multiple matters/firms.
- [ ] Decide if customers can invite co-buyers/co-sellers.
- [ ] Define legal/accountability requirements for document handling and audit logs.

---

## 2) Data model (DB)

- [ ] Add `customers` table (profile + auth user linkage).
- [ ] Add `matters` table (or `cases`) linked to `firm_id` and `customer_id`.
- [ ] Add `matter_participants` table for additional parties.
- [ ] Add `workflow_templates` table (firm-specific optional).
- [ ] Add `workflow_stages` table (ordered stages, unlock rules).
- [ ] Add `workflow_tasks` table (checkbox tasks per stage).
- [ ] Add `task_dependencies` table (task unlock chaining).
- [ ] Add `document_requests` table (what docs are required per task/stage).
- [ ] Add `uploaded_documents` table (file metadata + storage path + uploader).
- [ ] Add `task_events` table (who checked/unchecked/approved/rejected + timestamp).
- [ ] Add `notifications` table (customer + firm notifications).

---

## 3) Auth and access control

- [ ] Add customer signup/login routes.
- [ ] Add customer reset-password flow.
- [ ] Build RLS policies for customer-only matter/document access.
- [ ] Build RLS policies for firm team access by `firm_id`.
- [ ] Ensure platform owner override access is explicit and audited.
- [ ] Add row-level audit metadata (`created_by`, `updated_by`, `updated_at`).
- [ ] Enforce that next stage unlocks only when required prior tasks are complete.

---

## 4) Firm admin workflow UI

- [ ] “Create matter” flow (select customer + service + template).
- [ ] Stage/task board with checkbox controls.
- [ ] Task-level required documents panel.
- [ ] Document review controls:
  - [ ] Mark as accepted
  - [ ] Mark as rejected (reason required)
- [ ] Stage completion lock/unlock visualization.
- [ ] Activity timeline showing who completed what and when.
- [ ] Bulk download documents as ZIP by matter/stage.

---

## 5) Customer portal UI

- [ ] Customer dashboard with active matters.
- [ ] Matter detail showing current stage and unlocked tasks.
- [ ] Upload component for required documents per task.
- [ ] Task checklist visible to customer (read-only or interactive per design).
- [ ] Inline status badges: pending / uploaded / approved / rejected.
- [ ] Rejection feedback + re-upload action.
- [ ] Progress tracker showing locked vs unlocked next stage.

---

## 6) Document storage and security

- [ ] Create private storage bucket(s) for customer docs.
- [ ] Signed URL download strategy for firm/customer viewers.
- [ ] Virus scanning hook (optional but recommended).
- [ ] Restrict file types and size limits.
- [ ] Encrypt at rest/in transit (platform defaults + compliance checks).
- [ ] Add retention and deletion policy per matter lifecycle.

---

## 7) Workflow engine rules

- [ ] Define mandatory vs optional tasks.
- [ ] Define automatic unlock logic:
  - [ ] “All required tasks complete” unlocks next stage
  - [ ] Optional manual override by firm admin
- [ ] Define rollback behavior (if a document is rejected after completion).
- [ ] Add due dates/SLA per stage and overdue indicators.

---

## 8) Notifications

- [ ] Email customer when new task/document request is added.
- [ ] Email firm when customer uploads new document.
- [ ] Email customer when document approved/rejected.
- [ ] In-app notifications (customer + firm dashboard).
- [ ] Reminder cadence for outstanding tasks.

---

## 9) Reporting

- [ ] Matter funnel report: created -> in-progress -> completed.
- [ ] Stage duration report (avg time by stage).
- [ ] Outstanding document requests report.
- [ ] Team productivity report (tasks completed/reviewed by member).
- [ ] Customer completion rate and delay metrics.

---

## 10) MVP delivery plan (suggested)

- [ ] Phase 1: Customer auth + matter model + basic file upload.
- [ ] Phase 2: Firm task checklist + required documents + stage unlock.
- [ ] Phase 3: Review/approve/reject flow + notifications.
- [ ] Phase 4: Reports + timeline + polish + audit hardening.

---

## 11) Nice-to-have enhancements

- [ ] OCR and auto-classification of uploaded docs.
- [ ] E-sign integrations for forms.
- [ ] Shared customer/firm chat thread per matter.
- [ ] API/webhooks for external case management sync.
- [ ] Mobile-first customer UX improvements.

