// Compliance content carried over verbatim from the previous single-page index.html.
// Edit the text here; the build (site/build.mjs) renders it into every page.

// Detailed compliance summaries & amendment highlights (bulleted details for preview)
export const COMPLIANCE_GISTS = {
  // RBI Directions summaries
  "prudential": [
    "Minimum CRAR of 15% (Tier I: 10%) must be maintained by Middle & Upper Layer NBFCs.",
    "Leverage ratio (total outside liabilities to owned funds) of a Base Layer NBFC must not exceed 7 times.",
    "Requires Board-approved policies for credit concentration limits and investment classification.",
    "Mandates standard provisioning rates on outstanding assets, ranging from 0.25% to 1.0%."
  ],
  "npa-provisioning": [
    "Standardizes asset classification timeline to a strict 90 days past due (dpd) limit for NPA classification.",
    "Provisioning: standard assets 0.25% (Base Layer) or 0.40% (Middle Layer); sub-standard 10% of outstanding; doubtful 100% of the unsecured portion plus 20% to 50% of the secured portion, by age.",
    "A restructured or renegotiated loan is classified as sub-standard until it has performed satisfactorily for one year under the new terms."
  ],
  "governance": [
    "Middle and Upper Layer NBFCs must set up an Audit Committee (minimum 3 directors) and a Nomination and Remuneration Committee; all NBFCs need a Risk Management Committee.",
    "Requires annual 'Fit and Proper' criteria verification for all directors.",
    "Imposes strict disclosure requirements in balance sheets regarding director remuneration and related party transactions.",
    "Loans to directors, their relatives and related entities above a materiality threshold (₹1 Cr Base, ₹5 Cr Middle, ₹10 Cr Upper) need Board sanction."
  ],
  "kyc": [
    "Enforces Customer Due Diligence (CDD) procedures before opening any account or credit line.",
    "Permits Video Customer Identification Process (V-CIP) as an approved channel for digital customer identification.",
    "Establishes periodic updation: High-risk KYC every 2 years, Medium-risk every 8 years, and Low-risk every 10 years.",
    "Requires transaction monitoring and screening of client databases against sanctions lists."
  ],
  "conduct": [
    "Mandates the adoption of the Fair Practices Code (FPC) to ensure transparency in loan pricing and terms.",
    "Requires appointing a Grievance Redressal Officer (GRO) and displaying their contact information in all offices.",
    "Strictly prohibits coercive loan recovery tactics and establishes rules on recovery agent conducts.",
    "Enforces simple, transparent interest rate structures without hidden fee clauses."
  ],
  "credit-cards": [
    "NBFCs require prior approval from RBI and a minimum Net Owned Fund of ₹100 Crore to issue credit cards.",
    "Enforces strict billing transparency, penalty calculation limits, and customer consent protocols.",
    "A card can be reported to credit bureaus as past due only when it is over 3 days past the payment due date."
  ],
  "reporting": [
    "Governs submission of statutory regulatory returns (e.g. DNBS01, DNBS03) to the RBI portal.",
    "Mandates joining all four Credit Information Companies (CICs) in India.",
    "Lenders must report credit data to bureaus fortnightly (as on the 15th and last day of the month) within 7 days."
  ],
  "registration": [
    "Scale Based Regulation (SBR) places NBFCs in Base, Middle, Upper and Top Layers by size, activity and riskiness.",
    "Sets the minimum Net Owned Fund (NOF) requirement to ₹10 Crore for NBFC-ICCs.",
    "Requires prior written RBI approval for takeover/change in control or acquiring 26% or more of paid-up equity."
  ],
  "risk": [
    "Mandates appointing a Chief Risk Officer (CRO) for NBFCs with assets of more than ₹5,000 Crore.",
    "Middle Layer single-party exposure capped at 25% of Tier 1 capital (group 40%); Upper Layer 20%, extendable to 25%.",
    "Lays down governance policies for managing third-party IT and business outsourcing risk."
  ],
  "operations": [
    "Requires prior RBI approval for opening overseas subsidiaries/joint ventures or making investments abroad.",
    "Requires prior RBI approval for specific activities such as insurance JVs, IDF-MF sponsorship and overseas investment.",
    "Imposes restrictions on acquisition of control, transfer of shares, or change in management."
  ],

  // SEBI Regulations summaries
  "icdr": [
    "Regulates Initial Public Offerings (IPOs), Further Public Offerings (FPOs), Rights Issues, and QIPs.",
    "Mandates promoters must contribute a minimum of 20% of post-issue capital (locked in for 18 months to 3 years).",
    "Establishes rules on allocation sizes, anchor investor lock-ins, and draft prospectus disclosures."
  ],
  "lodr": [
    "Mandates listed entities submit quarterly financial results within 45 days of quarter-end (annual audited results within 60 days).",
    "Requires disclosure of material events under Regulation 30 within 30 minutes (board decisions), 12 hours (internal) or 24 hours (external).",
    "Enforces corporate governance rules (e.g. board independence ratios, audit committee composition).",
    "Requires top 250 listed entities to verify, confirm, or deny market rumors within specific timelines."
  ],
  "pit": [
    "Strictly prohibits trading in listed securities while holding Unpublished Price Sensitive Information (UPSI).",
    "Mandates maintaining a tamper-proof Structured Digital Database (SDD) to log all persons sharing UPSI.",
    "Enforces trading window closures starting from quarter-end until 48 hours after financial results publication."
  ],
  "sast": [
    "Triggers mandatory open offer to public shareholders upon acquiring 25% or more shares or voting rights.",
    "Allows creeping acquisition of up to 5% shares annually for shareholders holding between 25% and 75% voting rights.",
    "Requires public announcements of open offers to be made on the same day the transaction is agreed."
  ],
  "depositories": [
    "Regulates depository participants, demat account opening, and account maintenance procedures.",
    "Mandates safe preservation of electronic registers, transactions, and ownership databases.",
    "Enforces timelines for settlement reconciliations and investor grievance responses via SCORES portal."
  ],
  "registrars": [
    "Lays down standard codes of conduct for Registrars to an Issue (RTA) and Share Transfer Agents.",
    "Governs digital processing of demat requests, transfer approvals, and dividend distributions.",
    "Requires proper record-keeping, annual internal-control review by the audit committee, and SEBI inspection of records."
  ],
  "ipef": [
    "Governs the SEBI Investor Protection and Education Fund's administration and operations.",
    "Provides resources for conducting investor education programs, camps, and market awareness activities.",
    "Uses disgorged amounts credited to the Fund for restitution to eligible, identifiable investors who suffered losses."
  ],
  "pfutp": [
    "Prohibits any manipulative, deceptive, or fraudulent practices in connection with the buying/selling of securities.",
    "Explicitly bans front-running, wash trades, false appearance of trading, and planting false or misleading news.",
    "Authorises SEBI to investigate, seek seizure of records, suspend trading, and impound proceeds of manipulative trades."
  ],

  // Acts summaries
  "act-1": [
    "Establishes statutory rules for board meetings, quorum (1/3rd of total strength or 2 directors, whichever is higher), and minutes.",
    "Governs Corporate Social Responsibility (CSR) spending (2% of 3-year average net profits if net worth ≥ ₹500Cr, turnover ≥ ₹1,000Cr or net profit ≥ ₹5Cr).",
    "Regulates related party transactions (RPTs), requiring audit committee and board approvals."
  ],
  "act-2": [
    "Forms the legal baseline for anti-money laundering (AML) and counter-terrorist financing (CFT) in India.",
    "Mandates maintaining transaction records and reporting Cash Transactions (CTR) exceeding ₹10 Lakhs to FIU-IND.",
    "Enforces Suspicious Transaction Reporting (STR) within 7 working days of concluding a transaction is suspicious."
  ],
  "act-3": [
    "Chapter III-B provides the statutory power to RBI to register, inspect, audit, and regulate NBFCs.",
    "Mandates setting up a Statutory Reserve Fund (transferring minimum 20% of net profits annually).",
    "Grants RBI power to issue directions, cancel certificates of registration, and inspect NBFCs."
  ],
  "act-4": [
    "Provides detailed rules for client identification checks (KYC) for individuals, firms, and trusts.",
    "Designates roles of Principal Officer (PO) and Designated Director for monitoring PMLA compliance.",
    "Requires matching client registries against United Nations and government sanctions lists."
  ],
  "act-5": [
    "Provides SEBI with statutory authority to protect investor interests and regulate market intermediaries.",
    "Establishes the Securities Appellate Tribunal (SAT) to appeal decisions issued by SEBI.",
    "Provides framework for conducting search, seizure, and freezing of accounts of fraudulent entities."
  ],
  "act-6": [
    "Establishes legal rules for digital personal data processing, storage, and erasure.",
    "Requires free, specific, informed and unambiguous consent before processing, except for listed legitimate uses.",
    "Data fiduciaries must take reasonable security safeguards; Significant Data Fiduciaries must appoint a Data Protection Officer (DPO)."
  ],
  "act-7": [
    "Lenders must report borrower credit data to credit bureaus fortnightly (15th and month-end), per RBI rules since January 2025.",
    "Requires pulling credit reports only after obtaining prior written consent from the borrower.",
    "Mandates correction of disputed credit records within 30 days of receiving a customer complaint."
  ],
  "act-8": [
    "Governs cross-border transaction compliance, foreign direct investments (FDI), and overseas investments.",
    "Requires reporting of foreign equity inflows via the Single Master Form (SMF) on the RBI FIRMS portal.",
    "Outlines regulatory compliance for registering and reporting External Commercial Borrowings (ECB)."
  ],
  "act-9": [
    "Provides legal validity to digital contracts, electronic signatures, and electronic records.",
    "Makes body corporates pay compensation for negligence in protecting sensitive personal data under Section 43A (to be omitted under the DPDP Act).",
    "Defines cybercrimes, computer tampering, and parameters for corporate cybersecurity compliance."
  ],
  "act-10": [
    "Protects consumer rights against unfair trade, deceptive advertisements, and digital dark patterns.",
    "Covers financial services including lending, so borrowers can complain of unfair practices or deficient service.",
    "Sets up dispute redressing commissions for fast resolution of service deficiencies."
  ],

  // Secretarial Standards summaries
  "ss-1": [
    "Notice of Board meeting must be delivered to every director at least 7 days before the meeting.",
    "Agenda and notes on agenda must be circulated to the Board at least 7 days in advance.",
    "Draft minutes of the meeting must be circulated within 15 days of the meeting for director feedback."
  ],
  "ss-2": [
    "Notice of General Meetings (AGM/EGM) must be sent to all members at least 21 clear days in advance.",
    "Explanatory statements must accompany the notice for all items of special business.",
    "General meeting minutes must be entered in the books within 30 days and signed by the chairman."
  ],
  "ss-4": [
    "Requires the Board's Report to disclose details on corporate CSR, audit recommendations, and related party contracts.",
    "Requires a statement in the Board's Report on compliance with applicable Secretarial Standards.",
    "Requires explanation in the Board Report for any qualifications in the auditor's or secretarial reports."
  ]
};

