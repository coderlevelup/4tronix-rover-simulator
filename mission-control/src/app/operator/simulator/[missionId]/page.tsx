import SimulatorClient from './SimulatorClient';

export const dynamic = 'force-static';

export function generateStaticParams() {
  return [];
}

export default async function SimulatorPage({ params }: { params: Promise<{ missionId: string }> }) {
  const { missionId } = await params;
  return <SimulatorClient missionId={missionId} />;
}
