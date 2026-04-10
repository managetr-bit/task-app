import { BoardPageClient } from '@/components/task/BoardPageClient'

export default function BoardPageV5({ params }: { params: { boardId: string } }) {
  return <BoardPageClient boardId={params.boardId} version="v5" />
}
