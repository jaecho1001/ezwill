'use client'
import * as React from 'react'
import { WillDocument, INITIAL_WILL } from '@/lib/types/will'
import { loadDraft, saveDraft } from '@/lib/storage'
import { runAIFlags } from '@/lib/ai-flags'

type WillAction =
  | { type: 'SET_WILL'; payload: WillDocument }
  | { type: 'UPDATE_ABOUT_YOU'; payload: Partial<WillDocument['aboutYou']> }
  | { type: 'UPDATE_FAMILY'; payload: Partial<WillDocument['yourFamily']> }
  | { type: 'UPDATE_ESTATE'; payload: Partial<WillDocument['yourEstate']> }
  | { type: 'UPDATE_ARRANGEMENTS'; payload: Partial<WillDocument['yourArrangements']> }
  | { type: 'UPDATE_POA_PROPERTY'; payload: Partial<WillDocument['poaProperty']> }
  | { type: 'UPDATE_POA_PERSONAL_CARE'; payload: Partial<WillDocument['poaPersonalCare']> }
  | { type: 'ADD_ASSET'; payload: WillDocument['assets'][0] }
  | { type: 'REMOVE_ASSET'; payload: string }
  | { type: 'SET_STEP'; payload: { step: number; subStep?: number } }
  | { type: 'COMPLETE_STEP'; payload: number }
  | { type: 'SET_LANGUAGE'; payload: WillDocument['language'] }
  | { type: 'DISMISS_FLAG'; payload: string }
  | { type: 'RESET' }

function willReducer(state: WillDocument, action: WillAction): WillDocument {
  let next: WillDocument
  switch (action.type) {
    case 'SET_WILL':
      return action.payload
    case 'UPDATE_ABOUT_YOU':
      next = { ...state, aboutYou: { ...state.aboutYou, ...action.payload }, updatedAt: new Date().toISOString() }
      break
    case 'UPDATE_FAMILY':
      next = { ...state, yourFamily: { ...state.yourFamily, ...action.payload }, updatedAt: new Date().toISOString() }
      break
    case 'UPDATE_ESTATE':
      next = { ...state, yourEstate: { ...state.yourEstate, ...action.payload }, updatedAt: new Date().toISOString() }
      break
    case 'UPDATE_ARRANGEMENTS':
      next = { ...state, yourArrangements: { ...state.yourArrangements, ...action.payload }, updatedAt: new Date().toISOString() }
      break
    case 'UPDATE_POA_PROPERTY':
      next = { ...state, poaProperty: { ...state.poaProperty, ...action.payload }, updatedAt: new Date().toISOString() }
      break
    case 'UPDATE_POA_PERSONAL_CARE':
      next = { ...state, poaPersonalCare: { ...state.poaPersonalCare, ...action.payload }, updatedAt: new Date().toISOString() }
      break
    case 'ADD_ASSET':
      next = { ...state, assets: [...state.assets, action.payload], updatedAt: new Date().toISOString() }
      break
    case 'REMOVE_ASSET':
      next = { ...state, assets: state.assets.filter(a => a.id !== action.payload), updatedAt: new Date().toISOString() }
      break
    case 'SET_STEP':
      return { ...state, currentStep: action.payload.step, currentSubStep: action.payload.subStep ?? 0 }
    case 'COMPLETE_STEP':
      return { ...state, completedSteps: [...new Set([...state.completedSteps, action.payload])] }
    case 'SET_LANGUAGE':
      return { ...state, language: action.payload }
    case 'DISMISS_FLAG':
      return {
        ...state,
        aiFlags: state.aiFlags.map(f => f.id === action.payload ? { ...f, dismissed: true } : f)
      }
    case 'RESET':
      return { ...INITIAL_WILL, id: crypto.randomUUID(), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
    default:
      return state
  }
  // Re-run AI flags on data changes
  next.aiFlags = runAIFlags(next)
  return next
}

interface WillFormContextValue {
  will: WillDocument
  dispatch: React.Dispatch<WillAction>
}

const WillFormContext = React.createContext<WillFormContextValue | null>(null)

export function WillFormProvider({ children }: { children: React.ReactNode }) {
  const [will, dispatch] = React.useReducer(willReducer, INITIAL_WILL, (initial) => {
    const saved = loadDraft()
    if (saved) return saved
    return {
      ...initial,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
  })

  // Auto-save to localStorage
  React.useEffect(() => {
    const timer = setTimeout(() => saveDraft(will), 500)
    return () => clearTimeout(timer)
  }, [will])

  return (
    <WillFormContext.Provider value={{ will, dispatch }}>
      {children}
    </WillFormContext.Provider>
  )
}

export function useWillForm() {
  const ctx = React.useContext(WillFormContext)
  if (!ctx) throw new Error('useWillForm must be used within WillFormProvider')
  return ctx
}
