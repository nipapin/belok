import AnimatedGradientBackground from '@/components/effects/AnimatedGradientBackground';

export default function KioskLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex h-full min-h-0 flex-1 flex-col overflow-hidden">
      <AnimatedGradientBackground />
      <div className="relative z-10 flex min-h-0 flex-1 flex-col">{children}</div>
    </div>
  );
}
