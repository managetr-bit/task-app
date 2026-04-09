import { BoardPageClient } from '@/components/task/BoardPageClient'

export default function BoardPageV4({ params }: { params: { boardId: string } }) {
  return <BoardPageClient boardId={params.boardId} version="v4" />
}
