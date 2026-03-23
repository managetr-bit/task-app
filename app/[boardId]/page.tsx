import { BoardPageClient } from '@/components/task/BoardPageClient'

export default function BoardPage({ params }: { params: { boardId: string } }) {
  return <BoardPageClient boardId={params.boardId} />
}
