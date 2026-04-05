import { BoardPageClient } from '@/components/task/BoardPageClient'

export default function BoardPageV3({ params }: { params: { boardId: string } }) {
  return <BoardPageClient boardId={params.boardId} version="v3" />
}
