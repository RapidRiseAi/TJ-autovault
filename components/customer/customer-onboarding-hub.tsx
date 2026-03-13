'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import {
  BookOpenCheck,
  CheckCircle2,
  Circle,
  CircleDashed,
  Sparkles,
  X
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { OnboardingTask } from '@/lib/customer/onboarding-checklist';

type TutorialStep = {
  id: string;
  title: string;
  description: string;
  href: string;
};

type TutorialState = Record<string, boolean>;

const tutorialSteps: TutorialStep[] = [
  {
    id: 'dashboard-overview',
    title: 'Dashboard orientation',
    description: 'Understand your dashboard cards and where quick actions appear.',
    href: '/customer/dashboard'
  },
  {
    id: 'vehicles-flow',
    title: 'Vehicles section walkthrough',
    description: 'Learn where to open vehicles, timelines, and related documents.',
    href: '/customer/vehicles'
  },
  {
    id: 'alerts-center',
    title: 'Alerts & notifications',
    description: 'Review workshop alerts and notification settings.',
    href: '/customer/notifications'
  },
  {
    id: 'profile-hub',
    title: 'Profile settings hub',
    description: 'Find profile edit, billing, security, and support controls.',
    href: '/customer/profile'
  }
];

function Progress({ value }: { value: number }) {
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-black/10">
      <div
        className="h-full rounded-full bg-brand-red transition-all"
        style={{ width: `${Math.max(0, Math.min(value, 100))}%` }}
      />
    </div>
  );
}

function taskTone(task: OnboardingTask) {
  if (task.complete) {
    return 'border-emerald-200 bg-emerald-50 text-emerald-800';
  }
  if (task.required) {
    return 'border-amber-200 bg-amber-50 text-amber-800';
  }
  return 'border-black/10 bg-white text-gray-700';
}

