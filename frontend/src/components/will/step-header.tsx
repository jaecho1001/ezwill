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
      <div className="mb-2 flex items-center justify-between gap-4">
        <p className="text-sm font-medium tracking-wide text-[#2D2D2D]/50">{section}</p>
        {step !== undefined && totalSteps !== undefined && (
          <div className="flex items-center gap-1.5">
            {Array.from({ length: totalSteps }, (_, i) => (
              <div
                key={i}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  i === step ? 'w-6 bg-[#1B2A4A]' : i < step ? 'w-1.5 bg-[#1B2A4A]' : 'w-1.5 bg-[#E8E4DF]'
                }`}
              />
            ))}
          </div>
        )}
      </div>
      <h1 className="text-display text-3xl font-bold leading-tight text-[#1B2A4A]">{title}</h1>
      {description && <p className="mt-3 text-sm leading-relaxed text-[#2D2D2D]/60">{description}</p>}
    </div>
  )
}
