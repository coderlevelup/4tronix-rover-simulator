import RoverControlClient from './RoverControlClient';

export const dynamic = 'force-static';

export function generateStaticParams() {
  return [];
}

export default async function RoverControlPage({ params }: { params: Promise<{ missionId: string }> }) {
  const { missionId } = await params;
  return <RoverControlClient missionId={missionId} />;
}
