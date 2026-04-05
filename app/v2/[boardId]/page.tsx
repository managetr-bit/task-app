import { BoardPageClient } from '@/components/task/BoardPageClient'

export default function BoardPageV2({ params }: { params: { boardId: string } }) {
  return <BoardPageClient boardId={params.boardId} version="v2" />
}
