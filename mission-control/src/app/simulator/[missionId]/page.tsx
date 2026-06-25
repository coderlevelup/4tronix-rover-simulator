import { SimulatorScaffold } from '@/components/simulator/SimulatorScaffold';

export async function generateStaticParams() {
  // Required for output: export to work in Next.js when there are dynamic routes
  return [{ missionId: 'default' }];
}

type SimulatorPageProps = {
  params: Promise<{
    missionId: string;
  }>;
};

export default async function SimulatorPage({ params }: SimulatorPageProps) {
  const { missionId } = await params;

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <SimulatorScaffold missionId={missionId} />
    </main>
  );
}
