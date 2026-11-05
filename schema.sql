-- Supabase 의 SQL Editor 에 이 내용을 통째로 붙여 넣고 Run 을 한 번 누르세요.
create table if not exists public.items (
  id        uuid primary key,
  type      text not null,
  name      text not null,
  cat       text,
  place     text,
  at_time   text,
  descr     text,
  contact   text,
  has_photo boolean not null default false,
  photo     text,
  done      boolean not null default false,
  created   bigint not null
);

create index if not exists items_created_idx on public.items (created desc);

-- 행 단위 보안을 켜 두고 정책을 만들지 않아요.
-- 그러면 서버가 가진 secret 키로만 읽고 쓸 수 있고, 공개 키로는 아무도 접근하지 못해요.
alter table public.items enable row level security;