// Detailed recent amendments & changelogs (additions, revisions, removals)
export const COMPLIANCE_AMENDMENTS = {
  // RBI Topics / IDs
  "prudential": {
    lastUpdated: "July 01, 2026",
    changes: [
      { type: "revised", severity: "high", text: "Risk weight on NBFC consumer credit (excluding housing, education, vehicle, gold and microfinance loans) raised from 100% to 125% by the RBI circular of 16 Nov 2023.", link: "https://www.rbi.org.in/Scripts/NotificationUser.aspx?Id=12567&Mode=0" },
      { type: "added", severity: "medium", text: "Leverage ratio (total outside liabilities to owned funds) of a Base Layer NBFC must not exceed 7 times.", link: "https://www.rbi.org.in/Scripts/BS_ViewMasDirections.aspx?id=12959" },
      { type: "revised", severity: "low", text: "Tier-II capital inclusion eligibility criteria for Middle Layer revised.", link: "https://www.rbi.org.in/Scripts/BS_ViewMasDirections.aspx?id=12959" }
    ]
  },
  "npa-provisioning": {
    lastUpdated: "July 01, 2026",
    changes: [
      { type: "revised", severity: "high", text: "Overdue status and NPA classification are determined as part of the day-end process, not at month-end (RBI clarification of 12 Nov 2021, now consolidated in this direction).", link: "https://www.rbi.org.in/Scripts/BS_ViewMasDirections.aspx?id=12948" },
      { type: "added", severity: "medium", text: "Standard asset provisioning: 0.40% of outstanding for Middle Layer NBFCs and 0.25% for Base Layer NBFCs.", link: "https://www.rbi.org.in/Scripts/BS_ViewMasDirections.aspx?id=12948" }
    ]
  },
  "governance": {
    lastUpdated: "June 24, 2026",
    changes: [
      { type: "added", severity: "high", text: "Middle and Upper Layer NBFCs must appoint a Chief Compliance Officer (CCO) for a minimum fixed tenure of 3 years.", link: "https://www.rbi.org.in/Scripts/NotificationUser.aspx?Id=12290&Mode=0" },
      { type: "revised", severity: "medium", text: "Directors must give an annual fit and proper declaration as on March 31 and report changes forthwith.", link: "https://www.rbi.org.in/Scripts/BS_ViewMasDirections.aspx?id=12960" }
    ]
  },
  "kyc": {
    lastUpdated: "December 29, 2025",
    changes: [
      { type: "added", severity: "high", text: "KYC records of legal entities (accounts opened on or after April 1, 2021) must be uploaded to CKYCR within 10 days.", link: "https://www.rbi.org.in/Scripts/BS_ViewMasDirections.aspx?id=12943" },
      { type: "added", severity: "medium", text: "V-CIP extended to proprietors of proprietorship firms, authorised signatories and beneficial owners of legal entities.", link: "https://www.rbi.org.in/Scripts/NotificationUser.aspx?Id=12089&Mode=0" },
      { type: "revised", severity: "high", text: "Periodic KYC updation: at least every 2 years for high-risk, 8 years for medium-risk and 10 years for low-risk customers.", link: "https://www.rbi.org.in/Scripts/BS_ViewMasDirections.aspx?id=12943" }
    ]
  },
  "conduct": {
    lastUpdated: "July 01, 2026",
    changes: [
      { type: "added", severity: "high", text: "Lists of LSPs and their digital lending apps must be published on the NBFC website; fees not disclosed in the KFS cannot be charged.", link: "https://www.rbi.org.in/Scripts/BS_ViewMasDirections.aspx?id=12957" },
      { type: "revised", severity: "medium", text: "Complaints not resolved within 30 days can be escalated to the RBI Ombudsman (RB-IOS).", link: "https://www.rbi.org.in/Scripts/NotificationUser.aspx?Id=12848&Mode=0" }
    ]
  },
  "credit-cards": {
    lastUpdated: "November 28, 2025",
    changes: [
      { type: "added", severity: "high", text: "NBFCs require prior approval from RBI and a minimum Net Owned Fund of ₹100 Crore to issue credit cards.", link: "https://www.rbi.org.in/Scripts/BS_ViewMasDirections.aspx?id=12956" }
    ]
  },
  "reporting": {
    lastUpdated: "July 01, 2026",
    changes: [
      { type: "added", severity: "medium", text: "Green deposit framework for deposit-taking NBFCs: publish the policy on the website and file an annual impact report.", link: "https://www.rbi.org.in/Scripts/BS_ViewMasDirections.aspx?id=12940" },
      { type: "revised", severity: "low", text: "Notes to Accounts disclosure of concentration of advances, exposures and NPAs (top 20 borrowers, top 4 NPA accounts).", link: "https://www.rbi.org.in/Scripts/BS_ViewMasDirections.aspx?id=12945" }
    ]
  },
  "registration": {
    lastUpdated: "July 01, 2026",
    changes: [
      { type: "added", severity: "high", text: "NOF for NBFC-ICCs rises to ₹10 Crore by March 31, 2027 (₹5 Crore from March 31, 2025).", link: "https://www.rbi.org.in/Scripts/BS_ViewMasDirections.aspx?id=12965" }
    ]
  },
  "risk": {
    lastUpdated: "June 24, 2026",
    changes: [
      { type: "added", severity: "medium", text: "Chief Risk Officer (CRO) required for NBFCs with assets of more than ₹5,000 Crore.", link: "https://www.rbi.org.in/Scripts/BS_ViewMasDirections.aspx?id=12960" }
    ]
  },
  "operations": {
    lastUpdated: "November 28, 2025",
    changes: [
      { type: "added", severity: "high", text: "Prior written RBI approval required for change in control or acquisition of 26% or more of paid-up equity.", link: "https://www.rbi.org.in/Scripts/BS_ViewMasDirections.aspx?id=12964" }
    ]
  },

  // SEBI Regulations
  "icdr": {
    lastUpdated: "March 21, 2026",
    changes: [
      { type: "added", severity: "medium", text: "Rights issue draft letter of offer now filed only with stock exchanges, not SEBI; separate fast-track route removed (w.e.f. Apr 8, 2025).", link: "https://www.sebi.gov.in/legal/regulations/mar-2025/securities-and-exchange-board-of-india-issue-of-capital-and-disclosure-requirements-amendment-regulations-2025_92539.html" },
      { type: "revised", severity: "medium", text: "Lock-in period for promoter contribution reduced from 3 years to 18 months under specified conditions.", link: "https://www.sebi.gov.in/legal/regulations/aug-2021/securities-and-exchange-board-of-india-issue-of-capital-and-disclosure-requirements-third-amendment-regulations-2021_51884.html" }
    ]
  },
  "lodr": {
    lastUpdated: "July 14, 2026",
    changes: [
      { type: "added", severity: "high", text: "Verification of market rumours by top 100 listed entities (effective June 1, 2024) and top 250 (effective December 1, 2024).", link: "https://www.sebi.gov.in/legal/circulars/jan-2024/extension-of-timeline-for-verification-of-market-rumours-by-listed-entities_80867.html" },
      { type: "revised", severity: "high", text: "Timeline for disclosure of material events under Regulation 30 reduced from 24 hours to 12 hours (if originating within the entity).", link: "https://www.sebi.gov.in/legal/regulations/jun-2023/securities-and-exchange-board-of-india-listing-obligations-and-disclosure-requirements-second-amendment-regulations-2023_72609.html" }
    ]
  },
  "pit": {
    lastUpdated: "March 12, 2025",
    changes: [
      { type: "revised", severity: "medium", text: "Definition of Unpublished Price Sensitive Information (UPSI) aligned to include specific list of material events under LODR.", link: "https://www.sebi.gov.in/legal/regulations/mar-2025/securities-and-exchange-board-of-india-prohibition-of-insider-trading-amendment-regulations-2025_92645.html" },
      { type: "added", severity: "high", text: "Structured Digital Database (SDD) logs must be preserved for 8 years.", link: "https://www.sebi.gov.in/legal/regulations/jul-2020/securities-and-exchange-board-of-india-prohibition-of-insider-trading-amendment-regulations-2020_47104.html" }
    ]
  },
  "sast": {
    lastUpdated: "December 05, 2025",
    changes: [
      { type: "revised", severity: "medium", text: "Open offer process aligned with 2021 Delisting Regulations; acquirer may seek delisting through the open offer (Reg 5A).", link: "https://www.sebi.gov.in/legal/regulations/dec-2021/securities-and-exchange-board-of-india-substantial-acquisition-of-shares-and-takeovers-third-amendment-regulations-2021_54464.html" }
    ]
  },

  // Acts
  "act-1": {
    lastUpdated: "Regular MCA Updates",
    changes: [
      { type: "added", severity: "medium", text: "MCA notification on CSR funding (unspent CSR account transfer regulations).", link: "https://www.mca.gov.in/content/mca/global/en/acts-rules/ebooks/companies-act-2013.html" },
      { type: "revised", severity: "medium", text: "Small company thresholds revised (Paid-up capital up to ₹10 Crore and turnover up to ₹100 Crore, from Dec 1, 2025).", link: "https://www.mca.gov.in/content/mca/global/en/acts-rules/ebooks/companies-act-2013.html" }
    ]
  },
  "act-2": {
    lastUpdated: "FATF Alignment",
    changes: [
      { type: "revised", severity: "high", text: "Beneficial ownership threshold under the PML Rules lowered to 10% (from 25% for companies, 15% for partnerships and trusts) in 2023.", link: "https://fiuindia.gov.in/files/AML_Legislation/pmla_rules.html" }
    ]
  },
  "act-6": {
    lastUpdated: "Enacted 2023",
    changes: [
      { type: "added", severity: "high", text: "Mandatory consent architectures and penalty framework for data leaks up to ₹250 Crore.", link: "https://www.meity.gov.in/content/digital-personal-data-protection-act-2023" }
    ]
  },

  // Secretarial Standards
  "ss-1": {
    lastUpdated: "April 01, 2024",
    changes: [
      { type: "revised", severity: "medium", text: "Revised SS-1 effective 1 April 2024; notice 7 days before meeting, draft minutes within 15 days unchanged.", link: "https://icsis3-console.icsi.edu:9002/icsi-prod/media/cms_uploads/ss-1-1-2024.pdf" }
    ]
  },
  "ss-2": {
    lastUpdated: "April 01, 2024",
    changes: [
      { type: "revised", severity: "medium", text: "Revised SS-2 effective 1 April 2024; 21 clear days' notice and explanatory statement rules retained.", link: "https://icsis3-console.icsi.edu:9002/icsi-prod/media/cms_uploads/ss-2-1-2024.pdf" }
    ]
  }
};

