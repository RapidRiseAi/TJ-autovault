'use client';

import { useState } from 'react';

type Plan = {
  key: 'basic' | 'pro' | 'business';
  title: 'Plan 1' | 'Plan 2' | 'Plan 3';
  popular: boolean;
};

const planBenefits: Record<Plan['key'], string[]> = {
  basic: ['1 to 3 cars', '250MB storage', 'R200/month'],
  pro: ['Up to 10 cars', '1GB storage', 'R500/month'],
  business: ['Unlimited cars', '10GB storage', 'R1000/month']
};

export function SignupPlanSelector({ plans }: { plans: readonly Plan[] }) {
  const [selectedPlan, setSelectedPlan] = useState<Plan['key']>('basic');

  return (
    <>
      <div className="grid grid-cols-3 gap-2">
        {plans.map((item) => (
          <label
            key={item.key}
            className="relative cursor-pointer rounded-2xl border border-black/10 bg-white/90 p-3 transition-all has-[:checked]:border-brand-red has-[:checked]:bg-red-50/40 has-[:checked]:shadow-[0_12px_30px_rgba(220,38,38,0.18)]"
          >
            {item.popular ? (
              <span className="absolute -top-2 right-2 rounded-full bg-brand-black px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-white">
                Most popular
              </span>
            ) : null}
            <input
              type="radio"
              className="sr-only"
              name="plan"
              value={item.key}
              checked={selectedPlan === item.key}
              onChange={() => setSelectedPlan(item.key)}
            />
            <p className="text-sm font-semibold text-gray-900">{item.title}</p>
          </label>
        ))}
      </div>

      <div className="rounded-xl border border-black/10 bg-zinc-50/90 p-3">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">What you get</p>
        <ul className="mt-2 space-y-1 text-sm text-gray-700">
          {planBenefits[selectedPlan].map((item) => (
            <li key={item}>• {item}</li>
          ))}
        </ul>
      </div>
    </>
  );
}
