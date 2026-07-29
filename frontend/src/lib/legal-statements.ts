/**
 * SINGLE SOURCE for client-facing legal statements (#85, ask 2).
 *
 * Every statement a client reads about Ontario execution law — witness
 * counts, SLRA references, the remote-signing rule, separated-spouse
 * effects — lives HERE and only here. Screens and i18n dictionaries
 * import from this file; none may restate these facts in their own
 * strings. That gives the reviewing lawyer ONE file to read and sign
 * off (#85 assigns that sign-off to the lawyer), and one place to
 * correct if the law or the firm's practice changes.
 *
 * Do not edit wording without lawyer sign-off.
 *
 * FOR THE REVIEWING LAWYER (#93): the Korean rendering of "SLRA" below is
 * currently "유언검인법" (carried over verbatim from the earlier screens).
 * Please confirm or correct the Korean statute name — it is used wherever
 * the Act is named to clients in Korean.
 */

export interface LegalStatement {
  en: string
  ko: string
  statute?: string
}

export const LEGAL_STATEMENTS = {
  /** Post-questionnaire "what happens next" — full form. */
  willSigningInPerson: {
    en: 'You will sign your Will in person with 2 witnesses. Ontario does NOT permit fully electronic Wills — physical signing is required (SLRA s.4).',
    ko: '귀하는 2명의 증인이 참석한 가운데 직접 유언장에 서명하게 됩니다. 온타리오주는 완전한 전자 유언장을 허용하지 않으며, 실물 서명이 필요합니다 (SLRA 제4조).',
    statute: 'SLRA s.4',
  },
  poaSigningWitnesses: {
    en: 'Your POAs are signed separately in the presence of 2 witnesses. Ask your lawyer who may act as a witness.',
    ko: '위임장은 별도로 2명의 증인이 참석한 가운데 서명합니다. 증인이 될 수 있는 사람은 변호사에게 확인하십시오.',
    statute: 'SDA s.10',
  },
  /** Post-questionnaire "what happens next" — short form. */
  documentsSignedInPerson: {
    en: 'You will sign your documents in person with 2 witnesses (SLRA s.4).',
    ko: '직접 방문하여 2명의 증인과 함께 서류에 서명합니다. (SLRA 제4조)',
    statute: 'SLRA s.4',
  },
  /** Review-portal completion page. */
  willTwoWitnesses: {
    en: 'Under the Succession Law Reform Act (SLRA), your Will must be signed in the presence of two witnesses.',
    ko: '유언검인법(SLRA)에 따라 유언장은 두 명의 증인 앞에서 서명해야 합니다.',
    statute: 'SLRA s.4',
  },
  signingTestatorPresence: {
    en: 'The testator (you) must sign in the presence of two witnesses.',
    ko: '유언자(본인)는 두 명의 증인 앞에서 서명해야 합니다.',
    statute: 'SLRA s.4',
  },
  signingWitnessesPresence: {
    en: 'Both witnesses must sign in the presence of the testator and each other.',
    ko: '두 증인은 유언자와 서로의 면전에서 서명해야 합니다.',
    statute: 'SLRA s.4',
  },
  signingWitnessEligibility: {
    en: 'Witnesses cannot be beneficiaries or spouses of beneficiaries under the Will.',
    ko: '증인은 유언의 수익자나 수익자의 배우자가 될 수 없습니다.',
    statute: 'SLRA s.12',
  },
  signingRemoteOption: {
    en: 'Remote video signing is available under SLRA s.21.1 (one witness must be an LSO licensee).',
    ko: 'SLRA s.21.1에 따라 원격 화상 서명이 가능합니다 (증인 중 한 명은 LSO 면허 보유자여야 합니다).',
    statute: 'SLRA s.21.1',
  },
  /** Post-submission signing-requirements notice (submitted screen). */
  inPersonSigningNotice: {
    en: 'In Ontario, Wills must be signed in person. Electronic signing is not permitted (SLRA s.4). Your lawyer will schedule a signing appointment.',
    ko: '온타리오에서 유언장은 반드시 직접 서명해야 합니다. 전자 서명은 허용되지 않습니다 (SLRA 제4조). 변호사가 서명 약속을 잡을 것입니다.',
    statute: 'SLRA s.4',
  },
  /** Landing-page "how it works" signing step. */
  landingSigningStep: {
    en: 'Get signing instructions for Ontario requirements, including two witnesses and in-person execution.',
    ko: '온타리오 요건(증인 2명, 직접 서명 포함)에 따른 서명 안내를 받게 됩니다.',
    statute: 'SLRA s.4',
  },
  /** Landing-page footer validity sentence. */
  footerValidityNotice: {
    en: 'A will is only valid when signed according to the Succession Law Reform Act, including the required witnesses.',
    ko: '유언장은 유언검인법(SLRA)에 따라, 요구되는 증인과 함께 서명되어야만 유효합니다.',
    statute: 'SLRA s.4',
  },
  /** AI review flag for separated-spouse gifts (client-facing text). */
  separatedSpouseGiftsFlag: {
    en: 'Under SLRA s.17, gifts to a separated spouse are void after 3+ years of separation. Your Will should reflect your current intentions.',
    ko: 'SLRA 제17조에 따라 3년 이상 별거 후 배우자에 대한 증여는 무효가 될 수 있습니다.',
    statute: 'SLRA s.17',
  },
  /** Separated-spouse consequences shown during the questionnaire. */
  separatedSpouseGiftsShort: {
    en: 'SLRA s.17: gifts to ex may be void after 3 years',
    ko: 'SLRA 제17조: 3년 후 전 배우자에 대한 증여는 무효가 될 수 있습니다',
    statute: 'SLRA s.17',
  },
  separatedSpouseGiftsNote: {
    en: 'SLRA s.17: Gifts to a separated spouse may be void after 3+ years of separation.',
    ko: 'SLRA 제17조: 별거 중인 배우자에 대한 증여는 3년 이상 별거 후 무효가 될 수 있습니다.',
    statute: 'SLRA s.17',
  },
} as const satisfies Record<string, LegalStatement>

export type LegalStatementKey = keyof typeof LEGAL_STATEMENTS

export function legalStatement(
  key: LegalStatementKey,
  language: 'en' | 'ko'
): string {
  return LEGAL_STATEMENTS[key][language]
}