// RBI classification rules
export const RBI_TOPIC_RULES = [
  { pattern: /capital.adequacy|CAR|CRAR/i, topic: "prudential", label: "Capital Adequacy", cls: "tc-prudential" },
  { pattern: /income.recogni|asset.classif|NPA|provisioning/i, topic: "npa-provisioning", label: "NPA / Provisioning", cls: "tc-prudential" },
  { pattern: /governance/i, topic: "governance", label: "Governance", cls: "tc-governance" },
  { pattern: /know.your.customer|KYC/i, topic: "kyc", label: "KYC", cls: "tc-conduct" },
  { pattern: /responsible.business|fair.practice/i, topic: "conduct", label: "Conduct", cls: "tc-conduct" },
  { pattern: /credit.card|debit.card/i, topic: "credit-cards", label: "Credit Cards", cls: "tc-conduct" },
  { pattern: /financial.statement|disclosure/i, topic: "reporting", label: "Disclosures", cls: "tc-reporting" },
  { pattern: /credit.information.report/i, topic: "reporting", label: "Credit Reporting", cls: "tc-reporting" },
  { pattern: /registration|scale.based|exemption/i, topic: "registration", label: "Registration & SBR", cls: "tc-registration" },
  { pattern: /branch.authoris/i, topic: "registration", label: "Branch Auth", cls: "tc-registration" },
  { pattern: /acquisition.of.sharehold|amalgamat|undertaking.of.financial/i, topic: "operations", label: "M&A / Subsidiaries", cls: "tc-operations" },
  { pattern: /credit.risk|concentration.risk|outsourc/i, topic: "risk", label: "Risk Management", cls: "tc-risk" },
  { pattern: /asset.liability|ALM/i, topic: "risk", label: "ALM", cls: "tc-risk" },
  { pattern: /securitisation|transfer.and.distrib/i, topic: "risk", label: "Securitisation", cls: "tc-risk" },
  { pattern: /investment.portfolio|classif.valuat/i, topic: "risk", label: "Investment Portfolio", cls: "tc-risk" },
  { pattern: /climate|ESG/i, topic: "esg", label: "Climate / ESG", cls: "tc-governance" },
  { pattern: /wilful.default/i, topic: "credit-cards", label: "Wilful Defaulters", cls: "tc-prudential" },
  { pattern: /resolution.of.stress/i, topic: "prudential", label: "Stressed Assets", cls: "tc-prudential" },
  { pattern: /acceptance.of.public.deposit/i, topic: "deposits", label: "Public Deposits", cls: "tc-registration" },
  { pattern: /dividend/i, topic: "prudential", label: "Dividends", cls: "tc-prudential" },
  { pattern: /credit.facilit/i, topic: "credit", label: "Credit Facilities", cls: "tc-prudential" },
  { pattern: /voluntary.amalgam/i, topic: "operations", label: "Amalgamation", cls: "tc-operations" },
  { pattern: /miscellaneous/i, topic: "misc", label: "Miscellaneous", cls: "tc-other" },
];

