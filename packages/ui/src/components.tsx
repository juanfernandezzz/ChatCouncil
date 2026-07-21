import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";
import { brandMarkGeometry } from "./brand";

/**
 * Primitivas visuales — Fase 7 E1
 * ------------------------------------------------------------------
 * Extracción MÍNIMA y DIRIGIDA: cada variante mapea 1:1 a las clases
 * Tailwind que las Fases 4/5/6 acumularon inline a propósito (ver
 * BLUEPRINT §0.7). Ningún hex acá: los colores entran por los tokens
 * del @theme (globals.css) — criterio de aceptación de la fase.
 * react es peerDependency: este paquete no fija su propia copia.
 */

export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

// ─── Button ─────────────────────────────────────────────────────────

export type ButtonVariant = "ghost" | "accent" | "solid" | "success" | "danger";
export type ButtonSize = "xs" | "sm" | "md";

const BUTTON_VARIANT: Record<ButtonVariant, string> = {
  ghost: "border border-border text-text-secondary transition-colors hover:border-text-secondary",
  accent: "border border-accent-primary text-accent-primary transition-opacity hover:opacity-90",
  solid: "bg-accent-primary font-medium text-bg-base transition-opacity hover:opacity-90",
  success: "border border-accent-secondary text-accent-secondary transition-opacity hover:opacity-90",
  danger: "border border-danger text-danger transition-opacity hover:opacity-90",
};

const BUTTON_SIZE: Record<ButtonSize, string> = {
  xs: "rounded px-1.5 py-0.5 text-[10px]",
  sm: "rounded px-2 py-1 text-xs",
  md: "rounded-md px-3 py-1.5 text-sm",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** rounded-full (chips de toggle del ComposeBar). */
  pill?: boolean;
}

export function Button({ variant = "ghost", size = "sm", pill = false, className, type, ...rest }: ButtonProps) {
  return (
    <button
      type={type ?? "button"}
      className={cx(
        BUTTON_VARIANT[variant],
        BUTTON_SIZE[size],
        pill && "rounded-full",
        "disabled:cursor-not-allowed disabled:opacity-40",
        className,
      )}
      {...rest}
    />
  );
}

// ─── Badge ──────────────────────────────────────────────────────────

export type BadgeVariant = "neutral" | "primary" | "secondary" | "warning" | "danger";

const BADGE_VARIANT: Record<BadgeVariant, string> = {
  neutral: "bg-border/40 text-text-secondary",
  primary: "bg-accent-primary/20 text-accent-primary",
  secondary: "bg-accent-secondary/20 text-accent-secondary",
  warning: "bg-warning/20 text-warning",
  danger: "bg-danger/20 text-danger",
};

export interface BadgeProps {
  variant?: BadgeVariant;
  /** font-mono uppercase tracking-wide (rótulos técnicos: byok/byoa). */
  mono?: boolean;
  className?: string;
  title?: string;
  children: ReactNode;
}

export function Badge({ variant = "neutral", mono = false, className, title, children }: BadgeProps) {
  return (
    <span
      title={title}
      className={cx("rounded px-1.5 py-0.5 text-[10px]", mono && "font-mono uppercase tracking-wide", BADGE_VARIANT[variant], className)}
    >
      {children}
    </span>
  );
}

// ─── Section ────────────────────────────────────────────────────────

export interface SectionProps {
  title: string;
  /** Nodo opcional a la derecha del título (ej.: botón "+ nueva"). */
  action?: ReactNode;
  className?: string;
  children: ReactNode;
}

/** Caja estándar de las herramientas: rounded-md border p-3, título uppercase. */
export function Section({ title, action, className, children }: SectionProps) {
  return (
    <section className={cx("flex flex-col gap-2 rounded-md border border-border p-3", className)}>
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-text-secondary">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

// ─── Campos ─────────────────────────────────────────────────────────

export type FieldSize = "xs" | "sm";

const FIELD_BASE =
  "rounded border border-border bg-bg-base text-text-primary placeholder:text-text-secondary focus:outline-none";

const FIELD_SIZE: Record<FieldSize, string> = {
  xs: "px-1.5 py-0.5 text-[11px]",
  sm: "px-2 py-1 text-xs",
};

export interface TextInputProps extends InputHTMLAttributes<HTMLInputElement> {
  fieldSize?: FieldSize;
}

export function TextInput({ fieldSize = "sm", className, ...rest }: TextInputProps) {
  return <input className={cx(FIELD_BASE, FIELD_SIZE[fieldSize], className)} {...rest} />;
}

export interface TextAreaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  fieldSize?: FieldSize;
}

export function TextArea({ fieldSize = "sm", className, ...rest }: TextAreaProps) {
  return <textarea className={cx(FIELD_BASE, FIELD_SIZE[fieldSize], className)} {...rest} />;
}

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  fieldSize?: FieldSize;
}

export function Select({ fieldSize = "sm", className, ...rest }: SelectProps) {
  return <select className={cx(FIELD_BASE, FIELD_SIZE[fieldSize], className)} {...rest} />;
}

// ─── BrandMark ──────────────────────────────────────────────────────

export interface BrandMarkProps {
  /** Lado en px (el SVG es cuadrado). */
  size?: number;
  className?: string;
  title?: string;
}

/** La marca en JSX, currentColor — hereda el color del texto que la rodea. */
export function BrandMark({ size = 20, className, title = "ChatCouncil" }: BrandMarkProps) {
  const g = brandMarkGeometry();
  return (
    <svg
      data-brand="cc-brand-mark"
      width={size}
      height={size}
      viewBox={`0 0 ${g.viewBox} ${g.viewBox}`}
      className={className}
      role="img"
      aria-label={title}
    >
      {g.spokes.map((s, i) => (
        <line
          key={i}
          x1={s.x1}
          y1={s.y1}
          x2={s.x2}
          y2={s.y2}
          stroke="currentColor"
          strokeWidth={g.strokeWidth}
          strokeLinecap="round"
        />
      ))}
      <circle cx={g.hub.x} cy={g.hub.y} r={g.hub.r} fill="currentColor" />
      {g.nodes.map((n, i) => (
        <circle key={i} cx={n.x} cy={n.y} r={n.r} fill="currentColor" />
      ))}
    </svg>
  );
}
