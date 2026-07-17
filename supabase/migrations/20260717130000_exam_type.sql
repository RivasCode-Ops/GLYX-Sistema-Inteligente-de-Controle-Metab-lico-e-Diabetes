-- Modalidade de exame: laboratorial, ECG ou Raio-X

alter table public.exams
  add column if not exists exam_type text not null default 'lab'
    check (exam_type in ('lab', 'ecg', 'rx'));

comment on column public.exams.exam_type is
  'Modalidade: lab (laudo laboratorial), ecg (eletrocardiograma), rx (raio-X). Análise educativa, não diagnóstico.';

create index if not exists exams_user_type_created_idx
  on public.exams (user_id, exam_type, created_at desc);
