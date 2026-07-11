import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  Droplets,
  UtensilsCrossed,
  Dumbbell,
  Pill,
  Lightbulb,
  Sparkles,
  User,
  FileText,
  ScrollText,
  BellRing,
  Plug,
} from "lucide-react";

export type NavItem = {
  title: string;
  href: string;
  icon: LucideIcon;
  /** Show in bottom tab bar (mobile) */
  mobile?: boolean;
};

export const mainNav: NavItem[] = [
  { title: "Painel", href: "/dashboard", icon: LayoutDashboard, mobile: true },
  { title: "Glicemia", href: "/glicemia", icon: Droplets, mobile: true },
  { title: "Alimentação", href: "/alimentacao", icon: UtensilsCrossed, mobile: true },
  { title: "Exercícios", href: "/exercicios", icon: Dumbbell, mobile: true },
  { title: "Medicação", href: "/medicacao", icon: Pill, mobile: true },
  { title: "Integrações", href: "/integracoes", icon: Plug, mobile: false },
  { title: "Insights", href: "/insights", icon: Lightbulb, mobile: false },
  { title: "IA metabólica", href: "/ia-metabolica", icon: Sparkles, mobile: false },
  { title: "Perfil", href: "/perfil", icon: User, mobile: false },
  { title: "Exames", href: "/exames", icon: FileText, mobile: false },
  { title: "Histórico", href: "/historico", icon: ScrollText, mobile: false },
  { title: "Alertas", href: "/alertas", icon: BellRing, mobile: false },
];

export const mobileNav = mainNav.filter((i) => i.mobile);

export type SubNavItem = { title: string; href: string };

/** Secondary routes per module (desktop subnav + mobile chips) */
export const moduleSubNav: Record<string, SubNavItem[]> = {
  "/glicemia": [
    { title: "Visão geral", href: "/glicemia" },
    { title: "Tendências", href: "/glicemia/tendencias" },
    { title: "Sensor", href: "/glicemia/sensor" },
    { title: "Histórico", href: "/glicemia/historico" },
  ],
  "/alimentacao": [
    { title: "Visão geral", href: "/alimentacao" },
    { title: "Refeições", href: "/alimentacao/refeicoes" },
    { title: "Plano", href: "/alimentacao/plano" },
    { title: "Por foto", href: "/alimentacao/foto" },
  ],
  "/exercicios": [
    { title: "Visão geral", href: "/exercicios" },
    { title: "Plano", href: "/exercicios/plano" },
    { title: "Sessões", href: "/exercicios/sessoes" },
  ],
  "/medicacao": [
    { title: "Visão geral", href: "/medicacao" },
    { title: "Agenda", href: "/medicacao/agenda" },
  ],
};

export function getModuleKeyFromPath(pathname: string): string | null {
  const segments = pathname.split("/").filter(Boolean);
  if (segments.length === 0) return null;
  const root = `/${segments[0]}`;
  return moduleSubNav[root] ? root : null;
}
