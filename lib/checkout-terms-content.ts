export type TermsBlock =
  | { type: 'paragraph'; text: string }
  | { type: 'bullets'; items: string[] }

export type TermsSection = {
  number: string
  title: string
  blocks: TermsBlock[]
}

export const TERMS_MODAL_TITLE = 'Aircraft Rental and Services Agreement'
export const TERMS_MODAL_SUBTITLE = 'Cessna 172N - Wet Hire | CASA & NSW Compliant'
export const TERMS_LAST_UPDATED = 'Current version'

export const TERMS_NOTICE =
  'Please review the full rental agreement before accepting. This agreement applies to aircraft rental and related services provided by OZ Rent A Plane.'

export const TERMS_SECTIONS: TermsSection[] = [
  {
    number: '1',
    title: 'PARTIES',
    blocks: [
      { type: 'paragraph', text: 'This Agreement is between:' },
      { type: 'paragraph', text: 'JAM Aviation Pty Ltd (ACN: 695 639 555), trading as OZ Rent A Plane (Owner)' },
      { type: 'paragraph', text: 'AND' },
      { type: 'paragraph', text: 'Renter / Hirer (Renter)' },
    ],
  },
  {
    number: '2',
    title: 'LEASE & ACCEPTANCE OF AIRCRAFT',
    blocks: [
      { type: 'paragraph', text: '2.1 The Owner rents the Aircraft to the Renter on a non-exclusive, per-flight basis.' },
      { type: 'paragraph', text: '2.2 Prior to each flight, the Renter must conduct a full pre-flight inspection.' },
      { type: 'paragraph', text: '2.3 Acceptance Clause (Critical): Acceptance of the Aircraft by the Renter constitutes confirmation that:' },
      { type: 'bullets', items: ['The Aircraft is airworthy', 'The Aircraft is in good mechanical condition', 'The Renter is satisfied it is fit for intended flight'] },
      { type: 'paragraph', text: '2.4 The Aircraft must be returned in the same condition, fair wear and tear excepted.' },
    ],
  },
  {
    number: '3',
    title: 'TERM',
    blocks: [
      { type: 'paragraph', text: '3.1 This Agreement applies to all rentals from the Effective Date until:' },
      { type: 'bullets', items: ['Terminated by the Owner; or', 'Replaced by a new agreement'] },
    ],
  },
  {
    number: '4',
    title: 'OPERATIONAL CONTROL & CASA COMPLIANCE',
    blocks: [
      { type: 'paragraph', text: '4.1 The Aircraft is under the operational control of the Pilot in Command (Renter).' },
      { type: 'paragraph', text: '4.2 The Renter must comply with:' },
      { type: 'bullets', items: ['Civil Aviation Act 1988 (Cth)', 'CASR & CAR', 'CASA directions', 'AIP, ERSA, NOTAMs'] },
      { type: 'paragraph', text: '4.3 The Renter must:' },
      { type: 'bullets', items: ['Operate within licence privileges', 'Maintain recency (CASR Part 61)', 'Not permit unauthorised pilots'] },
    ],
  },
  {
    number: '5',
    title: 'OPERATIONAL REQUIREMENTS',
    blocks: [
      { type: 'paragraph', text: 'The Renter agrees to:' },
      { type: 'bullets', items: ['Conduct all flights using approved checklists', 'Review weather (METAR/TAF) and NOTAMs', 'Complete weight & balance calculations', 'Ensure fuel planning compliance', 'Secure aircraft when unattended'] },
      { type: 'paragraph', text: 'Flight Planning:' },
      { type: 'bullets', items: ['Flight plan or SARTIME must be used where required under CASA rules'] },
      { type: 'paragraph', text: 'Passengers:' },
      { type: 'bullets', items: ['Renter is responsible for passenger safety briefings'] },
    ],
  },
  {
    number: '6',
    title: 'OPERATING LIMITATIONS',
    blocks: [
      { type: 'bullets', items: ['Base Airport: YSBK (Bankstown Airport, NSW)', 'NSW operations only unless approved', 'Hard surface runways only unless approved', 'VFR Day/Night only unless IFR certified and authorised'] },
      { type: 'paragraph', text: 'Crosswind Limitation:' },
      { type: 'bullets', items: ['Crosswind component must not exceed the published aircraft limitations in the approved Flight Manual/POH and any lower limits imposed by the Owner or insurer.'] },
    ],
  },
  {
    number: '7',
    title: 'PROHIBITED USES',
    blocks: [
      { type: 'paragraph', text: 'The Aircraft must NOT be used for:' },
      { type: 'bullets', items: ['Illegal purposes', 'Charter or hire and reward', 'Flight training (unless approved)', 'Aerobatics', 'Formation flying', 'Operations outside CASA approvals'] },
    ],
  },
  {
    number: '8',
    title: 'RENTAL RATES & PAYMENT',
    blocks: [
      { type: 'bullets', items: ['$330/hr VDO (wet)'] },
      { type: 'paragraph', text: 'Minimum Usage:' },
      { type: 'bullets', items: ['A minimum charge of 4 hours applies where the Renter retains the Aircraft for a continuous 24-hour period', 'The Owner may, at its discretion, review and vary the 4-hour minimum on a case-by-case basis'] },
      { type: 'paragraph', text: 'Payment:' },
      { type: 'bullets', items: ['Due on return', 'Based on Flight Records Page and aircraft hour meters'] },
      { type: 'paragraph', text: 'Late Payment:' },
      { type: 'bullets', items: ['Any charges due and owing hereunder, if not paid within seven (7) days, shall bear interest at the rate of 1% per month, or the highest rate allowable by law, whichever is less'] },
    ],
  },
  {
    number: '9',
    title: 'ADDITIONAL EXPENSES',
    blocks: [
      { type: 'paragraph', text: 'Renter liable for:' },
      { type: 'bullets', items: ['Landing fees', 'Parking, tie-down or hangar fees, including overnight parking/hangar when outside the home base', 'Aircraft recovery costs if stranded'] },
      { type: 'paragraph', text: 'Renter liable for:' },
      { type: 'bullets', items: ['Landing fees', 'Parking/hangar', 'Aircraft recovery costs if stranded'] },
    ],
  },
  {
    number: '10',
    title: 'FUEL POLICY',
    blocks: [
      { type: 'paragraph', text: 'The parties acknowledge and agree that all Aircraft are rented to the Renter "wet" (i.e., with fuel).' },
      { type: 'paragraph', text: 'In the event that the Renter is required to purchase additional fuel during any rental, upon return of the Aircraft and provision of valid evidence of such fuel purchase, the Owner shall credit the Renter at the Owner’s then applicable published fuel credit rate.' },
      { type: 'paragraph', text: 'Such credit shall be applied on account and offset against charges due to the Owner for future flights by the Renter.' },
    ],
  },
  {
    number: '11',
    title: 'INSURANCE & LIABILITY',
    blocks: [
      { type: 'bullets', items: ['Excess: $1,200', 'Renter liable for uninsured losses'] },
      { type: 'paragraph', text: 'Insurance Void If:' },
      { type: 'bullets', items: ['CASA breach', 'Agreement breach', 'Negligence or unlawful use'] },
    ],
  },
  {
    number: '12',
    title: 'INDEMNITY',
    blocks: [
      { type: 'paragraph', text: 'The Renter indemnifies the Owner against:' },
      { type: 'bullets', items: ['Injury or death', 'Property damage', 'Legal costs', 'Aircraft damage'] },
      { type: 'paragraph', text: 'Arising from use or breach of this Agreement.' },
    ],
  },
  {
    number: '13',
    title: 'DAMAGE, INCIDENTS & DOWNTIME',
    blocks: [
      { type: 'bullets', items: ['Immediate reporting required', 'Renter liable for repair + downtime loss'] },
    ],
  },
  {
    number: '14',
    title: 'CANCELLATION POLICY',
    blocks: [
      { type: 'bullets', items: ['<24 hrs: $100', 'No-show: $100'] },
    ],
  },
  {
    number: '15',
    title: 'CLEANING, SMOKING & PETS',
    blocks: [
      { type: 'paragraph', text: '15.1 The Aircraft must be returned in a clean and tidy condition.' },
      { type: 'paragraph', text: '15.2 Smoking is strictly prohibited in or around the Aircraft.' },
      { type: 'paragraph', text: '15.3 Pets or animals are not permitted unless prior written approval is obtained from the Owner.' },
      { type: 'paragraph', text: '15.4 Where the Aircraft is returned in an unclean condition, or where smoking or unauthorised animals have resulted in cleaning requirements, the Owner may charge:' },
      { type: 'bullets', items: ['Cleaning fees', 'Detailing costs', 'Downtime costs if the Aircraft is unavailable for subsequent bookings'] },
    ],
  },
  {
    number: '16',
    title: 'PILOT QUALIFICATION & DOCUMENTATION',
    blocks: [
      { type: 'paragraph', text: 'Renter must provide:' },
      { type: 'bullets', items: ['Licence', 'Medical', 'ID', 'Flight history (if requested)'] },
      { type: 'paragraph', text: 'All information must remain current and accurate.' },
    ],
  },
  {
    number: '16',
    title: 'MULTI-AIRCRAFT CLAUSE',
    blocks: [{ type: 'paragraph', text: 'Agreement applies to all aircraft in fleet subject to approval and training.' }],
  },
  {
    number: '17',
    title: 'IFR / GPS UPGRADE',
    blocks: [
      { type: 'paragraph', text: 'IFR operations only permitted if:' },
      { type: 'bullets', items: ['Aircraft certified', 'Pilot rated', 'Owner approval given'] },
    ],
  },
  {
    number: '18',
    title: 'DIGITAL RECORDS & SIGNATURES',
    blocks: [{ type: 'paragraph', text: 'Electronic forms and signatures are legally binding.' }],
  },
  {
    number: '19',
    title: 'RISK ACKNOWLEDGEMENT',
    blocks: [{ type: 'paragraph', text: 'The Renter acknowledges aviation risk and accepts full responsibility as PIC.' }],
  },
  {
    number: '20',
    title: 'GOVERNING LAW',
    blocks: [
      { type: 'paragraph', text: 'This Agreement is governed by the laws of New South Wales and Australia.' },
      { type: 'paragraph', text: 'SCHEDULES' },
      { type: 'bullets', items: ['Pilot Competency Matrix', 'Pre-Flight Checklist', 'Damage Reporting Flow', 'Digital Forms Workflow'] },
    ],
  },
  {
    number: '21',
    title: 'RISK OF LOSS & RESPONSIBILITY',
    blocks: [
      { type: 'paragraph', text: '21.1 The Renter is liable for any loss of or damage to the Aircraft while it is in the Renter’s possession or operational control, including but not limited to:' },
      { type: 'bullets', items: ['Accidents or incidents', 'Third-party acts', 'Weather or environmental events (including acts of God)'] },
      { type: 'paragraph', text: '21.2 The Owner strongly recommends the Renter obtain pilot renter’s insurance.' },
      { type: 'paragraph', text: '21.3 To the extent permitted by law, the Renter acknowledges:' },
      { type: 'bullets', items: ['Their insurance is primary', 'The Owner’s insurance is not intended to respond to the Renter’s liabilities'] },
      { type: 'paragraph', text: '21.4 The Renter is responsible for all costs required to restore the Aircraft to its pre-rental condition (fair wear and tear excepted).' },
      { type: 'paragraph', text: '21.5 In the event of:' },
      { type: 'bullets', items: ['Damage', 'Malfunction', 'Incident'] },
      { type: 'paragraph', text: 'The Renter must immediately notify the Owner and comply with CASA and ATSB reporting requirements.' },
      { type: 'paragraph', text: '21.6 The Owner is not liable for:' },
      { type: 'bullets', items: ['Accommodation', 'Transport', 'Meals', 'Alternative travel costs'] },
      { type: 'paragraph', text: 'arising from aircraft unserviceability.' },
    ],
  },
  {
    number: '22',
    title: 'ALTERATIONS',
    blocks: [
      { type: 'paragraph', text: '22.1 The Renter must not modify, alter, or install equipment on the Aircraft without prior written approval.' },
      { type: 'paragraph', text: '22.2 Any approved modification becomes the property of the Owner.' },
    ],
  },
  {
    number: '23',
    title: 'MISCELLANEOUS',
    blocks: [
      { type: 'paragraph', text: '23.1 Entire Agreement' },
      { type: 'paragraph', text: 'This Agreement constitutes the entire agreement and supersedes all prior arrangements.' },
      { type: 'paragraph', text: '23.2 Governing Law' },
      { type: 'paragraph', text: 'This Agreement is governed by the laws of New South Wales, Australia.' },
      { type: 'paragraph', text: '23.3 Dispute Resolution (Australian Adaptation)' },
      { type: 'paragraph', text: 'Parties agree to attempt resolution via good faith negotiation and mediation in NSW prior to litigation.' },
      { type: 'paragraph', text: '23.4 Waiver' },
      { type: 'paragraph', text: 'Failure to enforce a provision does not waive future enforcement.' },
      { type: 'paragraph', text: '23.5 Severability' },
      { type: 'paragraph', text: 'Invalid provisions do not affect the remainder of the Agreement.' },
      { type: 'paragraph', text: '23.6 Legal Costs' },
      { type: 'paragraph', text: 'The prevailing party may recover reasonable legal costs to the extent permitted by law.' },
      { type: 'paragraph', text: '23.7 Counterparts & Electronic Execution' },
      { type: 'paragraph', text: 'This Agreement may be executed electronically and in counterparts, each forming one agreement.' },
      { type: 'paragraph', text: '23.8 Survival' },
      { type: 'paragraph', text: 'Clauses relating to liability, indemnity, payment, and risk survive termination.' },
    ],
  },
  {
    number: '24',
    title: 'ACKNOWLEDGEMENT OF WAIVER OF JURY TRIAL (AUSTRALIAN CONTEXT)',
    blocks: [
      { type: 'paragraph', text: '24.1 The parties acknowledge that jury trials are generally not applicable in Australian civil contract disputes.' },
      { type: 'paragraph', text: '24.2 To the extent applicable, parties agree disputes will be resolved by a judge in a court of competent jurisdiction in NSW.' },
    ],
  },
]

export const TERMS_END_TEXT = 'End of Agreement'
