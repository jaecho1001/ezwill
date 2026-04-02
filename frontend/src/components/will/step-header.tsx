'use client'
interface StepHeaderProps {
  section: string
  title: string
  description?: string
  step?: number
  totalSteps?: number
}

export function StepHeader({ section, title, description, step, totalSteps }: StepHeaderProps) {
  return (
    <div className="mb-8">
      <p className="text-xs font-semibold text-amber-600 uppercase tracking-wider mb-1">{section}</p>
      <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
      {description && <p className="mt-2 text-gray-500 text-sm leading-relaxed">{description}</p>}
      {step !== undefined && totalSteps !== undefined && (
        <div className="mt-3 flex items-center gap-2">
          {Array.from({ length: totalSteps }, (_, i) => (
            <div
              key={i}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                i < step ? 'bg-amber-500 flex-1' : i === step ? 'bg-amber-300 flex-1' : 'bg-gray-200 flex-1'
              }`}
            />
          ))}
        </div>
      )}
    </div>
  )
}