// SEBI classifications
export const SEBI_TOPICS = {
  icdr: { label: "ICDR (Capital Issue)", cls: "tc-sebi-icdr" },
  lodr: { label: "LODR (Listing Rules)", cls: "tc-sebi-lodr" },
  pit: { label: "PIT (Insider Trading)", cls: "tc-sebi-pit" },
  sast: { label: "SAST (Takeovers)", cls: "tc-sebi-sast" }
};

// High-level policy previews for compliance professionals
export const PREVIEW_DATA = {
  // RBI Directions previews
  "capital.adequacy": "Mandates leverage ratio rules for Base Layer, and a minimum Capital to Risk-Weighted Assets Ratio (CRAR) of 15% for Middle and Upper Layer NBFCs to maintain capital adequacy reserves.",
  "npa-provisioning": "Sets standards for classification of assets (Standard, Sub-standard, Doubtful, Loss) and corresponding provision requirements. Outlines the 90-day overdue norm for NPA categorization.",
  "governance": "Outlines board committees (Audit, Nomination and Remuneration, Risk Management), CCO/CRO roles, and fit & proper criteria for directors. Loans to directors and relatives need Board-approved policy and thresholds.",
  "kyc": "Prescribes client identification procedures, beneficial ownership verification, customer due diligence, AML screening, and mandatory reporting of suspicious transactions (STR).",
  "conduct": "Mandates fair treatment of customers, clear terms of loans, transparency in interest rates, grievance redressal officers, and rules prohibiting coercive recovery tactics.",
  "credit-cards": "Sets strict regulations on eligibility to issue cards, interest rates calculation, billing transparency, customer consent for value-added services, and default reporting.",
  "reporting": "Governs format for disclosure in balance sheets, reporting financial returns to RBI, and mandatory contribution of credit histories to Credit Information Companies (CICs).",
  "registration": "Defines scale-based categorization (Base Layer, Middle Layer, Upper Layer, Top Layer), Net Owned Fund (NOF) requirements, and exemptions from specific registrations.",
  "risk": "Lays down credit risk ceilings, concentration of credit limits, frameworks for ALM, and guidelines to manage third-party outsourcing risk securely.",
  "operations": "Regulates investment in subsidiaries, prior approval requirements for mergers/takeovers or change in control, and voluntary amalgamation rules.",

  // SEBI Regulations previews
  "icdr": "Securities and Exchange Board of India (Issue of Capital and Disclosure Requirements) Regulations, 2018. Governs initial public offerings (IPOs), further public offerings (FPOs), rights issues, and preferential allotments.",
  "lodr": "Securities and Exchange Board of India (Listing Obligations and Disclosure Requirements) Regulations, 2015. Prescribes corporate governance, financial result disclosures, material event reports, and shareholding patterns for listed entities.",
  "pit": "Securities and Exchange Board of India (Prohibition of Insider Trading) Regulations, 2015. Prohibits trading in listed securities based on Unpublished Price Sensitive Information (UPSI) and mandates codes of fair disclosure.",
  "sast": "Securities and Exchange Board of India (Substantial Acquisition of Shares and Takeovers) Regulations, 2011. Regulates acquisitions of substantial stakes, open offer thresholds, mandatory public announcements, and disclosure timings.",
  "depositories": "Securities and Exchange Board of India (Depositories and Participants) Regulations, 2018. Regulates depositories, safe-keeping of records, and mutual rules between participants and trading systems.",
  "registrars": "Securities and Exchange Board of India (Registrars to an Issue and Share Transfer Agents) Regulations, 2025 (replaced the 1993 Regulations). Sets standards of code of conduct for registrars, public issue registration, and share transfer actions.",
  "ipef": "Securities and Exchange Board of India (Investor Protection and Education Fund) Regulations, 2009. Outlines rules for utilization and administration of funds designated for investor protection and public trading awareness.",
  "pfutp": "Securities and Exchange Board of India (Prohibition of Fraudulent and Unfair Trade Practices relating to Securities Market) Regulations, 2003. Formulates definitions of market manipulation, misleading disclosures, and prohibited trade activities."
};

