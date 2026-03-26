-- board_notes: quick notes per board, convertible to tasks
create table if not exists board_notes (
  id          uuid primary key default gen_random_uuid(),
  board_id    uuid references boards(id) on delete cascade not null,
  content     text not null,
  author_name text,
  created_at  timestamptz default now() not null
);

create index if not exists board_notes_board_id on board_notes(board_id);

alter table board_notes enable row level security;

create policy "allow_all_board_notes"
  on board_notes for all
  using (true)
  with check (true);
