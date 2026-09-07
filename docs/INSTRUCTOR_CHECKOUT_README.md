# Instructor Checkout Flight & Instructor Management System
## Feature Specification & Technical Architecture

---

## 1. Overview & Objective

The **Instructor Checkout Flight** feature is an aircraft-specific onboarding workflow that enables qualified pilots to become authorized flight instructors on the OZRentaplane fleet. 

Unlike general solo-hire checkout clearance (which grants general flight permissions), **instructor authorization is granted per aircraft make and model** (e.g., Cessna 172N, Piper Archer, Cirrus SR22).

### Key Pillars:
1. **Direct Onboarding or Transition:** Both new applicants and existing solo-cleared pilots can request an instructor checkout without re-doing unnecessary steps.
2. **Aircraft-Specific Clearance:** Separate authorizations are tracked and enforced for each aircraft.
3. **Smart Document Reuse:** Pilots with valid documents on file skip redundant document uploads, while Night VFR and Instructor Endorsements are verified when applicable.
4. **Financial Safety Gate:** Unpaid or overdue invoices block checkout submission until cleared.
5. **Operational Clarity:** Clear tags and badges across customer bookings, admin action feeds, checkout reviews, and dedicated instructor management directory.

---

## 2. End-to-End User Journeys

### Journey A: Pilot Booking an Instructor Checkout Flight
```
1. Navigate to /dashboard/instructor ("Become an Instructor" page)
2. Select target aircraft (e.g. Cessna 172N)
3. Click "Book Instructor Checkout Flight"
4. System checks for pending unpaid invoices:
   ├── If unpaid invoices found: Block submission with alert & link to invoice
   └── If clean account: Proceed to Date & Time selection
5. Select Sydney Date & Time slot (2-hour checkout window)
6. Choose Day VFR or Night VFR:
   ├── If Day VFR: Enforce day window (before Sydney sunset + 120m buffer)
   └── If Night VFR: Enforce Night VFR rating & evidence document
7. Document Step:
   ├── If required docs (licence, medical, photo ID) exist: Auto-skip step
   └── If missing docs: Upload required credentials
8. Review details, accept terms, and click Submit
9. Booking created with `checkout_type = 'instructor'` & target `aircraft_id`
```

### Journey B: Dashboard & Application Status Reflection
```
Once submitted:
• On /dashboard/instructor:
  - Top Hero CTA changes from "Book Instructor Checkout Flight" -> "View Booking"
  - Banner displayed: "Instructor checkout requested for Cessna 172N — awaiting admin review."
  - Application Status Badge changes from "Not Approved" -> "Pending Admin Review" (Amber) or "Checkout Confirmed" (Blue)
  - "Ready to Take the Next Step" bottom card updates with current booking details
• On /dashboard/bookings:
  - Distinct badge: "Instructor Checkout" displayed next to aircraft registration
```

### Journey C: Admin Action Feed & Review
```
1. Admin opens Command Centre (/admin)
2. Action Queue displays item with distinct "Instructor Checkout" badge (purple/indigo pill)
3. Admin clicks "Review Checkout" -> Opens /admin/bookings/requests/[id]
4. Review panel clearly highlights:
   - "Instructor Checkout Request — [Aircraft Name]"
   - Candidate's qualifications, licence, medical, ARN, and Night VFR status
5. Admin confirms slot -> Booking status becomes `checkout_confirmed`
6. Flight completed -> Admin records checkout outcome:
   - Grants aircraft-specific instructor clearance in `instructor_aircraft_clearances`
   - Elevates/ensures role `instructor` in `user_roles`
```

### Journey D: Admin Instructor Directory
```
1. Admin navigates to Customers -> Instructors (/admin/customers/instructors)
2. Admin views table of all instructors and applicants:
   - Name, ARN, Email, Phone
   - Aircraft clearances matrix (e.g. C172N [Approved], SR22 [Pending])
   - Active status, student count, total instructional hours
   - Quick actions: View Profile, Manage Aircraft Clearances, View History
```

---

## 3. Database Schema Design

### 3.1. `instructor_aircraft_clearances`
```sql
CREATE TABLE public.instructor_aircraft_clearances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  instructor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  aircraft_id uuid NOT NULL REFERENCES public.aircraft(id) ON DELETE CASCADE,
  clearance_status text NOT NULL DEFAULT 'pending' 
    CHECK (clearance_status IN ('pending', 'approved', 'suspended', 'revoked', 'expired')),
  cleared_at timestamptz,
  cleared_by uuid REFERENCES auth.users(id),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_instructor_aircraft UNIQUE (instructor_id, aircraft_id)
);

CREATE INDEX idx_instructor_aircraft_clearances_instructor ON public.instructor_aircraft_clearances(instructor_id);
CREATE INDEX idx_instructor_aircraft_clearances_aircraft ON public.instructor_aircraft_clearances(aircraft_id);
```

### 3.2. `bookings` Table Additions
```sql
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS checkout_type text NOT NULL DEFAULT 'standard'
    CHECK (checkout_type IN ('standard', 'instructor', 'renewal'));

CREATE INDEX IF NOT EXISTS idx_bookings_checkout_type ON public.bookings(checkout_type);
```

### 3.3. Foundation for Future Capabilities: `instructor_students`
```sql
CREATE TABLE public.instructor_students (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  instructor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'transferred')),
  assigned_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_instructor_student UNIQUE (instructor_id, student_id)
);
```

---

## 4. Critical Edge Cases & Safeguards

| # | Edge Case / Risk | Architectural Safeguard |
|---|---|---|
| **1** | Existing `cleared_to_fly` pilot booking instructor checkout | Atomic booking RPC allows `cleared_to_fly` pilots when `checkout_type = 'instructor'`. |
| **2** | Multiple aircraft checkouts | Active booking uniqueness is scoped by `(user_id, aircraft_id, checkout_type)`. |
| **3** | Unpaid / overdue invoices | Query `booking_invoices` for unpaid balances and hard-gate checkout submission. |
| **4** | Missing Flight Instructor Rating (FIR) | Validation verifies presence of instructor credentials before completing submission. |
| **5** | Night VFR slot selection | Sydney sunset calculation dynamically enforces Night VFR document checks for evening flights. |
| **6** | Approval side-effects | Admin checkout confirmation grants specific aircraft clearance without resetting general solo status. |

---

## 5. UI Touchpoint Summary

- **Customer Dashboard:**
  - `app/dashboard/instructor/page.tsx`: Dynamic status, aircraft selector, and context-aware CTA.
  - `app/dashboard/checkout/page.tsx` & `CheckoutFlow.tsx`: Instructor flow mode, invoice gate, document bypass.
  - `app/dashboard/bookings/page.tsx`: Instructor Checkout badges.
- **Admin Dashboard:**
  - `app/admin/AdminSidebar.tsx`: Instructors navigation under Customers.
  - `app/admin/customers/instructors/page.tsx`: Instructors Directory management table.
  - `app/admin/ActionQueueSection.tsx`: "Instructor Checkout" action feed pill.
  - `app/admin/bookings/requests/[id]/AdminCheckoutReviewPanel.tsx`: Aircraft-specific instructor confirmation.
