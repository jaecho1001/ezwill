import type { WillClauseTemplate } from "@/types/will-document"

/**
 * Ontario Will & POA Clause Library
 *
 * Based on the Law Society of Ontario Annotated Will 2026 (199 pages, 9 TABs).
 * Each clause uses {{placeholder}} variables resolved from the will draft data.
 *
 * Organized by document type:
 * - 'all' clauses appear in every will
 * - 'single_will' for Tier 1 standard/short-form simple wills
 * - 'probate_will' / 'non_probate_will' for Tier 2 dual will strategy
 * - 'poa_property' / 'poa_personal_care' for Powers of Attorney
 * - 'affidavit_*' for Affidavits of Execution
 *
 * Annotations cite specific Ontario statutes and case law.
 */

export const willClauseLibrary: WillClauseTemplate[] = [
  // ============================================================
  // 1. REVOCATION
  // ============================================================
  {
    id: "rev",
    section: "Revocation",
    name: "Revocation",
    sortOrder: 1,
    isFolder: true,
    templateText: "",
    annotation: "Revokes all prior Wills and Codicils. Required in every Will.",
    tier: 1,
    documentType: "all",
  },
  {
    id: "rev-single",
    section: "Revocation",
    subsection: "Single Will Revocation",
    name: "Revocation of All Prior Wills",
    parentId: "rev",
    sortOrder: 1,
    isFolder: false,
    templateText:
      "I, {{testatorFullName}}, of the {{city}} of {{cityName}}, in the Province of {{province}}, hereby revoke all former Wills and Codicils made by me and declare this to be my Last Will and Testament.",
    annotation: "Standard revocation clause for a single will. Revokes ALL prior wills.",
    tier: 1,
    documentType: "single_will",
  },
  {
    id: "rev-probate",
    section: "Revocation",
    subsection: "Probate Will Revocation",
    name: "Revocation — Probate Will (Dual Will)",
    parentId: "rev",
    sortOrder: 2,
    isFolder: false,
    templateText:
      'I, {{testatorFullName}}, of the {{city}} of {{cityName}}, in the Province of {{province}}, revoke all former Wills and Codicils made by me EXCEPT my Non-Probate Will of even date (hereinafter my "Non-Probate Will"), and declare this to be my Last Will and Testament dealing with my Probate Assets (as defined below).',
    annotation:
      "Dual will revocation — explicitly preserves the Non-Probate Will. Critical: must reference the Non-Probate Will by date. See Granovsky Estate v. Ontario; Re Milne Estate (2019 ONSC 579).",
    statute: "EAT Act 1998",
    caselaw: "Re Milne Estate (2019 ONSC 579, Div. Ct.)",
    tier: 2,
    documentType: "probate_will",
  },
  {
    id: "rev-nonprobate",
    section: "Revocation",
    subsection: "Non-Probate Will Revocation",
    name: "Revocation — Non-Probate Will (Dual Will)",
    parentId: "rev",
    sortOrder: 3,
    isFolder: false,
    templateText:
      'I, {{testatorFullName}}, of the {{city}} of {{cityName}}, in the Province of {{province}}, revoke all former Wills and Codicils made by me dealing with Non-Probate Assets (as defined below) EXCEPT my Probate Will of even date (hereinafter my "Probate Will"), and declare this to be my Non-Probate Will dealing with my Non-Probate Assets.',
    annotation:
      "The secondary/private will. Cross-references the Probate Will. Covers private company shares, LP interests, trust interests, and first-dealings real estate.",
    statute: "EAT Act 1998",
    caselaw: "Granovsky Estate v. Ontario (1998)",
    tier: 2,
    documentType: "non_probate_will",
  },

  // ============================================================
  // 2. INTERPRETATION / DEFINITIONS
  // ============================================================
  {
    id: "interp",
    section: "Interpretation",
    name: "Interpretation",
    sortOrder: 2,
    isFolder: true,
    templateText: "",
    annotation: "Definitions used throughout the Will.",
    tier: 1,
    documentType: "all",
  },
  {
    id: "interp-spouse",
    section: "Interpretation",
    subsection: "Spouse",
    name: "Definition of Spouse",
    parentId: "interp",
    sortOrder: 1,
    isFolder: false,
    templateText:
      'In this my Will, "my spouse" means {{spouseFullName}}, provided that at the time of my death we are not living separate and apart and there is no subsisting order or agreement providing for our separation.',
    annotation:
      "Defines who is considered the testator's spouse. The 'living separate and apart' condition ensures SLRA s.17 is respected — if separated 3+ years, gifts to spouse are void.",
    statute: "SLRA s.17; SLRA s.1(1)",
    tier: 1,
    documentType: "all",
    applicableWhen: { hasSpouse: true },
  },
  {
    id: "interp-children",
    section: "Interpretation",
    subsection: "Children",
    name: "Definition of Children",
    parentId: "interp",
    sortOrder: 2,
    isFolder: false,
    templateText:
      'In this my Will, "my children" means {{childNames}}, and includes any child of mine born or adopted after the date of this Will.',
    annotation:
      "Names all known children and catches after-born/after-adopted children. Critical for per stirpes distribution.",
    tier: 1,
    documentType: "all",
    applicableWhen: { hasChildren: true },
  },
  {
    id: "interp-issue",
    section: "Interpretation",
    subsection: "Issue / Per Stirpes",
    name: "Definition of Issue and Per Stirpes",
    parentId: "interp",
    sortOrder: 3,
    isFolder: false,
    templateText:
      'In this my Will, "issue" means all lineal descendants of every degree, and a gift to issue "per stirpes" shall mean that each generation shall take equally the share that their deceased ancestor would have taken had such ancestor survived, by right of representation.',
    annotation:
      "Per stirpes is the recommended distribution method. Including 'issue' (potentially unborn grandchildren) defeats a Saunders v. Vautier application because the class of beneficiaries is never fully ascertainable.",
    caselaw: "Saunders v. Vautier [1841]",
    tier: 2,
    documentType: "all",
  },
  {
    id: "interp-probate-assets",
    section: "Interpretation",
    subsection: "Probate Assets",
    name: "Definition of Probate Assets (Dual Will)",
    parentId: "interp",
    sortOrder: 4,
    isFolder: false,
    templateText:
      'In this my Probate Will, "Probate Assets" means all property owned by me at the time of my death for which a grant of authority by a court of competent jurisdiction is required to complete a transfer of legal ownership to my Trustees, but excludes my Non-Probate Assets as defined in my Non-Probate Will.',
    annotation:
      "Allocation clause — the key clause that makes dual wills valid. Probate assets are those requiring a Certificate of Appointment (real estate, bank accounts, investments). Re Milne Estate confirmed this allocation is valid.",
    statute: "EAT Act 1998; Estates Act",
    caselaw: "Re Milne Estate (2019 ONSC 579, Div. Ct.)",
    tier: 2,
    documentType: "probate_will",
  },
  {
    id: "interp-nonprobate-assets",
    section: "Interpretation",
    subsection: "Non-Probate Assets",
    name: "Definition of Non-Probate Assets (Dual Will)",
    parentId: "interp",
    sortOrder: 5,
    isFolder: false,
    templateText:
      'In this my Non-Probate Will, "Non-Probate Assets" means all shares in the capital of any private corporation, all partnership and limited partnership interests, all interests in trusts, all personal property that is transferable by delivery, and all real property for which the Land Registrar will accept a first-dealings application without requiring a Certificate of Appointment of Estate Trustee.',
    annotation:
      "These assets do not require probate, so the Non-Probate Will is never submitted to court — avoiding Estate Administration Tax (~$15 per $1,000 of estate value). Private company shares are the most common Non-Probate Asset.",
    statute: "EAT Act 1998; Land Titles Act",
    caselaw: "Granovsky Estate v. Ontario (1998)",
    tier: 2,
    documentType: "non_probate_will",
  },

  // ── Additional Interpretation Clauses (from firm precedent) ──
  {
    id: "interp-nonprobate-defined",
    section: "Interpretation",
    subsection: "Excluded Property Definition (Non-Probate)",
    name: "Excluded Property / Non-Probate Estate — Full Definition",
    parentId: "interp",
    sortOrder: 6,
    isFolder: false,
    templateText:
      'In this my Non-Probate Will, my "Non-Probate Estate" shall consist of "Excluded Property," which means:\n\n(a) Shares in or debt from any corporation for which a grant of authority from a court of competent jurisdiction is not required for the transfer, distribution, or realization thereof, and any reference to the shares which are represented by a different capital holding in such corporation or in any other corporation as the result of an amalgamation, reconstruction, or rearrangement;\n\n(b) Assets held in trust by a corporation for me;\n\n(c) Any interest in any partnership or joint venture for which a grant of authority from a court of competent jurisdiction is not required for the transfer, distribution, disposition or realization thereof;\n\n(d) Any beneficial interest I may have in any trust for which a grant of authority from a court of competent jurisdiction is not required;\n\n(e) Any articles of personal or household use or ornament or jewelry and any works of art, for which a grant of authority from a court of competent jurisdiction is not required;\n\n(f) All amounts owing to me and for which a grant of authority from a court of competent jurisdiction is not required;\n\n(g) Any other investments including but not limited to cash on deposit and investments, registered or not registered, that the institution where they are invested agrees to transfer to my beneficiaries without the requirement of a grant from a court of competent jurisdiction;\n\n(h) Any other assets of any nature for which a grant of authority from a court of competent jurisdiction is not required;\n\n(i) The shares or holdings I may own on the date of my death in the capital stock of any private corporation, business or enterprise I control, directly, indirectly, or together with any member or members of my family, or any affiliate of such corporation, business or enterprise, with the words "control" and "affiliate" having the meanings ascribed to them in the Business Corporations Act (Ontario), at the time of my death (hereinafter collectively referred to as the "Corporations").',
    annotation:
      "Full 9-part Excluded Property definition from the firm's dual will precedent. This comprehensive definition covers: private company shares, trust assets, partnership interests, beneficial trust interests, personal property, debts owed, institutional investments, any non-grant assets, and controlled corporations. The probate will includes this as Schedule 'A' for informational cross-reference.",
    annotationKo: "비검인 유언장의 '제외 재산' 정의 — 법원 허가 없이 이전 가능한 모든 자산을 포함합니다.",
    statute: "EAT Act 1998; OBCA",
    caselaw: "Granovsky Estate v. Ontario (1998); Re Milne Estate (2019 ONSC 579)",
    tier: 2,
    documentType: "non_probate_will",
  },
  {
    id: "interp-corporation-changes",
    section: "Interpretation",
    subsection: "Corporation Name/Structure Changes",
    name: "Corporation Restructuring — Deeming Clause",
    parentId: "interp",
    sortOrder: 7,
    isFolder: false,
    templateText:
      "If any of the aforementioned Corporations changes its name, corporate structure, or transfers its assets to any successor Corporation, it is my intention that any reference in this my Will to such Corporation shall extend to and include a reference to any new name of such Corporation and any such successor Corporation, my intention being that the provisions contained in this my Will shall be effective regardless of any change in name, corporate structure or transfer to a successor Corporation.",
    annotation:
      "Deeming clause for corporate changes. Ensures the will remains effective if a private company amalgamates, is restructured, or changes its name after the will is executed. Essential for business owners.",
    annotationKo: "법인 명칭/구조 변경 시에도 유언장이 유효하도록 보장합니다.",
    tier: 2,
    documentType: "non_probate_will",
  },
  {
    id: "interp-relationship",
    section: "Interpretation",
    subsection: "Relationship Definition",
    name: "Relationship and Adoption Deeming Clause",
    parentId: "interp",
    sortOrder: 8,
    isFolder: false,
    templateText:
      "Any reference in this my Will or in any Codicil hereto to a person in terms of a relationship to another person determined by blood or marriage shall not include a person born outside marriage nor a person who comes within the description traced through another person who was born outside marriage, provided that any person who has been legally adopted shall be regarded as having been born in lawful wedlock to his or her adopting parent and any person who is born outside marriage and whose natural parents subsequently marry shall be regarded as having been born in lawful wedlock.",
    annotation:
      "Restricts 'issue' and other relational terms to legitimate and adopted children. Adopted children are fully included. This is a traditional clause — consider whether the client's wishes align, as modern practice may prefer broader inclusion.",
    tier: 2,
    documentType: "all",
  },
  {
    id: "interp-gender-number",
    section: "Interpretation",
    subsection: "Gender and Number",
    name: "Gender and Number Reading Clause",
    parentId: "interp",
    sortOrder: 9,
    isFolder: false,
    templateText:
      "This Will is to be read with all changes of gender and number as may be required by the context.",
    annotation: "Standard boilerplate — ensures the will is gender- and number-neutral where context requires.",
    tier: 1,
    documentType: "all",
  },
  {
    id: "interp-trustee-reference",
    section: "Interpretation",
    subsection: "Trustee Reference",
    name: "Trustee Reference Clause",
    parentId: "interp",
    sortOrder: 10,
    isFolder: false,
    templateText:
      'In this my {{willType}}, I refer to the Executor and Trustee, or Executors and Trustees, original or substituted, or surviving, of this my {{willType}}, as my "{{trusteeTitle}}" or as my "Trustee" where the context permits, whether referred to in the masculine or feminine gender alternately.',
    annotation:
      "Defines shorthand references for the estate trustee throughout the will. In dual wills, this distinguishes 'Probate Estate Trustee' from 'Non-Probate Estate Trustee.'",
    tier: 1,
    documentType: "all",
  },

  // ============================================================
  // 3. APPOINTMENT OF ESTATE TRUSTEE
  // ============================================================
  {
    id: "appt",
    section: "Appointment",
    name: "Appointment of Estate Trustee",
    sortOrder: 3,
    isFolder: true,
    templateText: "",
    annotation: "Names the executor(s)/estate trustee(s).",
    tier: 1,
    documentType: "all",
  },
  {
    id: "appt-primary",
    section: "Appointment",
    subsection: "Primary Executor",
    name: "Appointment of Estate Trustee",
    parentId: "appt",
    sortOrder: 1,
    isFolder: false,
    templateText:
      'I appoint {{primaryExecutorFullName}} (hereinafter referred to as "my Trustee") to be the Estate Trustee of this my Will.',
    annotation: "Names the primary executor. In Ontario, the legal term is 'Estate Trustee.'",
    statute: "Estates Act; Trustee Act",
    tier: 1,
    documentType: "all",
  },
  {
    id: "appt-backup",
    section: "Appointment",
    subsection: "Backup Executor",
    name: "Alternate Estate Trustee",
    parentId: "appt",
    sortOrder: 2,
    isFolder: false,
    templateText:
      "If {{primaryExecutorFullName}} should predecease me, refuse to act, or become unable or unwilling to act as my Trustee, I appoint {{backupExecutorFullName}} to be the Estate Trustee of this my Will in the place and stead of {{primaryExecutorFullName}}.",
    annotation: "Backup executor in case the primary cannot act. Consider naming 2 alternates for redundancy.",
    tier: 1,
    documentType: "all",
  },
  {
    id: "appt-corporate",
    section: "Appointment",
    subsection: "Corporate Trustee Fallback",
    name: "Corporate Trustee Fallback",
    parentId: "appt",
    sortOrder: 3,
    isFolder: false,
    templateText:
      "If none of the persons named above is able and willing to act as my Trustee, I appoint {{corporateTrusteeName}} to act as the Estate Trustee of this my Will.",
    annotation:
      "Corporate trustee fallback (e.g. TD Wealth, RBC Trust, BMO Trust). Recommended for high-value estates or when no suitable individual is available.",
    tier: 2,
    documentType: "all",
  },
  {
    id: "appt-compensation",
    section: "Appointment",
    subsection: "Trustee Compensation",
    name: "Trustee Compensation Clause",
    parentId: "appt",
    sortOrder: 4,
    isFolder: false,
    templateText:
      "My Trustee shall be entitled to receive and shall be paid out of my estate fair and reasonable compensation for their services in administering my estate, having regard to all circumstances including the care, management, and diligence involved, in accordance with the Trustee Act, R.S.O. 1990, c. T.23.",
    annotation:
      "Trustee Act s.61 'rule of thumb': 2.5% of capital receipts + 2.5% of capital disbursements + 3/5ths of 1% annual management fee. See Laing Estate v. Hines for factors adjusting compensation.",
    statute: "Trustee Act s.61",
    caselaw: "Laing Estate v. Hines",
    tier: 2,
    documentType: "all",
  },

  // ── Additional Appointment Clauses (from firm precedent) ─────
  {
    id: "appt-trustee-decision",
    section: "Appointment",
    subsection: "Trustee Decision-Making",
    name: "Trustee Decision — Final and Binding",
    parentId: "appt",
    sortOrder: 5,
    isFolder: false,
    templateText:
      "A decision of my {{trusteeTitle}} in all matters in the administration of my estate shall be final and binding upon my {{trusteeTitle}} and upon all beneficiaries under this my Will, notwithstanding that my {{trusteeTitle}} may have a personal interest in the matter being discussed.",
    annotation:
      "Protects the trustee when they are also a beneficiary (e.g., spouse as both executor and primary beneficiary). Prevents beneficiary challenges to trustee decisions.",
    tier: 2,
    documentType: "all",
  },
  {
    id: "appt-no-certificate",
    section: "Appointment",
    subsection: "No Certificate Obligation (Non-Probate)",
    name: "No Certificate of Appointment Required",
    parentId: "appt",
    sortOrder: 6,
    isFolder: false,
    templateText:
      "For greater certainty, I declare that my Non-Probate Estate Trustees shall have no obligation to obtain a Certificate of Appointment of Estate Trustee with a Will if in the exercise of an absolute discretion they determine that they will be otherwise able to perform their responsibilities hereunder. My Non-Probate Estate Trustees shall not be liable for any loss suffered by my Non-Probate Estate or by any beneficiary as a consequence of not having obtained a Certificate of Appointment of Estate Trustee with a Will.",
    annotation:
      "CRITICAL for the Non-Probate Will. Explicitly relieves the Non-Probate Trustee from applying for probate, which would defeat the EAT savings purpose of the dual will structure. Includes an indemnity for the trustee.",
    annotationKo: "비검인 유언장의 핵심 조항 — 유언집행인이 법원 허가를 받을 의무가 없음을 명시합니다.",
    statute: "EAT Act 1998",
    tier: 2,
    documentType: "non_probate_will",
  },

  // ============================================================
  // 4. DEBTS AND TAXES
  // ============================================================
  {
    id: "debt",
    section: "Debts and Taxes",
    name: "Debts and Taxes",
    sortOrder: 4,
    isFolder: true,
    templateText: "",
    annotation: "Payment of debts, taxes, and estate expenses from the estate.",
    tier: 1,
    documentType: "all",
  },
  {
    id: "debt-payment",
    section: "Debts and Taxes",
    subsection: "Payment of Debts",
    name: "Payment of Debts",
    parentId: "debt",
    sortOrder: 1,
    isFolder: false,
    templateText:
      "I direct my Trustee to pay out of and charge to the capital of my general estate my just debts, funeral and testamentary expenses, and all estate, inheritance, and succession duties or taxes that may be payable in consequence of my death.",
    annotation: "Standard debt clause — charges all debts to estate capital, not income.",
    tier: 1,
    documentType: "all",
  },

  // ── Additional Debt Clauses (Dual Will coordination) ─────────
  {
    id: "debt-dual-allocation",
    section: "Debts and Taxes",
    subsection: "Dual Will Debt Allocation",
    name: "Debt Allocation Between Probate and Non-Probate Estates",
    parentId: "debt",
    sortOrder: 2,
    isFolder: false,
    templateText:
      "For the information of my {{trusteeTitle}}, a similar provision appears in my {{otherWillType}}. It is not my intention that my debts, including taxes, funeral and testamentary expenses or special bequests which are to be paid as ordinary debts of my estate be paid twice. Therefore, subject to the following provisions, I DIRECT my {{trusteeTitle}}, in conjunction with the {{otherTrusteeTitle}} of my {{otherWillType}}, if not the same person, to determine how my special bequests, debts, including taxes, funeral and testamentary expenses which are to be paid as ordinary debts of my estate shall be allocated between my Probate Estate and my Non-Probate Estate.",
    annotation:
      "CRITICAL dual will clause — prevents double payment of debts. The two trustees (if different persons) must coordinate to allocate debts between the two estates. If same person serves as both, the coordination is simplified.",
    annotationKo: "이중 유언장의 핵심 조항 — 두 유언장 간의 채무 배분을 조정합니다.",
    tier: 2,
    documentType: "probate_will",
    applicableWhen: { isDualWill: true },
  },
  {
    id: "debt-dual-allocation-np",
    section: "Debts and Taxes",
    subsection: "Dual Will Debt Allocation (Non-Probate)",
    name: "Debt Allocation — Non-Probate Will Mirror",
    parentId: "debt",
    sortOrder: 3,
    isFolder: false,
    templateText:
      "For the information of my Non-Probate Estate Trustees, a similar provision appears in my Probate Will. It is not my intention that my debts, including taxes, funeral and testamentary expenses or special bequests which are to be paid as ordinary debts of my estate be paid twice. Therefore, I DIRECT my Non-Probate Estate Trustees, in conjunction with the Probate Estate Trustees of my Probate Will, if not the same person, to determine how my debts, including taxes, funeral and testamentary expenses shall be allocated between my Probate Estate and my Non-Probate Estate.",
    annotation:
      "Mirror clause in the Non-Probate Will. Identical purpose to the Probate Will version — ensures coordination.",
    tier: 2,
    documentType: "non_probate_will",
    applicableWhen: { isDualWill: true },
  },
  {
    id: "debt-abatement",
    section: "Debts and Taxes",
    subsection: "Order of Abatement",
    name: "Order of Abatement (Dual Will)",
    parentId: "debt",
    sortOrder: 4,
    isFolder: false,
    templateText:
      "If the aggregate residue of my Probate Estate and my Non-Probate Estate is insufficient to pay all of such debts including taxes, funeral and testamentary expenses, then in determining the order of abatement, I DIRECT my {{trusteeTitle}}, together with the {{otherTrusteeTitle}} of my {{otherWillType}}, to treat the gifts made by me in my Probate Will and my Non-Probate Will as one Will and to establish the order of abatement of such gifts in accordance with the applicable laws of Ontario.",
    annotation:
      "Treats both wills as a single instrument for abatement (which gifts get reduced first when the estate is insufficient). Without this, a court could apportion differently between the two wills.",
    tier: 2,
    documentType: "all",
    applicableWhen: { isDualWill: true },
  },

  // ============================================================
  // 5. SPECIFIC GIFTS
  // ============================================================
  {
    id: "gifts",
    section: "Specific Gifts",
    name: "Specific Gifts",
    sortOrder: 5,
    isFolder: true,
    templateText: "",
    annotation: "Specific bequests of items, cash amounts, or property to named individuals or charities.",
    tier: 1,
    documentType: "all",
  },
  {
    id: "gifts-item",
    section: "Specific Gifts",
    subsection: "Specific Item",
    name: "Gift of Specific Item",
    parentId: "gifts",
    sortOrder: 1,
    isFolder: false,
    templateText:
      "I give {{giftDescription}} to {{recipientFullName}}, if {{recipientFirstName}} survives me; and if {{recipientFirstName}} does not survive me, this gift shall fall into and form part of the residue of my estate.",
    annotation: "Specific item gift with survivorship condition. Falls to residue if recipient predeceases.",
    tier: 1,
    documentType: "all",
  },
  {
    id: "gifts-cash",
    section: "Specific Gifts",
    subsection: "Cash Legacy",
    name: "Cash Legacy",
    parentId: "gifts",
    sortOrder: 2,
    isFolder: false,
    templateText:
      "I give the sum of ${{cashAmount}} to {{recipientFullName}}, if {{recipientFirstName}} survives me.",
    annotation: "Cash bequest. Consider CPI adjustment for inflation if will is signed years before death.",
    tier: 1,
    documentType: "all",
  },
  {
    id: "gifts-charity",
    section: "Specific Gifts",
    subsection: "Charitable Gift",
    name: "Charitable Donation",
    parentId: "gifts",
    sortOrder: 3,
    isFolder: false,
    templateText:
      'I give the sum of ${{charityAmount}} (or {{charityPercentage}}% of my residuary estate) to {{charityName}} (CRA Registration No. {{charityNumber}}), to be used for its general charitable purposes. If {{charityName}} has ceased to exist or is no longer a registered charity at the time of my death, I direct my Trustee to apply this gift cy-près to an organization with similar charitable objects.',
    annotation:
      "Charitable gift with cy-près clause. If the named charity no longer exists, the court can redirect the gift to a similar charity. Without cy-près, the gift fails.",
    statute: "ITA s.118.1; Charities Act",
    caselaw: "Mansour v. Girgis, 2024 ONSC 1611",
    tier: 1,
    documentType: "all",
  },
  {
    id: "gifts-pet",
    section: "Specific Gifts",
    subsection: "Pet Provision",
    name: "Pet Care Provision",
    parentId: "gifts",
    sortOrder: 4,
    isFolder: false,
    templateText:
      "I give my {{petType}} {{petName}} to {{petCaregiverName}}, together with the sum of ${{petCareAmount}} for the care and maintenance of {{petName}}, and I request that {{petCaregiverName}} provide {{petName}} with a loving home.",
    annotation:
      "Ontario does not recognize pet trusts (purpose trust — no individual beneficiary: Mansour v. Girgis). This gives the pet and care money to a named person with a non-binding request.",
    caselaw: "Mansour v. Girgis, 2024 ONSC 1611",
    tier: 1,
    documentType: "all",
  },

  // ============================================================
  // 6. RESIDUE
  // ============================================================
  {
    id: "res",
    section: "Residue",
    name: "Residue of Estate",
    sortOrder: 6,
    isFolder: true,
    templateText: "",
    annotation: "Distribution of the remainder of the estate after debts and specific gifts.",
    tier: 1,
    documentType: "all",
  },
  {
    id: "res-spouse",
    section: "Residue",
    subsection: "To Surviving Spouse",
    name: "Residue to Surviving Spouse",
    parentId: "res",
    sortOrder: 1,
    isFolder: false,
    templateText:
      "I give the residue of my estate to my spouse, {{spouseFullName}}, if my spouse survives me.",
    annotation: "Gives everything to the surviving spouse. If spouse predeceases, falls to the next clause (usually to children per stirpes).",
    tier: 1,
    documentType: "all",
    applicableWhen: { hasSpouse: true },
  },
  {
    id: "res-children-stirpes",
    section: "Residue",
    subsection: "To Children Per Stirpes",
    name: "Residue to Children Per Stirpes",
    parentId: "res",
    sortOrder: 2,
    isFolder: false,
    templateText:
      "If my spouse does not survive me, or if I have no spouse at the time of my death, I give the residue of my estate to my children who survive me, in equal shares per stirpes, the share of any deceased child to be divided equally among that child's issue who survive me, per stirpes.",
    annotation:
      "Per stirpes: if a child predeceases, their share goes to their children (your grandchildren). Including 'issue' provides Saunders v. Vautier protection because the class is never closed (unborn grandchildren are included).",
    caselaw: "Saunders v. Vautier [1841]",
    tier: 1,
    documentType: "all",
    applicableWhen: { hasChildren: true },
  },
  {
    id: "res-common-disaster",
    section: "Residue",
    subsection: "Common Disaster",
    name: "Common Disaster Clause",
    parentId: "res",
    sortOrder: 3,
    isFolder: false,
    templateText:
      "If my spouse and I die in a common disaster or under circumstances making it uncertain which of us survived the other, it shall be deemed that my spouse predeceased me, and my estate shall be distributed as if my spouse had not survived me.",
    annotation:
      "Prevents double probate in simultaneous death. Without this, SLRA s.55 presumes neither survived the other.",
    statute: "SLRA s.55",
    tier: 2,
    documentType: "all",
    applicableWhen: { hasSpouse: true },
  },
  {
    id: "res-survival-period",
    section: "Residue",
    subsection: "Survival Period",
    name: "30-Day Survival Period",
    parentId: "res",
    sortOrder: 4,
    isFolder: false,
    templateText:
      "No person shall be deemed to have survived me for the purposes of this my Will unless such person survives me for a period of {{survivalDays}} days.",
    annotation:
      "Survival period (typically 30 days). Prevents a beneficiary who dies shortly after the testator from receiving — and then the gift being probated again in their estate. See Pierce v. Oswald (2025 ONSC 5344) for drafting clarity.",
    caselaw: "Pierce v. Oswald, 2025 ONSC 5344",
    tier: 2,
    documentType: "all",
  },

  // ============================================================
  // 7. FLA EXCLUSION — CRITICAL FOR EVERY ONTARIO WILL
  // ============================================================
  {
    id: "fla",
    section: "FLA Exclusion",
    name: "Family Law Act Exclusion",
    sortOrder: 7,
    isFolder: true,
    templateText: "",
    annotation: "CRITICAL — should be included in every Ontario Will. Protects inheritance from divorce equalization.",
    statute: "FLA s.4(2)(2)",
    tier: 1,
    documentType: "all",
  },
  {
    id: "fla-exclusion",
    section: "FLA Exclusion",
    subsection: "Exclusion Clause",
    name: "FLA s.4(2)(2) Exclusion Clause",
    parentId: "fla",
    sortOrder: 1,
    isFolder: false,
    templateText:
      "I declare that any property passing to any beneficiary under this my Will, and any income derived therefrom, shall be excluded from such beneficiary's net family property within the meaning of the Family Law Act, R.S.O. 1990, c. F.3, and shall not be subject to equalization upon the breakdown of such beneficiary's marriage or common-law relationship.",
    annotation:
      "The most important Ontario-specific clause. Without it, inherited money that grows in value during a beneficiary's marriage becomes part of their Net Family Property and gets split on divorce. FLA s.4(2)(2) allows testators to expressly exclude inherited property.",
    statute: "FLA s.4(2)(2)",
    tier: 1,
    documentType: "all",
  },

  // ============================================================
  // 8. TRUSTS
  // ============================================================
  {
    id: "trust",
    section: "Trusts",
    name: "Trust Provisions",
    sortOrder: 8,
    isFolder: true,
    templateText: "",
    annotation: "Trust clauses for minor children, disabled beneficiaries, and spouse.",
    tier: 1,
    documentType: "all",
  },
  {
    id: "trust-minor",
    section: "Trusts",
    subsection: "Minor Children's Trust",
    name: "Children's Trust — Age {{trustDistributionAge}}",
    parentId: "trust",
    sortOrder: 1,
    isFolder: false,
    templateText:
      "If any beneficiary under this my Will has not attained the age of {{trustDistributionAge}} years at the time of my death, I direct my Trustee to hold such beneficiary's share in trust and to use as much of the income and capital thereof as my Trustee in their absolute discretion deems advisable for the health, education, maintenance, and advancement of such beneficiary, and to pay or transfer the balance of such share to such beneficiary upon their attaining the age of {{trustDistributionAge}} years.",
    annotation:
      "Holds inheritance in trust until the beneficiary reaches the specified age. Ontario default is 18, but 25 is widely recommended. The 'absolute discretion' language gives the trustee flexibility.",
    statute: "Trustee Act; CLRA s.51",
    tier: 1,
    documentType: "all",
    applicableWhen: { hasMinorChildren: true },
  },
  {
    id: "trust-henson",
    section: "Trusts",
    subsection: "Henson Trust",
    name: "Henson Trust (ODSP Preservation)",
    parentId: "trust",
    sortOrder: 2,
    isFolder: false,
    templateText:
      'I direct my Trustee to set aside and hold the share of {{hensonBeneficiaryName}} (the "Henson Trust Share") in a separate trust for the benefit of {{hensonBeneficiaryName}} on the following terms:\n\n(a) My Trustee shall have absolute and unfettered discretion to pay or apply so much of the income and capital of the Henson Trust Share to or for the benefit of {{hensonBeneficiaryName}} as my Trustee in their sole and absolute discretion sees fit, and for such purposes and in such amounts and proportions and at such times as my Trustee in their sole and absolute discretion may determine.\n\n(b) {{hensonBeneficiaryName}} shall have no right, title, or interest in or to any income or capital of the Henson Trust Share unless and until my Trustee in their absolute discretion determines to pay or apply the same.\n\n(c) No creditor of {{hensonBeneficiaryName}} and no government agency shall have any claim against or entitlement to the income or capital of the Henson Trust Share.\n\n(d) My Trustee may, but shall not be obligated to, make voluntary payments not exceeding ${{hensonVoluntaryLimit}} in any calendar year directly to {{hensonBeneficiaryName}}.',
    annotation:
      "CRITICAL for ODSP beneficiaries. The Henson Trust preserves ODSP eligibility because: (1) absolute discretion — no vesting; (2) no entitlement — beneficiary never 'owns' the assets; (3) ODSP asset limit is $40,000 — Henson Trust assets are NOT counted. Consider also a QDT election (ITA s.122(3)) for tax advantage, and an RDSP contribution alternative.",
    statute: "ODSPA; ITA s.122(3)",
    caselaw: "Henson v. Henson",
    tier: 2,
    documentType: "all",
    applicableWhen: { hasODSPBeneficiary: true },
  },
  {
    id: "trust-spousal",
    section: "Trusts",
    subsection: "Testamentary Spousal Trust",
    name: "Testamentary Spousal Trust",
    parentId: "trust",
    sortOrder: 3,
    isFolder: false,
    templateText:
      'If my spouse {{spouseFullName}} survives me, I direct my Trustee to set aside the residue of my estate (or such portion as my Trustee in their discretion determines) in a separate trust (the "Spousal Trust") on the following terms:\n\n(a) During the lifetime of my spouse, my Trustee shall pay or cause to be paid to my spouse the entire net income of the Spousal Trust in convenient instalments, but not less frequently than annually.\n\n(b) My Trustee may, in their sole and absolute discretion, pay or apply to or for the benefit of my spouse so much of the capital of the Spousal Trust as my Trustee deems advisable for my spouse\'s health, maintenance, comfort, and support.\n\n(c) Upon the death of my spouse, I direct my Trustee to divide and distribute the remaining capital of the Spousal Trust to my children who survive my spouse, in equal shares per stirpes.',
    annotation:
      "QTIP-style testamentary spousal trust. Mandatory income to spouse protects ITA s.70(6) rollover. Capital is discretionary — gives control. PRE (principal residence exemption) is preserved for the spouse. The trust terminates on spouse's death, remainder to children per stirpes.",
    statute: "ITA s.70(6); FLA s.4(2)(2)",
    tier: 2,
    documentType: "all",
    applicableWhen: { hasSpouse: true },
  },

  // ============================================================
  // 9. GRE MAINTENANCE
  // ============================================================
  {
    id: "gre",
    section: "Graduated Rate Estate",
    name: "Graduated Rate Estate",
    sortOrder: 9,
    isFolder: true,
    templateText: "",
    annotation: "Graduated Rate Estate (GRE) saves income tax for 36 months post-death.",
    statute: "ITA s.248(1)",
    tier: 2,
    documentType: "all",
  },
  {
    id: "gre-maintenance",
    section: "Graduated Rate Estate",
    subsection: "GRE Maintenance Clause",
    name: "GRE Maintenance Clause",
    parentId: "gre",
    sortOrder: 1,
    isFolder: false,
    templateText:
      "I direct my Trustee to manage my estate in a manner that preserves its status as a Graduated Rate Estate within the meaning of subsection 248(1) of the Income Tax Act (Canada) for a period of up to 36 months following my death, including but not limited to:\n\n(a) making the designation of my estate as a Graduated Rate Estate in my estate's first T3 Trust Income Tax Return;\n\n(b) ensuring that no property is distributed to or settled in any non-arm's-length trust during the 36-month period;\n\n(c) ensuring that no arm's-length borrowing remains outstanding for a period exceeding 12 months; and\n\n(d) taking all reasonable steps to prevent the estate from engaging in any transaction that would cause it to lose its status as a Graduated Rate Estate.",
    annotation:
      "GRE allows the estate to use graduated tax rates (instead of top marginal rate) for up to 36 months. Anti-tainting provisions are critical: any arm's-length borrowing must be repaid within 12 months, and no distributions to non-arm's-length trusts.",
    statute: "ITA s.248(1); s.108(1)",
    tier: 2,
    documentType: "all",
  },

  // ============================================================
  // 10. GUARDIAN APPOINTMENT
  // ============================================================
  {
    id: "guard",
    section: "Guardian",
    name: "Guardian of Minor Children",
    sortOrder: 10,
    isFolder: true,
    templateText: "",
    annotation: "Guardian appointment for minor children. Note: CLRA s.61 — authority expires in 90 days.",
    statute: "CLRA s.61",
    tier: 1,
    documentType: "all",
  },
  {
    id: "guard-primary",
    section: "Guardian",
    subsection: "Primary Guardian",
    name: "Primary Guardian Appointment",
    parentId: "guard",
    sortOrder: 1,
    isFolder: false,
    templateText:
      "If my spouse should predecease me or become unable to exercise decision-making responsibility for our children, I appoint {{primaryGuardianFullName}} as the guardian of my minor children with full decision-making responsibility.",
    annotation:
      "CLRA s.61: A guardian appointed by Will has authority for only 90 days. Within that period, the guardian must apply to the Ontario Superior Court of Justice for a permanent guardianship order. The Will appointment is a 'temporary' bridge.",
    statute: "CLRA s.61 (2020 amendment: 'decision-making responsibility' replaces 'custody')",
    tier: 1,
    documentType: "all",
    applicableWhen: { hasMinorChildren: true },
  },

  // ============================================================
  // 11. EXECUTOR/TRUSTEE POWERS
  // ============================================================
  {
    id: "powers",
    section: "Trustee Powers",
    name: "Trustee Powers",
    sortOrder: 11,
    isFolder: true,
    templateText: "",
    annotation: "Investment and administrative powers for the estate trustee.",
    tier: 2,
    documentType: "all",
  },
  {
    id: "powers-investment",
    section: "Trustee Powers",
    subsection: "Investment Power",
    name: "Prudent Investor Power",
    parentId: "powers",
    sortOrder: 1,
    isFolder: false,
    templateText:
      "My Trustee shall invest the assets of my estate in accordance with the Trustee Act, R.S.O. 1990, c. T.23, as a prudent investor would, having regard to the 7 criteria set out in section 27 thereof, and may invest in any form of property or security in which a prudent investor might invest.",
    annotation: "Trustee Act s.27 prudent investor rule. The 7 criteria include: general economic conditions, possible effects of inflation, tax consequences, role of each investment in the portfolio, expected return, need for liquidity, and the asset's special relationship to the estate.",
    statute: "Trustee Act s.27",
    tier: 2,
    documentType: "all",
  },
  {
    id: "powers-distribution-in-kind",
    section: "Trustee Powers",
    subsection: "Distribution in Kind",
    name: "Distribution In Kind / In Specie",
    parentId: "powers",
    sortOrder: 2,
    isFolder: false,
    templateText:
      "My Trustee may make any division or distribution of my estate in kind, and for this purpose may allot and transfer specific assets to any beneficiary, and the determination of my Trustee as to the value of any asset so distributed shall be final and binding on all beneficiaries.",
    annotation: "Allows the trustee to distribute actual assets (not just cash) to beneficiaries. Avoids forced liquidation — important for real estate or business interests.",
    tier: 2,
    documentType: "all",
  },
  {
    id: "powers-borrowing",
    section: "Trustee Powers",
    subsection: "Borrowing Power (GRE-Safe)",
    name: "Borrowing Power",
    parentId: "powers",
    sortOrder: 3,
    isFolder: false,
    templateText:
      "My Trustee may borrow money for the purposes of my estate, and may mortgage or pledge any asset of my estate as security for such borrowing; provided that if my estate is or may be a Graduated Rate Estate, my Trustee shall ensure that any arm's-length borrowing is reimbursed to the estate within 12 months of the date of such borrowing, to preserve the estate's GRE status.",
    annotation: "Borrowing power with GRE restriction. ITA s.108(1) anti-tainting: if arm's-length borrowing is not repaid within 12 months, the estate loses GRE status and all income is taxed at the top marginal rate.",
    statute: "ITA s.108(1)",
    tier: 2,
    documentType: "all",
  },
  {
    id: "powers-combine-trusts",
    section: "Trustee Powers",
    subsection: "Combine Trusts",
    name: "Power to Combine Trusts",
    parentId: "powers",
    sortOrder: 4,
    isFolder: false,
    templateText:
      "My Trustee may, for administrative convenience, combine any two or more trusts created under this my Will into a single trust, provided that the beneficial interests of each beneficiary are maintained and that such combination does not adversely affect the tax treatment of any trust.",
    annotation: "Administrative convenience — avoids maintaining separate investment accounts for small trusts.",
    tier: 2,
    documentType: "all",
  },
  {
    id: "powers-resp",
    section: "Trustee Powers",
    subsection: "RESP Successor Subscriber",
    name: "RESP Successor Subscriber",
    parentId: "powers",
    sortOrder: 5,
    isFolder: false,
    templateText:
      "I direct that {{respSuccessorSubscriber}} shall be the successor subscriber of any Registered Education Savings Plan of which I am the subscriber at the time of my death, and I authorize my Trustee to take all steps necessary to effect such appointment.",
    annotation:
      "Without a successor subscriber, RESPs collapse on death — triggering income inclusion and CESG repayment. ITA s.146.1. The subscriber can be named in the RESP contract or in the Will.",
    statute: "ITA s.146.1; CLRA s.61",
    tier: 2,
    documentType: "all",
    applicableWhen: { hasRESP: true },
  },
  {
    id: "powers-minor-payment",
    section: "Trustee Powers",
    subsection: "Payment for Minor (CLRA s.51)",
    name: "Minor Payment Under $35,000",
    parentId: "powers",
    sortOrder: 6,
    isFolder: false,
    templateText:
      "Where any payment under this my Will is to be made to or for the benefit of a person who is a minor, my Trustee may, if the total amount payable to such minor does not exceed $35,000, pay such amount to a parent or lawful custodian of such minor, whose receipt shall be a sufficient discharge to my Trustee.",
    annotation:
      "CLRA s.51 as amended by O.Reg 120/21 — the trustee can pay up to $35,000 to a minor's parent without requiring a separate trust or court order. Above $35,000, the trustee must hold in trust or get court direction.",
    statute: "CLRA s.51; O.Reg 120/21",
    tier: 2,
    documentType: "all",
  },

  // ── Additional Trustee Powers (from firm precedent) ──────────
  {
    id: "powers-realization",
    section: "Trustee Powers",
    subsection: "Realization / Conversion",
    name: "Power to Realize and Postpone",
    parentId: "powers",
    sortOrder: 7,
    isFolder: false,
    templateText:
      "I AUTHORIZE my Trustee to use their discretion in the realization of my estate, with power to sell, call in and convert into money any part of my estate not consisting of money at such time or times, in such manner and upon such terms, and either for cash or credit or for part cash and part credit as they may in their absolute discretion decide upon, or to postpone such conversion of my estate or any part or parts thereof for such length of time as they may think best. My Trustee shall have a separate and substantive power to retain any of my investments or assets in the form existing at the date of my death at their absolute discretion without responsibility for loss, to the intent that investments or assets so retained shall be deemed to be authorized investments for all purposes of this my Will.",
    annotation:
      "Comprehensive realization power — sell, convert, or postpone conversion. The 'deemed authorized investments' language protects the trustee from liability for holding assets in their original form (e.g., keeping a family business rather than liquidating).",
    statute: "Trustee Act s.27",
    tier: 2,
    documentType: "all",
  },
  {
    id: "powers-real-property",
    section: "Trustee Powers",
    subsection: "Real Property Powers",
    name: "Real Property — Sell, Mortgage, Lease",
    parentId: "powers",
    sortOrder: 8,
    isFolder: false,
    templateText:
      "I AUTHORIZE my Trustee to sell, partition, exchange or otherwise dispose of the whole or any part of my real property in such manner, at such time and upon such terms as to credit or otherwise as they in their discretion consider advisable, with power to accept purchase money, mortgage or mortgages for any part of the purchase or exchange price. My Trustee shall also have the power to mortgage, lease for any term the real or leasehold property forming part of my estate, subject to such covenants and conditions as they shall think fit, to accept surrenders of leases and tenancies, to expend money in repairs, alterations, rebuilding and improvements and generally to manage any such property. The power of sale herein is discretionary and not mandatory.",
    annotation:
      "Broad real property management powers — sale, mortgage, lease, partition, repairs. The 'discretionary and not mandatory' language ensures the trustee is not forced to sell (important for the family home).",
    tier: 2,
    documentType: "all",
  },
  {
    id: "powers-lending",
    section: "Trustee Powers",
    subsection: "Lending and Guarantees",
    name: "Power to Lend and Guarantee",
    parentId: "powers",
    sortOrder: 9,
    isFolder: false,
    templateText:
      "I AUTHORIZE AND EMPOWER my Trustee to lend such part or parts of my estate upon any security which they may deem sufficient or upon no security whatever, to enter into guarantees or indemnifications for the benefit of the beneficiaries of this my Will and firms or corporations in which my estate or one or more of the beneficiaries may have an interest, and to give security therefor as my Trustee may in their discretion decide. My Trustee may borrow from any person or corporation notwithstanding that such person or corporation may be a member of my family or a beneficiary or trustee under this my Will, and the person or corporation from whom my Trustee borrows shall nevertheless be entitled to receive and be paid, for its, his or her own benefit, such interest as my Trustee in their absolute discretion deem advisable.",
    annotation:
      "Lending, guarantee, and self-dealing borrowing power. Permits the trustee to borrow from beneficiaries and vice versa — important for family businesses. GRE caution: arm's-length borrowing must be repaid within 12 months.",
    statute: "ITA s.108(1) (GRE); Trustee Act",
    tier: 2,
    documentType: "all",
  },
  {
    id: "powers-elections",
    section: "Trustee Powers",
    subsection: "Tax Elections",
    name: "Statutory Elections and Designations",
    parentId: "powers",
    sortOrder: 10,
    isFolder: false,
    templateText:
      "I AUTHORIZE my Trustee to make or refrain from making, in their absolute discretion, any elections, determinations, and designations permitted by any statute or regulation enacted by the Parliament or government of Canada, by the legislature or government of any province of Canada, or by any other legislative or government body of any other country, province, state or territory. Such exercise of discretion by my Trustee shall be conclusive and binding upon all the beneficiaries hereof. My Trustee shall not be liable to any person, whether beneficiary or otherwise, by reason of any loss, claim, tax or other cost resulting from any election, determination, designation or exercise of discretion, including any preferred beneficiary election, entered into by my Trustee in good faith.",
    annotation:
      "Covers all statutory elections — spousal rollover (ITA s.70(6)), principal residence designation, preferred beneficiary election, capital gains reserve, etc. The exoneration clause protects the trustee from claims arising from good-faith tax elections.",
    statute: "ITA s.70(6); s.159; s.104(14)",
    tier: 2,
    documentType: "all",
  },
  {
    id: "powers-exoneration",
    section: "Trustee Powers",
    subsection: "Trustee Exoneration",
    name: "Trustee Exoneration and Protection",
    parentId: "powers",
    sortOrder: 11,
    isFolder: false,
    templateText:
      "My Trustee shall be fully protected in exercising any discretion granted to them in this my Will and shall not be liable to the beneficiaries or their heirs or personal representatives by reason of the exercise of such discretion. My Trustee shall exercise the powers, authority and discretion given to them in what they deem to be the best interest, whether monetary or otherwise, of the beneficiaries, whether or not such exercise may have the effect of conferring an advantage on any one or more of the beneficiaries.",
    annotation:
      "Broad trustee exoneration clause. Protects the trustee from liability for good-faith decisions, even if those decisions benefit one beneficiary over another (e.g., distributing a family cottage to one child).",
    tier: 2,
    documentType: "all",
  },
  {
    id: "powers-gradual-liquidation",
    section: "Trustee Powers",
    subsection: "Gradual Liquidation / Settlements",
    name: "Gradual Liquidation and Compromise of Claims",
    parentId: "powers",
    sortOrder: 12,
    isFolder: false,
    templateText:
      "NOTWITHSTANDING any direction to my Trustee to pay all my just debts, I authorize and empower my Trustee to make arrangements for the gradual liquidation of any liabilities owing by me at my death, including, without limiting the generality thereof, claims against my estate arising before or after my death under the Family Law Act, R.S.O. 1990, c. F.3, and any amendments thereto, and to compromise, settle, waive or pay any claims at any time owing to my estate, or which my estate may have against others, for such consideration or no consideration, and upon such terms and conditions as my Trustee may deem advisable, and I hereby specifically exonerate my Trustee in connection with any such settlements if they act bona fide.",
    annotation:
      "Permits the trustee to settle claims (including FLA equalization claims) without going to court. The gradual liquidation power avoids fire-sale situations. Arbitration referral is authorized. Bona fide exoneration protects the trustee.",
    statute: "FLA R.S.O. 1990, c. F.3",
    tier: 2,
    documentType: "all",
  },

  // ============================================================
  // 12. TESTIMONIUM AND ATTESTATION
  // ============================================================
  {
    id: "test",
    section: "Testimonium",
    name: "Testimonium and Attestation",
    sortOrder: 12,
    isFolder: true,
    templateText: "",
    annotation: "Signing block and witness attestation. Ontario requires SLRA s.4 compliance.",
    statute: "SLRA s.4",
    tier: 1,
    documentType: "all",
  },
  {
    id: "test-in-person",
    section: "Testimonium",
    subsection: "In-Person Execution (SLRA s.4)",
    name: "In-Person Testimonium",
    parentId: "test",
    sortOrder: 1,
    isFolder: false,
    templateText:
      "IN TESTIMONY WHEREOF I have to this my Last Will and Testament, written upon this and the {{numberOfPages}} preceding pages of paper, subscribed my name this _____ day of ______________, 20_____.\n\n\nSIGNED, PUBLISHED AND DECLARED   )\n                                  )\nby {{testatorFullName}}           )\n                                  )  _______________________________\nas and for the Testator's         )  {{testatorFullName}}\nLast Will and Testament           )\nin our presence, who              )\nat the Testator's request,        )\nin the Testator's presence         )\nand in the presence of each       )\nother have subscribed our         )\nnames as witnesses                )\n\n\n_______________________________\nWitness #1 Name\n\n_______________________________\nAddress\n\n_______________________________\nOccupation\n\n\n_______________________________\nWitness #2 Name\n\n_______________________________\nAddress\n\n_______________________________\nOccupation",
    annotation:
      "In-person execution per SLRA s.4: testator signs in the presence of 2 witnesses, who sign in the presence of the testator and each other. Witnesses must not be beneficiaries or spouses of beneficiaries.",
    statute: "SLRA s.4",
    tier: 1,
    documentType: "all",
  },
  {
    id: "test-remote",
    section: "Testimonium",
    subsection: "Remote Video Execution (SLRA s.21.1)",
    name: "Remote Video Testimonium",
    parentId: "test",
    sortOrder: 2,
    isFolder: false,
    templateText:
      "IN TESTIMONY WHEREOF I have to this my Last Will and Testament, executed by way of remote audio-visual communication in accordance with section 21.1 of the Succession Law Reform Act, R.S.O. 1990, c. S.26, subscribed my name this _____ day of ______________, 20_____.\n\nThe execution of this Will was observed via {{remotePlatform}} by the undersigned witnesses, at least one of whom is a licensee within the meaning of the Law Society Act.\n\n\nSIGNED by {{testatorFullName}}    )  _______________________________\n                                  )  {{testatorFullName}}\n\n\n_______________________________\nWitness #1 Name (LSO Licensee)\nLSO Member Number: ___________\n\n_______________________________\nAddress\n\n\n_______________________________\nWitness #2 Name\n\n_______________________________\nAddress",
    annotation:
      "Remote video execution (SLRA s.21.1, made permanent). At least one witness must be a licensee within the meaning of the Law Society Act (lawyer or paralegal). The testator physically signs the document — only the witnessing is remote. Commissioner's jurat under O.Reg 431/20.",
    statute: "SLRA s.21.1; Law Society Act; O.Reg 431/20",
    tier: 2,
    documentType: "all",
  },

  // ============================================================
  // 13. AFFIDAVIT OF EXECUTION
  // ============================================================
  {
    id: "aff",
    section: "Affidavit of Execution",
    name: "Affidavit of Execution",
    sortOrder: 13,
    isFolder: true,
    templateText: "",
    annotation: "Required for probate. Sworn by one of the witnesses confirming proper execution.",
    tier: 1,
    documentType: "affidavit_execution",
  },
  {
    id: "aff-standard",
    section: "Affidavit of Execution",
    subsection: "Standard Affidavit",
    name: "Affidavit of Execution of Will",
    parentId: "aff",
    sortOrder: 1,
    isFolder: false,
    templateText:
      "AFFIDAVIT OF EXECUTION OF WILL\n\nI, {{deponentName}}, of the {{deponentCity}} of {{deponentCityName}}, in the Province of Ontario, MAKE OATH AND SAY:\n\n1. On {{dateOfWill}}, I was present and saw {{testatorFullName}} sign the document marked as Exhibit \"A\" to this my Affidavit.\n\n2. {{testatorFullName}} signed the document in my presence and in the presence of {{otherWitnessName}}, both of us being present at the same time, and we both signed the document in the presence of {{testatorFullName}} and in the presence of each other as attesting witnesses.\n\n3. To the best of my knowledge and belief, {{testatorFullName}} was of the age of eighteen (18) years or over at the time of execution of the document.\n\n4. To the best of my knowledge and belief, {{testatorFullName}} was of sound mind, memory and understanding at the time of execution and was not acting under any duress or undue influence.\n\n\nSWORN BEFORE ME at the\n{{deponentCity}} of {{deponentCityName}},\nin the Province of Ontario,\nthis _____ day of ______________, 20_____.\n\n\n_______________________________       _______________________________\nA Commissioner for Taking              {{deponentName}}\nAffidavits (or as may be)\n\nName: {{commissionerName}}\nExpiry: {{commissionerExpiry}}",
    annotation:
      "Standard Form Affidavit of Execution required for applying for a Certificate of Appointment of Estate Trustee (probate). One of the two subscribing witnesses must swear this affidavit. Form available under Rules of Civil Procedure.",
    statute: "Estates Act; Rules of Civil Procedure",
    tier: 1,
    documentType: "affidavit_execution",
  },
  {
    id: "aff-probate-will",
    section: "Affidavit of Execution",
    subsection: "Probate Will Affidavit",
    name: "Affidavit of Execution — Probate Will (Dual Will)",
    parentId: "aff",
    sortOrder: 2,
    isFolder: false,
    templateText:
      "AFFIDAVIT OF EXECUTION OF PROBATE WILL\n\nI, {{deponentName}}, of the {{deponentCity}} of {{deponentCityName}}, in the Province of Ontario, MAKE OATH AND SAY:\n\n1. On {{dateOfWill}}, I was present and saw {{testatorFullName}} sign the document marked as Exhibit \"A\" to this my Affidavit (the \"Probate Will\").\n\n2. I was informed and verily believe that {{testatorFullName}} also executed a Non-Probate Will of the same date dealing with certain Non-Probate Assets.\n\n3. {{testatorFullName}} signed the Probate Will in my presence and in the presence of {{otherWitnessName}}, both of us being present at the same time, and we both signed the Probate Will in the presence of {{testatorFullName}} and in the presence of each other as attesting witnesses.\n\n4. To the best of my knowledge and belief, {{testatorFullName}} was of the age of eighteen (18) years or over and of sound mind, memory and understanding at the time of execution, and was not acting under any duress or undue influence.\n\n\nSWORN BEFORE ME at the\n{{deponentCity}} of {{deponentCityName}},\nin the Province of Ontario,\nthis _____ day of ______________, 20_____.\n\n\n_______________________________       _______________________________\nA Commissioner for Taking              {{deponentName}}\nAffidavits (or as may be)",
    annotation:
      "Affidavit for the Probate Will in a dual will structure. Acknowledges the existence of the Non-Probate Will without submitting it to court (preserving the EAT benefit).",
    tier: 2,
    documentType: "affidavit_execution_probate",
  },
  {
    id: "aff-nonprobate-will",
    section: "Affidavit of Execution",
    subsection: "Non-Probate Will Affidavit",
    name: "Affidavit of Execution — Non-Probate Will (Dual Will)",
    parentId: "aff",
    sortOrder: 3,
    isFolder: false,
    templateText:
      "AFFIDAVIT OF EXECUTION OF NON-PROBATE WILL\n\nI, {{deponentName}}, of the {{deponentCity}} of {{deponentCityName}}, in the Province of Ontario, MAKE OATH AND SAY:\n\n1. On {{dateOfWill}}, I was present and saw {{testatorFullName}} sign the document marked as Exhibit \"A\" to this my Affidavit (the \"Non-Probate Will\").\n\n2. I was informed and verily believe that {{testatorFullName}} also executed a Probate Will of the same date dealing with certain Probate Assets.\n\n3. {{testatorFullName}} signed the Non-Probate Will in my presence and in the presence of {{otherWitnessName}}, both of us being present at the same time, and we both signed the Non-Probate Will in the presence of {{testatorFullName}} and in the presence of each other as attesting witnesses.\n\n4. To the best of my knowledge and belief, {{testatorFullName}} was of the age of eighteen (18) years or over and of sound mind, memory and understanding at the time of execution, and was not acting under any duress or undue influence.\n\n\nSWORN BEFORE ME at the\n{{deponentCity}} of {{deponentCityName}},\nin the Province of Ontario,\nthis _____ day of ______________, 20_____.\n\n\n_______________________________       _______________________________\nA Commissioner for Taking              {{deponentName}}\nAffidavits (or as may be)",
    annotation:
      "Affidavit for the Non-Probate Will. This affidavit is NOT submitted to court — it is kept on file by the lawyer in case it is ever needed (e.g., if a corporate transfer agent requires proof of execution).",
    tier: 2,
    documentType: "affidavit_execution_non_probate",
  },

  // ============================================================
  // POA FOR PROPERTY
  // ============================================================
  {
    id: "poa-prop",
    section: "POA — Property",
    name: "Continuing Power of Attorney for Property",
    sortOrder: 14,
    isFolder: true,
    templateText: "",
    annotation: "SDA S.O. 1992 — Continuing POA for Property.",
    statute: "SDA S.O. 1992",
    tier: 1,
    documentType: "poa_property",
  },
  {
    id: "poa-prop-appt",
    section: "POA — Property",
    subsection: "Appointment",
    name: "Appointment of Attorney for Property",
    parentId: "poa-prop",
    sortOrder: 1,
    isFolder: false,
    templateText:
      "I, {{testatorFullName}}, revoke any previous continuing power of attorney for property made by me and APPOINT {{poaPropertyAttorneyFullName}} to be my Attorney for Property.",
    annotation: "Revokes prior POAs and names the new attorney. The POA is 'continuing' — it survives the grantor's incapacity.",
    statute: "SDA s.7",
    tier: 1,
    documentType: "poa_property",
  },
  {
    id: "poa-prop-effective",
    section: "POA — Property",
    subsection: "Effective Date",
    name: "Effective Immediately",
    parentId: "poa-prop",
    sortOrder: 2,
    isFolder: false,
    templateText:
      "I authorize my Attorney to act on my behalf immediately, and this Power of Attorney shall continue to be effective if I become mentally incapable of managing property.",
    annotation: "Effective immediately — the attorney can act now. Most flexible option. Alternative: 'springing' POA that only activates on incapacity (requires a capacity assessment, causing delays).",
    statute: "SDA s.7(1)",
    tier: 1,
    documentType: "poa_property",
  },
  {
    id: "poa-prop-compensation",
    section: "POA — Property",
    subsection: "Compensation",
    name: "Attorney Compensation (SDA s.38)",
    parentId: "poa-prop",
    sortOrder: 3,
    isFolder: false,
    templateText:
      "My Attorney shall be entitled to reasonable compensation for the exercise of their powers and the performance of their duties under this Power of Attorney, as permitted by section 38 of the Substitute Decisions Act, 1992.",
    annotation:
      "SDA s.38 permits reasonable compensation. The prescribed rates under O.Reg 26/95 are: 3% of income, 3% of capital, 3/5% annual care and management. The attorney can also be reimbursed for out-of-pocket expenses.",
    statute: "SDA s.38; O.Reg 26/95",
    tier: 2,
    documentType: "poa_property",
  },
  {
    id: "poa-prop-restrictions",
    section: "POA — Property",
    subsection: "Restrictions",
    name: "Restrictions on Authority",
    parentId: "poa-prop",
    sortOrder: 4,
    isFolder: false,
    templateText:
      "My Attorney shall not, without the prior written consent of {{restrictionConsentPerson}} or an order of the court:\n\n(a) sell, mortgage, or encumber my principal residence;\n(b) make gifts of my property other than customary gifts of reasonable value.\n\nMy Attorney shall not change any beneficiary designations on my registered accounts, insurance policies, or any testamentary instruments.",
    annotation:
      "Restrictions limit the attorney's power. SDA s.7(4) allows custom restrictions. The prohibition on changing beneficiary designations and testamentary instruments is important — an attorney cannot alter who inherits.",
    statute: "SDA s.7(4); s.12",
    tier: 2,
    documentType: "poa_property",
  },

  // ============================================================
  // POA FOR PERSONAL CARE
  // ============================================================
  {
    id: "poa-care",
    section: "POA — Personal Care",
    name: "Power of Attorney for Personal Care",
    sortOrder: 15,
    isFolder: true,
    templateText: "",
    annotation: "SDA S.O. 1992 — POA for Personal Care.",
    statute: "SDA S.O. 1992",
    tier: 1,
    documentType: "poa_personal_care",
  },
  {
    id: "poa-care-appt",
    section: "POA — Personal Care",
    subsection: "Appointment",
    name: "Appointment of Attorney for Personal Care",
    parentId: "poa-care",
    sortOrder: 1,
    isFolder: false,
    templateText:
      "I, {{testatorFullName}}, revoke any previous power of attorney for personal care made by me and APPOINT {{poaCareAttorneyFullName}} to be my Attorney for Personal Care.",
    annotation: "A POA for Personal Care only takes effect when the grantor is incapable of making personal care decisions — it cannot operate while the grantor has capacity.",
    statute: "SDA s.46",
    tier: 1,
    documentType: "poa_personal_care",
  },
  {
    id: "poa-care-wishes",
    section: "POA — Personal Care",
    subsection: "Health Care Wishes",
    name: "Health Care Wishes",
    parentId: "poa-care",
    sortOrder: 2,
    isFolder: false,
    templateText:
      "I instruct my Attorney that if I am in a condition where there is no reasonable expectation of my recovery from physical or mental disability, I do not wish to be kept alive by artificial means or heroic measures. I request that I be allowed to die naturally with only such measures taken to keep me comfortable and alleviate suffering.",
    annotation:
      "Living will / advance directive language. This is a wish, not binding, but guides the attorney. The attorney must consult these wishes under SDA s.66.",
    statute: "SDA s.66; Health Care Consent Act",
    tier: 1,
    documentType: "poa_personal_care",
  },
  {
    id: "poa-care-organ",
    section: "POA — Personal Care",
    subsection: "Organ Donation",
    name: "Organ and Tissue Donation",
    parentId: "poa-care",
    sortOrder: 3,
    isFolder: false,
    templateText:
      "Upon my death, I authorize the use of my body and any organs or tissues thereof for transplantation, therapeutic purposes, medical education, or research.",
    annotation:
      "Also register with ServiceOntario at ontario.ca/organ-donor. The POA alone may not be seen quickly enough. Trillium Gift of Life Act governs organ/tissue donation in Ontario.",
    statute: "Trillium Gift of Life Network Act",
    tier: 1,
    documentType: "poa_personal_care",
  },
]
