import MissionVideoClient from './MissionVideoClient';

export async function generateStaticParams() {
  // Required for output: export to work in Next.js when there are dynamic routes
  return [{ missionId: 'default' }];
}

export default async function MissionVideoPage({ params }: { params: Promise<{ missionId: string }> }) {
  const { missionId } = await params;
  return <MissionVideoClient missionId={missionId} />;
}
