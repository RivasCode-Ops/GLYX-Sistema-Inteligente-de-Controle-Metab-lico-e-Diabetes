import { completeOnboarding } from "@/app/actions/profile";
import { WelcomeWizard } from "@/components/onboarding/welcome-wizard";

export const metadata = { title: "Bem-vindo — GLYX" };

export default function BemVindoPage() {
  async function onboardingAction(formData: FormData) {
    "use server";
    return completeOnboarding(formData);
  }

  return (
    <div className="mx-auto max-w-md space-y-6 py-6">
      <div className="text-center">
        <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500/15 text-2xl font-bold text-emerald-300">
          G
        </div>
        <h1 className="text-xl font-semibold text-zinc-100">Bem-vindo ao GLYX</h1>
        <p className="mt-1 text-sm text-zinc-400">
          3 perguntas e o app se organiza para o seu objetivo.
        </p>
      </div>
      <WelcomeWizard action={onboardingAction} />
    </div>
  );
}
