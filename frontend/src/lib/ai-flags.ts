import type { WillDocument, AIFlag } from './types/will'

interface FlagRule {
  id: string
  severity: 'critical' | 'warning' | 'info'
  title: string
  titleKo: string
  description: string
  descriptionKo: string
  statute?: string
  check: (will: WillDocument) => boolean
}

const FLAG_RULES: FlagRule[] = [
  {
    id: 'missing_fla_exclusion',
    severity: 'critical',
    title: 'FLA Exclusion Clause Missing',
    titleKo: 'FLA 제외 조항 누락',
    description: 'Ontario Family Law Act s.4(2)(2) requires an exclusion clause to protect your inheritance from being split in divorce. This should be included in every Ontario Will.',
    descriptionKo: '온타리오 가족법 제4(2)(2)조는 상속재산이 이혼 시 분할되지 않도록 보호하는 제외 조항이 필요합니다.',
    statute: 'FLA s.4(2)(2)',
    check: (will) => will.aboutYou.province === 'ON' && !will.yourEstate.includeFLAExclusion
  },
  {
    id: 'henson_trust_recommended',
    severity: 'critical',
    title: 'Henson Trust Recommended',
    titleKo: 'Henson 신탁 권장',
    description: 'A beneficiary receiving ODSP may lose benefits if they inherit directly. A Henson Trust (absolute discretion, no vesting) preserves ODSP eligibility. ODSP asset limit: $40,000.',
    descriptionKo: 'ODSP를 받는 수혜자는 직접 상속 시 혜택을 잃을 수 있습니다. Henson 신탁으로 ODSP 자격을 유지할 수 있습니다.',
    statute: 'ODSPA; Henson v. Henson',
    check: (will) => will.yourEstate.beneficiaries.some(b => b.receivesODSP) ||
      will.yourFamily.children.some(c => c.receivesODSP)
  },
  {
    id: 'separation_gift_void_risk',
    severity: 'critical',
    title: 'Gift to Separated Spouse May Be Void',
    titleKo: '별거 배우자에 대한 증여 무효 위험',
    description: 'Under SLRA s.17, gifts to a separated spouse are void after 3+ years of separation. Your Will should reflect your current intentions.',
    descriptionKo: 'SLRA 제17조에 따라 3년 이상 별거 후 배우자에 대한 증여는 무효가 될 수 있습니다.',
    statute: 'SLRA s.17',
    check: (will) => {
      if (will.yourFamily.maritalStatus !== 'separated') return false
      if (!will.yourFamily.separationDate) return true
      const sep = new Date(will.yourFamily.separationDate)
      const threeYearsAgo = new Date()
      threeYearsAgo.setFullYear(threeYearsAgo.getFullYear() - 3)
      return sep < threeYearsAgo
    }
  },
  {
    id: 'dual_will_recommended',
    severity: 'warning',
    title: 'Dual Will Strategy Recommended',
    titleKo: '이중 유언장 전략 권장',
    description: 'You have business interests. A Primary + Secondary (Private) Will can save significant Estate Administration Tax by keeping private company shares out of probate.',
    descriptionKo: '사업 지분이 있습니다. 기본 유언장 + 비공개 유언장 전략으로 상당한 유산 관리세를 절약할 수 있습니다.',
    statute: 'Granovsky Estate v. Ontario; Re Milne Estate 2019',
    check: (will) => will.assets.some(a => a.assetType === 'business') && !will.yourEstate.includeDualWill
  },
  {
    id: 'resp_clause_needed',
    severity: 'warning',
    title: 'RESP Successor Subscriber Clause Needed',
    titleKo: 'RESP 후계 가입자 조항 필요',
    description: 'You have an RESP. Your Will should designate a successor subscriber to prevent the RESP from collapsing on your death.',
    descriptionKo: 'RESP가 있습니다. 사망 시 RESP가 종료되지 않도록 후계 가입자를 지정해야 합니다.',
    statute: 'ITA s.146.1; CLRA s.61',
    check: (will) => will.assets.some(a => a.assetType === 'resp')
  },
  {
    id: 'saunders_vautier_risk',
    severity: 'warning',
    title: 'Trust May Be Collapsed Early',
    titleKo: '신탁 조기 종료 위험',
    description: 'Under Saunders v. Vautier, all adult beneficiaries can demand early termination of a trust. Include "per stirpes" language to include unborn beneficiaries and prevent premature collapse.',
    descriptionKo: 'Saunders v. Vautier 원칙에 따라 모든 성인 수혜자가 신탁의 조기 종료를 요구할 수 있습니다.',
    statute: 'Saunders v. Vautier [1841]',
    check: (will) => will.yourEstate.hasTrusts &&
      will.yourEstate.trusts.some(t => !t.perStirpesLanguage)
  },
  {
    id: 'us_person_tax_risk',
    severity: 'warning',
    title: 'US Person Tax Complications',
    titleKo: '미국인 세금 복잡성',
    description: 'A beneficiary or spouse is a US person. Cross-border estate planning may be required to address US estate tax and RRSP/RRIF complexities.',
    descriptionKo: '수혜자 또는 배우자가 미국인입니다. 미국 상속세 및 RRSP/RRIF 복잡성을 해결하기 위한 국경 간 상속 계획이 필요할 수 있습니다.',
    statute: 'ITA s.70(6); US-Canada Tax Treaty',
    check: (will) => [
      ...will.yourEstate.beneficiaries,
      ...will.yourFamily.children,
      will.yourFamily.spouse,
    ].filter(Boolean).some(p => p?.isUSPerson)
  },
  {
    id: 'clra_90day_guardian_warning',
    severity: 'info',
    title: 'Guardian Appointment Expires in 90 Days',
    titleKo: '후견인 지정은 90일 후 만료',
    description: 'Under CLRA s.61, a guardian appointed by Will only has authority for 90 days unless they apply to court. Make sure your guardian is aware of this requirement.',
    descriptionKo: 'CLRA 제61조에 따라 유언장으로 지정된 후견인의 권한은 법원에 신청하지 않으면 90일 후 만료됩니다.',
    statute: 'CLRA s.61',
    check: (will) => will.yourFamily.guardians.length > 0
  },
  {
    id: 'high_debt_to_asset_ratio',
    severity: 'warning',
    title: 'High Debt-to-Asset Ratio — Potential Insolvency',
    titleKo: '높은 부채 비율 — 잠재적 지급 불능',
    description: 'Total liabilities exceed 50% of total assets. Your estate may face solvency issues, meaning there may not be enough assets to cover debts and bequests. Consider consulting an estate lawyer about priority of payments.',
    descriptionKo: '총 부채가 총 자산의 50%를 초과합니다. 유산이 지급 불능 상태에 빠질 수 있으며, 부채와 유증을 충당할 자산이 부족할 수 있습니다.',
    check: (will) => {
      const totalAssets = will.assets.reduce((s, a) => s + (a.estimatedValue ?? 0), 0)
      const totalLiabilities = (will.liabilities ?? []).reduce((s, l) => s + (l.outstandingBalance ?? 0), 0)
      return totalAssets > 0 && totalLiabilities > totalAssets * 0.5
    }
  },
  {
    id: 'mortgage_without_insurance',
    severity: 'warning',
    title: 'Mortgage Without Life Insurance',
    titleKo: '생명보험 없는 주택담보대출',
    description: 'You have a mortgage liability but no life insurance asset listed. Consider life insurance to cover the outstanding mortgage so your family can keep the property without financial burden.',
    descriptionKo: '주택담보대출이 있지만 생명보험 자산이 등록되어 있지 않습니다. 가족이 재정적 부담 없이 재산을 유지할 수 있도록 미상환 대출을 충당할 생명보험을 고려하세요.',
    check: (will) => {
      const hasMortgage = (will.liabilities ?? []).some(l => l.liabilityType === 'mortgage')
      const hasInsurance = will.assets.some(a => a.assetType === 'insurance')
      return hasMortgage && !hasInsurance
    }
  },
  {
    id: 'pecore_resulting_trust',
    severity: 'warning',
    title: 'Joint Asset May Not Pass as Intended',
    titleKo: '공동 자산이 의도대로 이전되지 않을 수 있음',
    description: 'Under Pecore v. Pecore, adult children on joint title with a parent trigger a presumption of resulting trust — the asset may pass to the estate, not the joint owner.',
    descriptionKo: 'Pecore v. Pecore에 따라 부모와 함께 공동 소유인 성인 자녀는 결과적 신탁 추정을 발생시킵니다.',
    statute: 'Pecore v. Pecore [2007] 1 SCR 795',
    check: (will) => will.assets.some(a =>
      a.jointOwnerName &&
      a.jointOwnerRelationship !== 'spouse' &&
      a.jointOwnerRelationship !== 'partner'
    )
  },
]

export function runAIFlags(will: WillDocument): AIFlag[] {
  const newFlags: AIFlag[] = []

  for (const rule of FLAG_RULES) {
    try {
      if (rule.check(will)) {
        const existing = will.aiFlags.find(f => f.id === rule.id)
        if (existing) {
          newFlags.push(existing) // preserve dismissed state
        } else {
          newFlags.push({
            id: rule.id,
            severity: rule.severity,
            title: rule.title,
            titleKo: rule.titleKo,
            description: rule.description,
            descriptionKo: rule.descriptionKo,
            statute: rule.statute,
            dismissed: false,
          })
        }
      }
    } catch {
      // rule evaluation error — skip
    }
  }

  // Preserve dismissed flags that no longer trigger (so user doesn't see them re-appear)
  for (const f of will.aiFlags) {
    if (f.dismissed && !newFlags.find(nf => nf.id === f.id)) {
      newFlags.push(f)
    }
  }

  return newFlags
}