// Register descriptions, freshness notes and footer copy (previously in the page markup).
export const REGISTER_COPY = {
  rbiMd: "Master Directions issued by the Reserve Bank of India applicable to Non-Banking Financial Companies (NBFC-ICC).",
  rbiNotif: "Latest circulars and notifications issued by the Reserve Bank of India. Automatically scraped and monitored in real-time.",
  sebiReg: "Regulations governing listed entities, insider trading, substantial takeovers, capital disclosure rules, and depositories under SEBI Act.",
  sebiCirc: "Recent circulars issued by the Securities and Exchange Board of India covering market operations, compliance relaxations, and regulatory changes.",
  acts: "Primary statutes and company rules applicable to corporate governance, prevention of money laundering, data privacy, and electronic services.",
  ss: "Secretarial Standards formulated by the ICSI, dynamically discovered from ICSI's Secretarial Standards listing page (currently SS-1 through SS-6).",
};

export const FRESHNESS_COPY = {
  live: "Checked every 10-15 minutes, 8AM-8PM IST",
  actsMonthly: "Checked once a month — Parliament amends Acts far less often than RBI/SEBI issue circulars",
  ssMonthly: "Checked once a month — ICSI revises these infrequently",
};

export const COMPLIANCE_NOTE =
  "Always verify applicability to your specific NBFC registration layer (Base/Middle/Upper) before acting on any direction.";

export const NOT_AFFILIATED =
  "This is an independent project and is not affiliated with or endorsed by the RBI or SEBI.";

export const COPYRIGHT =
  "© 2026 Kreon Financial Services Limited. All rights reserved. Kreon RegPulse™ is a trademark of Kreon Financial Services Limited.";

// Optional sign-off for the hand-written notes above. Once a key is listed here, pages that
// show its notes add a "Reviewed by <name>, <date>" mark. Add an entry after a CS has checked
// the text against the official documents, e.g.
//   prudential: { by: "A. Sharma, CS", on: "2026-10-21" },
// Keys are the ones used in COMPLIANCE_GISTS / COMPLIANCE_AMENDMENTS (topic keys such as
// "prudential" or "kyc", SEBI keys such as "lodr", and ids such as "act-1" or "ss-1").
export const CONTENT_REVIEWS = {
};