export function CustomerOnboardingHub({
  userId,
  profileTasks,
  profileCompletionPercent,
  completedRequiredProfileTasks,
  totalRequiredProfileTasks
}: {
  userId: string;
  profileTasks: OnboardingTask[];
  profileCompletionPercent: number;
  completedRequiredProfileTasks: number;
  totalRequiredProfileTasks: number;
}) {
  const tutorialStorageKey = `customer_tutorial_state_${userId}`;
  const dismissedStorageKey = `customer_onboarding_hidden_${userId}`;

  const [tutorialOpen, setTutorialOpen] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [tutorialState, setTutorialState] = useState<TutorialState>(() => {
    if (typeof window === 'undefined') return {};
    try {
      return JSON.parse(window.localStorage.getItem(tutorialStorageKey) ?? '{}') as TutorialState;
    } catch {
      return {};
    }
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const rawValue = window.localStorage.getItem(dismissedStorageKey);
    setDismissed(rawValue === '1');
  }, [dismissedStorageKey]);

  const completedTutorialSteps = tutorialSteps.filter((step) => tutorialState[step.id]).length;
  const tutorialCompletionPercent = Math.round(
    (completedTutorialSteps / tutorialSteps.length) * 100
  );
  const tutorialComplete = completedTutorialSteps === tutorialSteps.length;
  const profileComplete = completedRequiredProfileTasks >= totalRequiredProfileTasks;
  const overallCompletionPercent = Math.round(
    (profileCompletionPercent + tutorialCompletionPercent) / 2
  );
  const fullyComplete = profileComplete && tutorialComplete;

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!fullyComplete) return;

    window.localStorage.setItem(dismissedStorageKey, '1');
    setDismissed(true);
  }, [dismissedStorageKey, fullyComplete]);

  const nextProfileTask = useMemo(
    () => profileTasks.find((task) => task.required && !task.complete) ?? null,
    [profileTasks]
  );

  const nextTutorialTask = useMemo(
    () => tutorialSteps.find((step) => !tutorialState[step.id]) ?? null,
    [tutorialState]
  );

  const saveTutorialState = (nextState: TutorialState) => {
    setTutorialState(nextState);
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(tutorialStorageKey, JSON.stringify(nextState));
  };

  const completeTutorialStep = (id: string) => {
    saveTutorialState({ ...tutorialState, [id]: true });
  };

  const handleDismiss = () => {
    setDismissed(true);
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(dismissedStorageKey, '1');
  };

  if (dismissed) return null;

  return (
    <section className="space-y-3 rounded-3xl border border-black/10 bg-white/95 p-3 shadow-[0_12px_36px_rgba(17,17,17,0.08)] sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">
            Profile setup assistant
          </p>
          <h2 className="mt-1 text-lg font-semibold text-black sm:text-xl">
            Setup progress: {overallCompletionPercent}% complete
          </h2>
          <p className="text-sm text-gray-600">
            Finish your profile checklist and tutorial to unlock the smoothest customer experience.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-brand-red" />
          {(fullyComplete || profileComplete) ? (
            <button
              type="button"
              onClick={handleDismiss}
              className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-black/15 text-gray-600 transition hover:bg-black/5 hover:text-black"
              aria-label="Close setup assistant"
              title="Close"
            >
              <X className="h-4 w-4" />
            </button>
          ) : null}
        </div>
      </div>

      <Progress value={overallCompletionPercent} />

      <div className="grid gap-2 md:hidden">
        <div className="rounded-2xl border border-black/10 bg-white p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Profile checklist</p>
          <p className="text-sm font-semibold text-black">
            {completedRequiredProfileTasks}/{totalRequiredProfileTasks} required tasks done
          </p>
          <p className="mt-1 text-xs text-gray-600">
            {nextProfileTask
              ? `Next: ${nextProfileTask.title}`
              : 'All required profile tasks are complete.'}
          </p>
        </div>

        <div className="rounded-2xl border border-black/10 bg-white p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">UI tutorial</p>
          <p className="text-sm font-semibold text-black">
            {completedTutorialSteps}/{tutorialSteps.length} steps done
          </p>
          <p className="mt-1 text-xs text-gray-600">
            {nextTutorialTask
              ? `Next: ${nextTutorialTask.title}`
              : 'Tutorial completed. Great work.'}
          </p>
        </div>
      </div>

      <div className="hidden grid-cols-2 gap-3 md:grid">
        <div className="rounded-2xl border border-black/10 bg-white p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Profile checklist</p>
          <p className="mt-1 text-lg font-semibold text-black">
            {completedRequiredProfileTasks}/{totalRequiredProfileTasks}
          </p>
          <Progress value={profileCompletionPercent} />
          <p className="mt-2 text-sm text-gray-600">
            {nextProfileTask
              ? `Next best action: ${nextProfileTask.title}`
              : 'Required profile setup complete.'}
          </p>
        </div>

        <div className="rounded-2xl border border-black/10 bg-white p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">UI tutorial</p>
          <p className="mt-1 text-lg font-semibold text-black">
            {completedTutorialSteps}/{tutorialSteps.length}
          </p>
          <Progress value={tutorialCompletionPercent} />
          <p className="mt-2 text-sm text-gray-600">
            {nextTutorialTask
              ? `Next best action: ${nextTutorialTask.title}`
              : 'Tutorial fully complete.'}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {nextProfileTask ? (
          <Button asChild>
            <Link href={nextProfileTask.href}>Continue profile setup</Link>
          </Button>
        ) : null}
        {!tutorialComplete ? (
          <Button variant="secondary" onClick={() => setTutorialOpen((open) => !open)}>
            <BookOpenCheck className="mr-1 h-4 w-4" />
            {tutorialOpen ? 'Hide tutorial guide' : 'Open tutorial guide'}
          </Button>
        ) : null}
        {fullyComplete ? (
          <Button variant="secondary" onClick={handleDismiss}>
            Dismiss setup assistant
          </Button>
        ) : null}
      </div>

      {tutorialOpen ? (
        <div className="space-y-4 rounded-2xl border border-black/10 bg-stone-50 p-3 sm:p-4">
          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-black">Profile checklist tasks</h3>
            <div className="grid gap-2">
              {profileTasks.map((task) => (
                <div
                  key={task.id}
                  className={cn('rounded-xl border px-3 py-2 text-sm', taskTone(task))}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold">{task.title}</p>
                      <p className="text-xs opacity-90">{task.description}</p>
                    </div>
                    {task.complete ? (
                      <CheckCircle2 className="h-4 w-4 shrink-0" />
                    ) : task.required ? (
                      <CircleDashed className="h-4 w-4 shrink-0" />
                    ) : (
                      <Circle className="h-4 w-4 shrink-0" />
                    )}
                  </div>
                  {!task.complete ? (
                    <div className="mt-2">
                      <Button asChild size="sm" variant="outline">
                        <Link href={task.href}>Open task</Link>
                      </Button>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-black">UI tutorial walkthrough</h3>
            <div className="grid gap-2">
              {tutorialSteps.map((step, index) => {
                const done = Boolean(tutorialState[step.id]);
                return (
                  <div
                    key={step.id}
                    className={cn(
                      'rounded-xl border px-3 py-2 text-sm',
                      done
                        ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                        : 'border-black/10 bg-white text-gray-700'
                    )}
                  >
                    <p className="font-semibold">
                      {index + 1}. {step.title}
                    </p>
                    <p className="text-xs opacity-90">{step.description}</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Button asChild size="sm" variant="outline">
                        <Link href={step.href}>Go to step</Link>
                      </Button>
                      {!done ? (
                        <Button size="sm" onClick={() => completeTutorialStep(step.id)}>
                          Mark complete
                        </Button>
                      ) : (
                        <span className="inline-flex items-center rounded-full border border-emerald-300 px-2 py-1 text-xs font-semibold">
                          Completed
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
