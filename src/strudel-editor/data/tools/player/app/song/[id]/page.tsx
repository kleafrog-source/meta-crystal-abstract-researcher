import EditorScreenLoader from '@/components/editor/EditorScreenLoader';

export default async function SongPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <EditorScreenLoader songId={id} />;
}
